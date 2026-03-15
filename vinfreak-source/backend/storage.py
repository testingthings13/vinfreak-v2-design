"""Utilities for persisting uploaded files to local storage or R2."""
from __future__ import annotations

import asyncio
import inspect
import logging
import mimetypes
from io import BytesIO
from pathlib import Path
from secrets import token_urlsafe
from typing import Optional
from urllib.parse import urlparse, urlunparse

import anyio

try:  # pragma: no cover - optional dependency during tests
    import boto3
    from botocore.config import Config
    from botocore.exceptions import BotoCoreError, ClientError
except ImportError:  # pragma: no cover
    boto3 = None  # type: ignore[assignment]
    Config = None  # type: ignore[assignment]
    BotoCoreError = ClientError = Exception

try:  # pragma: no cover - allow running as package or module
    from backend.backend_settings import settings
except ModuleNotFoundError:  # pragma: no cover
    from .backend_settings import settings  # type: ignore

logger = logging.getLogger("vinfreak.storage")

LOCAL_UPLOAD_PREFIX = "/uploads/"

_R2_CLIENT = None
_R2_CLIENT_ERROR = False


def _call_async_reader(reader):
    async def _runner():
        return await reader()

    return anyio.run(_runner)


def _resolve_upload_file(upload):
    """Return a readable file-like object for ``upload``.

    Handles ``UploadFile`` instances that may have closed underlying files by
    reading the remaining bytes into memory when necessary.
    """

    file_obj = getattr(upload, "file", None)
    if file_obj is not None and not getattr(file_obj, "closed", False):
        return file_obj

    if isinstance(upload, (bytes, bytearray)):
        return BytesIO(upload)

    reader = getattr(upload, "read", None)
    if callable(reader):
        try:
            if inspect.iscoroutinefunction(reader):
                try:
                    data = anyio.from_thread.run(reader)
                except RuntimeError:
                    try:
                        asyncio.get_running_loop()
                    except RuntimeError:
                        data = _call_async_reader(reader)
                    else:
                        return None
            else:
                data = reader()
        except Exception:
            logger.exception(
                "Failed to read from upload", extra={"filename": getattr(upload, "filename", None)}
            )
            return None

        if isinstance(data, (bytes, bytearray)):
            return BytesIO(data)
        if hasattr(data, "read"):
            return data

    return None


def _safe_seek(file_obj, pos: int = 0) -> bool:
    if hasattr(file_obj, "seek"):
        try:
            file_obj.seek(pos)
        except ValueError:
            return False
    return True


def _r2_enabled() -> bool:
    """Return ``True`` when R2 credentials are configured and boto3 is available."""

    return bool(
        boto3
        and getattr(settings, "R2_ENDPOINT", None)
        and getattr(settings, "R2_BUCKET", None)
        and getattr(settings, "R2_ACCESS_KEY_ID", None)
        and getattr(settings, "R2_SECRET_ACCESS_KEY", None)
    )


def _get_r2_client():
    """Return a cached boto3 client for R2 when configuration is available."""

    global _R2_CLIENT, _R2_CLIENT_ERROR
    if _R2_CLIENT_ERROR or not _r2_enabled():
        return None
    if _R2_CLIENT is None:
        try:
            client_kwargs = {
                "service_name": "s3",
                "endpoint_url": getattr(settings, "R2_ENDPOINT"),
                "aws_access_key_id": getattr(settings, "R2_ACCESS_KEY_ID"),
                "aws_secret_access_key": getattr(settings, "R2_SECRET_ACCESS_KEY"),
            }
            if Config is not None:  # pragma: no branch - Config is optional in tests
                client_kwargs["config"] = Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "virtual"},
                )
            client_kwargs["region_name"] = "auto"
            _R2_CLIENT = boto3.client(**client_kwargs)  # type: ignore[misc]
        except Exception:  # pragma: no cover - initialization errors are logged
            _R2_CLIENT_ERROR = True
            logger.exception("Failed to initialize R2 client")
            return None
    return _R2_CLIENT


def _clean_prefix(prefix: str | None) -> str:
    if not prefix:
        return ""
    parts = [p.strip() for p in str(prefix).split("/") if p and p not in {".", ".."}]
    return "/".join(parts)


def _determine_content_type(upload) -> Optional[str]:
    mime = getattr(upload, "content_type", None)
    filename = getattr(upload, "filename", "")
    if (not mime or mime == "application/octet-stream") and filename:
        guess = mimetypes.guess_type(filename)[0]
        if guess:
            mime = guess
    return mime or None


def _allowed_mime_types() -> set[str]:
    raw = getattr(settings, "upload_allowed_mime_types", ())
    return {str(item).strip().lower() for item in raw if str(item).strip()}


def _read_upload_bytes(file_obj, max_bytes: int) -> Optional[bytes]:
    if not _safe_seek(file_obj, 0):
        return None
    try:
        data = file_obj.read(max_bytes + 1)
    except Exception:
        return None
    if not isinstance(data, (bytes, bytearray)):
        return None
    if len(data) > max_bytes:
        return None
    return bytes(data)


def _ensure_local_directory(prefix: str) -> Path:
    base_dir = Path(getattr(settings, "UPLOAD_DIR", "uploads"))
    base_dir.mkdir(parents=True, exist_ok=True)
    if not prefix:
        return base_dir
    nested = base_dir.joinpath(*prefix.split("/"))
    nested.mkdir(parents=True, exist_ok=True)
    return nested


