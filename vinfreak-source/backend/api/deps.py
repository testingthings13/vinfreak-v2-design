"""Dependencies and helpers shared across API routes."""
from __future__ import annotations

import json
import secrets
import sys
from typing import Any

from fastapi import Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlmodel import Session as DBSession

try:
    from ..common.public import _public_car_dict, _public_make_dict
    from ..common.values import _coerce_truthy
except ImportError:  # pragma: no cover - fallback for script execution
    from common.public import _public_car_dict, _public_make_dict  # type: ignore
    from common.values import _coerce_truthy  # type: ignore


def _current_admin_engine():
    module = sys.modules.get("admin_db")
    if module is not None:
        engine = getattr(module, "engine", None)
        if engine is not None:
            return engine
    from admin_db import engine as admin_engine  # type: ignore

    return admin_engine

DEFAULT_SITE_PASSWORD_VERSION = "default"
PUBLIC_SESSION_KEY = "public_session_id"


class SitePasswordSubmission(BaseModel):
    password: str


class SitePasswordResult(BaseModel):
    ok: bool
    enabled: bool
    version: str | None = None
    error: str | None = None


def _ensure_public_session_id(request: Request | None) -> str | None:
    if request is None:
        return None
    try:
        session_data = request.session
    except AttributeError:
        return None
    session_id = session_data.get(PUBLIC_SESSION_KEY)
    if not isinstance(session_id, str) or not session_id.strip():
        session_id = secrets.token_urlsafe(24)
        session_data[PUBLIC_SESSION_KEY] = session_id
    return session_id


def _load_public_settings() -> dict[str, Any]:
    with DBSession(_current_admin_engine()) as session:
        rows = session.exec(text("SELECT key,value FROM settings")).mappings().all()
        data = {row["key"]: row["value"] for row in rows}

    raw = data.get("brand_filter_make_ids")
    parsed_ids: list[int | str] = []
    if raw:
        try:
            candidate = json.loads(raw) if isinstance(raw, str) else raw
            if isinstance(candidate, list):
                parsed_ids = [x for x in candidate if x not in (None, "")]
        except (ValueError, TypeError):
            if isinstance(raw, str):
                parsed_ids = [
                    part.strip()
                    for part in raw.split(",")
                    if part and part.strip()
                ]
    data["brand_filter_make_ids"] = parsed_ids

    top_filters_enabled = _coerce_truthy(
        data.get("home_top_filters_enabled"), default=False
    )
    data["home_top_filters_enabled"] = top_filters_enabled
    data["home_make_filter_enabled"] = _coerce_truthy(
        data.get("home_make_filter_enabled"), default=False
    )
    data["home_dealership_filter_enabled"] = _coerce_truthy(
        data.get("home_dealership_filter_enabled"), default=False
    )
    data["home_new_listing_badge_enabled"] = _coerce_truthy(
        data.get("home_new_listing_badge_enabled"), default=True
    )
    data["home_inventory_type_pills_enabled"] = _coerce_truthy(
        data.get("home_inventory_type_pills_enabled"), default=False
    )
    data["home_sort_label_enabled"] = _coerce_truthy(
        data.get("home_sort_label_enabled"), default=False
    )
    data["home_filter_counts_enabled"] = _coerce_truthy(
        data.get("home_filter_counts_enabled"), default=False
    )
    data["home_footer_panels_enabled"] = _coerce_truthy(
        data.get("home_footer_panels_enabled"), default=False
    )
    data["spotify_widget_enabled"] = _coerce_truthy(
        data.get("spotify_widget_enabled"), default=True
    )
    gate_enabled = _coerce_truthy(
        data.get("site_password_enabled"),
        default=False,
    )
    data["password_gate_enabled"] = gate_enabled
    if "site_password_enabled" not in data:
        data["site_password_enabled"] = "1" if gate_enabled else "0"
    version_value = str(
        data.get("site_password_version") or DEFAULT_SITE_PASSWORD_VERSION
    )
    data["site_password_version"] = version_value
    logo_url = str(data.get("logo_url") or "").strip()
    favicon_url = str(data.get("favicon_url") or "").strip()
    if not favicon_url and logo_url:
        data["favicon_url"] = logo_url
    if "site_password_hash" in data:
        data.pop("site_password_hash", None)
    return data


__all__ = [
    "DEFAULT_SITE_PASSWORD_VERSION",
    "PUBLIC_SESSION_KEY",
    "SitePasswordResult",
    "SitePasswordSubmission",
    "_ensure_public_session_id",
    "_load_public_settings",
    "_public_car_dict",
    "_public_make_dict",
]
