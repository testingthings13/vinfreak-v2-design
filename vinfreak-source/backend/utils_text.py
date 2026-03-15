"""Utilities for cleaning human-readable text fields."""
from __future__ import annotations

import re
from html import unescape

__all__ = [
    "sanitize_text",
    "sanitize_optional_text",
    "TEXT_FIELD_NAMES",
]

_COMMENT_RE = re.compile(r"(?is)<!--.*?-->")
_STYLE_SCRIPT_RE = re.compile(
    r"(?is)<(script|style|noscript|iframe|object|svg|math)[^>]*>.*?</\1>"
)
_TAG_RE = re.compile(r"(?is)<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")
_CSS_DECL_RE = re.compile(r"(?is)-?[a-z_][a-z0-9_\-]*\s*:[^;:{}]+;?")

CSS_NOISE_TOKENS = (
    "@media",
    "@supports",
    "@keyframes",
    ".similar-vehicles",
    ".vehiclecard",
    ".vehicle-images",
    ".hero-carousel",
    ".gallery",
    "display:",
    "margin-",
    "padding",
    "font-",
    "color:",
    "background",
    "column-gap",
    "row-gap",
    "nth-of-type",
)

# Fields that typically contain human-readable text and should be sanitized before
# being exposed to the frontend or stored.
TEXT_FIELD_NAMES: set[str] = {
    "title",
    "description",
    "highlights",
    "equipment",
    "modifications",
    "known_flaws",
    "service_history",
    "ownership_history",
    "seller_notes",
    "other_items",
    "engine",
    "make",
    "model",
    "trim",
    "body_type",
    "exterior_color",
    "interior_color",
    "seller_name",
    "seller_type",
    "location",
    "location_address",
    "city",
    "state",
    "fuel_type",
    "transmission",
    "drivetrain",
    "auction_status",
    "lot_number",
}


def sanitize_text(value: str | None) -> str:
    """Return a cleaned string or ``""`` when the content looks like CSS/HTML."""

    if value is None:
        return ""
    stripped = str(value).strip()
    if not stripped:
        return ""

    cleaned = _COMMENT_RE.sub(" ", stripped)
    cleaned = _STYLE_SCRIPT_RE.sub(" ", cleaned)
    cleaned = _TAG_RE.sub(" ", cleaned)
    cleaned = unescape(cleaned)
    cleaned = cleaned.replace("{", " ").replace("}", " ")
    cleaned = _WHITESPACE_RE.sub(" ", cleaned).strip()
    if not cleaned:
        return ""

    lowered = cleaned.lower()
    colon_count = cleaned.count(":")
    semi_count = cleaned.count(";")
    declaration_count = len(_CSS_DECL_RE.findall(cleaned))
    css_noise = any(token in lowered for token in CSS_NOISE_TOKENS)
    if declaration_count >= 2 or css_noise or colon_count >= 3 or semi_count >= 2:
        return ""

    if len(cleaned) > 2048:
        cleaned = cleaned[:2048].rstrip()
    return cleaned


def sanitize_optional_text(value: str | None) -> str | None:
    """Sanitize and return ``None`` when no human-friendly text remains."""

    cleaned = sanitize_text(value)
    return cleaned if cleaned else None
