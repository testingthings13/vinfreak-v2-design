from __future__ import annotations

import hashlib
import importlib
import json
import random
import re
import textwrap
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Iterable, Sequence, TYPE_CHECKING

import requests
from requests import RequestException
from sqlalchemy import case, func, or_
from sqlmodel import Session, delete, select

try:
    from backend.settings import settings
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as package root
    from settings import settings  # type: ignore

if TYPE_CHECKING:  # pragma: no cover - only used for type hints
    from backend.models import Car, Comment, CommentStatus


AUTOMATION_SOURCE = "gpt_commenter"
CAR_FAN_DISPLAY_NAMES: tuple[str, ...] = (
    "ApexAddict",
    "ApexFanatic",
    "ApexMaestro",
    "ApexSavant",
    "ApexWhisperer",
    "ApexJunkie",
    "TurboAddict",
    "TurboFanatic",
    "TurboMaestro",
    "TurboSavant",
    "TurboWhisperer",
    "TurboJunkie",
    "BoostAddict",
    "BoostFanatic",
    "BoostMaestro",
    "BoostSavant",
    "BoostWhisperer",
    "BoostJunkie",
    "PistonAddict",
    "PistonFanatic",
    "PistonMaestro",
    "PistonSavant",
    "PistonWhisperer",
    "PistonJunkie",
    "DriftAddict",
    "DriftFanatic",
    "DriftMaestro",
    "DriftSavant",
    "DriftWhisperer",
    "DriftJunkie",
    "TrackAddict",
    "TrackFanatic",
    "TrackMaestro",
    "TrackSavant",
    "TrackWhisperer",
    "TrackJunkie",
    "ThrottleAddict",
    "ThrottleFanatic",
    "ThrottleMaestro",
    "ThrottleSavant",
    "ThrottleWhisperer",
    "ThrottleJunkie",
    "GearAddict",
    "GearFanatic",
    "GearMaestro",
    "GearSavant",
    "GearWhisperer",
    "GearJunkie",
    "CamberAddict",
    "CamberFanatic",
    "CamberMaestro",
    "CamberSavant",
    "CamberWhisperer",
    "CamberJunkie",
    "ClutchAddict",
    "ClutchFanatic",
    "ClutchMaestro",
    "ClutchSavant",
    "ClutchWhisperer",
    "ClutchJunkie",
    "RevAddict",
    "RevFanatic",
    "RevMaestro",
    "RevSavant",
    "RevWhisperer",
    "RevJunkie",
    "TorqueAddict",
    "TorqueFanatic",
    "TorqueMaestro",
    "TorqueSavant",
    "TorqueWhisperer",
    "TorqueJunkie",
    "V8Addict",
    "V8Fanatic",
    "V8Maestro",
    "V8Savant",
    "V8Whisperer",
    "V8Junkie",
    "V12Addict",
    "V12Fanatic",
    "V12Maestro",
    "V12Savant",
    "V12Whisperer",
    "V12Junkie",
    "NitroAddict",
    "NitroFanatic",
    "NitroMaestro",
    "NitroSavant",
    "NitroWhisperer",
    "NitroJunkie",
    "IgnitionAddict",
    "IgnitionFanatic",
    "IgnitionMaestro",
    "IgnitionSavant",
    "IgnitionWhisperer",
    "IgnitionJunkie",
    "PitLaneAddict",
    "PitLaneFanatic",
    "PitLaneMaestro",
    "PitLaneSavant",
    "PitLaneWhisperer",
    "PitLaneJunkie",
    "OversteerAddict",
    "OversteerFanatic",
    "OversteerMaestro",
    "OversteerSavant",
    "OversteerWhisperer",
    "OversteerJunkie",
    "UndersteerAddict",
    "UndersteerFanatic",
    "UndersteerMaestro",
    "UndersteerSavant",
    "UndersteerWhisperer",
    "UndersteerJunkie",
    "SlipstreamAddict",
    "SlipstreamFanatic",
    "SlipstreamMaestro",
    "SlipstreamSavant",
    "SlipstreamWhisperer",
    "SlipstreamJunkie",
    "SpoilerAddict",
    "SpoilerFanatic",
    "SpoilerMaestro",
    "SpoilerSavant",
    "SpoilerWhisperer",
    "SpoilerJunkie",
    "RedlineAddict",
    "RedlineFanatic",
    "RedlineMaestro",
    "RedlineSavant",
    "RedlineWhisperer",
    "RedlineJunkie",
    "LugNutAddict",
    "LugNutFanatic",
    "LugNutMaestro",
    "LugNutSavant",
    "LugNutWhisperer",
    "LugNutJunkie",
    "FlywheelAddict",
    "FlywheelFanatic",
    "FlywheelMaestro",
    "FlywheelSavant",
    "FlywheelWhisperer",
    "FlywheelJunkie",
    "SuperchargerAddict",
    "SuperchargerFanatic",
    "SuperchargerMaestro",
    "SuperchargerSavant",
    "SuperchargerWhisperer",
    "SuperchargerJunkie",
)
MAX_PER_LISTING_CAP = 5
MAX_PER_RUN_CAP = 300
ALLOWED_STATUS_CODES: tuple[str, ...] = ("ACTIVE", "AUCTION_IN_PROGRESS")
_STATUS_ALIAS_MAP: dict[str, str] = {
    "ACTIVE": "ACTIVE",
    "A": "ACTIVE",
    "ACT": "ACTIVE",
    "L": "ACTIVE",
    "LIVE": "ACTIVE",
    "AUCTION": "AUCTION_IN_PROGRESS",
    "AUCTION_IN_PROGRESS": "AUCTION_IN_PROGRESS",
    "IN_PROGRESS": "AUCTION_IN_PROGRESS",
}
_STATUS_ALIASES_BY_CANONICAL: dict[str, set[str]] = {
    code: set() for code in ALLOWED_STATUS_CODES
}
for _alias, _canonical in _STATUS_ALIAS_MAP.items():
    if _canonical in _STATUS_ALIASES_BY_CANONICAL:
        _STATUS_ALIASES_BY_CANONICAL[_canonical].add(_alias)

