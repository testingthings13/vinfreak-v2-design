"""Standalone FastAPI application for the admin service."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

# Support running both as part of the ``backend`` package and as a top-level
# ``admin`` package (as done in deployment environments).
try:
    if __package__ and __package__.startswith("backend."):
        from ..settings import settings  # pragma: no cover
        from .bootstrap import admin_lifespan, templates, _require_basic_auth  # pragma: no cover
    else:  # When executed as ``admin.app``
        from backend.admin.bootstrap import admin_lifespan, templates, _require_basic_auth
        from backend.settings import settings
except (ImportError, ModuleNotFoundError):
    # ``backend`` is not importable when the project root isn't on ``sys.path``
    # (e.g. Render's ``/opt/render/project/src`` app dir). Ensure the parent
    # directory is available and retry the absolute import.
    import sys

    project_root = Path(__file__).resolve().parents[2]
    project_root_str = str(project_root)
    if project_root_str not in sys.path:
        sys.path.append(project_root_str)

    from backend.admin.bootstrap import admin_lifespan, templates, _require_basic_auth
    from backend.settings import settings
from .deps import csrf_token
from .routes import router

app = FastAPI(title="VINFREAK Admin", lifespan=admin_lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    https_only=bool(settings.SESSION_COOKIE_SECURE),
    same_site=settings.SESSION_COOKIE_SAMESITE,
)
allowed_origins = [origin for origin in settings.cors_allowed_origins if origin]
if not allowed_origins:
    allowed_origins = [
        "https://vinfreak.com",
        "https://www.vinfreak.com",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=bool(settings.CORS_ALLOW_CREDENTIALS),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
app.middleware("http")(_require_basic_auth)
Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
templates.env.globals["csrf_token"] = csrf_token
app.include_router(router)

try:
    from backend.app import (
        dealer_dashboard,
        dealer_inventory,
        dealer_inventory_create,
        dealer_inventory_delete,
        dealer_inventory_edit,
        dealer_inventory_new,
        dealer_inventory_update,
        dealer_login,
        dealer_login_form,
        dealer_logout,
        dealer_profile,
        dealer_profile_update,
        run_slack_command,
    )

    app.add_api_route(
        "/dealership/login",
        dealer_login_form,
        methods=["GET"],
        response_class=HTMLResponse,
    )
    app.add_api_route("/dealership/login", dealer_login, methods=["POST"])
    app.add_api_route("/dealership/logout", dealer_logout, methods=["GET"])
    app.add_api_route(
        "/dealership",
        dealer_dashboard,
        methods=["GET"],
        response_class=HTMLResponse,
    )
    app.add_api_route(
        "/dealership/inventory",
        dealer_inventory,
        methods=["GET"],
        response_class=HTMLResponse,
    )
    app.add_api_route(
        "/dealership/inventory/new",
        dealer_inventory_new,
        methods=["GET"],
        response_class=HTMLResponse,
    )
    app.add_api_route("/dealership/inventory/new", dealer_inventory_create, methods=["POST"])
    app.add_api_route(
        "/dealership/inventory/{car_id}",
        dealer_inventory_edit,
        methods=["GET"],
        response_class=HTMLResponse,
    )
    app.add_api_route(
        "/dealership/inventory/{car_id}",
        dealer_inventory_update,
        methods=["POST"],
    )
    app.add_api_route(
        "/dealership/inventory/{car_id}/delete",
        dealer_inventory_delete,
        methods=["POST"],
    )
    app.add_api_route(
        "/dealership/profile",
        dealer_profile,
        methods=["GET"],
        response_class=HTMLResponse,
    )
    app.add_api_route("/dealership/profile", dealer_profile_update, methods=["POST"])
    app.add_api_route(
        "/api/integrations/slack/commands/run",
        run_slack_command,
        methods=["POST"],
    )
    app.add_api_route(
        "/api/integrations/slack/commands/help",
        run_slack_command,
        methods=["POST"],
    )
    app.add_api_route(
        "/api/integrations/slack/commands/stats",
        run_slack_command,
        methods=["POST"],
    )
except Exception:
    # Keep admin app booting even if dealer portal import fails.
    pass

__all__ = ["app"]
