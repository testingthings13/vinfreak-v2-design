"""Lightweight Redis caching utilities."""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Mapping

from redis import Redis
from redis.exceptions import RedisError

try:  # Local imports may vary depending on invocation path
    from backend.backend_settings import settings
except ModuleNotFoundError:  # pragma: no cover - script execution fallback
    from backend_settings import settings  # type: ignore


LOGGER = logging.getLogger(__name__)
_redis_client: Redis | None = None
_CACHE_PREFIX = "vinfreak:cache:"
_logged_celery_broker_fallback = False


def _json_default(obj: Any) -> Any:
    """Best-effort serializer for common non-JSON types."""

    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    return str(obj)


def _normalize_redis_url(raw: Any) -> str | None:
    text = str(raw or "").strip()
    if not text:
        return None
    if "://" not in text:
        text = f"redis://{text}"
    return text


def _resolve_redis_url() -> str | None:
    global _logged_celery_broker_fallback

    for candidate in (
        settings.REDIS_URL,
        os.getenv("REDIS_URL"),
    ):
        redis_url = _normalize_redis_url(candidate)
        if redis_url:
            return redis_url

    for candidate in (
        getattr(settings, "CELERY_BROKER_URL", None),
        os.getenv("CELERY_BROKER_URL"),
    ):
        redis_url = _normalize_redis_url(candidate)
        if not redis_url:
            continue
        scheme = redis_url.split("://", 1)[0].lower()
        if scheme not in {"redis", "rediss", "unix"}:
            continue
        if not _logged_celery_broker_fallback:
            LOGGER.info(
                "REDIS_URL is not configured; using CELERY_BROKER_URL for cache storage."
            )
            _logged_celery_broker_fallback = True
        return redis_url

    return None


def get_client() -> Redis | None:
    """Return a Redis client using REDIS_URL or a Redis CELERY_BROKER_URL."""

    global _redis_client
    if _redis_client is not None:
        return _redis_client
    redis_url = _resolve_redis_url()
    if not redis_url:
        return None
    try:
        client = Redis.from_url(redis_url, decode_responses=True)
        client.ping()
    except (RedisError, ValueError) as exc:  # pragma: no cover - env specific
        LOGGER.warning("Redis unavailable: %s", exc)
        return None
    _redis_client = client
    return _redis_client


def build_cache_key(prefix: str, params: Mapping[str, Any] | None = None) -> str:
    """Build a deterministic cache key for the given prefix and params."""

    key_parts = [prefix]
    if params:
        serialized = json.dumps(params, default=_json_default, sort_keys=True)
        key_parts.append(serialized)
    return _CACHE_PREFIX + ":".join(key_parts)


def get_json(key: str) -> Any | None:
    """Fetch a JSON object from Redis, returning ``None`` on cache miss/errors."""

    client = get_client()
    if client is None:
        return None
    try:
        cached = client.get(key)
    except RedisError:  # pragma: no cover - transient redis issues
        return None
    if cached is None:
        return None
    try:
        return json.loads(cached)
    except json.JSONDecodeError:
        return None


def set_json(key: str, value: Any, ttl_seconds: int | None = None) -> None:
    """Serialize a value to JSON and store it in Redis with optional TTL."""

    client = get_client()
    if client is None:
        return
    ttl = ttl_seconds or settings.CACHE_TTL_SECONDS
    try:
        payload = json.dumps(value, default=_json_default)
        client.setex(key, ttl, payload)
    except RedisError:  # pragma: no cover - transient redis issues
        return


__all__ = [
    "build_cache_key",
    "get_client",
    "get_json",
    "set_json",
]
