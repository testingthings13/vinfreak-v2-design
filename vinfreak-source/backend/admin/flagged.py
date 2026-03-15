"""Helpers for identifying and querying cars with missing critical data."""
from __future__ import annotations

from typing import Sequence

from sqlalchemy import and_, false, func, or_
from sqlmodel import select

try:  # pragma: no cover - prefer explicit package imports
    from backend.models import Car
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as script
    from models import Car  # type: ignore


FLAGGED_STATUSES: tuple[str, ...] = ("LIVE", "AUCTION_IN_PROGRESS")


def _text_column(column):
    """Return a SQL expression that trims string columns and falls back to ''."""

    return func.trim(func.coalesce(column, ""))


def _is_blank(column):
    """Return a SQL expression evaluating to ``TRUE`` when ``column`` is blank."""

    return _text_column(column) == ""


def flagged_field_conditions() -> tuple:
    """Return SQL expressions representing each missing-field condition."""

    name_missing = and_(
        _is_blank(Car.title),
        or_(_is_blank(Car.make), _is_blank(Car.model)),
    )
    mileage_missing = or_(Car.mileage.is_(None), Car.mileage <= 0)
    price_missing = or_(Car.price.is_(None), Car.price <= 0)
    picture_missing = _is_blank(Car.image_url)
    location_missing = and_(
        _is_blank(Car.location_address),
        or_(_is_blank(Car.city), _is_blank(Car.state)),
    )
    dealership_missing = Car.dealership_id.is_(None)
    return (
        name_missing,
        mileage_missing,
        picture_missing,
        price_missing,
        location_missing,
        dealership_missing,
    )


def flagged_any_condition():
    """Return the SQL expression that matches any missing-field condition."""

    return or_(*flagged_field_conditions())


def _normalize_statuses(statuses: Sequence[str]) -> tuple[str, ...]:
    """Return a tuple of cleaned, upper-cased status values."""

    normalized: list[str] = []
    for status in statuses:
        if not status:
            continue
        status_text = str(status).strip()
        if not status_text:
            continue
        normalized.append(status_text.upper())
    return tuple(normalized)


def flagged_status_condition(statuses: Sequence[str] | None = None):
    """Return the SQL expression ensuring the car is in a live auction state."""

    normalized_status = func.upper(_text_column(Car.auction_status))
    allowed_statuses = _normalize_statuses(statuses or FLAGGED_STATUSES)
    if not allowed_statuses:
        return false()
    return normalized_status.in_(allowed_statuses)


def flagged_car_stmt(
    include_all_statuses: bool = False,
    *,
    statuses: Sequence[str] | None = None,
    include_all_candidates: bool = False,
):
    """Return a ``SELECT`` statement for cars missing required information.

    Args:
        include_all_statuses: When ``True`` the status filter is skipped so the
            query examines the complete inventory instead of only live auction
            cars.
        include_all_candidates: When ``True`` return all cars matching the
            status/deleted filters so callers can apply additional runtime
            checks that are not expressible in SQL.
    """

    deleted_ok = or_(Car.deleted_at.is_(None), _text_column(Car.deleted_at) == "")
    filters = [deleted_ok]
    if not include_all_candidates:
        filters.append(flagged_any_condition())
    if not include_all_statuses:
        filters.append(flagged_status_condition(statuses=statuses))
    return select(Car).where(*filters)


def flagged_car_count_stmt(
    include_all_statuses: bool = False,
    *,
    statuses: Sequence[str] | None = None,
):
    """Return a ``SELECT`` counting cars that meet the flagged criteria."""

    deleted_ok = or_(Car.deleted_at.is_(None), _text_column(Car.deleted_at) == "")
    filters = [deleted_ok, flagged_any_condition()]
    if not include_all_statuses:
        filters.append(flagged_status_condition(statuses=statuses))
    return select(func.count()).select_from(Car).where(*filters)


def count_flagged_cars(session) -> int:
    """Return the number of cars that are currently flagged."""

    result = session.exec(flagged_car_count_stmt()).one()
    return int(result or 0)


def flagged_car_missing_fields(
    car: Car,
    *,
    picture_issue: str | None = None,
) -> Sequence[str]:
    """Return the human-readable list of missing fields for ``car``."""

    def _is_blank_value(value: object | None) -> bool:
        if value is None:
            return True
        if isinstance(value, str):
            return not value.strip()
        return False

    missing: list[str] = []
    title_missing = _is_blank_value(getattr(car, "title", None))
    make_missing = _is_blank_value(getattr(car, "make", None))
    model_missing = _is_blank_value(getattr(car, "model", None))
    if title_missing and (make_missing or model_missing):
        missing.append("Name")
    mileage = getattr(car, "mileage", None)
    if mileage is None or (isinstance(mileage, (int, float)) and mileage <= 0):
        missing.append("Mileage")
    price = getattr(car, "price", None)
    if price is None:
        missing.append("Price")
    else:
        try:
            numeric_price = float(price)
        except (TypeError, ValueError):
            numeric_price = None
        if numeric_price is None or numeric_price <= 0:
            if "Price" not in missing:
                missing.append("Price")
    if _is_blank_value(getattr(car, "image_url", None)):
        missing.append("Picture")
    elif isinstance(picture_issue, str):
        issue_label = picture_issue.strip()
        if issue_label and issue_label not in missing:
            missing.append(issue_label)
    dealership_id = getattr(car, "dealership_id", None)
    if dealership_id is None:
        missing.append("Dealership")
    location_blank = _is_blank_value(getattr(car, "location_address", None))
    city_blank = _is_blank_value(getattr(car, "city", None))
    state_blank = _is_blank_value(getattr(car, "state", None))
    if location_blank and (city_blank or state_blank):
        missing.append("Location")
    return missing


__all__ = [
    "FLAGGED_STATUSES",
    "count_flagged_cars",
    "flagged_any_condition",
    "flagged_car_count_stmt",
    "flagged_car_missing_fields",
    "flagged_car_stmt",
    "flagged_field_conditions",
    "flagged_status_condition",
]
