"""Slack integration helpers."""

from __future__ import annotations

from typing import Any, Mapping
import hashlib
import hmac
import math
import time
from urllib.parse import parse_qsl

import requests
from requests import RequestException

try:
    from backend.backend_settings import settings
except ModuleNotFoundError:  # pragma: no cover - fallback for package import
    from ..backend_settings import settings  # type: ignore

__all__ = [
    "send_car_created_alert",
    "send_channel_message",
    "send_ops_alert",
    "send_slash_command_response",
    "verify_slash_command_request",
]


def _coerce_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _format_price(value: Any) -> str | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    if abs(number) >= 1000:
        return f"${number:,.0f}"
    return f"${number:,.2f}"


def _build_car_summary(car: Mapping[str, Any]) -> str:
    title = _coerce_str(car.get("title"))
    if title:
        return title
    year = _coerce_str(car.get("year"))
    make = _coerce_str(car.get("make"))
    model = _coerce_str(car.get("model"))
    trim = _coerce_str(car.get("trim"))
    parts = [part for part in (year, make, model, trim) if part]
    if parts:
        return " ".join(parts)
    vin = _coerce_str(car.get("vin"))
    if vin:
        return f"VIN {vin}"
    return "New car listing"


def _build_message_payload(car: Mapping[str, Any]) -> dict[str, Any] | None:
    webhook = _coerce_str(settings.SLACK_WEBHOOK_URL)
    if not webhook:
        return None
    if not isinstance(car, Mapping):
        return None
    summary = _build_car_summary(car)
    price = _format_price(car.get("price"))
    status = _coerce_str(car.get("auction_status"))
    location_parts = [
        _coerce_str(car.get("city")),
        _coerce_str(car.get("state")),
    ]
    location = ", ".join([part for part in location_parts if part]) or _coerce_str(
        car.get("location_address")
    )
    url = _coerce_str(car.get("url"))
    source = _coerce_str(car.get("source"))

    lines: list[str] = [f"*New car added*: {summary}"]
    if price:
        lines.append(f"*Price:* {price}")
    if status:
        lines.append(f"*Status:* {status}")
    if location:
        lines.append(f"*Location:* {location}")
    if source:
        lines.append(f"*Source:* {source}")
    if url:
        lines.append(f"<{url}|View listing>")

    payload: dict[str, Any] = {
        "webhook": webhook,
        "json": {"text": "\n".join(lines)},
    }
    channel = _coerce_str(settings.SLACK_CAR_ALERT_CHANNEL)
    if channel:
        payload["json"]["channel"] = channel
    return payload


def _header_value(headers: Mapping[str, Any], key: str) -> str:
    target = str(key or "").strip().lower()
    if not target:
        return ""
    for raw_key, raw_value in (headers or {}).items():
        if str(raw_key).strip().lower() != target:
            continue
        return str(raw_value or "").strip()
    return ""


def _as_bytes(value: bytes | str | None) -> bytes:
    if isinstance(value, bytes):
        return value
    if isinstance(value, str):
        return value.encode("utf-8")
    return b""


def _post_webhook_json(
    webhook: str | None,
    payload: Mapping[str, Any],
) -> bool:
    target = _coerce_str(webhook)
    if not target:
        return False
    try:
        response = requests.post(target, json=dict(payload), timeout=5)
    except RequestException:
        return False
    return bool(getattr(response, "ok", False))


def _slack_api_token() -> str | None:
    return _coerce_str(getattr(settings, "SLACK_BOT_TOKEN", None))


def _post_web_api_json(
    method: str,
    payload: Mapping[str, Any],
    *,
    timeout: int = 10,
) -> dict[str, Any] | None:
    token = _slack_api_token()
    endpoint = _coerce_str(method)
    if not token or not endpoint:
        return None
    url = f"https://slack.com/api/{endpoint}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
    }
    for attempt in range(2):
        try:
            response = requests.post(
                url,
                headers=headers,
                json=dict(payload),
                timeout=timeout,
            )
        except RequestException:
            return None
        if response.status_code == 429 and attempt == 0:
            retry_after = _coerce_str(response.headers.get("Retry-After"))
            try:
                sleep_seconds = max(1, min(10, int(retry_after or "1")))
            except (TypeError, ValueError):
                sleep_seconds = 1
            time.sleep(sleep_seconds)
            continue
        try:
            data = response.json()
        except ValueError:
            return None
        if response.ok and bool(data.get("ok")):
            return data
        return None
    return None


