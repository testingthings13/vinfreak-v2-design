"""Shared admin helpers used across admin routes."""
from __future__ import annotations

import secrets
from typing import Any

from fastapi import HTTPException, Request
from sqlmodel import Session as DBSession, SQLModel, select

try:  # pragma: no cover - prefer explicit package import
    from backend.db import engine
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as script
    from db import engine

try:  # pragma: no cover - prefer explicit absolute import
    from backend.models import AdminUser  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as a script
    from models import AdminUser  # type: ignore

try:  # pragma: no cover - prefer explicit package import
    from backend.admin.permissions import user_sections  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - fallback for script execution
    from .permissions import user_sections  # type: ignore


def _user_sections_list(user: AdminUser | None) -> list[str]:
    if user is None:
        return []
    sections = user_sections(
        getattr(user, "permissions", None),
        getattr(user, "is_superuser", False),
    )
    user.can_add_cars = "manual" in sections
    return sections


def _user_section_set(user: AdminUser | None) -> set[str]:
    return set(_user_sections_list(user))


def _has_section_access(user: AdminUser, *sections: str) -> bool:
    if getattr(user, "is_superuser", False):
        return True
    allowed = _user_section_set(user)
    if not sections:
        return bool(allowed)
    return bool(allowed.intersection(sections))


def admin_section_required(*sections: str):
    def dependency(request: Request):
        user = get_current_admin(request)
        if not _has_section_access(user, *sections):
            raise HTTPException(status_code=403, detail="Access to this section is restricted")
        return user

    return dependency


def _set_admin_session(request: Request, user: AdminUser) -> None:
    if getattr(user, "id", None) is None:
        raise HTTPException(status_code=401)
    request.session["admin_user"] = user.username
    request.session["admin_user_id"] = int(user.id)
    request.session["is_superadmin"] = bool(getattr(user, "is_superuser", False))
    sections = _user_sections_list(user)
    request.session["permissions"] = sections
    request.session["can_add_cars"] = "manual" in sections
    state_obj = getattr(request, "state", None)
    if state_obj is not None:
        setattr(state_obj, "admin_user", user)


def get_current_admin(request: Request) -> AdminUser:
    if AdminUser is None or not isinstance(AdminUser, type) or not issubclass(AdminUser, SQLModel):
        raise HTTPException(status_code=500, detail="Admin model unavailable")
    user_id = request.session.get("admin_user_id")
    try:
        user_id_int = int(user_id)
    except (TypeError, ValueError):
        request.session.clear()
        raise HTTPException(status_code=401)
    cached = getattr(request.state, "admin_user", None)
    if cached and getattr(cached, "id", None) == user_id_int:
        user = cached
    else:
        with DBSession(engine) as session:
            statement = select(AdminUser).where(AdminUser.id == user_id_int)
            user = session.exec(statement).first()
        if not user or not getattr(user, "is_active", True):
            request.session.clear()
            raise HTTPException(status_code=401)
    _set_admin_session(request, user)
    return user


def flash(request: Request, message: str, category: str = "success") -> None:
    request.session.setdefault("flash", []).append({"cat": category, "msg": message})


def pop_flash(request: Request) -> list[dict[str, Any]]:
    msgs = request.session.get("flash", [])
    request.session["flash"] = []
    return msgs


def get_ip(request: Request) -> str:
    return request.headers.get("x-forwarded-for") or request.client.host


def admin_session_required(request: Request) -> AdminUser:
    user = get_current_admin(request)
    if not _has_section_access(user):
        raise HTTPException(status_code=403, detail="No admin sections assigned")
    return user


def manual_entry_required(request: Request) -> AdminUser:
    user = get_current_admin(request)
    if not _has_section_access(user, "manual"):
        raise HTTPException(status_code=403, detail="Manual entry access required")
    return user


def super_admin_required(request: Request) -> AdminUser:
    user = get_current_admin(request)
    if not getattr(user, "is_superuser", False):
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user


def csrf_token(request: Request) -> str:
    tok = request.session.get("csrf_token")
    if not tok:
        tok = secrets.token_urlsafe(32)
        request.session["csrf_token"] = tok
    return tok


def require_csrf(request: Request, token: str) -> None:
    if token != request.session.get("csrf_token"):
        raise HTTPException(status_code=400, detail="CSRF token invalid")


__all__ = [
    "_has_section_access",
    "_set_admin_session",
    "_user_sections_list",
    "admin_section_required",
    "admin_session_required",
    "csrf_token",
    "flash",
    "get_current_admin",
    "get_ip",
    "manual_entry_required",
    "pop_flash",
    "require_csrf",
    "super_admin_required",
]
