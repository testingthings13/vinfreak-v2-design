"""Utilities for fetching listing data and structuring it with Grok."""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup
from requests import Response
from requests.exceptions import RequestException

from backend.backend_settings import settings

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 NeuroAI/1.0"
)
LISTING_MODEL = "grok-4-fast-reasoning"
DEFAULT_TIMEOUT = 45
MAX_LISTING_CHARS = 12000
NEUROAI_LOGIN_PATH = "/login"
NEUROAI_BATCH_PATH = "/grok/fetch-batch"
DEFAULT_NEUROAI_TIMEOUT = 1800
NEUROAI_TIMEOUT = max(
    30,
    int(
        getattr(settings, "NEUROAI_REQUEST_TIMEOUT_SECONDS", DEFAULT_NEUROAI_TIMEOUT)
        or DEFAULT_NEUROAI_TIMEOUT
    ),
)
NEUROAI_FRONTEND = "vinfreak-neuroai-admin"
DEFAULT_NEUROAI_BATCH_SIZE = 1000
NEUROAI_MAX_BATCH_SIZE = max(
    1,
    int(
        getattr(settings, "NEUROAI_MAX_URLS_PER_REQUEST", DEFAULT_NEUROAI_BATCH_SIZE)
        or DEFAULT_NEUROAI_BATCH_SIZE
    ),
)

SCHEMA_FIELDS: Sequence[tuple[str, str]] = (
    ("source_url", "Canonical URL for the listing (string)."),
    ("marketplace", "Marketplace or dealer name, e.g. 'Cars & Bids' (string or null)."),
    ("listing_id", "Marketplace identifier or lot number if available (string or null)."),
    ("status", "Sale status such as LIVE, SOLD, PENDING (string or null)."),
    ("posted_at", "ISO8601 timestamp or date if present (string or null)."),
    (
        "end_time",
        "ISO8601 timestamp describing when the auction ends (string or null).",
    ),
    (
        "time_left",
        "Countdown text or duration remaining for the auction (string or null).",
    ),
    ("title", "Headline for the vehicle (string)."),
    ("year", "Model year as an integer or null."),
    ("make", "Manufacturer name (string or null)."),
    ("model", "Model name (string or null)."),
    ("trim", "Trim or variant (string or null)."),
    ("vin", "Vehicle identification number without spaces (string or null)."),
    ("price", "Asking price as a number (no currency symbols) or null."),
    ("currency", "Currency code like USD, EUR (string or null)."),
    ("mileage", "Mileage as a number of miles or kilometres (integer or null)."),
    ("body_style", "Body style or type (string or null)."),
    ("drivetrain", "Drivetrain such as AWD, RWD (string or null)."),
    ("transmission", "Transmission description, ideally Manual/Automatic (string or null)."),
    ("engine", "Engine description (string or null)."),
    ("exterior_color", "Exterior colour (string or null)."),
    ("interior_color", "Interior colour (string or null)."),
    ("location_city", "City or locality (string or null)."),
    ("location_state", "State/region/province (string or null)."),
    ("location_country", "Country name or code (string or null)."),
    ("highlights", "Array of 3-6 punchy bullet highlights (array of strings)."),
    ("description", "Paragraph summary of the listing (string)."),
    ("equipment", "Array describing notable factory equipment/options (array of strings)."),
    ("modifications", "Array of significant modifications (array of strings)."),
    ("known_flaws", "Array calling out known flaws/issues (array of strings)."),
    ("service_history", "Array summarising maintenance/records (array of strings)."),
    ("seller_notes", "Array of any seller comments or disclosures (array of strings)."),
    ("seller_name", "Seller or contact name (string or null)."),
    ("dealer_name", "Dealership/showroom name if present (string or null)."),
    ("seller_type", "Seller type such as Dealer or Private Party (string or null)."),
    ("image_urls", "Array of direct, deduplicated image URLs (array of strings, may be empty)."),
)

ARRAY_FIELDS = {
    "highlights",
    "equipment",
    "modifications",
    "known_flaws",
    "service_history",
    "seller_notes",
    "image_urls",
}

SCHEMA_DESCRIPTION = "\n".join(
    f"- ``{name}``: {description}" for name, description in SCHEMA_FIELDS
)

SYSTEM_MESSAGE = (
    "You are NeuroAI, a specialist that converts car listings into structured"
    " JSON for the VINFREAK marketplace. Always obey the schema, respond in"
    " JSON mode, and never include markdown fences."
)


