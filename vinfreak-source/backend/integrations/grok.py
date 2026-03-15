"""Utilities for requesting Grok insights for FREAKStats."""

from __future__ import annotations

from typing import Any, Iterable

import json
import re
import time

import requests
from requests.exceptions import RequestException, Timeout

from backend.backend_settings import settings
try:
    from backend.constants import (
        DEFAULT_FREAKSTATS_SYSTEM_PROMPT,
        DEFAULT_FREAKSTATS_SYSTEM_PROMPT_AUCTION,
        DEFAULT_FREAKSTATS_SYSTEM_PROMPT_RETAIL,
        DEFAULT_FREAKSTATS_USER_PROMPT,
        DEFAULT_FREAKSTATS_USER_PROMPT_AUCTION,
        DEFAULT_FREAKSTATS_USER_PROMPT_RETAIL,
        DEFAULT_FREAKSTATS_AUCTION_STATUSES,
        DEFAULT_FREAKSTATS_RETAIL_STATUSES,
    )
except ModuleNotFoundError:  # pragma: no cover - fallback when executed from backend dir
    from constants import (  # type: ignore
        DEFAULT_FREAKSTATS_SYSTEM_PROMPT,
        DEFAULT_FREAKSTATS_SYSTEM_PROMPT_AUCTION,
        DEFAULT_FREAKSTATS_SYSTEM_PROMPT_RETAIL,
        DEFAULT_FREAKSTATS_USER_PROMPT,
        DEFAULT_FREAKSTATS_USER_PROMPT_AUCTION,
        DEFAULT_FREAKSTATS_USER_PROMPT_RETAIL,
        DEFAULT_FREAKSTATS_AUCTION_STATUSES,
        DEFAULT_FREAKSTATS_RETAIL_STATUSES,
    )
try:  # pragma: no cover - prefer explicit package import
    from backend.admin_db import engine as admin_engine
except ModuleNotFoundError:  # pragma: no cover - fallback during script execution
    try:
        from admin_db import engine as admin_engine
    except Exception:  # pragma: no cover
        admin_engine = None  # type: ignore
except Exception:  # pragma: no cover
    admin_engine = None  # type: ignore
from sqlmodel import Session
from sqlalchemy import text
try:  # pragma: no cover - prefer explicit package import
    from backend.models import Setting
except ModuleNotFoundError:  # pragma: no cover - fallback if executed as script
    from models import Setting
except Exception:  # pragma: no cover
    class _SettingFallback:
        FREAKSTATS_PROMPT = "freakstats_prompt"
        FREAKSTATS_SYSTEM_PROMPT = "freakstats_system_prompt"
        FREAKSTATS_USER_PROMPT = "freakstats_user_prompt"
        FREAKSTATS_SYSTEM_PROMPT_RETAIL = "freakstats_system_prompt_retail"
        FREAKSTATS_USER_PROMPT_RETAIL = "freakstats_user_prompt_retail"
        FREAKSTATS_SYSTEM_PROMPT_AUCTION = "freakstats_system_prompt_auction"
        FREAKSTATS_USER_PROMPT_AUCTION = "freakstats_user_prompt_auction"
        FREAKSTATS_RETAIL_STATUSES = "freakstats_retail_statuses"
        FREAKSTATS_AUCTION_STATUSES = "freakstats_auction_statuses"

    Setting = _SettingFallback()  # type: ignore

GROK_API_URL = "https://api.x.ai/v1/chat/completions"
_PROMPT_CACHE: dict[str, tuple[str, str, float]] = {}
_PROMPT_CACHE_TTL_SECONDS = 60.0
_STATUS_CACHE: tuple[set[str], set[str], float] | None = None


class GrokConfigurationError(RuntimeError):
    """Raised when Grok cannot be contacted due to configuration issues."""


class GrokRequestError(RuntimeError):
    """Raised when the Grok API returns an error or invalid payload."""


def _escape_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\r", " ").replace("\n", " ").strip()


