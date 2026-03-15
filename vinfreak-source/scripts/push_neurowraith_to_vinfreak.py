#!/usr/bin/env python3
"""Run local NeuroWraith spiders and push results to VinFreak."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.integrations.neurowraith_runner import (  # noqa: E402
    LocalNeuroWraithRunner,
    LocalNeuroWraithRunnerError,
)

DEFAULT_REQUEST_TIMEOUT_SECONDS = 300
DEFAULT_RETRY_DELAY_SECONDS = 15.0


def _env_first(*names: str) -> str:
    for name in names:
        value = os.getenv(name)
        if value is not None and value.strip():
            return value.strip()
    return ""


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Run local NeuroWraith spiders from a cron worker and push listings "
            "to VinFreak /internal/neurowraith/import."
        )
    )
    parser.add_argument(
        "--neurowraith-base-dir",
        default=_env_first("NEUROWRATH_LOCAL_BASE_DIR"),
        help=(
            "Path to local neurowraith folder (env: NEUROWRATH_LOCAL_BASE_DIR)."
        ),
    )
    parser.add_argument(
        "--vinfreak-import-url",
        default=_env_first("VINFREAK_NEUROWRATH_IMPORT_URL"),
        help=(
            "Full VinFreak push-import endpoint URL "
            "(env: VINFREAK_NEUROWRATH_IMPORT_URL)."
        ),
    )
    parser.add_argument(
        "--vinfreak-cron-token",
        default=_env_first(
            "VINFREAK_NEUROWRATH_CRON_TOKEN",
            "NEUROWRATH_CRON_TOKEN",
        ),
        help=(
            "VinFreak cron token for X-NeuroWraith-Cron-Token header "
            "(env: VINFREAK_NEUROWRATH_CRON_TOKEN or NEUROWRATH_CRON_TOKEN)."
        ),
    )
    parser.add_argument(
        "--sources",
        default=_env_first("VINFREAK_NEUROWRATH_PUSH_SOURCES"),
        help=(
            "Comma-separated spiders with optional limits, e.g. "
            "'bringatrailer:25,carsandbids:25'. "
            "Defaults from env VINFREAK_NEUROWRATH_PUSH_SOURCES."
        ),
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=int(
            _env_first("VINFREAK_NEUROWRATH_PUSH_TIMEOUT")
            or DEFAULT_REQUEST_TIMEOUT_SECONDS
        ),
        help="HTTP timeout in seconds when pushing to VinFreak (default: 300).",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=int(_env_first("VINFREAK_NEUROWRATH_CRON_RETRIES") or "2"),
        help="Retry attempts after the initial push request (default: 2).",
    )
    parser.add_argument(
        "--retry-delay",
        type=float,
        default=float(
            _env_first("VINFREAK_NEUROWRATH_CRON_RETRY_DELAY")
            or DEFAULT_RETRY_DELAY_SECONDS
        ),
        help="Seconds to sleep between push retries (default: 15).",
    )
    parser.add_argument(
        "--mark-missing-removed",
        action="store_true",
        help=(
            "Ask VinFreak import to mark missing listings as REMOVED. "
            "Only use for full sweeps."
        ),
    )
    parser.add_argument(
        "--continue-on-error",
        action="store_true",
        help="Continue to next spider when one spider fails.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print response payloads.",
    )
    return parser


def _validate_args(args: argparse.Namespace) -> None:
    if not args.neurowraith_base_dir:
        raise SystemExit(
            "Missing --neurowraith-base-dir (or env NEUROWRATH_LOCAL_BASE_DIR)."
        )
    if not args.vinfreak_import_url:
        raise SystemExit(
            "Missing --vinfreak-import-url (or env VINFREAK_NEUROWRATH_IMPORT_URL)."
        )
    if not args.vinfreak_cron_token:
        raise SystemExit(
            "Missing --vinfreak-cron-token (or env VINFREAK_NEUROWRATH_CRON_TOKEN / "
            "NEUROWRATH_CRON_TOKEN)."
        )
    if not args.sources:
        raise SystemExit(
            "Missing --sources (or env VINFREAK_NEUROWRATH_PUSH_SOURCES)."
        )
    if args.timeout <= 0:
        raise SystemExit("--timeout must be greater than zero.")
    if args.retries < 0:
        raise SystemExit("--retries cannot be negative.")
    if args.retry_delay < 0:
        raise SystemExit("--retry-delay cannot be negative.")


def _parse_sources(raw: str) -> list[tuple[str, int]]:
    specs: list[tuple[str, int]] = []
    tokens = [token.strip() for token in (raw or "").split(",") if token.strip()]
    for token in tokens:
        if ":" in token:
            spider_raw, limit_raw = token.split(":", 1)
            spider = spider_raw.strip().lower()
            try:
                limit = int(limit_raw.strip())
            except (TypeError, ValueError):
                raise SystemExit(f"Invalid limit in source token '{token}'.")
        else:
            spider = token.strip().lower()
            limit = 10
        if not spider:
            raise SystemExit(f"Invalid empty spider in token '{token}'.")
        if limit <= 0:
            raise SystemExit(f"Limit must be > 0 in token '{token}'.")
        specs.append((spider, limit))
    if not specs:
        raise SystemExit("No valid spiders parsed from --sources.")
    return specs


def _decode_json_dict(raw_text: str) -> dict[str, Any]:
    stripped = raw_text.strip()
    if not stripped:
        return {}
    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        return {"raw": stripped}
    if isinstance(payload, dict):
        return payload
    return {"raw": payload}


def _post_with_retries(
    *,
    url: str,
    token: str,
    payload: dict[str, Any],
    timeout: int,
    retries: int,
    retry_delay: float,
) -> tuple[int, dict[str, Any]]:
    attempts_total = retries + 1
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    for attempt in range(1, attempts_total + 1):
        req = urllib.request.Request(
            url=url,
            method="POST",
            headers={
                "X-NeuroWraith-Cron-Token": token,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            data=body,
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                status_code = int(getattr(resp, "status", 200))
                raw = resp.read().decode("utf-8", errors="replace")
            return status_code, _decode_json_dict(raw)
        except urllib.error.HTTPError as exc:
            message = f"HTTP {getattr(exc, 'code', 'unknown')}"
            try:
                response_body = exc.read().decode("utf-8", errors="replace").strip()
            except Exception:
                response_body = ""
            if response_body:
                message = f"{message}: {response_body[:500]}"
        except urllib.error.URLError as exc:
            message = str(exc)
        if attempt >= attempts_total:
            raise RuntimeError(message)
        if retry_delay > 0:
            time.sleep(retry_delay)
    raise RuntimeError("Request attempts exhausted.")


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    _validate_args(args)
    source_specs = _parse_sources(args.sources)

    base_dir = Path(args.neurowraith_base_dir).expanduser().resolve()
    runner = LocalNeuroWraithRunner(base_dir=base_dir)
    if not runner.is_available():
        print(
            "[push-neurowraith-to-vinfreak] local runner unavailable "
            f"(base_dir={base_dir})",
            file=sys.stderr,
        )
        return 1

    failures = 0
    total_inserted = 0
    total_updated = 0
    total_skipped = 0

    for spider, limit in source_specs:
        print(
            "[push-neurowraith-to-vinfreak] "
            f"running spider={spider} limit={limit}"
        )
        try:
            listings = runner.fetch(spider=spider, query=None, limit=limit)
        except LocalNeuroWraithRunnerError as exc:
            print(
                "[push-neurowraith-to-vinfreak] "
                f"spider={spider} fetch failed: {exc}",
                file=sys.stderr,
            )
            failures += 1
            if not args.continue_on_error:
                return 1
            continue
        except Exception as exc:
            print(
                "[push-neurowraith-to-vinfreak] "
                f"spider={spider} unexpected fetch error: {exc}",
                file=sys.stderr,
            )
            failures += 1
            if not args.continue_on_error:
                return 1
            continue

        payload: dict[str, Any] = {
            "spider": spider,
            "listings": listings,
            "limit_requested": limit,
            "run_type": "scheduled",
        }
        if args.mark_missing_removed:
            payload["mark_missing_removed"] = True

        try:
            status_code, response_payload = _post_with_retries(
                url=args.vinfreak_import_url,
                token=args.vinfreak_cron_token,
                payload=payload,
                timeout=args.timeout,
                retries=args.retries,
                retry_delay=args.retry_delay,
            )
        except RuntimeError as exc:
            print(
                "[push-neurowraith-to-vinfreak] "
                f"spider={spider} push failed: {exc}",
                file=sys.stderr,
            )
            failures += 1
            if not args.continue_on_error:
                return 1
            continue

        if status_code >= 400:
            print(
                "[push-neurowraith-to-vinfreak] "
                f"spider={spider} push failed with HTTP {status_code}",
                file=sys.stderr,
            )
            failures += 1
            if not args.continue_on_error:
                return 1
            continue

        total_inserted += int(response_payload.get("inserted") or 0)
        total_updated += int(response_payload.get("updated") or 0)
        total_skipped += int(response_payload.get("skipped") or 0)

        print(
            "[push-neurowraith-to-vinfreak] "
            f"spider={spider} inserted={response_payload.get('inserted', 0)} "
            f"updated={response_payload.get('updated', 0)} "
            f"skipped={response_payload.get('skipped', 0)} "
            f"received={response_payload.get('received', 0)}"
        )
        if args.verbose:
            print(json.dumps(response_payload, ensure_ascii=False, sort_keys=True))

    print(
        "[push-neurowraith-to-vinfreak] "
        f"done inserted={total_inserted} updated={total_updated} "
        f"skipped={total_skipped} failures={failures}"
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