class GrokAPIError(RuntimeError):
    """Raised when an HTTP call to Grok fails."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


@dataclass
class GrokResult:
    """Container for each processed listing."""

    url: str | None
    prompt: str
    listing_text: str
    image_urls: list[str]
    raw_response: dict[str, Any] | None = None
    parsed_payload: dict[str, Any] | None = None
    normalized: dict[str, Any] | None = None
    error: str | None = None


def _default_headers() -> dict[str, str]:
    return {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
    }


def _neuroai_base_url() -> str:
    base = (settings.NEUROAI_BASE_URL or "").strip()
    if not base:
        raise GrokAPIError("NeuroAI base URL is not configured")
    return base.rstrip("/")


def _login_to_neuroai(session: requests.Session) -> str:
    base_url = _neuroai_base_url()
    login_url = f"{base_url}{NEUROAI_LOGIN_PATH}"
    payload = {
        "username": settings.NEUROAI_USERNAME,
        "password": settings.NEUROAI_PASSWORD,
    }
    try:
        response = session.post(login_url, data=payload, timeout=15)
    except RequestException as exc:  # pragma: no cover - depends on network failures
        raise GrokAPIError(f"Unable to contact NeuroAI login: {exc}") from exc
    if response.status_code >= 400:
        raise GrokAPIError(
            f"NeuroAI login failed with status {response.status_code}",
            status_code=response.status_code,
        )
    return base_url


def fetch_listing(url: str, *, session: requests.Session | None = None) -> tuple[str, str]:
    """Return HTML for ``url`` and the resolved final URL."""

    sess = session or requests.Session()
    try:
        response: Response = sess.get(url, headers=_default_headers(), timeout=20)
    except RequestException as exc:  # pragma: no cover - depends on network failures
        raise GrokAPIError(f"Failed to download listing: {exc}") from exc
    if response.status_code >= 400:
        raise GrokAPIError(
            f"Listing request returned {response.status_code} for {url}",
            status_code=response.status_code,
        )
    return response.text, str(response.url or url)


def strip_boilerplate(html: str, *, max_chars: int = MAX_LISTING_CHARS) -> str:
    """Return condensed text content from an HTML page."""

    soup = BeautifulSoup(html, "lxml")
    for tag in soup(['script', 'style', 'noscript', 'svg', 'iframe']):
        tag.decompose()
    for tag in soup(['header', 'footer', 'nav', 'aside']):
        tag.extract()
    text = soup.get_text(separator="\n", strip=True)
    text = re.sub(r"\n{2,}", "\n", text)
    text = re.sub(r"\s+", " ", text)
    text = text.strip()
    if len(text) > max_chars:
        text = text[:max_chars]
    return text


def _split_srcset(value: str) -> Iterable[str]:
    for part in value.split(','):
        cleaned = part.strip().split(' ')[0].strip()
        if cleaned:
            yield cleaned


def extract_image_urls(html: str, base_url: str) -> list[str]:
    """Extract image URLs from meta tags, img tags and srcsets."""

    soup = BeautifulSoup(html, "lxml")
    discovered: list[str] = []
    seen: set[str] = set()

    def _add(candidate: str | None) -> None:
        if not candidate:
            return
        absolute = urljoin(base_url, candidate)
        if absolute not in seen:
            seen.add(absolute)
            discovered.append(absolute)

    for meta in soup.select("meta[property='og:image'], meta[name='og:image']"):
        _add(meta.get("content"))

    for tag in soup.find_all("img"):
        _add(tag.get("data-src") or tag.get("data-lazy") or tag.get("src"))
        srcset = tag.get("srcset")
        if srcset:
            for item in _split_srcset(srcset):
                _add(item)

    for tag in soup.find_all("source"):
        srcset = tag.get("srcset")
        if srcset:
            for item in _split_srcset(srcset):
                _add(item)

    return discovered


def build_prompt(url: str, listing_text: str, image_urls: Sequence[str]) -> str:
    """Return the structured prompt Grok should receive."""

    image_section = "\n".join(f"- {img}" for img in image_urls) if image_urls else "(none)"
    prompt_parts = [
        "You must produce a single JSON object that matches the schema.",
        "Every key listed below must be present once. Use null or an empty array when data is missing.",
        "Do not invent vehicles that are not in the listing.",
        "Schema:",
        SCHEMA_DESCRIPTION,
        "\nDiscovered image URLs (deduplicated, prefer highest resolution):",
        image_section,
        "\nListing URL:",
        url,
        "\nListing text (trimmed):",
        listing_text,
    ]
    return "\n\n".join(prompt_parts)


def _summarize_http_error(response: Response) -> str:
    snippet = response.text[:400] if response.text else ""
    snippet = snippet.replace("\n", " ").strip()
    return f"HTTP {response.status_code}: {snippet}" if snippet else f"HTTP {response.status_code}"


def call_grok(prompt: str, *, system_message: str | None = None) -> dict[str, Any]:
    """Invoke Grok and return the raw JSON response."""

    api_key = settings.GROK_API_KEY
    if not api_key:
        raise GrokAPIError("Grok API key is not configured")

    payload = {
        "model": LISTING_MODEL,
        "messages": [
            {"role": "system", "content": system_message or SYSTEM_MESSAGE},
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        "max_output_tokens": 1200,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Frontend": "vinfreak-neuroai-admin",
    }
    try:
        response = requests.post(
            "https://api.x.ai/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=settings.GROK_TIMEOUT_SECONDS or DEFAULT_TIMEOUT,
        )
    except RequestException as exc:  # pragma: no cover - network failure path
        raise GrokAPIError(f"Unable to contact Grok: {exc}") from exc
    if response.status_code >= 400:
        raise GrokAPIError(_summarize_http_error(response), status_code=response.status_code)
    try:
        return response.json()
    except ValueError as exc:
        raise GrokAPIError("Invalid JSON response from Grok") from exc


def _extract_json_payload(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if "```" in text:
            text = text.rsplit("```", 1)[0]
    try:
        return json.loads(text)
    except ValueError as exc:
        raise GrokAPIError("Grok response was not valid JSON") from exc


def _ensure_keys(payload: dict[str, Any]) -> dict[str, Any]:
    for key, _ in SCHEMA_FIELDS:
        if key in ARRAY_FIELDS:
            payload.setdefault(key, [])
        else:
            payload.setdefault(key, None)
    if not isinstance(payload.get("image_urls"), list):
        payload["image_urls"] = []
    return payload


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    if isinstance(value, (int, float)):
        return str(value)
    return None


def _normalize_listing_url(*values: Any) -> str | None:
    for raw in values:
        if not isinstance(raw, str):
            continue
        candidate = raw.strip()
        if not candidate:
            continue
        if candidate.startswith(("http://", "https://")):
            return candidate
        if candidate.startswith("//"):
            return f"https:{candidate}"

        parsed = urlparse(candidate)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            return urlunparse(
                (
                    parsed.scheme.lower(),
                    parsed.netloc,
                    parsed.path or "",
                    parsed.params,
                    parsed.query,
                    parsed.fragment,
                )
            )
        if parsed.netloc:
            return urlunparse(
                (
                    "https",
                    parsed.netloc,
                    parsed.path or "",
                    parsed.params,
                    parsed.query,
                    parsed.fragment,
                )
            )
        if " " not in candidate and "." in candidate:
            return f"https://{candidate}"
    return None


def _clean_vin(value: Any) -> str | None:
    text = _clean_str(value)
    if not text:
        return None
    vin = re.sub(r"[^A-HJ-NPR-Z0-9]", "", text.upper())
    return vin or None


def _clean_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
    if isinstance(value, str):
        digits = re.findall(r"[0-9]+", value.replace(",", ""))
        if not digits:
            return None
        try:
            return int(digits[0])
        except ValueError:
            return None
    return None


def _clean_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace(",", "").strip()
        match = re.search(r"-?[0-9]+(?:\.[0-9]+)?", cleaned)
        if not match:
            return None
        try:
            return float(match.group(0))
        except ValueError:
            return None
    return None


def _clean_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        result = []
        for item in value:
            text = _clean_str(item)
            if text:
                result.append(text)
        return result
    text = _clean_str(value)
    if text:
        return [text]
    return []


def _pick_str(record: Mapping[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = record.get(key)
        text = _clean_str(value)
        if text:
            return text
    return None


def _combine_end_components(record: Mapping[str, Any]) -> str | None:
    direct = _pick_str(
        record,
        "end_time",
        "endTime",
        "end_datetime",
        "endDatetime",
        "auction_end",
        "auctionEnd",
        "auction_end_time",
        "auction_end_time_utc",
        "auction_end_datetime",
        "auction_end_datetime_utc",
        "auctionEndDateTime",
        "auction_endDateTime",
        "auction_ending",
    )
    if direct:
        return direct

    date_value = _pick_str(
        record,
        "end_date",
        "endDate",
        "auction_end_date",
        "auctionEndDate",
        "auction_endDate",
        "auctionEnd",
    )
    time_value = _pick_str(
        record,
        "end_time_component",
        "auction_end_time_component",
        "auctionEndTime",
        "auction_endTime",
        "auction_end_time_local",
    )

    if date_value and time_value:
        if "T" in date_value:
            return f"{date_value}{time_value}"
        if date_value.endswith("Z") or date_value.endswith("z"):
            return f"{date_value[:-1]}T{time_value}Z"
        return f"{date_value}T{time_value}"

    return date_value


def transform_listing(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalise Grok output into a structure ready for DB import."""

    record = _ensure_keys(dict(payload))

    image_urls = []
    for url in record.get("image_urls") or []:
        if not isinstance(url, str):
            continue
        absolute = url.strip()
        if absolute and absolute not in image_urls:
            image_urls.append(absolute)

    city = _clean_str(record.get("location_city"))
    state = _clean_str(record.get("location_state"))
    country = _clean_str(record.get("location_country"))

    def _split_address(value: str | None) -> tuple[str | None, str | None]:
        if not value:
            return None, None
        parts = [part.strip() for part in re.split(r"[,\n]", value) if part.strip()]
        if not parts:
            return None, None
        city_part = parts[0]
        state_part = parts[-1] if len(parts) > 1 else None
        return city_part or None, state_part or None

    raw_address = _clean_str(record.get("location_address"))
    if not raw_address:
        raw_address = _clean_str(record.get("location"))

    if raw_address:
        parsed_city, parsed_state = _split_address(raw_address)
        city = city or parsed_city
        state = state or parsed_state

    location_parts = [part for part in [city, state, country] if part]
    location_address = raw_address or (", ".join(location_parts) if location_parts else None)

    highlights = _clean_list(record.get("highlights"))
    equipment = _clean_list(record.get("equipment"))
    modifications = _clean_list(record.get("modifications"))
    flaws = _clean_list(record.get("known_flaws"))
    service = _clean_list(record.get("service_history"))
    seller_notes = _clean_list(record.get("seller_notes"))

    normalized = {
        "source_url": _normalize_listing_url(record.get("source_url")),
        "marketplace": _clean_str(record.get("marketplace")),
        "listing_id": _clean_str(record.get("listing_id")),
        "status": _clean_str(record.get("status")),
        "posted_at": _clean_str(record.get("posted_at")),
        "end_time": _combine_end_components(record),
        "time_left": _pick_str(
            record,
            "time_left",
            "timeLeft",
            "time_remaining",
            "timeRemaining",
            "countdown",
            "countdown_timer",
            "countdownTimer",
            "auction_time_left",
            "auctionTimeLeft",
        ),
        "title": _clean_str(record.get("title")),
        "year": _clean_int(record.get("year")),
        "make": _clean_str(record.get("make")),
        "model": _clean_str(record.get("model")),
        "trim": _clean_str(record.get("trim")),
        "vin": _clean_vin(record.get("vin")),
        "price": _clean_float(record.get("price")),
        "currency": (_clean_str(record.get("currency")) or "USD"),
        "mileage": _clean_int(record.get("mileage")),
        "body_style": _clean_str(record.get("body_style")),
        "drivetrain": _clean_str(record.get("drivetrain")),
        "transmission": _clean_str(record.get("transmission")),
        "engine": _clean_str(record.get("engine")),
        "exterior_color": _clean_str(record.get("exterior_color")),
        "interior_color": _clean_str(record.get("interior_color")),
        "city": city,
        "state": state,
        "country": country,
        "location_address": location_address,
        "highlights": highlights,
        "equipment": equipment,
        "modifications": modifications,
        "known_flaws": flaws,
        "service_history": service,
        "seller_notes": seller_notes,
        "description": _clean_str(record.get("description")),
        "seller_name": _clean_str(record.get("seller_name")),
        "dealer_name": _clean_str(record.get("dealer_name")),
        "seller_type": _clean_str(record.get("seller_type")),
        "image_urls": image_urls,
    }

    def _from_domain(url: str | None) -> str | None:
        if not url:
            return None
        parsed = urlparse(url)
        host = parsed.netloc or ""
        host = host.split(":")[0]
        host = host.replace("www.", "")
        host = re.sub(r"[-_]", " ", host)
        host = re.sub(r"\s+", " ", host).strip()
        if not host:
            return None
        if "." in host and " " not in host:
            host = host.split(".")[0]
        return host.title()

    source_name = (
        _clean_str(record.get("source"))
        or normalized["marketplace"]
        or normalized["dealer_name"]
    )
    domain_label = _from_domain(normalized.get("source_url"))
    normalized["source"] = source_name or domain_label or "NeuroAI"

    source_url_value = _normalize_listing_url(normalized.get("source_url"))
    if source_url_value:
        normalized["source_url"] = source_url_value
    else:
        fallback_source = normalized.get("source")
        fallback_candidate = _normalize_listing_url(fallback_source)
        if fallback_candidate:
            normalized["source_url"] = fallback_candidate
        else:
            normalized["source_url"] = None
    return normalized