def _coalesce(car: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in car:
            candidate = car[key]
            if candidate not in (None, "", [], {}):
                return candidate
    return None


def _join_highlights(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, Iterable):
        parts = [str(item).strip() for item in value if item not in (None, "")]
        return "; ".join(part for part in parts if part)
    return str(value)


def _sanitize_prompt_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _unwrap_code_fence(content: str) -> str:
    if not content:
        return ""

    stripped = content.strip()
    if not stripped.startswith("```"):
        return stripped

    lines = stripped.splitlines()
    if not lines:
        return ""

    # Drop the opening fence which may include a language hint.
    body = lines[1:]
    while body and body[-1].strip().startswith("```"):
        body.pop()
    return "\n".join(body).strip()


def _parse_status_setting(value: Any, fallback: Iterable[str]) -> set[str]:
    statuses: set[str] = set()
    seed: Iterable[str] = fallback if value is None else ()
    for item in seed:
        normalized = _normalize_status(item)
        if normalized:
            statuses.add(normalized)
    if value:
        text_value = str(value)
        for part in _STATUS_SPLIT_PATTERN.split(text_value):
            normalized = _normalize_status(part)
            if normalized:
                statuses.add(normalized)
    return statuses


def _load_status_sets() -> tuple[set[str], set[str]]:
    """Return cached status lists for each prompt variant."""

    global _STATUS_CACHE
    now = time.time()
    if _STATUS_CACHE and (now - _STATUS_CACHE[2]) < _PROMPT_CACHE_TTL_SECONDS:
        return _STATUS_CACHE[0], _STATUS_CACHE[1]

    retail_statuses = _parse_status_setting(None, DEFAULT_FREAKSTATS_RETAIL_STATUSES)
    auction_statuses = _parse_status_setting(None, DEFAULT_FREAKSTATS_AUCTION_STATUSES)

    if admin_engine is not None:
        try:
            with Session(admin_engine) as session:
                rows = session.exec(
                    text(
                        "SELECT key,value FROM settings WHERE key IN (:retail_key, :auction_key)"
                    ).bindparams(
                        retail_key=getattr(
                            Setting,
                            "FREAKSTATS_RETAIL_STATUSES",
                            "freakstats_retail_statuses",
                        ),
                        auction_key=getattr(
                            Setting,
                            "FREAKSTATS_AUCTION_STATUSES",
                            "freakstats_auction_statuses",
                        ),
                    )
                ).mappings().all()
            data = {row["key"]: row.get("value") for row in rows}
            retail_statuses = _parse_status_setting(
                data.get(getattr(
                    Setting,
                    "FREAKSTATS_RETAIL_STATUSES",
                    "freakstats_retail_statuses",
                )),
                DEFAULT_FREAKSTATS_RETAIL_STATUSES,
            )
            auction_statuses = _parse_status_setting(
                data.get(getattr(
                    Setting,
                    "FREAKSTATS_AUCTION_STATUSES",
                    "freakstats_auction_statuses",
                )),
                DEFAULT_FREAKSTATS_AUCTION_STATUSES,
            )
        except Exception:  # pragma: no cover - rely on defaults
            retail_statuses = _parse_status_setting(
                None, DEFAULT_FREAKSTATS_RETAIL_STATUSES
            )
            auction_statuses = _parse_status_setting(
                None, DEFAULT_FREAKSTATS_AUCTION_STATUSES
            )

    _STATUS_CACHE = (retail_statuses, auction_statuses, now)
    return retail_statuses, auction_statuses


_PROMPT_VARIANT_RETAIL = "retail"
_PROMPT_VARIANT_AUCTION = "auction"
_DEFAULT_PROMPTS: dict[str, tuple[str, str]] = {
    _PROMPT_VARIANT_RETAIL: (
        DEFAULT_FREAKSTATS_SYSTEM_PROMPT_RETAIL,
        DEFAULT_FREAKSTATS_USER_PROMPT_RETAIL,
    ),
    _PROMPT_VARIANT_AUCTION: (
        DEFAULT_FREAKSTATS_SYSTEM_PROMPT_AUCTION,
        DEFAULT_FREAKSTATS_USER_PROMPT_AUCTION,
    ),
}
_VARIANT_SETTING_KEYS: dict[str, tuple[str, str]] = {
    _PROMPT_VARIANT_RETAIL: (
        getattr(Setting, "FREAKSTATS_SYSTEM_PROMPT_RETAIL", "freakstats_system_prompt_retail"),
        getattr(Setting, "FREAKSTATS_USER_PROMPT_RETAIL", "freakstats_user_prompt_retail"),
    ),
    _PROMPT_VARIANT_AUCTION: (
        getattr(
            Setting, "FREAKSTATS_SYSTEM_PROMPT_AUCTION", "freakstats_system_prompt_auction"
        ),
        getattr(Setting, "FREAKSTATS_USER_PROMPT_AUCTION", "freakstats_user_prompt_auction"),
    ),
}
_GENERAL_SYSTEM_KEY = getattr(Setting, "FREAKSTATS_SYSTEM_PROMPT", "freakstats_system_prompt")
_GENERAL_USER_KEY = getattr(Setting, "FREAKSTATS_USER_PROMPT", "freakstats_user_prompt")
_LEGACY_SYSTEM_KEY = getattr(Setting, "FREAKSTATS_PROMPT", "freakstats_prompt")
_STATUS_SPLIT_PATTERN = re.compile(r"[\n,]+")


def _get_freakstats_prompts(variant: str) -> tuple[str, str]:
    global _PROMPT_CACHE
    now = time.time()
    cached = _PROMPT_CACHE.get(variant)
    if cached and (now - cached[2]) < _PROMPT_CACHE_TTL_SECONDS:
        return cached[0], cached[1]

    defaults = _DEFAULT_PROMPTS.get(variant) or _DEFAULT_PROMPTS[_PROMPT_VARIANT_RETAIL]
    system_prompt, user_prompt = defaults
    engine = admin_engine
    if engine is not None:
        try:
            with Session(engine) as session:
                system_key, user_key = _VARIANT_SETTING_KEYS.get(variant, _VARIANT_SETTING_KEYS[_PROMPT_VARIANT_RETAIL])
                keys = {
                    "variant_system": system_key,
                    "variant_user": user_key,
                    "general_system": _GENERAL_SYSTEM_KEY,
                    "general_user": _GENERAL_USER_KEY,
                    "legacy": _LEGACY_SYSTEM_KEY,
                }
                stored: dict[str, str] = {}
                for label, key in keys.items():
                    row = (
                        session.exec(
                            text("SELECT value FROM settings WHERE key=:key").bindparams(key=key)
                        )
                        .mappings()
                        .first()
                    )
                    if row:
                        stored[label] = _sanitize_prompt_value(row.get("value"))
            system_candidate = (
                stored.get("variant_system")
                or stored.get("general_system")
                or stored.get("legacy")
                or ""
            )
            user_candidate = stored.get("variant_user") or stored.get("general_user") or ""
            if system_candidate:
                system_prompt = system_candidate
            if user_candidate:
                user_prompt = user_candidate
        except Exception:  # pragma: no cover - fall back on errors
            system_prompt, user_prompt = defaults

    _PROMPT_CACHE[variant] = (system_prompt, user_prompt, now)
    return system_prompt, user_prompt


def _normalize_status(value: Any) -> str:
    if value is None:
        return ""
    normalized = _escape_text(value)
    if not normalized:
        return ""
    return normalized.replace("-", "_").replace(" ", "_").upper()


def _is_auction_listing(car: dict[str, Any]) -> bool:
    """Return True when the car should use the auction prompt template."""

    retail_statuses, auction_statuses = _load_status_sets()

    # Prefer the primary status field so stale auction-specific metadata does not
    # accidentally trigger the auction prompts.
    primary_status = _normalize_status(_coalesce(car, "__status", "status"))
    if primary_status in auction_statuses:
        return True
    if primary_status in retail_statuses:
        return False
    if primary_status:
        return False

    secondary_status = _normalize_status(
        _coalesce(car, "__auction_status", "auction_status")
    )
    if secondary_status in auction_statuses:
        return True
    if secondary_status in retail_statuses:
        return False
    return False


def _select_prompt_variant(car: dict[str, Any]) -> str:
    if _is_auction_listing(car):
        return _PROMPT_VARIANT_AUCTION
    return _PROMPT_VARIANT_RETAIL


def build_prompt(
    url: str,
    car: dict[str, Any],
    template: str | None = None,
    variant: str | None = None,
) -> str:
    """Return the structured prompt sent to Grok for a listing."""

    context_parts: list[str] = []

    prompt_variant = variant or _select_prompt_variant(car)

    title = _escape_text(_coalesce(car, "__title", "title"))
    if title:
        context_parts.append(title)

    year = _coalesce(car, "__year", "year")
    make = _coalesce(car, "__make", "make")
    model = _coalesce(car, "__model", "model")
    trim = _coalesce(car, "__trim", "trim")
    descriptor = " ".join(
        part for part in map(_escape_text, [year, make, model, trim]) if part
    )
    if descriptor and descriptor != title:
        context_parts.append(f"Vehicle: {descriptor}")

    price = _coalesce(car, "__price", "price")
    currency = _escape_text(_coalesce(car, "currency")) or "USD"
    if price not in (None, ""):
        context_parts.append(f"Listed price: {_escape_text(price)} {currency}")

    mileage = _coalesce(car, "__mileage", "mileage")
    if mileage not in (None, ""):
        context_parts.append(f"Mileage: {_escape_text(mileage)} miles")

    location = _escape_text(_coalesce(car, "__location", "location"))
    if location:
        context_parts.append(f"Location: {location}")

    dealership = _escape_text(_coalesce(car, "dealership"))
    if dealership:
        context_parts.append(f"Dealership: {dealership}")

    highlights_raw = _join_highlights(_coalesce(car, "highlights"))
    highlights = _escape_text(highlights_raw)
    if highlights:
        context_parts.append(f"Highlights: {highlights}")

    vin = _escape_text(_coalesce(car, "vin"))
    if vin:
        context_parts.append(f"VIN: {vin}")

    year_text = _escape_text(year)
    make_text = _escape_text(make)
    model_text = _escape_text(model)
    trim_text = _escape_text(trim)
    mileage_text = _escape_text(mileage)
    price_text = _escape_text(price)
    location_text = location
    dealership_text = dealership

    vehicle_line = descriptor or "Unknown vehicle"
    vehicle_example = " ".join(
        part for part in [year_text, make_text, model_text, trim_text] if part
    ) or "this vehicle"
    mileage_example = (
        f"{mileage_text} miles" if mileage_text else "unknown mileage"
    )
    dealership_example = dealership_text or "the seller"
    if location_text:
        dealership_example = f"{dealership_example} in {location_text}"
    if dealership_text and not location_text:
        dealership_example = dealership_text
    price_example = (
        f"{price_text} {currency}" if price_text else "an unknown price"
    )
    example_sentence = (
        "\"This "
        f"{vehicle_example} is a rather new car with only {mileage_example}, and is offered for sale at {dealership_example}. "
        f"The price for this vehicle is {price_example} and the FREAKScore is X. Read more details below!\""
    )

    context = {
        "url": url,
        "title": title,
        "vehicle_line": vehicle_line,
        "vehicle_example": vehicle_example,
        "mileage_example": mileage_example,
        "dealership_example": dealership_example,
        "price_example": price_example,
        "example_sentence": example_sentence,
        "year": year_text,
        "make": make_text,
        "model": model_text,
        "trim": trim_text,
        "location": location_text,
        "currency": currency,
    }

    defaults = _DEFAULT_PROMPTS.get(prompt_variant) or _DEFAULT_PROMPTS[_PROMPT_VARIANT_RETAIL]
    user_template = template or _get_freakstats_prompts(prompt_variant)[1]
    try:
        base_prompt = user_template.format(**context)
    except Exception:
        base_prompt = defaults[1].format(**context)

    if context_parts:
        context_text = "\n".join(part for part in context_parts if part)
        return (
            f"{base_prompt}\nHere is additional structured info you can reference:\n{context_text}"
        )
    return base_prompt


def fetch_grok_insights(
    url: str,
    car: dict[str, Any],
    *,
    system_prompt_override: str | None = None,
    user_template_override: str | None = None,
    variant_override: str | None = None,
) -> str:
    """Fetch formatted insights for a listing from Grok.

    Optional overrides allow callers (like the admin preview endpoint) to
    experiment with unsaved prompt changes while keeping request behaviour
    consistent with production.
    """

    api_key = settings.GROK_API_KEY
    if not api_key:
        raise GrokConfigurationError(
            "Grok API key is not configured. Set the GROK_API_KEY environment variable."
        )

    variant = variant_override or _select_prompt_variant(car)
    if variant not in (_PROMPT_VARIANT_RETAIL, _PROMPT_VARIANT_AUCTION):
        variant = _PROMPT_VARIANT_RETAIL

    system_prompt, user_template = _get_freakstats_prompts(variant)
    if system_prompt_override is not None:
        system_prompt = system_prompt_override
    template_for_prompt = user_template_override or user_template
    payload = {
        "model": settings.GROK_MODEL,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": build_prompt(
                    url,
                    car,
                    template=template_for_prompt,
                    variant=variant,
                ),
            },
        ],
        "temperature": 0.6,
        # Allow the full response so longer insight descriptions aren't
        # truncated mid-sentence. Grok supports responses up to 2048 tokens, so
        # request the maximum.
        "max_tokens": 2048,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    timeout_seconds = max(1, int(settings.GROK_TIMEOUT_SECONDS))
    max_attempts = max(1, int(settings.GROK_MAX_RETRIES))
    retry_delay = max(0.0, float(settings.GROK_RETRY_DELAY_SECONDS))
    connect_timeout = min(10.0, float(timeout_seconds))

    response: requests.Response | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.post(
                GROK_API_URL,
                headers=headers,
                json=payload,
                timeout=(connect_timeout, timeout_seconds),
            )
            break
        except Timeout as exc:  # pragma: no cover - network timeout
            if attempt >= max_attempts:
                raise GrokRequestError(
                    f"Grok did not respond within {timeout_seconds} seconds"
                ) from exc
            if retry_delay:
                time.sleep(retry_delay)
        except RequestException as exc:  # pragma: no cover - network error
            raise GrokRequestError(f"Unable to contact Grok: {exc}") from exc
    else:  # pragma: no cover - safety net
        raise GrokRequestError("Unable to contact Grok after multiple attempts")

    if response is None:  # pragma: no cover - defensive
        raise GrokRequestError("Grok returned no response")

    text = response.text
    if not response.ok:
        detail = text
        try:
            parsed_error = response.json()
            detail = parsed_error.get("error", {}).get("message") or str(parsed_error)
        except Exception:  # pragma: no cover - fallback when response isn't JSON
            pass
        raise GrokRequestError(
            f"Grok request failed: {response.status_code} {response.reason} • {detail}"
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise GrokRequestError(f"Unable to parse Grok response: {exc}") from exc

    content = (
        data.get("choices") or [{}]
    )[0].get("message", {}).get("content") if data else None
    if not content or not isinstance(content, str):
        raise GrokRequestError("Grok returned an empty response")

    return content.strip()


def fetch_freakestimate_report(
    vin: str,
    mileage: str | None = None,
    *,
    notes: str | None = None,
) -> dict[str, str]:
    """Generate a pricing brief for a vehicle using Grok."""

    api_key = settings.GROK_API_KEY
    if not api_key:
        raise GrokConfigurationError(
            "Grok API key is not configured. Set the GROK_API_KEY environment variable."
        )

    vin_value = (vin or "").strip().upper()
    if not vin_value:
        raise GrokRequestError("VIN is required to fetch a FreakEstimate report")

    mileage_value = (mileage or "").strip()
    notes_value = (notes or "").strip()

    system_prompt = (
        "You are FreakEstimate, an automotive valuation analyst with live internet "
        "access through Grok. Research authoritative sources, decode the VIN, and "
        "summarise verified insights about the vehicle. Prioritise accurate "
        "equipment details, realistic retail pricing, comparable listings, and "
        "Monroney sticker data when available. Always include source links in the "
        "Research notes section. Keep the tone confident, concise, and suitable for "
        "a dealer dashboard."
    )

    user_lines = [
        "Create a FreakEstimate briefing in under 350 words using GitHub-flavoured Markdown.",
        "Structure the response with the exact section headings:",
        "## Vehicle snapshot",
        "## Pricing guidance",
        "## Monroney highlights",
        "## Research notes",
        "",
        "Within Pricing guidance provide:",
        "- A recommended listing price range in USD",
        "- A single recommended asking price",
        "- At least two comparable listings with mileage, price, and linked sources",
        "",
        "Vehicle details:",
        f"VIN: {vin_value}",
    ]

    if mileage_value:
        user_lines.append(f"Mileage: {mileage_value}")
    else:
        user_lines.append("Mileage: unknown")

    user_lines.append("Focus on the United States market unless notes specify otherwise.")
    user_lines.append("Complete the research within roughly one minute of browsing time.")

    if notes_value:
        user_lines.append("")
        user_lines.append("Additional context to factor into the estimate:")
        user_lines.append(notes_value)

    payload = {
        "model": settings.GROK_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "\n".join(user_lines)},
        ],
        "temperature": 0.4,
        "max_tokens": 1536,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    timeout_seconds = min(60, max(1, int(settings.GROK_TIMEOUT_SECONDS)))
    max_attempts = max(1, int(settings.GROK_MAX_RETRIES))
    retry_delay = max(0.0, float(settings.GROK_RETRY_DELAY_SECONDS))
    connect_timeout = min(10.0, float(timeout_seconds))

    response: requests.Response | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.post(
                GROK_API_URL,
                headers=headers,
                json=payload,
                timeout=(connect_timeout, timeout_seconds),
            )
            break
        except Timeout as exc:  # pragma: no cover - network timeout
            if attempt >= max_attempts:
                raise GrokRequestError(
                    f"Grok did not respond within {timeout_seconds} seconds"
                ) from exc
            if retry_delay:
                time.sleep(retry_delay)
        except RequestException as exc:  # pragma: no cover - network error
            raise GrokRequestError(f"Unable to contact Grok: {exc}") from exc
    else:  # pragma: no cover - safety net
        raise GrokRequestError("Unable to contact Grok after multiple attempts")

    if response is None:  # pragma: no cover - defensive
        raise GrokRequestError("Grok returned no response")

    text = response.text
    if not response.ok:
        detail = text
        try:
            parsed_error = response.json()
            detail = parsed_error.get("error", {}).get("message") or str(parsed_error)
        except Exception:  # pragma: no cover - fallback when response isn't JSON
            pass
        raise GrokRequestError(
            f"Grok request failed: {response.status_code} {response.reason} • {detail}"
        )

    try:
        data = response.json()
    except ValueError as exc:  # pragma: no cover - fallback when JSON fails
        raise GrokRequestError(f"Unable to parse Grok response: {exc}") from exc

    content = (
        data.get("choices") or [{}]
    )[0].get("message", {}).get("content") if data else None
    if not isinstance(content, str):
        raise GrokRequestError("Grok response did not include content")

    markdown = _unwrap_code_fence(content)
    return {"markdown": markdown, "raw": content}


