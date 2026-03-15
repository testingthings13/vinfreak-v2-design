"""Utilities for resolving car makes to stored ``Make`` rows."""

from __future__ import annotations

import re
from typing import Sequence, Tuple, List, Dict, Set
from difflib import SequenceMatcher

from sqlmodel import Session, select

try:  # allow running inside the backend package or as a script
    from backend.models import Make  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - fallback for script execution
    from models import Make
except Exception:  # pragma: no cover - tests may stub partial sqlmodel modules
    Make = None  # type: ignore[assignment]

try:
    from backend.db import engine  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - fallback for script execution
    from db import engine
except Exception:  # pragma: no cover - tests may stub sqlmodel/create_engine
    engine = None  # type: ignore[assignment]

MakeCacheEntry = Tuple[int, str, str]


def _alias_key(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", "", value.lower())


_CANONICAL_BRAND_ALIASES: Dict[str, Set[str]] = {
    "Porsche": {"porsche"},
    "BMW": {"bmw"},
    "Mercedes": {
        "mercedes",
        "mercedes-benz",
        "mercedes benz",
        "mercedesbenz",
        "mercedes-amg",
        "mercedes amg",
        "mercedesamg",
    },
    "Lamborghini": {"lamborghini"},
    "Rolls": {"rolls", "rolls-royce", "rolls royce", "rollsroyce"},
    "Audi": {"audi"},
    "Ferrari": {"ferrari"},
    "McLaren": {"mclaren", "mc laren", "mc-laren"},
    "Aston": {"aston", "aston martin", "aston-martin", "astonmartin"},
    "Bentley": {"bentley"},
    "Bugatti": {"bugatti"},
    "Koenigsegg": {"koenigsegg"},
    "Pagani": {"pagani"},
}

_ALIAS_LOOKUP: Dict[str, str] = {}
for canonical, aliases in _CANONICAL_BRAND_ALIASES.items():
    _ALIAS_LOOKUP[_alias_key(canonical)] = canonical
    for alias in aliases:
        key = _alias_key(alias)
        if key:
            _ALIAS_LOOKUP[key] = canonical


def canonicalize_make_name(value: str | None) -> str | None:
    """Return the canonical brand name for ``value`` when known."""

    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    lookup_key = _alias_key(trimmed)
    canonical = _ALIAS_LOOKUP.get(lookup_key)
    if canonical:
        return canonical
    # fall back to case-insensitive match against canonical names
    for candidate in _CANONICAL_BRAND_ALIASES.keys():
        if trimmed.lower() == candidate.lower():
            return candidate
    return trimmed


def make_aliases(value: str | None) -> Set[str]:
    """Return lower-case aliases for the canonical make referenced by ``value``."""

    canonical = canonicalize_make_name(value)
    if not canonical:
        return {value.strip().lower()} if isinstance(value, str) and value.strip() else set()
    aliases = {canonical.lower()}
    aliases.update(alias.lower() for alias in _CANONICAL_BRAND_ALIASES.get(canonical, set()))
    return aliases


def _normalize(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def load_make_cache(session: Session | None = None) -> List[MakeCacheEntry]:
    """Return cached make metadata sorted by name length (desc)."""
    if Make is None:
        return []
    close_session = False
    if session is None:
        if engine is None:
            return []
        session = Session(engine)
        close_session = True
    try:
        makes = session.exec(select(Make)).all()
        cache: List[MakeCacheEntry] = []
        for mk in makes:
            if mk and mk.id is not None and mk.name:
                cache.append((mk.id, mk.name, _normalize(mk.name)))
        cache.sort(key=lambda item: len(item[2]), reverse=True)
        return cache
    finally:
        if close_session:
            session.close()


def _tokenize(text: str) -> list[str]:
    return [part for part in text.split() if part]


def _match_against_text(text_norm: str, cache: Sequence[MakeCacheEntry]) -> Tuple[int | None, str | None]:
    if not text_norm:
        return None, None
    padded = f" {text_norm} "
    compressed = text_norm.replace(" ", "")
    tokens = _tokenize(text_norm)
    for mk_id, mk_name, mk_norm in cache:
        if mk_norm and mk_norm == text_norm:
            return mk_id, mk_name
    for mk_id, mk_name, mk_norm in cache:
        if not mk_norm:
            continue
        if f" {mk_norm} " in padded:
            return mk_id, mk_name
    for mk_id, mk_name, mk_norm in cache:
        if not mk_norm:
            continue
        if text_norm.startswith(mk_norm + " ") or text_norm.endswith(" " + mk_norm):
            return mk_id, mk_name
        if mk_norm.startswith(text_norm + " ") or mk_norm.endswith(" " + text_norm):
            return mk_id, mk_name
        if compressed and mk_norm.replace(" ", "") == compressed:
            return mk_id, mk_name
    if not tokens:
        return None, None
    best_id: int | None = None
    best_name: str | None = None
    best_score = 0.0
    token_set = set(tokens)
    for mk_id, mk_name, mk_norm in cache:
        if not mk_norm:
            continue
        mk_tokens = _tokenize(mk_norm)
        if not mk_tokens:
            continue
        mk_token_set = set(mk_tokens)
        overlap = len(token_set.intersection(mk_token_set))
        if overlap == 0:
            continue
        coverage = overlap / len(mk_token_set)
        text_coverage = overlap / len(token_set)
        ratio = SequenceMatcher(None, text_norm, mk_norm).ratio()
        prefix_bonus = 0.15 if tokens and mk_tokens and tokens[0] == mk_tokens[0] else 0.0
        score = (ratio * 0.55) + (coverage * 0.3) + (text_coverage * 0.15) + prefix_bonus
        if score > best_score:
            best_score = score
            best_id = mk_id
            best_name = mk_name
    if best_id is not None and best_score >= 0.65:
        return best_id, best_name
    return None, None


def match_make(
    raw_make: str | None,
    title: str | None,
    cache: Sequence[MakeCacheEntry],
) -> Tuple[int | None, str | None]:
    """Return the best matching ``Make`` for the provided strings."""
    if not cache:
        return None, None
    norm_raw = _normalize(raw_make)
    match = _match_against_text(norm_raw, cache)
    if match[0] is not None:
        return match
    norm_title = _normalize(title)
    return _match_against_text(norm_title, cache)


def resolve_make(
    raw_make: str | None,
    title: str | None,
    *,
    session: Session | None = None,
    cache: Sequence[MakeCacheEntry] | None = None,
) -> Tuple[int | None, str | None]:
    """Resolve ``raw_make``/``title`` to a ``(make_id, make_name)`` pair."""
    lookup = list(cache) if cache is not None else load_make_cache(session)
    return match_make(raw_make, title, lookup)
