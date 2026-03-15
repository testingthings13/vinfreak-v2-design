from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlmodel import Session, select

from backend.backend_settings import settings
try:
    from backend.db import engine
except ModuleNotFoundError:  # pragma: no cover
    from db import engine
try:
    from backend.models import AdminUser
except ModuleNotFoundError:  # pragma: no cover
    AdminUser = None  # type: ignore
try:
    from backend.security import verify_password  # type: ignore
except ModuleNotFoundError:  # pragma: no cover
    from security import verify_password

security = HTTPBasic()

def admin_required(credentials: HTTPBasicCredentials = Depends(security)):
    username = credentials.username or ""
    password = credentials.password or ""
    ok = False
    if AdminUser is not None:
        with Session(engine) as s:
            user = s.exec(
                select(AdminUser).where(AdminUser.username == username)
            ).first()
        if user and getattr(user, "is_active", True) and verify_password(password, user.password_hash):
            ok = True
    if not ok and username == settings.ADMIN_USER and password == settings.ADMIN_PASS:
        ok = True
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required",
            headers={"WWW-Authenticate": "Basic"},
        )
    return True