def verify_slash_command_request(
    headers: Mapping[str, Any] | None,
    raw_body: bytes | str | None,
) -> bool:
    body_bytes = _as_bytes(raw_body)
    signing_secret = _coerce_str(
        getattr(settings, "SLACK_COMMAND_SIGNING_SECRET", None)
    )
    if signing_secret:
        signature = _header_value(headers or {}, "X-Slack-Signature")
        timestamp = _header_value(headers or {}, "X-Slack-Request-Timestamp")
        if not signature or not timestamp:
            return False
        try:
            request_ts = int(timestamp)
        except (TypeError, ValueError):
            return False
        now = int(time.time())
        if abs(now - request_ts) > 300:
            return False
        base = b"v0:" + timestamp.encode("utf-8") + b":" + body_bytes
        digest = "v0=" + hmac.new(
            signing_secret.encode("utf-8"),
            base,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(signature, digest)

    verification_token = _coerce_str(
        getattr(settings, "SLACK_COMMAND_VERIFICATION_TOKEN", None)
    )
    if verification_token:
        parsed = dict(parse_qsl(body_bytes.decode("utf-8", errors="ignore")))
        token = _coerce_str(parsed.get("token"))
        if token:
            return hmac.compare_digest(token, verification_token)
    return False


def send_slash_command_response(
    response_url: str | None,
    text: str | None,
    *,
    response_type: str = "ephemeral",
    blocks: list[Mapping[str, Any]] | None = None,
    attachments: list[Mapping[str, Any]] | None = None,
) -> bool:
    target_url = _coerce_str(response_url)
    message = _coerce_str(text)
    normalized_blocks = [
        dict(item) for item in (blocks or []) if isinstance(item, Mapping)
    ]
    normalized_attachments = [
        dict(item) for item in (attachments or []) if isinstance(item, Mapping)
    ]
    if not target_url or (
        not message and not normalized_blocks and not normalized_attachments
    ):
        return False
    visibility = response_type if response_type in {"ephemeral", "in_channel"} else "ephemeral"
    payload: dict[str, Any] = {"response_type": visibility}
    if message:
        payload["text"] = message
    if normalized_blocks:
        payload["blocks"] = normalized_blocks
    if normalized_attachments:
        payload["attachments"] = normalized_attachments
    return _post_webhook_json(
        target_url,
        payload,
    )


def send_channel_message(
    channel: str | None,
    text: str | None,
    *,
    thread_ts: str | None = None,
    reply_broadcast: bool = False,
) -> dict[str, Any] | None:
    destination = _coerce_str(channel)
    message = _coerce_str(text)
    if not destination or not message:
        return None
    payload: dict[str, Any] = {
        "channel": destination,
        "text": message,
        "mrkdwn": True,
    }
    thread_value = _coerce_str(thread_ts)
    if thread_value:
        payload["thread_ts"] = thread_value
        if reply_broadcast:
            payload["reply_broadcast"] = True
    return _post_web_api_json("chat.postMessage", payload)


def send_ops_alert(
    text: str,
    *,
    channel: str | None = None,
) -> bool:
    message = _coerce_str(text)
    if not message:
        return False
    webhook = _coerce_str(getattr(settings, "SLACK_ALERT_WEBHOOK_URL", None))
    if not webhook:
        webhook = _coerce_str(getattr(settings, "SLACK_WEBHOOK_URL", None))
    if not webhook:
        return False
    target_channel = _coerce_str(channel) or _coerce_str(
        getattr(settings, "SLACK_ALERT_CHANNEL", None)
    )
    payload: dict[str, Any] = {"text": message}
    if target_channel:
        payload["channel"] = target_channel
    return _post_webhook_json(webhook, payload)


def send_car_created_alert(car: Mapping[str, Any] | None) -> None:
    payload = _build_message_payload(car or {})
    if not payload:
        return
    _post_webhook_json(payload["webhook"], payload["json"])
