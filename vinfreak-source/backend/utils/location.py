"""Helpers for parsing and resolving offline geographic coordinates."""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Optional, Tuple

from .georesolver import GeoResolver

ZIP_RE = re.compile(r"\b(\d{5})(?:-\d{4})?\b")


def strip_zip_from_state(state_val: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Split a ZIP code embedded in the state field."""
    if not state_val:
        return None, None
    text = state_val.strip()
    match = ZIP_RE.search(text)
    if match:
        zip_code = match.group(1)
        without_zip = ZIP_RE.sub("", text).strip().rstrip(",")
        return (without_zip or None, zip_code)
    return (text or None, None)


def extract_zip_from_text(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    match = ZIP_RE.search(value)
    return match.group(1) if match else None


def resolve_offline_coordinates(
    geo: GeoResolver,
    *,
    city: Optional[str],
    state: Optional[str],
    postal: Optional[str],
    allow_state_fallback: bool = True,
) -> Tuple[Optional[float], Optional[float]]:
    """Resolve coordinates using the offline GeoResolver with graceful fallback."""
    lat, lng, _, _ = geo.resolve(city=city, state=state, postal=postal)
    if lat is not None and lng is not None:
        return lat, lng
    if allow_state_fallback and state:
        lat2, lng2, _, _ = geo.resolve(city=None, state=state, postal=None)
        if lat2 is not None and lng2 is not None:
            return lat2, lng2
    return None, None


@lru_cache(maxsize=1)
def get_default_resolver(data_dir: Optional[str] = None) -> GeoResolver:
    if data_dir:
        base = Path(data_dir)
    else:
        base = Path(__file__).resolve().parents[1] / "data" / "geoindex"
    return GeoResolver(str(base))
