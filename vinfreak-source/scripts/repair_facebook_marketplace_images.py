#!/usr/bin/env python3
"""Repair imported Facebook Marketplace images in the cars table.

This script fixes existing rows where avatar/profile assets became the primary
listing image. It re-orders candidate images using the same backend heuristics,
canonicalizes listing URLs, and optionally attempts listing-page enrichment.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from sqlalchemy import create_engine, func
from sqlmodel import Session, select

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.backend_settings import settings as backend_settings
from backend.models import Car
import backend.app as app_module


AVATAR_HINT_RE = re.compile(
    r"(?:/v/t39\.30808-1/|[?&]stp=[^#]*s(?:32|36|40|48|50|60)x(?:32|36|40|48|50|60)|\bavatar\b|\bprofile\b)",
    flags=re.IGNORECASE,
)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _looks_profile_image(url: str | None) -> bool:
    value = _text(url)
    if not value:
        return False
    lowered = value.lower()
    if AVATAR_HINT_RE.search(lowered):
        return True
    # Some profile assets are tiny square thumbnails even without explicit
    # avatar tokens.
    return "fbcdn.net" in lowered and ("s40x40" in lowered or "s32x32" in lowered)


def _parse_images_json(value: Any) -> list[str]:
    text = _text(value)
    if not text:
        return []
    try:
        payload = json.loads(text)
        if isinstance(payload, list):
            return [_text(item) for item in payload if _text(item)]
    except (TypeError, ValueError):
        pass
    parts = [part.strip() for part in re.split(r"[\n,]+", text) if part.strip()]
    return parts


def _build_ordered_images(row: Car) -> list[str]:
    candidates: list[str] = []
    primary = _text(getattr(row, "image_url", None))
    if primary:
        candidates.append(primary)
    for extra in _parse_images_json(getattr(row, "images_json", None)):
        if extra:
            candidates.append(extra)
    extracted = app_module._facebook_extract_images(candidates)
    return app_module._facebook_marketplace_order_image_urls(extracted)


def _canonical_listing_url(row: Car) -> str | None:
    payload = {
        "id": _text(getattr(row, "lot_number", None)),
        "url": _text(getattr(row, "url", None)),
        "permalink": _text(getattr(row, "url", None)),
        "listing_url": _text(getattr(row, "url", None)),
    }
    return app_module._facebook_marketplace_listing_url(payload)


def _listing_id(row: Car, canonical_url: str | None) -> str | None:
    lot_number = _text(getattr(row, "lot_number", None))
    if lot_number:
        return lot_number
    return app_module._facebook_marketplace_listing_id_from_url(canonical_url)


def _fetch_listing_page_images(
    *,
    listing_url: str,
    listing_id: str | None,
    headers: dict[str, str],
    timeout_seconds: int,
) -> list[str]:
    try:
        response = requests.get(
            listing_url,
            headers=headers,
            timeout=(2, max(2, timeout_seconds)),
        )
    except requests.RequestException:
        return []
    if int(getattr(response, "status_code", 0) or 0) >= 400:
        return []
    detail = app_module._facebook_marketplace_item_detail_from_html(
        response.text or "",
        listing_id=listing_id,
        listing_url=listing_url,
    )
    images = app_module._facebook_extract_images(
        detail.get("images")
        or detail.get("pictures")
        or detail.get("photos")
        or detail.get("media")
        or detail.get("primary_listing_photo")
        or detail.get("primary_photo")
    )
    return app_module._facebook_marketplace_order_image_urls(images)


def _normalized_source_filter(value: Any) -> str:
    return _text(value).lower()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Repair imported Facebook Marketplace listing images."
    )
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL") or _text(getattr(backend_settings, "DATABASE_URL", "")),
        help="Database URL (defaults to DATABASE_URL env or backend settings).",
    )
    parser.add_argument(
        "--source",
        default="facebook_marketplace",
        help="Source key to repair (default: facebook_marketplace).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional max number of rows to scan.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist updates. Without this flag, runs as dry-run.",
    )
    parser.add_argument(
        "--enrich-from-listing-page",
        action="store_true",
        help="Try fetching listing pages when primary image still looks like an avatar.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=5,
        help="HTTP timeout for optional listing-page enrichment.",
    )
    args = parser.parse_args()

    database_url = _text(args.database_url)
    if not database_url:
        print("Error: database URL is required. Pass --database-url or set DATABASE_URL.")
        return 2

    source_key = _normalized_source_filter(args.source)
    now_iso = datetime.now(timezone.utc).isoformat()
    engine = create_engine(database_url, future=True)

    session_cookie = app_module._facebook_marketplace_session_cookie()
    base_headers = {
        "Accept": "application/json",
        "User-Agent": app_module._facebook_marketplace_user_agent(),
        "Accept-Language": "en-US,en;q=0.9",
    }
    if session_cookie:
        base_headers["Cookie"] = session_cookie
    listing_request_headers = app_module._facebook_marketplace_item_request_headers(base_headers)

    scanned = 0
    changed = 0
    canonicalized_url = 0
    primary_replaced = 0
    enriched_rows = 0
    unresolved_avatar = 0
    sample_changes: list[str] = []

    with Session(engine) as session:
        source_expr = func.lower(func.coalesce(Car.source, ""))
        source_filter = (source_expr == source_key)
        if source_key == "facebook_marketplace":
            # Older imports sometimes used "facebook" instead of
            # "facebook_marketplace".
            source_filter = source_filter | source_expr.contains("facebook")
        query = select(Car).where(source_filter).order_by(Car.id.asc())
        if int(args.limit or 0) > 0:
            query = query.limit(int(args.limit))
        rows = session.exec(query).all()

        for row in rows:
            scanned += 1
            old_url = _text(getattr(row, "url", None)) or None
            old_primary = _text(getattr(row, "image_url", None)) or None

            canonical_url = _canonical_listing_url(row)
            listing_id = _listing_id(row, canonical_url)

            ordered_images = _build_ordered_images(row)
            if (
                args.enrich_from_listing_page
                and canonical_url
                and (not ordered_images or _looks_profile_image(ordered_images[0]))
            ):
                fetched_images = _fetch_listing_page_images(
                    listing_url=canonical_url,
                    listing_id=listing_id,
                    headers=listing_request_headers,
                    timeout_seconds=max(2, int(args.timeout_seconds or 5)),
                )
                if fetched_images:
                    ordered_images = app_module._facebook_marketplace_order_image_urls(
                        [*fetched_images, *ordered_images]
                    )
                    enriched_rows += 1

            if ordered_images:
                new_primary = ordered_images[0]
                new_extra = ordered_images[1:]
                new_images_json = (
                    json.dumps(new_extra, ensure_ascii=False) if new_extra else None
                )
            else:
                if _looks_profile_image(old_primary):
                    new_primary = None
                    new_images_json = None
                else:
                    new_primary = old_primary
                    new_images_json = getattr(row, "images_json", None)

            if _looks_profile_image(new_primary):
                unresolved_avatar += 1

            row_changed = False
            if canonical_url and canonical_url != old_url:
                canonicalized_url += 1
                row_changed = True
            if new_primary != old_primary:
                primary_replaced += 1
                row_changed = True
            if _text(new_images_json) != _text(getattr(row, "images_json", None)):
                row_changed = True

            if not row_changed:
                continue

            changed += 1
            if len(sample_changes) < 20:
                sample_changes.append(
                    f"id={getattr(row, 'id', None)} primary: {_text(old_primary)[:72]} -> {_text(new_primary)[:72]}"
                )
            if not args.apply:
                continue

            if canonical_url:
                row.url = canonical_url
            row.image_url = new_primary
            row.images_json = new_images_json
            row.updated_at = now_iso
            session.add(row)

        if args.apply:
            session.commit()

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(
        f"[{mode}] scanned={scanned} changed={changed} primary_replaced={primary_replaced} "
        f"canonicalized_url={canonicalized_url} enriched_rows={enriched_rows} "
        f"still_avatar_primary={unresolved_avatar}"
    )
    if sample_changes:
        print("Sample changes:")
        for line in sample_changes:
            print(f" - {line}")
    if not args.apply:
        print("No rows were written. Re-run with --apply to persist updates.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
