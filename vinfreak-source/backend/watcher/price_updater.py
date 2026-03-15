"""Async worker that refreshes car prices from their source URLs."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Collection, List, Sequence, Tuple

import httpx
from sqlalchemy import func
from sqlmodel import Session, select

from backend.db import engine
from backend.models import Car
from backend.services.pricing import (
    HostLimiter,
    extract_price,
    fetch_html,
    fetch_html_with_playwright,
    should_use_playwright,
    to_number_usd,
)

logger = logging.getLogger(__name__)
LIMITER = HostLimiter(per_host=3)
PROTECTION_RETRY_METHODS = {"cloudflare_challenge", "login_required"}


@dataclass(slots=True)
class RefreshStats:
    processed: int = 0
    updated: int = 0
    skipped: int = 0

    def log_summary(self) -> None:
        logger.info(
            "vinfreak-watcher processed %s cars: %s updated, %s skipped",
            self.processed,
            self.updated,
            self.skipped,
        )


async def refresh_car_prices(batch_size: int = 100) -> RefreshStats:
    """Fetch prices for cars in batches and persist successful updates."""

    stats = RefreshStats()
    processed_ids: set[int] = set()
    limits = httpx.Limits(max_connections=20, max_keepalive_connections=10)

    async with httpx.AsyncClient(http2=True, follow_redirects=True, limits=limits) as client:
        while True:
            cars = _load_batch(batch_size=batch_size, exclude_ids=processed_ids)
            # Filter out rows already processed in this run or without a usable URL.
            cars = [row for row in cars if row.id not in processed_ids and row.url]
            if not cars:
                break

            results = await asyncio.gather(
                *[
                    _fetch_price_for_car(client, row.id, row.url)
                    for row in cars
                ],
                return_exceptions=True,
            )

            for result in results:
                if isinstance(result, asyncio.CancelledError):
                    raise result

            # Update persistence layer in a fresh session to avoid concurrent use.
            with Session(engine) as session:
                for car_row, result in zip(cars, results):
                    stats.processed += 1
                    if isinstance(result, Exception):
                        stats.skipped += 1
                        logger.warning(
                            "Failed price fetch for car %s (%s): %s",
                            car_row.id,
                            car_row.url,
                            result,
                        )
                        continue

                    price_text, method = result
                    if not price_text:
                        stats.skipped += 1
                        logger.info(
                            "No price found for car %s (%s) via %s",
                            car_row.id,
                            car_row.url,
                            method,
                        )
                        continue

                    numeric_price = to_number_usd(price_text, allow_compact_without_symbol=False)
                    if numeric_price is None:
                        stats.skipped += 1
                        logger.info(
                            "Could not parse price '%s' for car %s (%s)",
                            price_text,
                            car_row.id,
                            car_row.url,
                        )
                        continue

                    car = session.get(Car, car_row.id)
                    if not car:
                        stats.skipped += 1
                        logger.info(
                            "Car %s disappeared before update", car_row.id
                        )
                        continue

                    car.price = float(numeric_price)
                    car.currency = car.currency or "USD"
                    car.updated_at = datetime.now(timezone.utc).isoformat()
                    session.add(car)
                    stats.updated += 1
                    logger.info(
                        "Updated car %s price to %s via %s",
                        car_row.id,
                        price_text,
                        method,
                    )

                session.commit()

            processed_ids.update(row.id for row in cars)

    return stats


async def _fetch_price_for_car(
    client: httpx.AsyncClient, car_id: int, url: str
) -> Tuple[str | None, str]:
    html: str | None = None
    use_playwright = should_use_playwright(url)

    if use_playwright:
        # Cloudflare-protected hosts like Cars & Bids require a real browser
        # fetch to avoid 403 responses. Try Playwright first so the request
        # looks like a normal Chromium visitor before falling back to httpx.
        html = await fetch_html_with_playwright(url)

    if not html:
        html = await fetch_html(client, url, limiter=LIMITER)
        if not html and use_playwright:
            html = await fetch_html_with_playwright(url)

    price, method = extract_price(url, html)
    if not price and method in PROTECTION_RETRY_METHODS:
        retry_html = await fetch_html_with_playwright(url)
        if retry_html and retry_html != html:
            retry_price, retry_method = extract_price(url, retry_html)
            if retry_price or retry_method not in PROTECTION_RETRY_METHODS:
                return retry_price, retry_method

    return price, method


@dataclass
class CarRow:
    id: int
    url: str


PRICEABLE_STATUSES = (
    "LIVE",
    "AUCTION_IN_PROGRESS",
)


def _load_batch(batch_size: int, exclude_ids: Collection[int] | None = None) -> List[CarRow]:
    with Session(engine) as session:
        stmt = (
            select(Car.id, Car.url)
            .where(Car.url.is_not(None))
            .where(Car.url != "")
            .where(Car.deleted_at.is_(None))
        )

        if exclude_ids:
            stmt = stmt.where(Car.id.notin_(list(exclude_ids)))

        status_upper = func.upper(
            func.replace(
                func.replace(
                    func.trim(
                        func.replace(
                            func.coalesce(Car.auction_status_column(), ""),
                            "\u00A0",
                            " ",
                        )
                    ),
                    " ",
                    "_",
                ),
                "-",
                "_",
            )
        )
        stmt = stmt.where(status_upper.in_(PRICEABLE_STATUSES))

        stmt = stmt.order_by(
            Car.updated_at.is_(None).desc(),
            Car.updated_at.asc(),
            Car.id.asc(),
        ).limit(batch_size)

        result = session.exec(stmt)
        rows: Sequence[Tuple[int, str | None]] = result.all()
    return [CarRow(id=row[0], url=row[1] or "") for row in rows]


async def run(loop: bool = False, interval_seconds: int = 300) -> RefreshStats:
    try:
        while True:
            stats = await refresh_car_prices()
            stats.log_summary()
            if not loop:
                return stats
            await asyncio.sleep(interval_seconds)
    except asyncio.CancelledError:  # pragma: no cover - cooperative shutdown
        logger.info("vinfreak-watcher received cancellation; exiting")
        raise


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    loop = False
    interval = 300
    try:
        import argparse

        parser = argparse.ArgumentParser(description="Update VINfreak car prices")
        parser.add_argument(
            "--loop",
            action="store_true",
            help="Run continuously instead of exiting after one refresh",
        )
        parser.add_argument(
            "--interval",
            type=int,
            default=300,
            help="Seconds to sleep between refreshes when --loop is set",
        )
        args = parser.parse_args()
        loop = args.loop
        interval = max(5, args.interval)
    except SystemExit:
        raise
    except Exception:
        logger.exception("Failed to parse arguments; falling back to defaults")

    asyncio.run(run(loop=loop, interval_seconds=interval))


if __name__ == "__main__":
    main()
