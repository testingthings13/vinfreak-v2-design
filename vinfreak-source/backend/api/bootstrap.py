"""API-specific bootstrap helpers."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

try:  # pragma: no cover - prefer explicit package imports
    from backend.db import init_db as init_primary_db
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as package
    from db import init_db as init_primary_db  # type: ignore

try:
    from backend.admin_db import init_db as init_admin_db
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as package
    from admin_db import init_db as init_admin_db  # type: ignore

try:
    from backend.admin.bootstrap import ensure_comment_blocklist_defaults
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as package
    from admin.bootstrap import ensure_comment_blocklist_defaults  # type: ignore

logger = logging.getLogger("vinfreak.api.bootstrap")


@asynccontextmanager
async def api_lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialize shared databases without starting admin-only workers."""

    try:
        init_primary_db()
    except Exception:  # pragma: no cover - defensive startup guard
        logger.exception("Failed to initialize primary database for API service")
    try:
        init_admin_db()
    except Exception:  # pragma: no cover - defensive startup guard
        logger.exception("Failed to initialize admin database for API service")
    try:
        ensure_comment_blocklist_defaults()
    except Exception:  # pragma: no cover - defensive startup guard
        logger.exception("Unable to seed admin comment blocklist for API service")
    yield


__all__ = ["api_lifespan"]