def _coerce_image_list(value: Any) -> list[str]:
    images: list[str] = []
    if isinstance(value, list):
        for item in value:
            if isinstance(item, str):
                cleaned = item.strip()
                if cleaned and cleaned not in images:
                    images.append(cleaned)
    return images


def _resolve_neuroai_url(base_url: str, candidate: str) -> str:
    parsed = urlparse(candidate)
    if parsed.scheme and parsed.netloc:
        return candidate
    return f"{base_url.rstrip('/')}/{candidate.lstrip('/')}"


def _parse_script_json(text: str) -> Any:
    cleaned = (text or "").strip()
    if not cleaned:
        return None

    if not cleaned.startswith("{") and not cleaned.startswith("["):
        equals_index = cleaned.find("=")
        if equals_index != -1:
            cleaned = cleaned[equals_index + 1 :].strip()
    cleaned = cleaned.strip().lstrip(";")

    brace_index = cleaned.find("{")
    bracket_index = cleaned.find("[")
    if brace_index == -1 and bracket_index == -1:
        return None
    if brace_index == -1:
        start_index = bracket_index
    elif bracket_index == -1:
        start_index = brace_index
    else:
        start_index = min(brace_index, bracket_index)
    cleaned = cleaned[start_index:]

    last_brace = cleaned.rfind("}")
    last_bracket = cleaned.rfind("]")
    end_index = max(last_brace, last_bracket)
    if end_index != -1:
        cleaned = cleaned[: end_index + 1]

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