DEFAULT_SYSTEM_PROMPT = (
    "You are GPTCommenter, a helpful and enthusiastic car enthusiast who leaves "
    "authentic public comments on listings. Respond in a single paragraph, keep "
    "the tone friendly and insightful, avoid emojis and hashtags, and never "
    "mention being an AI."
)
DEFAULT_INSTRUCTIONS = (
    "Write one distinct comment reacting to the listing. Keep it under 90 words, "
    "highlight one or two interesting details, and avoid repeating the listing text verbatim."
)
GROK_COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions"


class GPTCommenterError(RuntimeError):
    """Raised when the GPT commenter cannot complete a request."""


@dataclass
class CommentCreation:
    comment_id: int
    car_id: int
    body: str


def generate_display_name() -> str:
    """Return a random car-fan themed display name for GPT comments."""

    base_name = random.choice(CAR_FAN_DISPLAY_NAMES)
    return base_name


def canonicalize_status(value: str | None) -> str | None:
    """Return the canonical GPTCommenter status or ``None`` when unknown."""

    if value is None:
        return None
    text = str(value).strip().upper()
    if not text:
        return None
    canonical = _STATUS_ALIAS_MAP.get(text)
    if canonical in ALLOWED_STATUS_CODES:
        return canonical
    return None


def status_filter_values(values: Iterable[str]) -> set[str]:
    """Expand canonical statuses to all recognized filter values."""

    expanded: set[str] = set()
    for raw in values or []:
        canonical = canonicalize_status(raw)
        if not canonical:
            continue
        aliases = _STATUS_ALIASES_BY_CANONICAL.get(canonical)
        if not aliases:
            expanded.add(canonical)
            continue
        expanded.update(aliases)
    return expanded


def normalize_statuses(values: Iterable[str]) -> list[str]:
    """Return canonical, de-duplicated status codes."""

    normalized: list[str] = []
    seen: set[str] = set()
    for raw in values or []:
        canonical = canonicalize_status(raw)
        if not canonical or canonical in seen:
            continue
        seen.add(canonical)
        normalized.append(canonical)
    return normalized


def normalize_car_ids(values: Iterable[int | str]) -> list[int]:
    """Return de-duplicated positive integer car IDs."""

    normalized: list[int] = []
    seen: set[int] = set()
    for raw in values or []:
        if isinstance(raw, int):
            candidate = raw
        else:
            text = str(raw or "").strip()
            if not text:
                continue
            try:
                candidate = int(text)
            except ValueError:
                continue
        if candidate <= 0 or candidate in seen:
            continue
        seen.add(candidate)
        normalized.append(candidate)
    return normalized


def _split_lines(value: str | None, *, limit: int = 6) -> list[str]:
    if not value:
        return []
    bits = []
    for part in re.split(r"[\n\r•]+", value):
        cleaned = part.strip("- \t")
        if not cleaned:
            continue
        bits.append(cleaned)
        if len(bits) >= limit:
            break
    return bits


