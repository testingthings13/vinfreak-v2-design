"""Simple in-memory rate limiter for authentication endpoints."""
from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class RateLimiter:
    window_seconds: int
    max_attempts: int
    block_seconds: int
    max_tracked_keys: int = 10000
    cleanup_interval_seconds: int = 60
    _attempts: dict[str, list[float]] = field(default_factory=dict)
    _blocked_until: dict[str, float] = field(default_factory=dict)
    _last_cleanup_at: float = 0.0

    def _now(self) -> float:
        return time.time()

    def _prune(self, key: str, now: float) -> list[float]:
        window_start = now - self.window_seconds
        recent = [ts for ts in self._attempts.get(key, []) if ts >= window_start]
        self._attempts[key] = recent
        return recent

    def _cleanup(self, now: float) -> None:
        if now - self._last_cleanup_at < float(self.cleanup_interval_seconds):
            return
        self._last_cleanup_at = now

        window_start = now - self.window_seconds
        for key, attempts in list(self._attempts.items()):
            recent = [ts for ts in attempts if ts >= window_start]
            if recent:
                self._attempts[key] = recent
            else:
                self._attempts.pop(key, None)

        for key, until in list(self._blocked_until.items()):
            if until <= now:
                self._blocked_until.pop(key, None)

        total_keys = len(set(self._attempts.keys()) | set(self._blocked_until.keys()))
        max_keys = max(100, int(self.max_tracked_keys))
        if total_keys <= max_keys:
            return

        # Keep the most recently active keys and evict the oldest identities.
        last_seen: dict[str, float] = {}
        for key, attempts in self._attempts.items():
            if attempts:
                last_seen[key] = max(attempts)
        for key, until in self._blocked_until.items():
            blocked_at = until - self.block_seconds
            previous = last_seen.get(key)
            if previous is None or blocked_at > previous:
                last_seen[key] = blocked_at

        overflow = total_keys - max_keys
        for key, _ in sorted(last_seen.items(), key=lambda item: item[1])[:overflow]:
            self._attempts.pop(key, None)
            self._blocked_until.pop(key, None)

    def is_blocked(self, key: str) -> float | None:
        now = self._now()
        self._cleanup(now)
        until = self._blocked_until.get(key)
        if until and until > now:
            return max(0.0, until - now)
        if until:
            self._blocked_until.pop(key, None)
        return None

    def allow(self, key: str) -> tuple[bool, float | None]:
        now = self._now()
        remaining = self.is_blocked(key)
        if remaining is not None:
            return False, remaining
        recent = self._prune(key, now)
        if len(recent) >= self.max_attempts:
            block_until = now + self.block_seconds
            self._blocked_until[key] = block_until
            self._attempts.pop(key, None)
            return False, float(self.block_seconds)
        return True, None

    def record_failure(self, key: str) -> None:
        now = self._now()
        self._cleanup(now)
        attempts = self._attempts.setdefault(key, [])
        attempts.append(now)

    def reset(self, key: str) -> None:
        self._attempts.pop(key, None)
        self._blocked_until.pop(key, None)