def invalidate_prompt_cache() -> None:
    """Clear the cached prompts so future requests reload from the database."""

    global _PROMPT_CACHE, _STATUS_CACHE
    _PROMPT_CACHE = {}
    _STATUS_CACHE = None


def generate_seller_email(url: str, car: dict[str, Any]) -> dict[str, str]:
    """Ask Grok to draft an email for contacting a dealership seller."""

    api_key = settings.GROK_API_KEY
    if not api_key:
        raise GrokConfigurationError(
            "Grok API key is not configured. Set the GROK_API_KEY environment variable."
        )

    listing_title = _escape_text(_coalesce(car, "__title", "title"))
    dealership_name = _escape_text(_coalesce(car, "dealership"))
    price_value = _escape_text(_coalesce(car, "__price", "price"))
    mileage_value = _escape_text(_coalesce(car, "__mileage", "mileage"))
    location_value = _escape_text(_coalesce(car, "__location", "location"))
    vin_value = _escape_text(_coalesce(car, "vin", "VIN"))

    context_lines = [
        "Draft a concise, friendly email for a prospective buyer to send the seller.",
        "Follow these requirements:",
        "- Output strict JSON with keys recipient_email, subject, and body.",
        "- recipient_email should be the best email address for the dealership or seller. If none can be found after reviewing the listing and linked site, return null.",
        "- subject should follow the pattern 'Inquiry on <vehicle> (VIN:<VIN or UNKNOWN>)'.",
        "- body must be plain text with newline breaks and include the dealership greeting, vehicle interest, and a polite request for next steps.",
        "- Keep the tone professional and helpful. Mention mileage, price, or other highlights when useful.",
        "Listing details:",
        f"URL: {url}",
    ]

    if listing_title:
        context_lines.append(f"Title: {listing_title}")
    if dealership_name:
        context_lines.append(f"Dealership: {dealership_name}")
    if location_value:
        context_lines.append(f"Location: {location_value}")
    if price_value:
        context_lines.append(f"Price: {price_value}")
    if mileage_value:
        context_lines.append(f"Mileage: {mileage_value}")
    if vin_value:
        context_lines.append(f"VIN: {vin_value}")

    highlights = _join_highlights(_coalesce(car, "highlights"))
    if highlights:
        context_lines.append(f"Highlights: {highlights}")

    system_prompt = (
        "You are a concierge assistant with live browsing via Grok. "
        "Find the dealership contact email when available and craft outreach "
        "drafts tailored to each listing. Always respect the requested JSON "
        "schema."
    )

    payload = {
        "model": settings.GROK_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "\n".join(context_lines)},
        ],
        "temperature": 0.5,
        "max_tokens": 800,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    timeout_seconds = max(1, int(settings.GROK_TIMEOUT_SECONDS))
    max_attempts = max(1, int(settings.GROK_MAX_RETRIES))
    retry_delay = max(0.0, float(settings.GROK_RETRY_DELAY_SECONDS))
    connect_timeout = min(10.0, float(timeout_seconds))

    response: requests.Response | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.post(
                GROK_API_URL,
                headers=headers,
                json=payload,
                timeout=(connect_timeout, timeout_seconds),
            )
            break
        except Timeout as exc:  # pragma: no cover - network timeout
            if attempt >= max_attempts:
                raise GrokRequestError(
                    f"Grok did not respond within {timeout_seconds} seconds"
                ) from exc
            if retry_delay:
                time.sleep(retry_delay)
        except RequestException as exc:  # pragma: no cover - network error
            raise GrokRequestError(f"Unable to contact Grok: {exc}") from exc
    else:  # pragma: no cover - defensive
        raise GrokRequestError("Unable to contact Grok after multiple attempts")

    if response is None:  # pragma: no cover - defensive
        raise GrokRequestError("Grok returned no response")

    text = response.text
    if not response.ok:
        detail = text
        try:
            parsed_error = response.json()
            detail = parsed_error.get("error", {}).get("message") or str(parsed_error)
        except Exception:  # pragma: no cover - fallback when response isn't JSON
            pass
        raise GrokRequestError(
            f"Grok request failed: {response.status_code} {response.reason} • {detail}"
        )

    try:
        data = response.json()
    except ValueError as exc:  # pragma: no cover - fallback when JSON fails
        raise GrokRequestError(f"Unable to parse Grok response: {exc}") from exc

    content = (
        data.get("choices") or [{}]
    )[0].get("message", {}).get("content") if data else None
    if not isinstance(content, str):
        raise GrokRequestError("Grok response did not include content")

    cleaned = _unwrap_code_fence(content)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise GrokRequestError("Grok response was not valid JSON") from exc

    if not isinstance(parsed, dict):
        raise GrokRequestError("Grok response did not return an object")

    subject = parsed.get("subject")
    body = parsed.get("body")
    recipient = parsed.get("recipient_email") or parsed.get("email")

    if not isinstance(subject, str) or not subject.strip():
        raise GrokRequestError("Grok response was missing an email subject")
    if not isinstance(body, str) or not body.strip():
        raise GrokRequestError("Grok response was missing an email body")

    subject_text = subject.strip()
    body_text = body.strip()
    recipient_text = recipient.strip() if isinstance(recipient, str) else ""

    return {
        "subject": subject_text,
        "body": body_text,
        "recipient_email": recipient_text,
    }

