"""API token authentication for public endpoints."""
from __future__ import annotations

import hmac
import re
from typing import Callable, Awaitable

from fastapi import Request
from starlette.responses import Response

try:  # pragma: no cover - prefer package import
    from backend.settings import settings
except ModuleNotFoundError:  # pragma: no cover - fallback
    from settings import settings  # type: ignore


_PUBLIC_API_EXACT_PATHS: dict[str, set[str]] = {
    "GET": {
        "/api/cars",
        "/api/listings",
        "/api/dealerships",
        "/api/makes",
        "/api/geo/ip",
        "/api/public/settings",
    },
    "POST": {
        "/api/freakstats/insights",
        "/api/grok/ask-seller",
        "/api/dealership/apply",
        "/api/public/site-password",
        "/api/integrations/slack/commands/run",
        "/api/integrations/slack/commands/help",
        "/api/integrations/slack/commands/stats",
    },
}

_PUBLIC_API_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "GET": (
        re.compile(r"^/api/geo/zip/[^/]+$"),
        re.compile(r"^/api/cars/[^/]+$"),
        re.compile(r"^/api/cars/[^/]+/comments$"),
        re.compile(r"^/api/cars/[^/]+/comments/count$"),
    ),
    "POST": (
        re.compile(r"^/api/cars/[^/]+/comments$"),
        re.compile(r"^/api/comments/[^/]+/reactions$"),
        re.compile(r"^/api/cars/[^/]+/likes$"),
    ),
}


def _normalize_api_path(path: str) -> str:
    if not isinstance(path, str) or not path:
        return "/"
    if path != "/" and path.endswith("/"):
        return path.rstrip("/")
    return path


def _is_public_api_path(path: str, method: str) -> bool:
    method_upper = (method or "").upper()
    normalized_path = _normalize_api_path(path)

    if normalized_path in _PUBLIC_API_EXACT_PATHS.get(method_upper, set()):
        return True

    for pattern in _PUBLIC_API_PATTERNS.get(method_upper, ()):
        if pattern.fullmatch(normalized_path):
            return True

    return False


def _extract_api_token(request: Request) -> str:
    header_name = (getattr(settings, "API_TOKEN_HEADER", "") or "X-API-Token").strip()
    if header_name:
        token = request.headers.get(header_name)
        if token:
            token_value = token.strip()
            if header_name.lower() == "authorization" and token_value.lower().startswith("bearer "):
                return token_value[7:].strip()
            return token_value
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


def _token_required() -> bool:
    expected = (getattr(settings, "API_TOKEN", None) or "").strip()
    require = bool(getattr(settings, "REQUIRE_API_TOKEN", True))
    return bool(expected) or require


def _allow_insecure() -> bool:
    env = (getattr(settings, "APP_ENV", "") or "").strip().lower()
    return bool(getattr(settings, "ALLOW_INSECURE_DEFAULTS", False)) or env in {
        "development",
        "dev",
        "test",
        "local",
    }


async def require_api_token(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    path = request.scope.get("path") or request.url.path
    if not path.startswith("/api"):
        return await call_next(request)
    if request.method.upper() == "OPTIONS":
        return await call_next(request)
    if _is_public_api_path(path, request.method):
        return await call_next(request)

    expected = (getattr(settings, "API_TOKEN", None) or "").strip()
    if not expected and _allow_insecure():
        return await call_next(request)
    if not _token_required() and not expected:
        return await call_next(request)

    token = _extract_api_token(request)
    if expected and token and hmac.compare_digest(token, expected):
        return await call_next(request)

    return Response(
        status_code=401,
        headers={"WWW-Authenticate": "Bearer"},
    )


__all__ = ["require_api_token"]
