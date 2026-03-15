#!/usr/bin/env python3
"""Health-gated NeuroWraith cron trigger.

Flow:
1) Authenticate to remote NeuroWraith (`POST /login`).
2) Probe `/spiders` with the authenticated session.
3) Trigger VinFreak `POST /internal/neurowraith/cron` when healthy.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

DEFAULT_HEALTH_TIMEOUT_SECONDS = 20
DEFAULT_TRIGGER_TIMEOUT_SECONDS = 120
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
            "Login to NeuroWraith and verify /spiders before triggering "
            "VinFreak /internal/neurowraith/cron."
        )
    )
    parser.add_argument(
        "--neurowraith-url",
        default=_env_first("NEUROWRATH_API_BASE_URL", "NEUROWRATH_BASE_URL"),
        help=(
            "NeuroWraith base URL, for example https://neurowraith.example.com "
            "(env: NEUROWRATH_API_BASE_URL or NEUROWRATH_BASE_URL)."
        ),
    )
    parser.add_argument(
        "--neurowraith-username",
        default=_env_first("NEUROWRATH_USERNAME"),
        help="NeuroWraith username (env: NEUROWRATH_USERNAME).",
    )
    parser.add_argument(
        "--neurowraith-password",
        default=_env_first("NEUROWRATH_PASSWORD"),
        help="NeuroWraith password (env: NEUROWRATH_PASSWORD).",
    )
    parser.add_argument(
        "--require-spiders",
        default=_env_first("NEUROWRATH_REQUIRE_SPIDERS"),
        help=(
            "Comma-separated spider IDs expected in /spiders "
            "(example: bringatrailer,carsandbids)."
        ),
    )
    parser.add_argument(
        "--vinfreak-cron-url",
        default=_env_first("VINFREAK_NEUROWRATH_CRON_URL"),
        help=(
            "Full VinFreak cron endpoint URL "
            "(env: VINFREAK_NEUROWRATH_CRON_URL)."
        ),
    )
    parser.add_argument(
        "--vinfreak-cron-token",
        default=_env_first(
            "VINFREAK_NEUROWRATH_CRON_TOKEN",
            "NEUROWRATH_CRON_TOKEN",
        ),
        help=(
            "VinFreak cron token (env: VINFREAK_NEUROWRATH_CRON_TOKEN "
            "or NEUROWRATH_CRON_TOKEN)."
        ),
    )
    parser.add_argument(
        "--health-timeout",
        type=int,
        default=int(
            _env_first("VINFREAK_NEUROWRATH_HEALTH_TIMEOUT")
            or DEFAULT_HEALTH_TIMEOUT_SECONDS
        ),
        help="Timeout in seconds for NeuroWraith login/probe requests (default: 20).",
    )
    parser.add_argument(
        "--trigger-timeout",
        type=int,
        default=int(
            _env_first("VINFREAK_NEUROWRATH_TRIGGER_TIMEOUT")
            or DEFAULT_TRIGGER_TIMEOUT_SECONDS
        ),
        help="Timeout in seconds for VinFreak cron trigger request (default: 120).",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=int(_env_first("VINFREAK_NEUROWRATH_CRON_RETRIES") or "2"),
        help="Retry attempts after the initial request (default: 2).",
    )
    parser.add_argument(
        "--retry-delay",
        type=float,
        default=float(
            _env_first("VINFREAK_NEUROWRATH_CRON_RETRY_DELAY")
            or DEFAULT_RETRY_DELAY_SECONDS
        ),
        help="Seconds to sleep between retries (default: 15).",
    )
    parser.add_argument(
        "--fail-on-skipped",
        action="store_true",
        help=(
            "Exit with failure when VinFreak returns "
            '{"status":"skipped"} (no enabled sources).'
        ),
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print detailed payloads.",
    )
    return parser


def _validate_args(args: argparse.Namespace) -> None:
    if not args.neurowraith_url:
        raise SystemExit(
            "Missing --neurowraith-url (or env NEUROWRATH_API_BASE_URL)."
        )
    if not args.neurowraith_username:
        raise SystemExit(
            "Missing --neurowraith-username (or env NEUROWRATH_USERNAME)."
        )
    if not args.neurowraith_password:
        raise SystemExit(
            "Missing --neurowraith-password (or env NEUROWRATH_PASSWORD)."
        )
    if not args.vinfreak_cron_url:
        raise SystemExit(
            "Missing --vinfreak-cron-url (or env VINFREAK_NEUROWRATH_CRON_URL)."
        )
    if not args.vinfreak_cron_token:
        raise SystemExit(
            "Missing --vinfreak-cron-token (or env VINFREAK_NEUROWRATH_CRON_TOKEN / "
            "NEUROWRATH_CRON_TOKEN)."
        )
    for field in ("health_timeout", "trigger_timeout"):
        if getattr(args, field) <= 0:
            raise SystemExit(f"--{field.replace('_', '-')} must be greater than zero.")
    if args.retries < 0:
        raise SystemExit("--retries cannot be negative.")
    if args.retry_delay < 0:
        raise SystemExit("--retry-delay cannot be negative.")


def _join_url(base_url: str, path: str) -> str:
    normalized_base = base_url.rstrip("/") + "/"
    return urllib.parse.urljoin(normalized_base, path.lstrip("/"))


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


def _extract_http_error(exc: urllib.error.HTTPError) -> str:
    status = getattr(exc, "code", "unknown")
    body = ""
    try:
        body = exc.read().decode("utf-8", errors="replace").strip()
    except Exception:
        body = ""
    if body:
        return f"HTTP {status}: {body[:500]}"
    return f"HTTP {status}"


def _build_neurowraith_opener() -> urllib.request.OpenerDirector:
    cookie_jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))


def _check_neurowraith_health(args: argparse.Namespace) -> tuple[list[str], dict[str, Any]]:
    opener = _build_neurowraith_opener()
    login_url = _join_url(args.neurowraith_url, "/login")
    spiders_url = _join_url(args.neurowraith_url, "/spiders")

    login_data = urllib.parse.urlencode(
        {
            "username": args.neurowraith_username,
            "password": args.neurowraith_password,
        }
    ).encode("utf-8")
    login_req = urllib.request.Request(
        url=login_url,
        method="POST",
        data=login_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        opener.open(login_req, timeout=args.health_timeout)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(
            f"NeuroWraith login failed ({_extract_http_error(exc)})"
        ) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"NeuroWraith login request failed ({exc})") from exc

    spiders_req = urllib.request.Request(
        url=spiders_url,
        method="GET",
        headers={"Accept": "application/json"},
    )
    try:
        with opener.open(spiders_req, timeout=args.health_timeout) as resp:
            status_code = int(getattr(resp, "status", 200))
            raw_body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(
            f"NeuroWraith /spiders probe failed ({_extract_http_error(exc)})"
        ) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"NeuroWraith /spiders request failed ({exc})") from exc

    if status_code >= 400:
        raise RuntimeError(f"NeuroWraith /spiders returned HTTP {status_code}")

    payload = _decode_json_dict(raw_body)
    spiders_value = payload.get("spiders")
    if not isinstance(spiders_value, list):
        raise RuntimeError("NeuroWraith /spiders payload is missing list field 'spiders'.")

    spider_ids: list[str] = []
    for item in spiders_value:
        if not isinstance(item, dict):
            continue
        spider_id = str(item.get("id") or "").strip()
        if spider_id:
            spider_ids.append(spider_id)

    if not spider_ids:
        raise RuntimeError("NeuroWraith /spiders returned no spider IDs.")

    required_raw = str(args.require_spiders or "").strip()
    if required_raw:
        required = [token.strip() for token in required_raw.split(",") if token.strip()]
        missing = [spider for spider in required if spider not in spider_ids]
        if missing:
            raise RuntimeError(
                "NeuroWraith is up but missing required spiders: "
                + ", ".join(missing)
            )

    return spider_ids, payload


def _trigger_vinfreak_cron(
    *,
    cron_url: str,
    cron_token: str,
    timeout_seconds: int,
) -> tuple[int, dict[str, Any]]:
    req = urllib.request.Request(
        url=cron_url,
        method="POST",
        headers={
            "X-NeuroWraith-Cron-Token": cron_token,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        data=b"{}",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            status_code = int(getattr(resp, "status", 200))
            body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        detail = _extract_http_error(exc)
        raise RuntimeError(f"VinFreak cron request failed ({detail})") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"VinFreak cron request failed ({exc})") from exc

    return status_code, _decode_json_dict(body)


def _run(args: argparse.Namespace) -> int:
    attempts_total = args.retries + 1
    for index in range(1, attempts_total + 1):
        try:
            spider_ids, health_payload = _check_neurowraith_health(args)
            status_code, cron_payload = _trigger_vinfreak_cron(
                cron_url=args.vinfreak_cron_url,
                cron_token=args.vinfreak_cron_token,
                timeout_seconds=args.trigger_timeout,
            )
            if status_code >= 400:
                raise RuntimeError(f"VinFreak cron returned HTTP {status_code}")

            cron_status = str(cron_payload.get("status") or "").strip().lower()
            if cron_status not in {"ok", "skipped"}:
                raise RuntimeError(
                    f"Unexpected VinFreak cron response: {cron_payload!r}"
                )
            if cron_status == "skipped" and args.fail_on_skipped:
                raise RuntimeError(
                    "VinFreak returned skipped (no enabled NeuroWraith sources)."
                )

            print(
                "[trigger-neurowraith-with-health] "
                f"OK attempt={index}/{attempts_total} spiders={len(spider_ids)} "
                f"cron_status={cron_status}"
            )
            if args.verbose:
                print("[health-payload]")
                print(json.dumps(health_payload, ensure_ascii=False, sort_keys=True))
                print("[cron-payload]")
                print(json.dumps(cron_payload, ensure_ascii=False, sort_keys=True))
            return 0
        except RuntimeError as exc:
            print(
                "[trigger-neurowraith-with-health] "
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
    return _run(args)


if __name__ == "__main__":
    raise SystemExit(main())
