import os
from typing import Optional

from itsdangerous import URLSafeSerializer
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request
from sqlmodel import Session, select

try:  # pragma: no cover - prefer explicit package imports
    from backend.db import engine
except ModuleNotFoundError:  # pragma: no cover - fallback for script execution
    from db import engine
try:
    from backend.models import AdminUser
except ModuleNotFoundError:  # pragma: no cover - fallback for script execution
    from models import AdminUser
try:  # pragma: no cover - prefer explicit package import
    from backend.admin.permissions import user_sections
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as package
    from .permissions import user_sections  # type: ignore
try:
    from backend.security import verify_password  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - fallback when imported as script
    from security import verify_password

try:  # pragma: no cover - prefer explicit package import
    from backend.settings import settings  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as a script
    try:
        from settings import settings  # type: ignore
    except Exception:  # pragma: no cover
        settings = None  # type: ignore

try:  # pragma: no cover - prefer explicit package import
    from backend.rate_limit import RateLimiter
except ModuleNotFoundError:  # pragma: no cover - fallback for script execution
    from rate_limit import RateLimiter  # type: ignore


def _allow_insecure_defaults() -> bool:
    if settings is None:
        return True
    env = (getattr(settings, "APP_ENV", "") or "").strip().lower()
    return bool(getattr(settings, "ALLOW_INSECURE_DEFAULTS", False)) or env in {
        "development",
        "dev",
        "test",
        "local",
    }


def _resolve_admin_secret() -> str:
    secret = os.getenv("ADMIN_SECRET")
    if not secret and settings is not None:
        secret = getattr(settings, "SECRET_KEY", None)
    if not secret:
        secret = "change-this-secret-key"
    if not _allow_insecure_defaults() and secret in {"change-this-secret-key", "change-me"}:
        raise RuntimeError("ADMIN_SECRET must be set to a strong value")
    return secret


ADMIN_SECRET = _resolve_admin_secret()
AUTH_RATE_LIMITER = RateLimiter(
    int(getattr(settings, "LOGIN_RATE_LIMIT_WINDOW_SECONDS", 300) or 300),
    int(getattr(settings, "LOGIN_RATE_LIMIT_ATTEMPTS", 10) or 10),
    int(getattr(settings, "LOGIN_RATE_LIMIT_BLOCK_SECONDS", 900) or 900),
)

class SimpleAuth(AuthenticationBackend):
    def __init__(self, secret_key: Optional[str] = None):
        secret = secret_key or ADMIN_SECRET
        super().__init__(secret_key=secret)
        self.secret_key = secret
        self.signer = URLSafeSerializer(self.secret_key)

    async def login(self, request: Request) -> bool:
        form = await request.form()
        username = form.get("username")
        password = form.get("password")
        if not username or not password:
            return False
        ip = request.client.host if request.client else ""
        rate_key = f"sqladmin:{ip}:{str(username).strip().lower()}"
        allowed, _ = AUTH_RATE_LIMITER.allow(rate_key)
        if not allowed:
            return False
        with Session(engine) as s:
            user = s.exec(
                select(AdminUser).where(AdminUser.username == username)
            ).first()
        if (
            user
            and user.is_active
            and user.is_superuser
            and verify_password(password, user.password_hash)
        ):
            sections = user_sections(getattr(user, "permissions", None), True)
            token = self.signer.dumps({"id": user.id, "u": user.username})
            request.session.update(
                {
                    "admin": token,
                    "admin_user": user.username,
                    "admin_user_id": user.id,
                    "is_superadmin": True,
                    "permissions": sections,
                    "can_add_cars": "manual" in sections,
                }
            )
            AUTH_RATE_LIMITER.reset(rate_key)
            return True
        AUTH_RATE_LIMITER.record_failure(rate_key)
        return False

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        token = request.session.get("admin")
        if not token:
            return False
        try:
            data = self.signer.loads(token)
        except Exception:
            return False
        user_id = data.get("id")
        if not user_id:
            return False
        with Session(engine) as s:
            user = s.get(AdminUser, user_id)
        if not user or not user.is_active or not user.is_superuser:
            return False
        sections = user_sections(getattr(user, "permissions", None), True)
        request.session.update(
            {
                "admin_user": user.username,
                "admin_user_id": user.id,
                "is_superadmin": True,
                "permissions": sections,
                "can_add_cars": "manual" in sections,
            }
        )
        return True
