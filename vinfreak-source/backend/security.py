"""Lightweight password hashing helpers for admin accounts."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
from dataclasses import dataclass

_ALGORITHM = "sha256"
_ITERATIONS = 600_000
_SALT_BYTES = 16


def _b64encode(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _b64decode(data: str) -> bytes:
    return base64.b64decode(data.encode("ascii"))


def hash_password(password: str) -> str:
    """Return a PBKDF2-HMAC hash for ``password``.

    The return value embeds the salt and iteration count so future changes to
    the hashing parameters remain backward compatible.  The format is::

        pbkdf2$<iterations>$<salt_b64>$<hash_b64>
    """

    if not isinstance(password, str):  # pragma: no cover - defensive
        raise TypeError("Password must be a string")

    salt = os.urandom(_SALT_BYTES)
    dk = hashlib.pbkdf2_hmac(_ALGORITHM, password.encode("utf-8"), salt, _ITERATIONS)
    return f"pbkdf2${_ITERATIONS}${_b64encode(salt)}${_b64encode(dk)}"


def verify_password(password: str, encoded: str | None) -> bool:
    """Return ``True`` when ``password`` matches ``encoded``."""

    if not encoded:
        return False
    try:
        scheme, iter_str, salt_b64, hash_b64 = encoded.split("$", 3)
    except ValueError:
        return False
    if scheme != "pbkdf2":
        return False
    try:
        iterations = int(iter_str)
    except ValueError:
        return False
    try:
        salt = _b64decode(salt_b64)
        stored = _b64decode(hash_b64)
    except Exception:
        return False
    candidate = hashlib.pbkdf2_hmac(
        _ALGORITHM,
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(candidate, stored)


@dataclass(frozen=True)
class PasswordCheck:
    """Result helper bundling verification state and hash value."""

    ok: bool
    encoded: str


def ensure_password(password: str, encoded: str | None) -> PasswordCheck:
    """Verify ``password`` against ``encoded`` returning the stored hash.

    When ``encoded`` is missing or invalid the password is hashed and the new
    value returned so callers can transparently upgrade older formats.
    """

    if encoded and verify_password(password, encoded):
        return PasswordCheck(True, encoded)
    new_hash = hash_password(password)
    return PasswordCheck(True, new_hash)