def _model_classes():
    try:
        module = importlib.import_module("backend.models")
    except ModuleNotFoundError:  # pragma: no cover - fallback when imported as script
        module = importlib.import_module("models")
    return module.Car, module.Comment, module.CommentStatus


def _status_priority_expression(column, statuses: Sequence[str]):
    """Return a SQL expression that orders cars by the selected status priority."""

    if not statuses:
        return None
    whens: list[tuple] = []
    for index, status in enumerate(statuses):
        aliases = _STATUS_ALIASES_BY_CANONICAL.get(status) or {status}
        for alias in aliases:
            whens.append((column == alias, index))
    if not whens:
        return None
    return case(*whens, else_=len(statuses))


def _car_payload(car: "Car") -> dict:
    highlights = _split_lines(getattr(car, "highlights", None))
    equipment = _split_lines(getattr(car, "equipment", None))
    modifications = _split_lines(getattr(car, "modifications", None))
    flaws = _split_lines(getattr(car, "known_flaws", None))
    service = _split_lines(getattr(car, "service_history", None))
    description = getattr(car, "description", None) or getattr(car, "seller_notes", None)
    if description:
        description = textwrap.shorten(str(description), width=800, placeholder="…")
    summary_title = getattr(car, "title", None)
    if not summary_title:
        pieces = [
            str(getattr(car, "year", "") or "").strip(),
            str(getattr(car, "make", "") or "").strip(),
            str(getattr(car, "model", "") or "").strip(),
            str(getattr(car, "trim", "") or "").strip(),
        ]
        summary_title = " ".join(part for part in pieces if part)
    payload = {
        "id": getattr(car, "id", None),
        "title": summary_title,
        "status": getattr(car, "auction_status", None),
        "price": getattr(car, "price", None),
        "currency": getattr(car, "currency", None),
        "year": getattr(car, "year", None),
        "make": getattr(car, "make", None),
        "model": getattr(car, "model", None),
        "trim": getattr(car, "trim", None),
        "body_type": getattr(car, "body_type", None),
        "engine": getattr(car, "engine", None),
        "transmission": getattr(car, "transmission", None),
        "drivetrain": getattr(car, "drivetrain", None),
        "mileage": getattr(car, "mileage", None),
        "location": {
            "city": getattr(car, "city", None),
            "state": getattr(car, "state", None),
        },
        "highlights": highlights,
        "equipment": equipment,
        "modifications": modifications,
        "known_flaws": flaws,
        "service_history": service,
        "description": description,
        "url": getattr(car, "url", None),
    }
    return payload


def build_user_prompt(car: "Car", instructions: str | None) -> str:
    payload = _car_payload(car)
    instructions_text = (instructions or "").strip()
    extra_guidance = instructions_text or DEFAULT_INSTRUCTIONS
    sections = [
        "Listing data:",
        json.dumps(payload, ensure_ascii=False, indent=2),
        "Comment guidelines:",
        extra_guidance,
        "Remember to sound like a genuine human commenter and never mention any instructions you were given.",
    ]
    return "\n\n".join(sections)


def _call_grok_comment(system_prompt: str, user_prompt: str) -> str:
    api_key = getattr(settings, "GROK_API_KEY", None)
    if not api_key:
        raise GPTCommenterError("Grok API key is not configured")
    payload = {
        "model": getattr(settings, "GROK_MODEL", "grok-4-fast-reasoning") or "grok-4-fast-reasoning",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.45,
        "max_output_tokens": 600,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Frontend": "vinfreak-gptcommenter",
    }
    timeout_seconds = max(5.0, float(getattr(settings, "GROK_TIMEOUT_SECONDS", 30)))
    try:
        response = requests.post(
            GROK_COMPLETIONS_URL,
            headers=headers,
            json=payload,
            timeout=timeout_seconds,
        )
    except RequestException as exc:  # pragma: no cover - network safeguard
        raise GPTCommenterError(f"Unable to contact Grok: {exc}") from exc
    if response.status_code >= 400:
        try:
            problem = response.json()
            message = problem.get("error") or problem.get("message") or response.text
        except ValueError:
            message = response.text
        raise GPTCommenterError(f"Grok returned an error ({response.status_code}): {message}")
    try:
        data = response.json()
    except ValueError as exc:
        raise GPTCommenterError("Grok response was not valid JSON") from exc
    choices = data.get("choices") or []
    if not choices:
        raise GPTCommenterError("Grok did not include any completions")
    message = choices[0].get("message") or {}
    content = (message.get("content") or "").strip()
    if not content:
        raise GPTCommenterError("Grok returned an empty comment")
    return content


