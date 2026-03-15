"""Shared helpers for admin/agent section permissions."""

from __future__ import annotations

import json
from typing import Iterable, List

SECTION_CHOICES: List[tuple[str, str]] = [
    ("dashboard", "FreakOps"),
    ("cars", "Cars & inventory"),
    ("manual", "Manual listings"),
    ("comments", "Comments"),
    ("gptcommenter", "GPTCommenter"),
    ("car_logos", "Car logos"),
    ("dealerships", "Dealerships"),
    ("imports", "Car imports"),
    ("settings", "Site settings"),
    ("freakstats", "FreakGPT"),
    ("freakestimate", "What's my car worth?"),
    ("neuroai", "NeuroAI"),
    ("neurowraith", "NeuroWraith"),
]

SECTION_LABELS = {code: label for code, label in SECTION_CHOICES}
ALL_SECTION_CODES = [code for code, _ in SECTION_CHOICES]
DEFAULT_AGENT_SECTIONS = ["dashboard", "manual"]
DEFAULT_SUPER_SECTIONS = ALL_SECTION_CODES.copy()


def normalize_sections(values: Iterable[str] | None) -> list[str]:
    """Return a stable, de-duplicated list of valid section codes."""

    allowed: list[str] = []
    seen: set[str] = set()
    values_iter: Iterable[str] = values or []
    for raw in values_iter:
        code = str(raw).strip().lower()
        if not code or code not in SECTION_LABELS:
            continue
        if code in seen:
            continue
        seen.add(code)
        allowed.append(code)
    if allowed and "dashboard" not in seen:
        allowed.insert(0, "dashboard")
    return allowed


def serialize_sections(values: Iterable[str] | None) -> str:
    """Serialize ``values`` to JSON after normalization."""

    return json.dumps(normalize_sections(values))


def parse_sections(raw) -> list[str]:
    """Deserialize ``raw`` into a normalized list of section codes."""

    if raw in (None, ""):
        return []
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
        except ValueError:
            data = [part.strip() for part in raw.split(",") if part.strip()]
    elif isinstance(raw, (list, tuple, set)):
        data = list(raw)
    else:
        data = []
    return normalize_sections(data)


def user_sections(raw_permissions, is_superuser: bool) -> list[str]:
    """Return section codes available to a user."""

    if is_superuser:
        return DEFAULT_SUPER_SECTIONS.copy()
    return parse_sections(raw_permissions)
