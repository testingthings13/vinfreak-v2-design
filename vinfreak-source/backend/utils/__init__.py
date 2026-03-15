import re
from typing import Any
import re
from typing import Any


def _has_countdown_value(value: Any) -> bool:
    """Return ``True`` when ``value`` should be treated as a countdown field."""

    if value is None:
        return False
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return False
        if stripped.lower() in {"null", "none", "n/a", "na", "undefined"}:
            return False
        return True
    return True


_VALID_STATUSES = {"LIVE", "AUCTION_IN_PROGRESS", "SOLD", "REMOVED"}


def _set_status(payload: dict, status: str) -> None:
    """Persist ``status`` in both snake_case and camelCase fields."""

    payload["auction_status"] = status
    payload["auctionStatus"] = status


def ensure_live_status(payload: dict) -> None:
    """Populate ``auction_status`` based on the presence of countdown fields.

    NeuroWraith and JSON imports occasionally omit ``end_time``/``time_left`` for
    vehicles that are actively listed. When the countdown data is present we
    assume the auction is running and default to ``AUCTION_IN_PROGRESS``. When
    the countdown fields are absent (or explicitly ``null``/blank) and the
    incoming data does not already provide a recognized ``auction_status``, we
    default to ``LIVE`` so the listing appears as active on the site.
    """

    if not isinstance(payload, dict):
        return

    end_candidates = (
        payload.get("end_time"),
        payload.get("endTime"),
    )
    time_candidates = (
        payload.get("time_left"),
        payload.get("timeLeft"),
    )

    if any(_has_countdown_value(value) for value in (*end_candidates, *time_candidates)):
        _set_status(payload, "AUCTION_IN_PROGRESS")
        return

    status_value = payload.get("auction_status") or payload.get("auctionStatus")
    if isinstance(status_value, str) and status_value.strip():
        status_normalized = status_value.strip().upper()
        if status_normalized in _VALID_STATUSES:
            _set_status(payload, status_normalized)
            return

    _set_status(payload, "LIVE")


def strip_zip(address: str | None) -> str | None:
    """Remove trailing US ZIP codes from an address string.

    Returns the input string without a trailing 5-digit ZIP code or ZIP+4,
    preserving the rest of the address. If the input is falsy it is returned
    unchanged.
    """
    if not address:
        return address
    return re.sub(r"\s*\b\d{5}(?:-\d{4})?\b$", "", address).strip() or None