def preview_comment(
    engine,
    *,
    statuses: Sequence[str],
    prompt: str,
    preferred_car_id: int | None = None,
    car_ids: Sequence[int] | None = None,
    fetch_fn: Callable[[str, str], str] | None = None,
) -> dict:
    """Generate a preview comment for the newest eligible listing."""

    normalized_statuses = normalize_statuses(statuses)
    if not normalized_statuses:
        raise GPTCommenterError("Select at least one listing status to preview")
    status_filters = status_filter_values(normalized_statuses)
    if not status_filters:
        raise GPTCommenterError("Select at least one listing status to preview")
    normalized_car_ids = normalize_car_ids(car_ids or [])
    fetcher = fetch_fn or _call_grok_comment
    Car, _, _ = _model_classes()
    selected: dict[str, object] | None = None
    with Session(engine) as session:
        car: Car | None = None
        if preferred_car_id:
            car = session.get(Car, preferred_car_id)
            if car and car.deleted_at not in {None, ""}:
                car = None
            if car and getattr(car, "auction_status", None):
                status_value = canonicalize_status(getattr(car, "auction_status", None))
                if status_value not in normalized_statuses:
                    car = None
            if car and normalized_car_ids and int(getattr(car, "id", 0) or 0) not in normalized_car_ids:
                car = None
        if car is None:
            status_column = func.upper(
                func.coalesce(Car.auction_status_column(), "")
            )
            status_priority = _status_priority_expression(status_column, normalized_statuses)
            car = session.exec(
                select(Car)
                .where(
                    status_column.in_(status_filters),
                    or_(Car.deleted_at.is_(None), Car.deleted_at == ""),
                    *(
                        [Car.id.in_(normalized_car_ids)]
                        if normalized_car_ids
                        else []
                    ),
                )
                .order_by(
                    *(
                        [status_priority]
                        if status_priority is not None
                        else []
                    ),
                    Car.updated_at.desc(),
                    Car.id.desc(),
                )
            ).first()
        if not car:
            raise GPTCommenterError("No listings match the selected statuses")
        selected = {
            "car_id": int(getattr(car, "id", 0) or 0),
            "car_title": getattr(car, "title", None),
            "car_status": getattr(car, "auction_status", None),
            "car_url": getattr(car, "url", None),
            "prompt": build_user_prompt(car, prompt),
        }

    if not selected:
        raise GPTCommenterError("No listings match the selected statuses")

    body = fetcher(DEFAULT_SYSTEM_PROMPT, str(selected["prompt"]))
    return {
        "car_id": selected["car_id"],
        "car_title": selected["car_title"],
        "car_status": selected["car_status"],
        "car_url": selected["car_url"],
        "comment": body.strip(),
        "prompt": selected["prompt"],
    }


def _prompt_hash(instructions: str) -> str:
    return hashlib.sha256(instructions.encode("utf-8")).hexdigest()[:12]


