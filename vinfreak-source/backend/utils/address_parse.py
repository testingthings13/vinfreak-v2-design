"""Utilities for parsing city/state/ZIP from free-form addresses."""

from __future__ import annotations

import re
from typing import Tuple


US_STATE_ABBR = {
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
    "DC",
}

ZIP_RE = re.compile(r"\b(\d{5})(?:-\d{4})?\b")


def from_location_address(addr: str | None) -> Tuple[str | None, str | None, str | None]:
    """Extract ``(city, state, ZIP)`` from ``addr``.

    The parser is intentionally conservative: it prefers using the final comma
    separated components while falling back to the first component when the
    address does not contain an explicit city/state pair.  All returned values
    are stripped strings or ``None``.
    """

    if not addr:
        return None, None, None

    text = addr.strip()
    if not text:
        return None, None, None

    match = ZIP_RE.search(text)
    zip5 = match.group(1) if match else None

    parts = [part.strip() for part in text.split(",") if part.strip()]
    city: str | None = None
    state: str | None = None

    if len(parts) >= 2:
        city = parts[-2]
        tail = parts[-1]
        tokens = [tok for tok in tail.split() if tok]
        if tokens:
            last = tokens[-1].upper()
            if last in US_STATE_ABBR:
                state = last
            else:
                filtered = [tok for tok in tokens if not tok.isdigit() and not ZIP_RE.fullmatch(tok)]
                state = " ".join(filtered) or None

    if city is None and parts and not parts[0][:1].isdigit():
        city = parts[0]

    return (city or None, state or None, zip5 or None)


__all__ = ["from_location_address", "US_STATE_ABBR", "ZIP_RE"]

