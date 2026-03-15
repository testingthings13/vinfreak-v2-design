"""Shared admin bootstrap helpers used by both monolith and standalone apps."""
from __future__ import annotations

import base64
import hmac
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator, Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.responses import RedirectResponse
from sqlmodel import Session as SQLModelSession, select
from starlette.templating import Jinja2Templates

try:  # pragma: no cover - prefer explicit package imports
    from backend.admin.deps import csrf_token
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as script
    from admin.deps import csrf_token  # type: ignore

try:
    from backend.settings import settings  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - fallback when running as package
    from settings import settings  # type: ignore

try:
    from backend.db import engine as default_engine, init_db as default_init_db
except ModuleNotFoundError:  # pragma: no cover - fallback for script execution
    from db import engine as default_engine, init_db as default_init_db  # type: ignore

try:
    from backend.admin_db import init_db as default_init_admin_db
except ModuleNotFoundError:  # pragma: no cover - fallback for script execution
    from admin_db import init_db as default_init_admin_db  # type: ignore

try:
    from backend.models import Comment, CommentBlocklist, CommentStatus
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as script
    from models import Comment, CommentBlocklist, CommentStatus  # type: ignore

try:  # pragma: no cover - prefer explicit package imports
    from backend.admin.flagged import count_flagged_cars
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as script
    from admin.flagged import count_flagged_cars  # type: ignore

from sqlalchemy import func, or_


logger = logging.getLogger("vinfreak.admin.bootstrap")


def _monolith_module():
    return sys.modules.get("backend.app")


def _current_engine():
    module = _monolith_module()
    if module is not None and getattr(module, "engine", None) is not None:
        return module.engine
    return default_engine


def _session_factory():
    module = _monolith_module()
    session_cls = None
    if module is not None:
        session_cls = getattr(module, "DBSession", None)
    return session_cls or SQLModelSession


def _current_init_db():
    module = _monolith_module()
    fn = None
    if module is not None:
        fn = getattr(module, "init_db", None)
    return fn or default_init_db


def _current_init_admin_db():
    module = _monolith_module()
    fn = None
    if module is not None:
        fn = getattr(module, "init_admin_db", None)
    return fn or default_init_admin_db


DEFAULT_BLOCKED_WORDS: tuple[str, ...] = (
    "abuse",
    "fraud",
    "hate",
    "obscene",
    "scam",
    "spam",
    "stupid",
    "toxic",
    "trash",
    "ugly",
    "fake",
    "loser",
)


_templates_dir = Path(__file__).resolve().parents[1] / "templates"
templates = Jinja2Templates(directory=str(_templates_dir))
templates.env.globals["csrf_token"] = csrf_token


def ensure_comment_blocklist_defaults() -> None:
    """Seed the comment blocklist with default entries if none exist."""

    if CommentBlocklist is None:
        return
    try:
        session_cls = _session_factory()
        with session_cls(_current_engine()) as session:
            existing = {
                (entry.phrase or "").strip().lower()
                for entry in session.exec(select(CommentBlocklist)).all()
            }
            to_add = [
                CommentBlocklist(phrase=word)
                for word in DEFAULT_BLOCKED_WORDS
                if word.lower() not in existing
            ]
            if to_add:
                for entry in to_add:
                    session.add(entry)
                session.commit()
    except Exception:  # pragma: no cover - guard during startup
        logger.exception("Failed to seed default comment blocklist")


def _comment_alert_count() -> int:
    if Comment is None:
        return 0
    try:
        session_cls = _session_factory()
        with session_cls(_current_engine()) as session:
            stmt = select(func.count()).where(
                or_(
                    Comment.flagged.is_(True),
                    func.lower(Comment.status) == CommentStatus.PENDING.value,
                )
            )
            result = session.exec(stmt).one()
            return int(result or 0)
    except Exception:  # pragma: no cover - template guard
        return 0


templates.env.globals["comment_alert_count"] = _comment_alert_count


def _flagged_car_count() -> int:
    try:
        session_cls = _session_factory()
        with session_cls(_current_engine()) as session:
            return count_flagged_cars(session)
    except Exception:  # pragma: no cover - template guard
        return 0


templates.env.globals["flagged_car_count"] = _flagged_car_count


@asynccontextmanager
async def admin_lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Minimal lifespan for the standalone admin service."""

    _current_init_db()()
    _current_init_admin_db()()
    ensure_comment_blocklist_defaults()
    yield


async def _require_basic_auth(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Middleware enforcing HTTP basic auth for admin endpoints."""

    if request.method.upper() == "OPTIONS":
        return await call_next(request)

    path = request.scope.get("path") or request.url.path
    segments = path.split("/")
    if (
        len(segments) >= 3
        and segments[1].casefold() == "admin"
        and segments[2].casefold() == "comments"
    ):
        normalized_segments = ["", "admin", "comments", *segments[3:]]
        normalized_path = "/".join(normalized_segments) or "/"
        if normalized_path != path:
            if request.method in {"GET", "HEAD", "OPTIONS"}:
                destination = normalized_path
                if request.url.query:
                    destination = f"{destination}?{request.url.query}"
                return RedirectResponse(destination, status_code=308)
            request.scope["path"] = normalized_path
            request.scope["raw_path"] = normalized_path.encode("utf-8")

    normalized_path = request.scope.get("path") or request.url.path
    protected_prefixes = ("/admin", "/dealer", "/dealership")
    if not any(normalized_path.startswith(prefix) for prefix in protected_prefixes):
        return await call_next(request)

    canonical_admin_host = (settings.ADMIN_CANONICAL_HOST or "").strip()
    if canonical_admin_host:
        current_host = (request.url.hostname or "").strip().lower()
        canonical_host = canonical_admin_host.strip()
        canonical_host_lower = canonical_host.lower()
        redirect_hosts = {
            host.strip().lower()
            for host in settings.admin_redirect_hosts
            if host and host.strip()
        }
        should_redirect = bool(current_host) and current_host != canonical_host_lower
        if should_redirect and (not redirect_hosts or current_host in redirect_hosts):
            canonical_scheme = (settings.ADMIN_CANONICAL_SCHEME or "").strip() or request.url.scheme
            destination = request.url.replace(
                scheme=canonical_scheme,
                netloc=canonical_host,
            )
            return RedirectResponse(str(destination), status_code=308)

    expected_pairs: list[tuple[str, str]] = []
    admin_user = settings.BASIC_AUTH_USERNAME or ""
    admin_password = settings.BASIC_AUTH_PASSWORD or ""
    if admin_user and admin_password:
        expected_pairs.append((admin_user, admin_password))
    agent_user = settings.AGENT_BASIC_AUTH_USERNAME or ""
    agent_password = settings.AGENT_BASIC_AUTH_PASSWORD or ""
    if agent_user and agent_password:
        expected_pairs.append((agent_user, agent_password))

    if not expected_pairs:
        return await call_next(request)

    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Basic "):
        return Response(status_code=401, headers={"WWW-Authenticate": "Basic"})
    try:
        user, _, pwd = base64.b64decode(auth.split()[1]).decode().partition(":")
    except Exception:
        return Response(status_code=401, headers={"WWW-Authenticate": "Basic"})

    for expected_user, expected_password in expected_pairs:
        if hmac.compare_digest(user, expected_user) and hmac.compare_digest(
            pwd, expected_password
        ):
            return await call_next(request)

    return Response(status_code=401, headers={"WWW-Authenticate": "Basic"})


__all__ = [
    "DEFAULT_BLOCKED_WORDS",
    "admin_lifespan",
    "ensure_comment_blocklist_defaults",
    "templates",
    "_require_basic_auth",
]