def run_commenter(
    engine,
    *,
    statuses: Sequence[str],
    prompt: str,
    initial_status: str,
    max_per_listing: int = MAX_PER_LISTING_CAP,
    max_total: int = 10,
    car_ids: Sequence[int] | None = None,
    fetch_fn: Callable[[str, str], str] | None = None,
) -> dict:
    Car, Comment, CommentStatus = _model_classes()
    normalized_statuses = normalize_statuses(statuses)
    if not normalized_statuses:
        raise GPTCommenterError("Select at least one listing status to start GPTCommenter")
    status_filters = status_filter_values(normalized_statuses)
    if not status_filters:
        raise GPTCommenterError("Select at least one listing status to start GPTCommenter")
    normalized_car_ids = normalize_car_ids(car_ids or [])
    fetcher = fetch_fn or _call_grok_comment
    per_listing_cap = max(1, min(int(max_per_listing or 1), MAX_PER_LISTING_CAP))
    total_cap = max(1, min(int(max_total or 1), MAX_PER_RUN_CAP))
    try:
        status_choice = CommentStatus(str(initial_status or "").strip().lower())
    except ValueError:
        status_choice = CommentStatus.PENDING
    results: dict[str, list] = {"created": [], "skipped": [], "errors": []}
    prompt_identifier = _prompt_hash(prompt or "")
    created_count = 0

    candidates: list[dict[str, object]] = []
    with Session(engine) as session:
        status_column = func.upper(
            func.coalesce(Car.auction_status_column(), "")
        )
        status_priority = _status_priority_expression(status_column, normalized_statuses)
        query = (
            select(Car)
            .where(
                status_column.in_(status_filters),
                or_(Car.deleted_at.is_(None), Car.deleted_at == ""),
            )
        )
        if normalized_car_ids:
            query = query.where(Car.id.in_(normalized_car_ids))
        order_columns = (
            [status_priority] if status_priority is not None else []
        ) + [Car.updated_at.desc(), Car.id.desc()]
        cars = session.exec(query.order_by(*order_columns)).all()
        for car in cars:
            candidates.append(
                {
                    "car_id": int(getattr(car, "id", 0) or 0),
                    "car_status": getattr(car, "auction_status", None),
                    "user_prompt": build_user_prompt(car, prompt),
                }
            )

    for candidate in candidates:
        car_id = int(candidate["car_id"])
        if created_count >= total_cap:
            results["skipped"].append({"car_id": car_id, "reason": "run_limit_reached"})
            continue

        with Session(engine) as session:
            existing_count = session.exec(
                select(func.count())
                .where(
                    Comment.car_id == car_id,
                    Comment.automation_source == AUTOMATION_SOURCE,
                )
            ).one()
        if int(existing_count or 0) >= per_listing_cap:
            results["skipped"].append({"car_id": car_id, "reason": "limit_reached"})
            continue

        try:
            body = fetcher(DEFAULT_SYSTEM_PROMPT, str(candidate["user_prompt"])).strip()
        except GPTCommenterError as exc:
            results["errors"].append({"car_id": car_id, "message": str(exc)})
            continue
        if not body:
            results["errors"].append({"car_id": car_id, "message": "Empty response from Grok"})
            continue

        with Session(engine) as session:
            current_count = session.exec(
                select(func.count())
                .where(
                    Comment.car_id == car_id,
                    Comment.automation_source == AUTOMATION_SOURCE,
                )
            ).one()
            if int(current_count or 0) >= per_listing_cap:
                results["skipped"].append({"car_id": car_id, "reason": "limit_reached"})
                continue

            duplicate = session.exec(
                select(Comment.id)
                .where(
                    Comment.car_id == car_id,
                    Comment.automation_source == AUTOMATION_SOURCE,
                    Comment.body == body,
                )
                .limit(1)
            ).first()
            if duplicate:
                results["skipped"].append({"car_id": car_id, "reason": "duplicate"})
                continue

            new_comment = Comment(
                car_id=car_id,
                display_name=generate_display_name(),
                email=None,
                body=body,
                status=status_choice,
                flagged=False,
                automation_source=AUTOMATION_SOURCE,
                automation_metadata=json.dumps(
                    {
                        "status": candidate.get("car_status"),
                        "prompt_hash": prompt_identifier,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                    }
                ),
            )
            session.add(new_comment)
            try:
                session.commit()
            except Exception as exc:  # pragma: no cover - defensive rollback
                session.rollback()
                results["errors"].append({"car_id": car_id, "message": str(exc)})
                continue
            session.refresh(new_comment)

        created_count += 1
        results["created"].append(
            CommentCreation(
                comment_id=int(getattr(new_comment, "id", 0) or 0),
                car_id=car_id,
                body=body,
            )
        )
        if created_count >= total_cap:
            break
    return {
        "created": results["created"],
        "skipped": results["skipped"],
        "errors": results["errors"],
        "created_count": len(results["created"]),
    }


def delete_comments(
    engine,
    *,
    statuses: Sequence[str] | None = None,
    car_ids: Sequence[int] | None = None,
) -> int:
    Car, Comment, _ = _model_classes()
    normalized_statuses = normalize_statuses(statuses or [])
    normalized_car_ids = normalize_car_ids(car_ids or [])
    with Session(engine) as session:
        status_filters = status_filter_values(normalized_statuses)
        if status_filters or normalized_car_ids:
            status_column = func.upper(
                func.coalesce(Car.auction_status_column(), "")
            )
            query = (
                select(Comment.id)
                .join(Car, Car.id == Comment.car_id, isouter=True)
                .where(Comment.automation_source == AUTOMATION_SOURCE)
            )
            if status_filters:
                query = query.where(status_column.in_(status_filters))
            if normalized_car_ids:
                query = query.where(Comment.car_id.in_(normalized_car_ids))
            rows = session.exec(query).all()
            comment_ids = [int(row[0] if not isinstance(row, int) else row) for row in rows]
            if not comment_ids:
                return 0
            session.exec(delete(Comment).where(Comment.id.in_(comment_ids)))
            session.commit()
            return len(comment_ids)
        result = session.exec(
            delete(Comment).where(Comment.automation_source == AUTOMATION_SOURCE)
        )
        deleted = int(getattr(result, "rowcount", 0) or 0)
        session.commit()
        return deleted

