"""Generic helpers shared between the API and admin services."""
from __future__ import annotations

from typing import Any


def _coerce_truthy(value: Any, *, default: bool = False) -> bool:
    """Coerce loosely-typed form values to booleans."""

    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text_value = str(value).strip().lower()
    if not text_value:
        return default
    return text_value not in {"0", "false", "off", "no"}


__all__ = ["_coerce_truthy"]
