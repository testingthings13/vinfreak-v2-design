from datetime import datetime, timezone

from sqlmodel import SQLModel, Session, select
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
try:  # pragma: no cover - prefer explicit package import
    from backend.models import Setting, AdminAudit, AdminUser
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as script
    from models import Setting, AdminAudit, AdminUser
try:  # pragma: no cover - prefer explicit package import
    from backend.admin.permissions import (
        DEFAULT_SUPER_SECTIONS,
        serialize_sections,
        normalize_sections,
        parse_sections,
        DEFAULT_AGENT_SECTIONS,
    )
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as package
    from .admin.permissions import (  # type: ignore
        DEFAULT_SUPER_SECTIONS,
        serialize_sections,
        normalize_sections,
        parse_sections,
        DEFAULT_AGENT_SECTIONS,
    )
try:
    from backend.constants import (
        DEFAULT_FREAKSTATS_SYSTEM_PROMPT,
        DEFAULT_FREAKSTATS_SYSTEM_PROMPT_AUCTION,
        DEFAULT_FREAKSTATS_SYSTEM_PROMPT_RETAIL,
        DEFAULT_FREAKSTATS_USER_PROMPT,
        DEFAULT_FREAKSTATS_USER_PROMPT_AUCTION,
        DEFAULT_FREAKSTATS_USER_PROMPT_RETAIL,
        DEFAULT_FREAKSTATS_AUCTION_STATUSES,
        DEFAULT_FREAKSTATS_RETAIL_STATUSES,
    )
except ModuleNotFoundError:  # pragma: no cover - fallback when executed from backend dir
    from constants import (  # type: ignore
        DEFAULT_FREAKSTATS_SYSTEM_PROMPT,
        DEFAULT_FREAKSTATS_SYSTEM_PROMPT_AUCTION,
        DEFAULT_FREAKSTATS_SYSTEM_PROMPT_RETAIL,
        DEFAULT_FREAKSTATS_USER_PROMPT,
        DEFAULT_FREAKSTATS_USER_PROMPT_AUCTION,
        DEFAULT_FREAKSTATS_USER_PROMPT_RETAIL,
        DEFAULT_FREAKSTATS_AUCTION_STATUSES,
        DEFAULT_FREAKSTATS_RETAIL_STATUSES,
    )
try:
    from backend.db import engine
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as script
    from db import engine
from backend.backend_settings import settings
try:
    from security import hash_password
except ModuleNotFoundError:  # pragma: no cover - fallback when imported as package
    from backend.security import hash_password  # type: ignore

def init_db():
    SQLModel.metadata.create_all(
        engine,
        tables=[Setting.__table__, AdminAudit.__table__, AdminUser.__table__],
    )
    with Session(engine) as s:
        try:
            s.exec(
                text(
                    "ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT '[]'"
                )
            )
            s.exec(
                text(
                    "ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at TEXT"
                )
            )
        except OperationalError:
            pass
        defaults = {
            "site_title": "VINFREAK",
            "site_tagline": "Discover performance & provenance",
            "theme": "dark",
            "logo_url": "",
            "logo_width": "64",
            "logo_height": "64",
            "favicon_url": "",
            "contact_email": "",
            "default_page_size": "12",
            "maintenance_banner": "",
            "brand_filter_make_ids": "[]",
            "home_top_filters_enabled": "0",
            "home_make_filter_enabled": "0",
            "home_dealership_filter_enabled": "0",
            "home_new_listing_badge_enabled": "1",
            "home_inventory_type_pills_enabled": "0",
            "home_sort_label_enabled": "0",
            "home_filter_counts_enabled": "0",
            "home_footer_panels_enabled": "0",
            "spotify_widget_enabled": "1",
            Setting.FREAKSTATS_PROMPT: DEFAULT_FREAKSTATS_SYSTEM_PROMPT,
            Setting.FREAKSTATS_SYSTEM_PROMPT: DEFAULT_FREAKSTATS_SYSTEM_PROMPT,
            Setting.FREAKSTATS_USER_PROMPT: DEFAULT_FREAKSTATS_USER_PROMPT,
            Setting.FREAKSTATS_SYSTEM_PROMPT_RETAIL: DEFAULT_FREAKSTATS_SYSTEM_PROMPT_RETAIL,
            Setting.FREAKSTATS_USER_PROMPT_RETAIL: DEFAULT_FREAKSTATS_USER_PROMPT_RETAIL,
            Setting.FREAKSTATS_SYSTEM_PROMPT_AUCTION: DEFAULT_FREAKSTATS_SYSTEM_PROMPT_AUCTION,
            Setting.FREAKSTATS_USER_PROMPT_AUCTION: DEFAULT_FREAKSTATS_USER_PROMPT_AUCTION,
            Setting.FREAKSTATS_RETAIL_STATUSES: "\n".join(DEFAULT_FREAKSTATS_RETAIL_STATUSES),
            Setting.FREAKSTATS_AUCTION_STATUSES: "\n".join(DEFAULT_FREAKSTATS_AUCTION_STATUSES),
        }
        for k, v in defaults.items():
            r = s.exec(text("SELECT key FROM settings WHERE key=:k").bindparams(k=k)).first()
            if not r:
                s.exec(text("INSERT INTO settings(key,value) VALUES (:k,:v)").bindparams(k=k, v=v))
        now = datetime.now(timezone.utc).isoformat()
        admin = s.exec(
            select(AdminUser).where(AdminUser.username == settings.ADMIN_USER)
        ).first()
        if not admin:
            s.add(
                AdminUser(
                    username=settings.ADMIN_USER,
                    password_hash=hash_password(settings.ADMIN_PASS),
                    is_superuser=True,
                    can_add_cars=True,
                    permissions=serialize_sections(DEFAULT_SUPER_SECTIONS),
                    created_at=now,
                    updated_at=now,
                )
            )

        users = s.exec(select(AdminUser)).all()
        for user in users:
            existing_sections = parse_sections(getattr(user, "permissions", None))
            if not existing_sections:
                base = (
                    list(DEFAULT_SUPER_SECTIONS)
                    if user.is_superuser
                    else list(DEFAULT_AGENT_SECTIONS)
                )
                if user.can_add_cars and "manual" not in base:
                    base.append("manual")
                sections = normalize_sections(base)
            else:
                sections = normalize_sections(existing_sections)
            manual_enabled = "manual" in sections
            if sections != existing_sections or user.can_add_cars != manual_enabled:
                user.permissions = serialize_sections(sections)
                user.can_add_cars = manual_enabled
                user.updated_at = now
                s.add(user)
        s.commit()
