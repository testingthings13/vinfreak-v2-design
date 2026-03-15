"""Standalone FastAPI application for the public API service."""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from starlette.middleware.sessions import SessionMiddleware

from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import backend.app as monolith_app
from backend.app import _require_basic_auth
from backend.api.auth import require_api_token
from backend.settings import settings
from .routes import create_router
from .bootstrap import api_lifespan

app = FastAPI(title="VINFREAK API", lifespan=api_lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    https_only=bool(settings.SESSION_COOKIE_SECURE),
    same_site=settings.SESSION_COOKIE_SAMESITE,
)
allowed_origins = [origin for origin in settings.cors_allowed_origins if origin]
if allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=bool(settings.CORS_ALLOW_CREDENTIALS),
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
app.middleware("http")(require_api_token)
app.middleware("http")(_require_basic_auth)
app.include_router(create_router(monolith_app))


@app.api_route(
    "/share/{identifier}",
    methods=["GET", "HEAD"],
    response_class=HTMLResponse,
    include_in_schema=False,
)
@app.api_route(
    "/share/{identifier}/{cache_bust}",
    methods=["GET", "HEAD"],
    response_class=HTMLResponse,
    include_in_schema=False,
)
def api_share_preview(
    request: Request,
    identifier: str,
    cache_bust: str | None = None,
):
    # Reuse the monolith share renderer so social scrapers receive
    # server-rendered OG/Twitter metadata for each listing.
    return monolith_app.share_preview(request, identifier, cache_bust)

__all__ = ["app"]
