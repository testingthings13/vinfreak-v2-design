"""Shared helper functions for public-facing payloads and formatting."""
from __future__ import annotations

import json
from typing import Any, Optional

try:
    from ..utils import strip_zip  # type: ignore
    from ..utils_geo import coerce_coordinate  # type: ignore
    from ..utils_make import canonicalize_make_name  # type: ignore
except ImportError:  # pragma: no cover - fallback for script execution
    from utils import strip_zip  # type: ignore
    from utils_geo import coerce_coordinate  # type: ignore
    from utils_make import canonicalize_make_name  # type: ignore


def _model_to_dict(obj: Any) -> dict[str, Any]:
    """Return ``obj`` as a plain ``dict`` across supported Pydantic versions."""

    if hasattr(obj, "model_dump"):
        try:
            return obj.model_dump(exclude={"geo"})
        except TypeError:
            return obj.model_dump()
    if hasattr(obj, "dict"):
        return obj.dict()
    return getattr(obj, "__dict__", {})


def _is_timestamp_missing(value: Any) -> bool:
    """Return ``True`` when ``value`` should be treated as an empty timestamp."""

    if value is None:
        return True
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return True
        return stripped.lower() in {"null", "none"}
    return False


def _ensure_import_timestamps(payload: dict[str, Any], fallback: str | None) -> None:
    """Populate missing timestamp fields in ``payload`` using ``fallback``."""

    if not isinstance(payload, dict):
        return
    if fallback is None:
        return
    if isinstance(fallback, str):
        fallback_str = fallback.strip()
        if not fallback_str:
            return
    else:
        fallback_str = str(fallback).strip()
    if not fallback_str:
        return
    for key in ("posted_at", "created_at", "updated_at"):
        if _is_timestamp_missing(payload.get(key)):
            payload[key] = fallback_str


def _parse_images(value: Optional[str]) -> list[str]:
    """Return a list of image URLs from various textual inputs."""

    if not value:
        return []
    if isinstance(value, str):
        value = value.strip()
    if not value:
        return []
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [str(x) for x in parsed if x]
        if isinstance(parsed, str):
            return [parsed] if parsed else []
    except Exception:  # pragma: no cover - defensive parsing
        pass
    parts = [p.strip() for p in str(value).replace(",", "\n").splitlines() if p.strip()]
    return parts


def _parse_images_form(value: Optional[str]) -> Optional[str]:
    """Normalize image input from admin forms to a JSON string."""

    imgs = _parse_images(value)
    return json.dumps(imgs) if imgs else None


def _public_make_dict(make: Any) -> dict[str, Any] | None:
    """Return a lightweight make payload for public APIs."""

    if not make:
        return None
    data = _model_to_dict(make) if not isinstance(make, dict) else dict(make)
    payload = {
        "id": data.get("id"),
        "name": data.get("name"),
        "logo_url": data.get("logo_url"),
    }
    if payload.get("name"):
        canonical = canonicalize_make_name(payload.get("name"))
        if canonical:
            payload["name"] = canonical
    if "car_count" in data and data.get("car_count") is not None:
        try:
            payload["car_count"] = int(data.get("car_count"))
        except (TypeError, ValueError):
            payload["car_count"] = data.get("car_count")
    return payload


def _public_car_dict(obj: Any, dealership: Any = None, make: Any = None) -> dict[str, Any]:
    """Return a dict for public API consumers."""

    data = _model_to_dict(obj) if not isinstance(obj, dict) else dict(obj)
    data.pop("geo", None)

    lat_val = coerce_coordinate(data.get("latitude"))
    lng_val = coerce_coordinate(data.get("longitude"))
    dist_val = coerce_coordinate(data.get("distance_miles"))
    if lat_val is not None:
        data["latitude"] = lat_val
    else:
        data.pop("latitude", None)
    if lng_val is not None:
        data["longitude"] = lng_val
    else:
        data.pop("longitude", None)
    if dist_val is not None:
        data["distance_miles"] = dist_val
    else:
        data.pop("distance_miles", None)

    # Derive fallback timestamps from related import metadata when available
    fallback_timestamps: list[str | None] = []
    if isinstance(obj, dict):
        fallback_timestamps.append(obj.get("import_uploaded_at"))
        import_meta = obj.get("import_list")
    else:
        fallback_timestamps.append(getattr(obj, "import_uploaded_at", None))
        import_meta = getattr(obj, "import_list", None)
    if isinstance(import_meta, dict):
        fallback_timestamps.append(import_meta.get("uploaded_at"))
    elif import_meta is not None:
        fallback_timestamps.append(getattr(import_meta, "uploaded_at", None))
    fallback_timestamp: str | None = None
    for candidate in fallback_timestamps:
        if not _is_timestamp_missing(candidate):
            fallback_timestamp = candidate
            break
    _ensure_import_timestamps(data, fallback_timestamp)
    data.pop("import_uploaded_at", None)
    data.pop("import_list", None)

    canonical_make = canonicalize_make_name(data.get("make"))
    if canonical_make != data.get("make"):
        data["make"] = canonical_make

    imgs = _parse_images(data.get("images_json"))
    data["images"] = imgs
    if not data.get("image_url") and imgs:
        data["image_url"] = imgs[0]

    data["dealership"] = _model_to_dict(dealership) if dealership else None

    make_obj = make
    if make_obj is None and hasattr(obj, "make_rel"):
        make_obj = getattr(obj, "make_rel")
    data.pop("make_rel", None)
    data["make_rel"] = _public_make_dict(make_obj) if make_obj else None

    loc = (
        data.get("location")
        or data.get("location_address")
        or ", ".join(x for x in [data.get("city"), data.get("state")] if x)
    )
    loc = strip_zip(loc)
    data["location"] = loc or None

    price = data.get("price")
    if price not in (None, ""):
        try:
            data["price"] = float(str(price).replace("$", "").replace(",", ""))
        except Exception:  # pragma: no cover - defensive parsing
            data["price"] = None

    for key in ("posted_at", "end_time", "created_at", "updated_at"):
        if data.get(key) is not None:
            data[key] = str(data[key])

    return data


__all__ = [
    "_ensure_import_timestamps",
    "_is_timestamp_missing",
    "_model_to_dict",
    "_parse_images",
    "_parse_images_form",
    "_public_car_dict",
    "_public_make_dict",
]
