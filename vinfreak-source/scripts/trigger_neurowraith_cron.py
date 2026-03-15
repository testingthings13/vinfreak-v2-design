#!/usr/bin/env python3
"""Trigger VinFreak's NeuroWraith cron endpoint from an external cron host."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any

DEFAULT_TIMEOUT_SECONDS = 120
DEFAULT_RETRY_DELAY_SECONDS = 15.0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Call VinFreak POST /internal/neurowraith/cron with "
            "X-NeuroWraith-Cron-Token from an external cron server."
        )
    )
    parser.add_argument(
        "--url",
        default=os.getenv("VINFREAK_NEUROWRATH_CRON_URL", "").strip(),
        help=(
            "Full endpoint URL (or env VINFREAK_NEUROWRATH_CRON_URL), "
            "for example https://vinfreak.example.com/internal/neurowraith/cron"
        ),
    )
    parser.add_argument(
        "--token",
        default=(
            os.getenv("VINFREAK_NEUROWRATH_CRON_TOKEN")
            or os.getenv("NEUROWRATH_CRON_TOKEN")
            or ""
        ).strip(),
        help=(
            "Cron token value. Reads VINFREAK_NEUROWRATH_CRON_TOKEN "
            "or NEUROWRATH_CRON_TOKEN by default."
        ),
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=int(
            os.getenv("VINFREAK_NEUROWRATH_CRON_TIMEOUT", DEFAULT_TIMEOUT_SECONDS)
        ),
        help="Request timeout in seconds (default: 120).",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=int(os.getenv("VINFREAK_NEUROWRATH_CRON_RETRIES", "2")),
        help="Retry attempts after the initial request (default: 2).",
    )
    parser.add_argument(
        "--retry-delay",
        type=float,
        default=float(
            os.getenv(
                "VINFREAK_NEUROWRATH_CRON_RETRY_DELAY",
                str(DEFAULT_RETRY_DELAY_SECONDS),
            )
        ),
        help="Seconds to sleep between retries (default: 15).",
    )
    parser.add_argument(
        "--fail-on-skipped",
        action="store_true",
        help=(
            "Exit with failure when API returns "
            '{"status":"skipped"} (no enabled sources).'
        ),
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print extra response/debug details.",
    )
    return parser


def _validate_args(args: argparse.Namespace) -> None:
    if not args.url:
        raise SystemExit(
            "Missing --url (or env VINFREAK_NEUROWRATH_CRON_URL)."
        )
    if not args.token:
        raise SystemExit(
            "Missing --token (or env VINFREAK_NEUROWRATH_CRON_TOKEN / "
            "NEUROWRATH_CRON_TOKEN)."
        )
    if args.timeout <= 0:
        raise SystemExit("--timeout must be greater than zero.")
    if args.retries < 0:
        raise SystemExit("--retries cannot be negative.")
    if args.retry_delay < 0:
        raise SystemExit("--retry-delay cannot be negative.")


def _request(url: str, token: str, timeout: int) -> tuple[int, dict[str, Any]]:
    req = urllib.request.Request(
        url=url,
        method="POST",
        headers={
            "X-NeuroWraith-Cron-Token": token,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        data=b"{}",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        status = int(getattr(resp, "status", 200))
        body = resp.read().decode("utf-8", errors="replace").strip()
    if not body:
        return status, {}
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        payload = {"raw": body}
    if not isinstance(payload, dict):
        payload = {"raw": payload}
    return status, payload


def _attempt(args: argparse.Namespace) -> int:
    attempts_total = args.retries + 1
    for index in range(1, attempts_total + 1):
        try:
            status_code, payload = _request(args.url, args.token, args.timeout)
            status_text = str(payload.get("status") or "").strip().lower()

            if status_code >= 400:
                msg = payload.get("detail") or payload.get("reason") or payload
                raise RuntimeError(f"HTTP {status_code}: {msg}")

            if status_text not in {"ok", "skipped"}:
                raise RuntimeError(
                    f"Unexpected response status: {payload!r}"
                )

            if status_text == "skipped" and args.fail_on_skipped:
                raise RuntimeError(
                    "VinFreak returned skipped (no enabled NeuroWraith sources)."
                )

            label = "OK" if status_text == "ok" else "SKIPPED"
            print(f"[trigger-neurowraith-cron] {label} attempt={index}/{attempts_total}")
            if args.verbose:
                print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
            return 0
        except (urllib.error.URLError, TimeoutError, RuntimeError) as exc:
            print(
                "[trigger-neurowraith-cron] "
                f"attempt={index}/{attempts_total} failed: {exc}",
                file=sys.stderr,
            )
            if index >= attempts_total:
                return 1
            if args.retry_delay > 0:
                time.sleep(args.retry_delay)
    return 1


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    _validate_args(args)
    return _attempt(args)


if __name__ == "__main__":
    raise SystemExit(main())
