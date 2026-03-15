"""Compatibility shim for accessing the shared settings object.

Both the API and admin services import :data:`settings` from this module so
that configuration continues to be sourced from ``backend/backend_settings``.
"""
from .backend_settings import settings

__all__ = ["settings"]