def _build_public_url(key: str) -> str:
    base_url = getattr(settings, "ASSETS_BASE_URL", None)
    if base_url:
        base = str(base_url).rstrip("/")
        return f"{base}/{key}" if key else base
    endpoint = str(getattr(settings, "R2_ENDPOINT", "") or "").rstrip("/")
    bucket = str(getattr(settings, "R2_BUCKET", "") or "")
    if endpoint:
        parsed = urlparse(endpoint)
        path = parsed.path.strip("/")
        components = [path] if path else []
        if bucket:
            components.append(bucket)
        components.append(key)
        new_path = "/".join(c for c in components if c)
        return urlunparse(parsed._replace(path=f"/{new_path}"))
    return f"{LOCAL_UPLOAD_PREFIX}{key}" if key else LOCAL_UPLOAD_PREFIX.rstrip("/")


def _asset_key_from_url(url: str | None) -> Optional[str]:
    if not url:
        return None
    if url.startswith(LOCAL_UPLOAD_PREFIX):
        return url[len(LOCAL_UPLOAD_PREFIX) :]
    base_url = getattr(settings, "ASSETS_BASE_URL", None)
    if base_url:
        base = str(base_url).rstrip("/")
        if url.startswith(f"{base}/"):
            return url[len(base) + 1 :]
    endpoint = str(getattr(settings, "R2_ENDPOINT", "") or "").rstrip("/")
    bucket = str(getattr(settings, "R2_BUCKET", "") or "")
    if endpoint and bucket:
        combined = f"{endpoint}/{bucket}".rstrip("/")
        if url.startswith(f"{combined}/"):
            return url[len(combined) + 1 :]
    return None


def save_upload(upload, *, category: str = "") -> Optional[str]:
    """Persist ``upload`` and return a publicly accessible URL.

    When R2 credentials are configured, files are uploaded to the configured
    bucket using the optional ``category`` as a folder prefix. Otherwise, files
    are written to the local ``UPLOAD_DIR``.
    """

    if not upload or not getattr(upload, "filename", ""):
        return None

    prefix = _clean_prefix(category)
    ext = Path(upload.filename).suffix
    fname = f"{token_urlsafe(16)}{ext}"
    key = "/".join(filter(None, [prefix, fname]))

    file_obj = _resolve_upload_file(upload)
    if file_obj is None:
        logger.warning(
            "Upload did not provide a readable file", extra={"filename": getattr(upload, "filename", None)}
        )
        return None

    allowed_types = _allowed_mime_types()
    content_type = _determine_content_type(upload)
    if allowed_types:
        if not content_type or content_type.lower() not in allowed_types:
            logger.warning(
                "Rejected upload with disallowed content type",
                extra={"content_type": content_type, "filename": getattr(upload, "filename", None)},
            )
            return None

    max_bytes = int(getattr(settings, "UPLOAD_MAX_BYTES", 0) or 0)
    if max_bytes <= 0:
        max_bytes = 10_485_760
    data = _read_upload_bytes(file_obj, max_bytes)
    if data is None:
        logger.warning(
            "Rejected upload exceeding size limit",
            extra={"filename": getattr(upload, "filename", None), "limit": max_bytes},
        )
        return None

    client = _get_r2_client()
    if client:
        try:
            upload_kwargs = {"Bucket": getattr(settings, "R2_BUCKET"), "Key": key}
            extra_args = {}
            if content_type:
                extra_args["ContentType"] = content_type
            if extra_args:
                upload_kwargs["ExtraArgs"] = extra_args
            client.upload_fileobj(BytesIO(data), **upload_kwargs)
        except (BotoCoreError, ClientError, OSError):
            logger.exception("Failed to upload file to R2", extra={"key": key})
            return None
        return _build_public_url(key)

    dest_dir = _ensure_local_directory(prefix)
    dest_path = dest_dir / fname
    try:
        dest_path.write_bytes(data)
    except OSError:
        logger.exception("Failed to write uploaded file locally", extra={"path": str(dest_path)})
        return None
    return f"{LOCAL_UPLOAD_PREFIX}{key}" if key else f"{LOCAL_UPLOAD_PREFIX}{fname}"


def delete_upload(url: str | None) -> None:
    """Remove the uploaded asset referenced by ``url`` from storage."""

    if not url or url.startswith("data:"):
        return
    if url.startswith(LOCAL_UPLOAD_PREFIX):
        rel = url[len(LOCAL_UPLOAD_PREFIX) :]
        target = Path(getattr(settings, "UPLOAD_DIR", "uploads")) / Path(rel)
        try:
            target.unlink()
        except FileNotFoundError:
            pass
        except OSError:
            logger.warning("Failed to delete local upload", exc_info=True, extra={"path": str(target)})
        return
    key = _asset_key_from_url(url)
    if not key:
        return
    client = _get_r2_client()
    if not client:
        return
    try:
        client.delete_object(Bucket=getattr(settings, "R2_BUCKET"), Key=key)
    except (BotoCoreError, ClientError):
        logger.warning("Failed to delete R2 object", exc_info=True, extra={"key": key})