def _extract_fetcher_candidate(text: str) -> str | None:
    patterns = [
        r"fetch\((['\"])(?P<url>[^'\"]+?)\1",
        r"axios\.get\((['\"])(?P<url>[^'\"]+?)\1",
        r"url:\s*(['\"])(?P<url>[^'\"]+?)\1",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        candidate = match.group("url").strip()
        if candidate and ("grok" in candidate or "result" in candidate):
            return candidate
    return None


def _extract_grok_results_from_html(
    html: str,
) -> tuple[list[dict[str, Any]] | None, str | None, str | None]:
    soup = BeautifulSoup(html, "lxml")
    fetcher_url: str | None = None

    for script in soup.find_all("script"):
        script_text = script.string or script.get_text()
        if not fetcher_url and script_text:
            fetcher_url = _extract_fetcher_candidate(script_text) or fetcher_url

        data = _parse_script_json(script_text or "")
        if data is None:
            continue

        status: str | None = None
        if isinstance(data, dict):
            candidate = data.get("results")
            if isinstance(candidate, list):
                status_value = data.get("status") or data.get("state")
                if isinstance(status_value, str):
                    status = status_value.strip().lower() or None
                return candidate, status, fetcher_url
            if all(isinstance(item, Mapping) for item in data.values()):
                # Some builds wrap results under a nested key.
                for value in data.values():
                    if isinstance(value, Mapping):
                        nested_results = value.get("results")
                        if isinstance(nested_results, list):
                            status_value = value.get("status") or value.get("state")
                            if isinstance(status_value, str):
                                status = status_value.strip().lower() or None
                            return nested_results, status, fetcher_url
        if isinstance(data, list):
            if all(isinstance(item, Mapping) for item in data):
                return data, None, fetcher_url

    if not fetcher_url:
        for tag in soup.find_all(attrs={"data-results-url": True}):
            candidate = _clean_str(tag.get("data-results-url"))
            if candidate:
                fetcher_url = candidate
                break
    if not fetcher_url:
        meta = soup.find("meta", attrs={"name": "neuroai:results-url"})
        if meta:
            fetcher_url = _clean_str(meta.get("content"))
    if not fetcher_url:
        anchor = soup.find("a", attrs={"data-fetch": True})
        if anchor:
            fetcher_url = _clean_str(anchor.get("href"))

    return None, None, fetcher_url


def _poll_neuroai_results(
    session: requests.Session,
    base_url: str,
    url_or_path: str,
    *,
    timeout: float,
) -> list[dict[str, Any]]:
    result_url = _resolve_neuroai_url(base_url, url_or_path)
    deadline = time.monotonic() + max(timeout, 1.0)
    poll_interval = 0.5
    poll_backoff = 1.5
    max_interval = 3.0
    status: str | None = None
    attempted_fetch_urls: set[str] = set()

    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break

        per_request_timeout = (
            min(10.0, max(1.0, remaining)),
            min(30.0, max(5.0, remaining)),
        )
        try:
            response = session.get(
                result_url,
                headers=_default_headers(),
                timeout=per_request_timeout,
            )
        except RequestException as exc:  # pragma: no cover - network dependent
            time.sleep(min(poll_interval, max(0.05, remaining / 4)))
            poll_interval = min(max_interval, poll_interval * poll_backoff)
            continue

        if response.status_code >= 400:
            raise GrokAPIError(
                f"NeuroAI results page returned {response.status_code}",
                status_code=response.status_code,
            )

        results, status, fetcher_url = _extract_grok_results_from_html(response.text)
        if results is not None:
            return results

        if fetcher_url:
            resolved_fetcher = _resolve_neuroai_url(base_url, fetcher_url)
            if resolved_fetcher not in attempted_fetch_urls:
                attempted_fetch_urls.add(resolved_fetcher)
                try:
                    fetch_response = session.get(
                        resolved_fetcher,
                        headers={**_default_headers(), "Accept": "application/json"},
                        timeout=per_request_timeout,
                    )
                except RequestException:  # pragma: no cover - network dependent
                    pass
                else:
                    if fetch_response.status_code < 400:
                        try:
                            fetch_payload = fetch_response.json()
                        except ValueError:
                            fetch_payload = None
                        if isinstance(fetch_payload, Mapping):
                            fetch_results = fetch_payload.get("results")
                            if isinstance(fetch_results, list):
                                return fetch_results
                            fetch_status = fetch_payload.get("status") or fetch_payload.get("state")
                            if isinstance(fetch_status, str):
                                normalized = fetch_status.strip().lower()
                                if normalized:
                                    status = normalized
                    elif fetch_response.status_code not in {404, 410}:
                        raise GrokAPIError(
                            f"NeuroAI fetcher returned {fetch_response.status_code}",
                            status_code=fetch_response.status_code,
                        )

        normalized_status = (status or "").strip().lower()
        if normalized_status not in {"", "pending", "processing", "running", "queued", "waiting"}:
            break

        time.sleep(min(poll_interval, max(0.05, remaining / 4)))
        poll_interval = min(max_interval, poll_interval * poll_backoff)

    message = "NeuroAI response did not include results"
    if status:
        message = f"{message} (status: {status})"
    raise GrokAPIError(message, status_code=None)


def _request_neuroai_batch(
    session: requests.Session,
    base_url: str,
    batch_urls: list[str],
    *,
    timeout: tuple[float, float],
) -> list[dict[str, Any]]:
    payload = {
        "urls": batch_urls,
        "invoke": True,
        "model": LISTING_MODEL,
        "frontend": NEUROAI_FRONTEND,
        "max_chars": MAX_LISTING_CHARS,
        "temperature": 0.0,
    }
    try:
        response = session.post(
            f"{base_url}{NEUROAI_BATCH_PATH}",
            json=payload,
            timeout=timeout,
        )
    except RequestException as exc:  # pragma: no cover - depends on network failures
        raise GrokAPIError(f"Unable to contact NeuroAI batch endpoint: {exc}") from exc
    if response.status_code >= 400:
        raise GrokAPIError(
            _summarize_http_error(response), status_code=response.status_code
        )

    try:
        data = response.json()
    except ValueError as exc:  # pragma: no cover - invalid payloads
        raise GrokAPIError("Invalid JSON response from NeuroAI") from exc

    raw_results = data.get("results")
    if isinstance(raw_results, list):
        return raw_results

    result_url = None
    for key in ("results_url", "result_url", "job_url", "poll_url"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            result_url = value.strip()
            break

    if result_url:
        if isinstance(timeout, tuple):
            read_timeout = timeout[1]
        else:
            read_timeout = timeout
        return _poll_neuroai_results(
            session,
            base_url,
            result_url,
            timeout=float(read_timeout or DEFAULT_TIMEOUT),
        )

    raise GrokAPIError("NeuroAI response did not include results")


def _parse_batch_results(
    raw_results: list[dict[str, Any]],
    *,
    original_inputs: list[str],
    offset: int,
) -> list[GrokResult]:
    results: list[GrokResult] = []
    total_inputs = len(original_inputs)
    for index, item in enumerate(raw_results):
        if not isinstance(item, dict):
            continue

        final_url = _clean_str(item.get("final_url"))
        requested_url = _clean_str(item.get("requested_url"))
        raw_url = _clean_str(item.get("url"))
        input_index = min(offset + index, total_inputs - 1)
        original_input = original_inputs[input_index]
        url_value = _normalize_listing_url(
            final_url,
            raw_url,
            requested_url,
            original_input,
        )
        prompt_value = item.get("prompt") or item.get("grok_prompt") or ""
        prompt = prompt_value if isinstance(prompt_value, str) else ""
        listing_value = item.get("listing_text") or ""
        listing_text = listing_value if isinstance(listing_value, str) else ""
        image_urls = _coerce_image_list(item.get("image_urls"))

        raw_response = item.get("grok_raw")
        if not isinstance(raw_response, dict):
            raw_response = None
        parsed_payload = item.get("grok_parsed") or item.get("parsed_payload")
        if not isinstance(parsed_payload, dict):
            parsed_payload = None

        normalized_payload = (
            item.get("grok_validated")
            or item.get("validated")
            or item.get("normalized")
        )
        normalized: dict[str, Any] | None = None
        if isinstance(normalized_payload, dict):
            normalized = transform_listing(normalized_payload)
            if url_value and not normalized.get("source_url"):
                normalized["source_url"] = url_value
            if image_urls and not normalized.get("image_urls"):
                normalized["image_urls"] = image_urls.copy()

        error_value = item.get("error")
        if error_value is not None and not isinstance(error_value, str):
            error_value = str(error_value)

        if not error_value:
            detail_value = item.get("detail")
            if detail_value:
                error_value = (
                    detail_value if isinstance(detail_value, str) else str(detail_value)
                )

        status_value = item.get("status")
        if (
            not error_value
            and isinstance(status_value, str)
            and status_value
            and status_value.lower() not in {"ok", "success", "completed"}
            and not normalized
        ):
            error_value = status_value

        if not normalized and not error_value:
            error_value = "NeuroAI did not return a validated record."

        results.append(
            GrokResult(
                url=url_value,
                prompt=prompt,
                listing_text=listing_text,
                image_urls=image_urls,
                raw_response=raw_response,
                parsed_payload=parsed_payload,
                normalized=normalized,
                error=error_value,
            )
        )
    return results


def fetch_batch(urls: Iterable[str]) -> list[GrokResult]:
    """Fetch and process a batch of URLs via the NeuroWraith Grok assistant."""

    cleaned_urls = [str(url).strip() for url in urls if str(url or "").strip()]
    if not cleaned_urls:
        return []

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
    base_url = _login_to_neuroai(session)

    connect_timeout = float(min(30, NEUROAI_TIMEOUT))
    request_timeout = (connect_timeout, float(NEUROAI_TIMEOUT))

    results: list[GrokResult] = []
    for offset in range(0, len(cleaned_urls), NEUROAI_MAX_BATCH_SIZE):
        chunk = cleaned_urls[offset : offset + NEUROAI_MAX_BATCH_SIZE]
        raw_results = _request_neuroai_batch(
            session,
            base_url,
            chunk,
            timeout=request_timeout,
        )
        results.extend(
            _parse_batch_results(
                raw_results,
                original_inputs=cleaned_urls,
                offset=offset,
            )
        )

    if not results:
        raise GrokAPIError("NeuroAI returned an empty results list")
    return results
