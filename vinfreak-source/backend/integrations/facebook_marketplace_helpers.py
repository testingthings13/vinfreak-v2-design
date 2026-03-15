"""Shared Facebook Marketplace helper functions.

These helpers are extracted from ``backend.app`` to keep the monolith smaller
while preserving behavior through thin wrappers in ``backend.app``.
"""

from __future__ import annotations

import functools
import json
import re
from typing import Any, Callable, Iterable, Mapping
from urllib.parse import parse_qsl, urlparse


def _text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    cleaned = str(value).strip()
    return cleaned or None


def _parse_images_fallback(value: Any) -> list[str]:
    raw_text = _text(value)
    if not raw_text:
        return []
    try:
        parsed = json.loads(raw_text)
        if isinstance(parsed, list):
            return [str(item) for item in parsed if _text(item)]
        if isinstance(parsed, str):
            normalized = _text(parsed)
            return [normalized] if normalized else []
    except Exception:  # pragma: no cover - defensive parsing
        pass
    parts = [part.strip() for part in str(raw_text).replace(",", "\n").splitlines() if part.strip()]
    return parts


def facebook_next_page(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    paging = payload.get("paging")
    if isinstance(paging, dict):
        next_url = paging.get("next")
        if isinstance(next_url, str) and next_url.strip():
            return next_url.strip()
    next_url = payload.get("next")
    if isinstance(next_url, str) and next_url.strip():
        return next_url.strip()
    return None


def facebook_graphql_page_cursor(payload: Any, *, depth: int = 0) -> tuple[str | None, bool]:
    if depth > 10 or not isinstance(payload, Mapping):
        return (None, False)
    page_info = payload.get("page_info")
    if isinstance(page_info, Mapping):
        end_cursor = _text(
            page_info.get("end_cursor")
            or page_info.get("cursor")
            or page_info.get("next_cursor")
        )
        has_next_raw = page_info.get("has_next_page")
        if isinstance(has_next_raw, bool):
            has_next = has_next_raw
        else:
            has_next = str(has_next_raw or "").strip().lower() in {"1", "true", "yes"}
        return (end_cursor, has_next)
    for value in payload.values():
        if not isinstance(value, Mapping):
            continue
        end_cursor, has_next = facebook_graphql_page_cursor(value, depth=depth + 1)
        if end_cursor or has_next:
            return (end_cursor, has_next)
    return (None, False)


def facebook_marketplace_is_profile_avatar_image_url(value: Any) -> bool:
    url = _text(value)
    if not url:
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    host = (parsed.netloc or "").lower()
    path = (parsed.path or "").lower()
    if not host:
        return False
    if "facebook.com" not in host and "fbcdn.net" not in host:
        return False
    avatar_hint = bool(
        re.search(
            r"(?:^|[/_\-])(?:avatar|profile|profilepic|profile_photo)(?:$|[/_\-])",
            path,
        )
    )
    stp_value = ""
    for key, candidate in parse_qsl(parsed.query, keep_blank_values=True):
        if str(key or "").lower() != "stp":
            continue
        stp_value = str(candidate or "").lower()
        break
    size_haystack = " ".join(part for part in (path, stp_value) if part)
    small_square_hint = bool(
        size_haystack
        and re.search(
            r"(?:^|[_\-])s(?:32|36|40|48|50|60)x(?:32|36|40|48|50|60)(?:[_\-]|$)",
            size_haystack,
        )
    )
    if avatar_hint:
        return True
    if small_square_hint:
        return True
    return False


def facebook_marketplace_is_creative_image_url(value: Any) -> bool:
    url = _text(value)
    if not url:
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    host = (parsed.netloc or "").lower()
    path = (parsed.path or "").lower()
    if not host:
        return False
    if "facebook.com" not in host and "fbcdn.net" not in host:
        return False
    if "/v/t45." in path:
        return True
    if "/v/t15." in path:
        return True
    return False


def facebook_marketplace_is_supported_image_url(value: Any) -> bool:
    url = _text(value)
    if not url:
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    scheme = (parsed.scheme or "").lower()
    if scheme not in {"http", "https"}:
        return False
    host = (parsed.netloc or "").lower()
    path = (parsed.path or "").lower()
    if not host:
        return False
    if facebook_marketplace_is_profile_avatar_image_url(url):
        return False
    if "facebook.com" in host or "fbcdn.net" in host:
        if "static.xx.fbcdn.net" in host:
            return False
        if "/rsrc.php/" in path or path.endswith("/rsrc.php"):
            return False
        if path.endswith(".ico"):
            return False
        if "/images/logos/" in path:
            return False
    return True


def facebook_marketplace_image_dimension_score(url: str) -> int:
    parsed = urlparse(url)
    stp_value = ""
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        if str(key or "").lower() != "stp":
            continue
        stp_value = str(value or "")
        break
    candidates = [parsed.path or ""]
    if stp_value:
        candidates.append(stp_value)
    haystack = " ".join(candidates).lower()
    best = 0
    for match in re.finditer(
        r"(?:^|[_\-])(?:s|p)(\d{2,4})x(\d{2,4})(?:[_\-]|$)",
        haystack,
    ):
        try:
            width = int(match.group(1))
            height = int(match.group(2))
        except (TypeError, ValueError):
            continue
        if width <= 0 or height <= 0:
            continue
        best = max(best, width * height)
    return best


def facebook_marketplace_image_sort_key(url: str) -> tuple[int, int, int, int, int, int, int]:
    parsed = urlparse(url)
    host = (parsed.netloc or "").lower()
    path = (parsed.path or "").lower()
    stp_value = ""
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        if str(key or "").lower() != "stp":
            continue
        stp_value = str(value or "")
        break
    lowered_stp = stp_value.lower()
    dimension_score = facebook_marketplace_image_dimension_score(url)
    crop_penalty = 1 if re.search(r"(?:^|_)c\d", lowered_stp) else 0
    small_penalty = 1 if dimension_score and dimension_score <= (400 * 400) else 0
    low_quality_host_penalty = 1 if ".xx.fbcdn.net" in host else 0
    preview_variant_penalty = 1 if "/v/t15." in path else 0
    creative_variant_penalty = 1 if "/v/t45." in path else 0
    avatar_variant_penalty = (
        1 if facebook_marketplace_is_profile_avatar_image_url(url) else 0
    )
    return (
        -dimension_score,
        crop_penalty,
        small_penalty,
        low_quality_host_penalty,
        preview_variant_penalty,
        creative_variant_penalty,
        avatar_variant_penalty,
    )


def facebook_marketplace_order_image_urls(urls: Iterable[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in urls:
        value = _text(candidate)
        if not value or value in seen:
            continue
        if not facebook_marketplace_is_supported_image_url(value):
            continue
        seen.add(value)
        deduped.append(value)
    if len(deduped) <= 1:
        return deduped

    scored: list[dict[str, Any]] = []
    for index, value in enumerate(deduped):
        parsed = urlparse(value)
        host = (parsed.netloc or "").lower()
        path = (parsed.path or "").lower()
        stp_value = ""
        for key, candidate in parse_qsl(parsed.query, keep_blank_values=True):
            if str(key or "").lower() != "stp":
                continue
            stp_value = str(candidate or "")
            break
        lowered_stp = stp_value.lower()
        dimension_score = facebook_marketplace_image_dimension_score(value)
        scored.append(
            {
                "index": index,
                "url": value,
                "dimension_score": dimension_score,
                "crop_penalty": 1 if re.search(r"(?:^|_)c\d", lowered_stp) else 0,
                "small_penalty": 1 if dimension_score and dimension_score <= (400 * 400) else 0,
                "low_quality_host_penalty": 1 if ".xx.fbcdn.net" in host else 0,
                "preview_variant_penalty": 1 if "/v/t15." in path else 0,
                "creative_variant_penalty": 1 if "/v/t45." in path else 0,
                "avatar_variant_penalty": (
                    1 if facebook_marketplace_is_profile_avatar_image_url(value) else 0
                ),
            }
        )

    def _compare(left: Mapping[str, Any], right: Mapping[str, Any]) -> int:
        for key in (
            "crop_penalty",
            "small_penalty",
            "low_quality_host_penalty",
            "preview_variant_penalty",
            "creative_variant_penalty",
            "avatar_variant_penalty",
        ):
            left_value = int(left.get(key) or 0)
            right_value = int(right.get(key) or 0)
            if left_value != right_value:
                return -1 if left_value < right_value else 1
        left_area = int(left.get("dimension_score") or 0)
        right_area = int(right.get("dimension_score") or 0)
        if left_area > 0 and right_area > 0 and left_area != right_area:
            return -1 if left_area > right_area else 1
        left_index = int(left.get("index") or 0)
        right_index = int(right.get("index") or 0)
        if left_index == right_index:
            return 0
        return -1 if left_index < right_index else 1

    scored.sort(key=functools.cmp_to_key(_compare))
    return [str(entry["url"]) for entry in scored]


def facebook_extract_images(raw_images: Any) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()

    def _push(candidate: Any) -> None:
        url = _text(candidate)
        if not url or url in seen:
            return
        if not facebook_marketplace_is_supported_image_url(url):
            return
        seen.add(url)
        urls.append(url)

    def _walk(candidate: Any, *, depth: int = 0) -> None:
        if candidate is None or depth > 8:
            return
        if isinstance(candidate, str):
            _push(candidate.strip())
            return
        if isinstance(candidate, Mapping):
            for key in ("url", "src", "uri", "image_url"):
                _push(candidate.get(key))
            for key in (
                "image",
                "media_image",
                "thumbnailImage",
                "thumbnail_image",
                "thumbnail",
                "square_media_image",
                "primary_listing_photo",
                "primary_photo",
                "photo",
                "cover_photo",
            ):
                if key in candidate:
                    _walk(candidate.get(key), depth=depth + 1)
            for key in ("data", "images", "items", "values", "attachments", "media", "nodes"):
                if key in candidate:
                    _walk(candidate.get(key), depth=depth + 1)
            return
        if isinstance(candidate, (list, tuple, set)):
            for entry in candidate:
                _walk(entry, depth=depth + 1)

    _walk(raw_images)
    return urls


def facebook_marketplace_repair_image_candidates(
    *,
    primary_image_url: Any,
    images_json: Any,
    parse_images: Callable[[Any], list[str]] | None = None,
) -> list[str]:
    candidates: list[str] = []
    primary_value = _text(primary_image_url)
    if primary_value:
        candidates.append(primary_value)
    parser = parse_images or _parse_images_fallback
    for extra in parser(_text(images_json) or None):
        value = _text(extra)
        if value:
            candidates.append(value)
    extracted = facebook_extract_images(candidates)
    return facebook_marketplace_order_image_urls(extracted)


__all__ = [
    "facebook_extract_images",
    "facebook_graphql_page_cursor",
    "facebook_marketplace_image_dimension_score",
    "facebook_marketplace_image_sort_key",
    "facebook_marketplace_is_creative_image_url",
    "facebook_marketplace_is_profile_avatar_image_url",
    "facebook_marketplace_is_supported_image_url",
    "facebook_marketplace_order_image_urls",
    "facebook_marketplace_repair_image_candidates",
    "facebook_next_page",
]
