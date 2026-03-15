"""Background job queue adapter with optional Celery + Redis support."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from functools import lru_cache
from typing import Any

try:  # pragma: no cover - optional dependency at runtime
    from celery import Celery
except Exception:  # pragma: no cover - Celery not installed
    Celery = None  # type: ignore[assignment]

try:  # pragma: no cover - optional at import time when Celery is absent
    from kombu import Queue
except Exception:  # pragma: no cover - Kombu comes with Celery
    Queue = None  # type: ignore[assignment]

try:  # Allow test/runtime overrides with lightweight settings module
    from backend_settings import settings  # type: ignore
except ImportError:  # pragma: no cover - package import fallback
    from backend.backend_settings import settings

LOGGER = logging.getLogger(__name__)
DEFAULT_CELERY_QUEUE = "celery"
NEUROWRATH_CELERY_QUEUE = "neurowraith"
FACEBOOK_MARKETPLACE_CELERY_QUEUE = "facebook_marketplace"


def _backend_name() -> str:
    raw = getattr(settings, "BACKGROUND_JOB_BACKEND", "thread")
    text = str(raw or "thread").strip().lower()
    return text or "thread"


def _redis_url() -> str | None:
    broker = str(getattr(settings, "CELERY_BROKER_URL", "") or "").strip()
    if broker:
        if "://" not in broker:
            broker = f"redis://{broker}"
        return broker
    redis_url = str(getattr(settings, "REDIS_URL", "") or "").strip()
    if redis_url:
        if "://" not in redis_url:
            redis_url = f"redis://{redis_url}"
        return redis_url
    return None


def _result_backend_url(broker_url: str) -> str:
    backend = str(getattr(settings, "CELERY_RESULT_BACKEND", "") or "").strip()
    return backend or broker_url


def _worker_pool() -> str:
    raw = getattr(settings, "CELERY_WORKER_POOL", "solo")
    text = str(raw or "solo").strip().lower()
    return text or "solo"


def _int_setting(name: str, default: int, minimum: int = 0) -> int:
    raw = getattr(settings, name, default)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = int(default)
    return max(minimum, value)


def is_celery_backend_enabled() -> bool:
    if _backend_name() != "celery":
        return False
    if Celery is None:
        return False
    return bool(_redis_url())


def backend_status() -> dict[str, Any]:
    backend = _backend_name()
    celery_selected = backend == "celery"
    celery_installed = Celery is not None
    broker_configured = bool(_redis_url())
    result_backend_configured = bool(
        str(getattr(settings, "CELERY_RESULT_BACKEND", "") or "").strip()
    ) or broker_configured

    ready = False
    reason = ""
    if not celery_selected:
        ready = True
        reason = "thread mode"
    elif not celery_installed:
        reason = "Celery package is not installed"
    elif not broker_configured:
        reason = "CELERY_BROKER_URL or REDIS_URL is missing"
    else:
        ready = True
        reason = "celery configured"

    return {
        "backend": backend,
        "ready": ready,
        "celery_selected": celery_selected,
        "celery_installed": celery_installed,
        "broker_configured": broker_configured,
        "result_backend_configured": result_backend_configured,
        "reason": reason,
    }


def backend_summary() -> str:
    status = backend_status()
    backend = str(status.get("backend") or "thread").strip().lower()
    if backend != "celery":
        return "threads (single app runtime)"
    if bool(status.get("ready")):
        return "celery + redis (configured)"
    reason = str(status.get("reason") or "configuration incomplete").strip()
    return f"celery requested but unavailable ({reason})"


@lru_cache(maxsize=1)
def get_celery_app() -> Any | None:
    if not is_celery_backend_enabled():
        return None
    broker_url = _redis_url()
    if not broker_url:
        return None
    pool_name = _worker_pool()
    concurrency = _int_setting("CELERY_WORKER_CONCURRENCY", default=1, minimum=1)
    if pool_name == "solo":
        concurrency = 1
    max_tasks_per_child = _int_setting(
        "CELERY_WORKER_MAX_TASKS_PER_CHILD", default=50, minimum=0
    )
    max_memory_per_child = _int_setting(
        "CELERY_WORKER_MAX_MEMORY_PER_CHILD_KB", default=0, minimum=0
    )

    app = Celery(
        "vinfreak-jobs",
        broker=broker_url,
        backend=_result_backend_url(broker_url),
        include=["backend.integrations.job_tasks"],
    )
    app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        task_track_started=bool(getattr(settings, "CELERY_TASK_TRACK_STARTED", True)),
        task_always_eager=bool(getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False)),
        task_ignore_result=True,
        task_store_errors_even_if_ignored=False,
        task_default_queue=DEFAULT_CELERY_QUEUE,
        task_create_missing_queues=True,
        worker_prefetch_multiplier=1,
        # Admin jobs already persist their own status; late acks only cause
        # dead workers to resurrect stale job IDs from the broker.
        task_acks_late=False,
        task_reject_on_worker_lost=False,
        worker_pool=pool_name,
        worker_concurrency=concurrency,
        worker_max_tasks_per_child=max_tasks_per_child,
        worker_max_memory_per_child=max_memory_per_child,
    )
    if Queue is not None:
        queue_config = (
            Queue(DEFAULT_CELERY_QUEUE),
            Queue(NEUROWRATH_CELERY_QUEUE),
            Queue(FACEBOOK_MARKETPLACE_CELERY_QUEUE),
        )
        app.conf.update(task_queues=queue_config)
    return app


def enqueue_job_task(
    task_name: str,
    *args: Any,
    queue_name: str | None = None,
    **kwargs: Any,
) -> bool:
    app = get_celery_app()
    if app is None:
        return False
    task = str(task_name or "").strip()
    if not task:
        return False
    queue_value = str(queue_name or "").strip() or None
    try:
        if not _celery_worker_supports_queue(app, queue_name=queue_value):
            queue_label = queue_value or DEFAULT_CELERY_QUEUE
            LOGGER.warning(
                "No Celery workers subscribed to queue '%s'; skipping task '%s'",
                queue_label,
                task,
            )
            return False
        send_options: dict[str, Any] = {}
        if queue_value:
            send_options["queue"] = queue_value
        app.send_task(task, args=list(args), kwargs=dict(kwargs), **send_options)
        return True
    except Exception:  # pragma: no cover - queue failures are environment-specific
        LOGGER.exception("Failed to enqueue Celery task '%s'", task)
        return False


def _celery_worker_supports_queue(app: Any, *, queue_name: str | None = None) -> bool:
    queue_value = str(queue_name or "").strip().lower()
    try:
        control = getattr(app, "control", None)
        inspector = control.inspect(timeout=1.0) if control is not None else None
    except Exception:  # pragma: no cover - worker inspection depends on runtime env
        LOGGER.debug("Celery worker inspection failed during setup", exc_info=True)
        return True
    if inspector is None:
        return True

    active_queues: Any = None
    try:
        active_queues = inspector.active_queues()
    except Exception:  # pragma: no cover - broker/worker specific behavior
        LOGGER.debug("Celery worker queue inspection failed", exc_info=True)

    if isinstance(active_queues, Mapping):
        if not active_queues:
            return False
        if not queue_value:
            return True
        for worker_queues in active_queues.values():
            if not isinstance(worker_queues, list):
                continue
            for queue_payload in worker_queues:
                if not isinstance(queue_payload, Mapping):
                    continue
                queue_name_value = str(queue_payload.get("name") or "").strip().lower()
                if queue_name_value and queue_name_value == queue_value:
                    return True
        return False

    try:
        ping_payload = inspector.ping()
    except Exception:  # pragma: no cover - broker/worker specific behavior
        LOGGER.debug("Celery worker ping failed", exc_info=True)
        return True
    if isinstance(ping_payload, Mapping):
        return bool(ping_payload)
    return True


__all__ = [
    "DEFAULT_CELERY_QUEUE",
    "FACEBOOK_MARKETPLACE_CELERY_QUEUE",
    "NEUROWRATH_CELERY_QUEUE",
    "backend_status",
    "backend_summary",
    "enqueue_job_task",
    "get_celery_app",
    "is_celery_backend_enabled",
]
