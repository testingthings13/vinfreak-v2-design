"""Celery task definitions for background imports."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from .job_queue import get_celery_app

LOGGER = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _ensure_worker_databases_initialized() -> None:
    """Initialize DB schemas once per Celery worker process."""

    try:  # pragma: no cover - import path depends on execution mode
        from backend.backend_settings import settings as runtime_settings
    except ModuleNotFoundError:  # pragma: no cover - script/runtime fallback
        from backend_settings import settings as runtime_settings  # type: ignore

    db_url = str(getattr(runtime_settings, "DATABASE_URL", "") or "").strip().lower()
    if db_url.startswith("sqlite"):
        LOGGER.warning(
            "Celery worker is using SQLite DATABASE_URL. Configure shared Postgres "
            "DATABASE_URL for multi-service deployments."
        )

    try:  # pragma: no cover - import path depends on execution mode
        from backend.db import init_db as init_primary_db
    except ModuleNotFoundError:  # pragma: no cover - script/runtime fallback
        from db import init_db as init_primary_db  # type: ignore

    try:  # pragma: no cover - import path depends on execution mode
        from backend.admin_db import init_db as init_admin_db
    except ModuleNotFoundError:  # pragma: no cover - script/runtime fallback
        from admin_db import init_db as init_admin_db  # type: ignore

    init_primary_db()
    init_admin_db()


celery_app = get_celery_app()


if celery_app is not None:  # pragma: no cover - exercised in Celery worker runtime

    @celery_app.task(name="vinfreak.jobs.neurowraith", bind=True)
    def run_neurowraith_job(self: Any, job_id: str) -> dict[str, Any]:
        job_key = str(job_id or "").strip()
        task_id = str(getattr(getattr(self, "request", None), "id", "") or "").strip()
        LOGGER.info(
            "NeuroWraith task started (task_id=%s job_id=%s)",
            task_id or "unknown",
            job_key or "unknown",
        )
        try:
            _ensure_worker_databases_initialized()
            from backend import app as app_module

            app_module._neurowraith_job_worker(job_key)
        except Exception:
            LOGGER.exception(
                "NeuroWraith task failed (task_id=%s job_id=%s)",
                task_id or "unknown",
                job_key or "unknown",
            )
            raise
        LOGGER.info(
            "NeuroWraith task finished (task_id=%s job_id=%s)",
            task_id or "unknown",
            job_key or "unknown",
        )
        return {"job_id": job_key, "section": "neurowraith"}


    @celery_app.task(name="vinfreak.jobs.facebook_marketplace", bind=True)
    def run_facebook_marketplace_job(self: Any, job_id: str) -> dict[str, Any]:
        job_key = str(job_id or "").strip()
        task_id = str(getattr(getattr(self, "request", None), "id", "") or "").strip()
        LOGGER.info(
            "Facebook Marketplace task started (task_id=%s job_id=%s)",
            task_id or "unknown",
            job_key or "unknown",
        )
        try:
            _ensure_worker_databases_initialized()
            from backend import app as app_module

            app_module._facebook_marketplace_job_worker(job_key)
        except Exception:
            LOGGER.exception(
                "Facebook Marketplace task failed (task_id=%s job_id=%s)",
                task_id or "unknown",
                job_key or "unknown",
            )
            raise
        LOGGER.info(
            "Facebook Marketplace task finished (task_id=%s job_id=%s)",
            task_id or "unknown",
            job_key or "unknown",
        )
        return {"job_id": job_key, "section": "facebook_marketplace"}


else:

    def run_neurowraith_job(job_id: str) -> dict[str, Any]:  # pragma: no cover
        raise RuntimeError("Celery background backend is not enabled.")


    def run_facebook_marketplace_job(job_id: str) -> dict[str, Any]:  # pragma: no cover
        raise RuntimeError("Celery background backend is not enabled.")


__all__ = [
    "celery_app",
    "_ensure_worker_databases_initialized",
    "run_neurowraith_job",
    "run_facebook_marketplace_job",
]
