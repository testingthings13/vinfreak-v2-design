import json
from pathlib import Path
from typing import Optional, ClassVar

from pydantic import Field, model_validator, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SQLITE_URL = f"sqlite:///{(BASE_DIR / 'vinfreak.db').as_posix()}"
DEFAULT_ADMIN_REDIRECT_HOSTS = ("backend-vinfreak-prod.onrender.com",)
DEFAULT_UPLOAD_ALLOWED_MIME_TYPES = (
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/x-icon",
    "image/vnd.microsoft.icon",
)


class Settings(BaseSettings):
    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_file=(str(BASE_DIR.parent / ".env"), str(BASE_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "VINFREAK Admin"
    APP_ENV: str = Field(default="development", env="APP_ENV")
    ALLOW_INSECURE_DEFAULTS: bool = Field(
        default=False, env="ALLOW_INSECURE_DEFAULTS"
    )
    ADMIN_USER: str = "admin"
    ADMIN_PASS: str = "admin"  # change later
    # Read database URLs from environment variables. The default points to the
    # production Render-hosted PostgreSQL instance; replace the password or
    # override `DATABASE_URL` for other deployments.
    DATABASE_URL: str = Field(default=DEFAULT_SQLITE_URL, env="DATABASE_URL")
    ADMIN_DATABASE_URL: Optional[str] = Field(default=None, env="ADMIN_DATABASE_URL")
    DB_POOL_SIZE: int = Field(default=10, ge=1, env="DB_POOL_SIZE")
    DB_MAX_OVERFLOW: int = Field(default=10, ge=0, env="DB_MAX_OVERFLOW")
    DB_POOL_TIMEOUT_SECONDS: int = Field(
        default=30, ge=1, env="DB_POOL_TIMEOUT_SECONDS"
    )
    DB_POOL_RECYCLE_SECONDS: int = Field(
        default=1800, ge=0, env="DB_POOL_RECYCLE_SECONDS"
    )
    DB_POOL_PRE_PING: bool = Field(default=True, env="DB_POOL_PRE_PING")
    DB_POOL_USE_LIFO: bool = Field(default=True, env="DB_POOL_USE_LIFO")
    UPLOAD_DIR: str = (BASE_DIR / "uploads").as_posix()
    R2_ENDPOINT: Optional[str] = Field(default=None, env="R2_ENDPOINT")
    R2_BUCKET: Optional[str] = Field(default=None, env="R2_BUCKET")
    R2_ACCESS_KEY_ID: Optional[str] = Field(default=None, env="R2_ACCESS_KEY_ID")
    R2_SECRET_ACCESS_KEY: Optional[str] = Field(
        default=None, env="R2_SECRET_ACCESS_KEY"
    )
    ASSETS_BASE_URL: Optional[str] = Field(default=None, env="ASSETS_BASE_URL")
    SECRET_KEY: str = "change-me"
    REQUIRE_API_TOKEN: bool = Field(default=True, env="REQUIRE_API_TOKEN")
    API_TOKEN: Optional[str] = Field(default=None, env="API_TOKEN")
    API_TOKEN_HEADER: str = Field(default="X-API-Token", env="API_TOKEN_HEADER")
    GROK_API_KEY: str | None = Field(default=None, env="GROK_API_KEY")
    GROK_MODEL: str = Field(default="grok-4-fast-reasoning", env="GROK_MODEL")
    GROK_TIMEOUT_SECONDS: int = Field(default=45, ge=1, env="GROK_TIMEOUT_SECONDS")
    GROK_MAX_RETRIES: int = Field(default=2, ge=1, env="GROK_MAX_RETRIES")
    GROK_RETRY_DELAY_SECONDS: float = Field(
        default=1.0, ge=0.0, env="GROK_RETRY_DELAY_SECONDS"
    )
    SLACK_WEBHOOK_URL: Optional[str] = Field(default=None, env="SLACK_WEBHOOK_URL")
    SLACK_CAR_ALERT_CHANNEL: Optional[str] = Field(
        default=None, env="SLACK_CAR_ALERT_CHANNEL"
    )
    SLACK_COMMAND_SIGNING_SECRET: Optional[str] = Field(
        default=None, env="SLACK_COMMAND_SIGNING_SECRET"
    )
    SLACK_COMMAND_VERIFICATION_TOKEN: Optional[str] = Field(
        default=None, env="SLACK_COMMAND_VERIFICATION_TOKEN"
    )
    SLACK_BOT_TOKEN: Optional[str] = Field(default=None, env="SLACK_BOT_TOKEN")
    SLACK_ALERTS_ENABLED: bool = Field(default=True, env="SLACK_ALERTS_ENABLED")
    SLACK_ALERT_WEBHOOK_URL: Optional[str] = Field(
        default=None, env="SLACK_ALERT_WEBHOOK_URL"
    )
    SLACK_ALERT_CHANNEL: Optional[str] = Field(
        default=None, env="SLACK_ALERT_CHANNEL"
    )
    PCA_MART_DEALERSHIP_ID: Optional[int] = Field(
        default=23, env="PCA_MART_DEALERSHIP_ID"
    )
    NEUROAI_BASE_URL: Optional[str] = Field(default=None, env="NEUROAI_BASE_URL")
    NEUROAI_USERNAME: Optional[str] = Field(default=None, env="NEUROAI_USERNAME")
    NEUROAI_PASSWORD: Optional[str] = Field(default=None, env="NEUROAI_PASSWORD")
    NEUROAI_REQUEST_TIMEOUT_SECONDS: int = Field(
        default=1800, ge=30, env="NEUROAI_REQUEST_TIMEOUT_SECONDS"
    )
    NEUROAI_MAX_URLS_PER_REQUEST: int = Field(
        default=1000, ge=1, env="NEUROAI_MAX_URLS_PER_REQUEST"
    )
    NEUROWRATH_MODE: str = Field(default="auto", env="NEUROWRATH_MODE")
    NEUROWRATH_API_BASE_URL: Optional[str] = Field(
        default=None, env="NEUROWRATH_API_BASE_URL"
    )
    NEUROWRATH_USERNAME: Optional[str] = Field(
        default=None, env="NEUROWRATH_USERNAME"
    )
    NEUROWRATH_PASSWORD: Optional[str] = Field(
        default=None, env="NEUROWRATH_PASSWORD"
    )
    NEUROWRATH_LOCAL_BASE_DIR: Optional[str] = Field(
        default=None, env="NEUROWRATH_LOCAL_BASE_DIR"
    )
    NEUROWRATH_LOCAL_SCRAPY_BIN: Optional[str] = Field(
        default=None, env="NEUROWRATH_LOCAL_SCRAPY_BIN"
    )
    NEUROWRATH_LOCAL_PYTHON: Optional[str] = Field(
        default=None, env="NEUROWRATH_LOCAL_PYTHON"
    )
    NEUROWRATH_LOCAL_FALLBACK_TO_REMOTE: bool = Field(
        default=True, env="NEUROWRATH_LOCAL_FALLBACK_TO_REMOTE"
    )
    NEUROWRATH_MANUAL_IMPORT_TIMEOUT_SECONDS: int = Field(
        default=900, ge=60, env="NEUROWRATH_MANUAL_IMPORT_TIMEOUT_SECONDS"
    )
    # 0 disables the cap (unbounded).
    NEUROWRATH_MANUAL_IMPORT_MAX_LIMIT: int = Field(
        default=0, ge=0, env="NEUROWRATH_MANUAL_IMPORT_MAX_LIMIT"
    )
    NEUROWRATH_SCHEDULER_ENABLED: bool = Field(
        default=True, env="NEUROWRATH_SCHEDULER_ENABLED"
    )
    NEUROWRATH_CRON_TOKEN: Optional[str] = Field(
        default=None, env="NEUROWRATH_CRON_TOKEN"
    )
    REDIS_URL: Optional[str] = Field(default=None, env="REDIS_URL")
    BACKGROUND_JOB_BACKEND: str = Field(
        default="thread", env="BACKGROUND_JOB_BACKEND"
    )
    CELERY_BROKER_URL: Optional[str] = Field(default=None, env="CELERY_BROKER_URL")
    CELERY_RESULT_BACKEND: Optional[str] = Field(
        default=None, env="CELERY_RESULT_BACKEND"
    )
    CELERY_TASK_ALWAYS_EAGER: bool = Field(
        default=False, env="CELERY_TASK_ALWAYS_EAGER"
    )
    CELERY_TASK_TRACK_STARTED: bool = Field(
        default=True, env="CELERY_TASK_TRACK_STARTED"
    )
    CELERY_WORKER_POOL: str = Field(default="solo", env="CELERY_WORKER_POOL")
    CELERY_WORKER_CONCURRENCY: int = Field(
        default=1, ge=1, env="CELERY_WORKER_CONCURRENCY"
    )
    CELERY_WORKER_MAX_TASKS_PER_CHILD: int = Field(
        default=50, ge=0, env="CELERY_WORKER_MAX_TASKS_PER_CHILD"
    )
    CELERY_WORKER_MAX_MEMORY_PER_CHILD_KB: int = Field(
        default=0, ge=0, env="CELERY_WORKER_MAX_MEMORY_PER_CHILD_KB"
    )
    CACHE_TTL_SECONDS: int = Field(default=300, ge=1, env="CACHE_TTL_SECONDS")
    BASIC_AUTH_USERNAME: Optional[str] = Field(default=None, env="BASIC_AUTH_USERNAME")
    BASIC_AUTH_PASSWORD: Optional[str] = Field(default=None, env="BASIC_AUTH_PASSWORD")
    AGENT_BASIC_AUTH_USERNAME: Optional[str] = Field(
        default=None, env="AGENT_BASIC_AUTH_USERNAME"
    )
    AGENT_BASIC_AUTH_PASSWORD: Optional[str] = Field(
        default=None, env="AGENT_BASIC_AUTH_PASSWORD"
    )
    ADMIN_CANONICAL_HOST: Optional[str] = Field(
        default="admin.vinfreak.com", env="ADMIN_CANONICAL_HOST"
    )
    ADMIN_CANONICAL_SCHEME: str = Field(
        default="https", env="ADMIN_CANONICAL_SCHEME"
    )
    ADMIN_REDIRECT_HOSTS: str = Field(default="", env="ADMIN_REDIRECT_HOSTS")
    CORS_ALLOWED_ORIGINS: str = Field(default="", env="CORS_ALLOWED_ORIGINS")
    CORS_ALLOW_CREDENTIALS: bool = Field(
        default=True, env="CORS_ALLOW_CREDENTIALS"
    )
    SESSION_COOKIE_SECURE: Optional[bool] = Field(
        default=None, env="SESSION_COOKIE_SECURE"
    )
    SESSION_COOKIE_SAMESITE: str = Field(
        default="lax", env="SESSION_COOKIE_SAMESITE"
    )
    UPLOAD_MAX_BYTES: int = Field(default=10_485_760, ge=1, env="UPLOAD_MAX_BYTES")
    UPLOAD_ALLOWED_MIME_TYPES: str = Field(default="", env="UPLOAD_ALLOWED_MIME_TYPES")
    LOGIN_RATE_LIMIT_ATTEMPTS: int = Field(
        default=10, ge=1, env="LOGIN_RATE_LIMIT_ATTEMPTS"
    )
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = Field(
        default=300, ge=1, env="LOGIN_RATE_LIMIT_WINDOW_SECONDS"
    )
    LOGIN_RATE_LIMIT_BLOCK_SECONDS: int = Field(
        default=900, ge=1, env="LOGIN_RATE_LIMIT_BLOCK_SECONDS"
    )
    LOGIN_RATE_LIMIT_MAX_TRACKED_KEYS: int = Field(
        default=10000, ge=100, env="LOGIN_RATE_LIMIT_MAX_TRACKED_KEYS"
    )
    FACEBOOK_MARKETPLACE_IMPORT_ENABLED: bool = Field(
        default=True, env="FACEBOOK_MARKETPLACE_IMPORT_ENABLED"
    )
    FACEBOOK_MARKETPLACE_FEED_URL: Optional[str] = Field(
        default=None, env="FACEBOOK_MARKETPLACE_FEED_URL"
    )
    FACEBOOK_MARKETPLACE_ACCESS_TOKEN: Optional[str] = Field(
        default=None, env="FACEBOOK_MARKETPLACE_ACCESS_TOKEN"
    )
    FACEBOOK_MARKETPLACE_TIMEOUT_SECONDS: int = Field(
        default=20, ge=1, env="FACEBOOK_MARKETPLACE_TIMEOUT_SECONDS"
    )
    FACEBOOK_MARKETPLACE_SESSION_COOKIE: Optional[str] = Field(
        default=None,
        env="FACEBOOK_MARKETPLACE_SESSION_COOKIE",
    )
    FACEBOOK_MARKETPLACE_USER_AGENT: Optional[str] = Field(
        default=None,
        env="FACEBOOK_MARKETPLACE_USER_AGENT",
    )
    FACEBOOK_MARKETPLACE_GRAPHQL_DOC_ID: Optional[str] = Field(
        default=None,
        env="FACEBOOK_MARKETPLACE_GRAPHQL_DOC_ID",
    )
    FACEBOOK_MARKETPLACE_GRAPHQL_FRIENDLY_NAME: Optional[str] = Field(
        default=None,
        env="FACEBOOK_MARKETPLACE_GRAPHQL_FRIENDLY_NAME",
    )
    FACEBOOK_MARKETPLACE_FB_DTSG: Optional[str] = Field(
        default=None,
        env="FACEBOOK_MARKETPLACE_FB_DTSG",
    )
    FACEBOOK_MARKETPLACE_LSD: Optional[str] = Field(
        default=None,
        env="FACEBOOK_MARKETPLACE_LSD",
    )
    FACEBOOK_MARKETPLACE_JAZOEST: Optional[str] = Field(
        default=None,
        env="FACEBOOK_MARKETPLACE_JAZOEST",
    )
    FACEBOOK_MARKETPLACE_ASBD_ID: Optional[str] = Field(
        default=None,
        env="FACEBOOK_MARKETPLACE_ASBD_ID",
    )
    FACEBOOK_MARKETPLACE_GRAPHQL_FORM_FIELDS: Optional[str] = Field(
        default=None,
        env="FACEBOOK_MARKETPLACE_GRAPHQL_FORM_FIELDS",
    )
    FACEBOOK_MARKETPLACE_GRAPHQL_HEADERS: Optional[str] = Field(
        default=None,
        env="FACEBOOK_MARKETPLACE_GRAPHQL_HEADERS",
    )
    FACEBOOK_MARKETPLACE_DEFAULT_QUERY: str = Field(
        default="Vehicles", env="FACEBOOK_MARKETPLACE_DEFAULT_QUERY"
    )
    FACEBOOK_MARKETPLACE_DEFAULT_CATEGORY_ID: str = Field(
        default="546583916084032", env="FACEBOOK_MARKETPLACE_DEFAULT_CATEGORY_ID"
    )
    FACEBOOK_MARKETPLACE_DEFAULT_LOCATION_ID: str = Field(
        default="104029022966940", env="FACEBOOK_MARKETPLACE_DEFAULT_LOCATION_ID"
    )
    FACEBOOK_MARKETPLACE_DEFAULT_LATITUDE: float = Field(
        default=35.1258, env="FACEBOOK_MARKETPLACE_DEFAULT_LATITUDE"
    )
    FACEBOOK_MARKETPLACE_DEFAULT_LONGITUDE: float = Field(
        default=-117.985, env="FACEBOOK_MARKETPLACE_DEFAULT_LONGITUDE"
    )
    FACEBOOK_MARKETPLACE_DEFAULT_RADIUS_KM: int = Field(
        default=500, ge=1, env="FACEBOOK_MARKETPLACE_DEFAULT_RADIUS_KM"
    )
    FACEBOOK_MARKETPLACE_DEALERSHIP_ID: Optional[int] = Field(
        default=None, env="FACEBOOK_MARKETPLACE_DEALERSHIP_ID"
    )

    @model_validator(mode="before")
    @classmethod
    def _recover_misplaced_marketplace_cookie(cls, data: object):
        """Recover from common env misconfiguration in hosted dashboards.

        Some deployments accidentally paste the cookie header value into
        ``FACEBOOK_MARKETPLACE_IMPORT_ENABLED`` instead of
        ``FACEBOOK_MARKETPLACE_SESSION_COOKIE``. Detect that shape and remap
        it before field parsing so startup does not fail.
        """
        if not isinstance(data, dict):
            return data
        raw_enabled = data.get("FACEBOOK_MARKETPLACE_IMPORT_ENABLED")
        raw_cookie = data.get("FACEBOOK_MARKETPLACE_SESSION_COOKIE")
        if not isinstance(raw_enabled, str):
            return data

        candidate = raw_enabled.strip().strip('"').strip("'")
        looks_cookie = "c_user=" in candidate and "xs=" in candidate
        if not looks_cookie:
            return data

        corrected = dict(data)
        if raw_cookie in (None, ""):
            corrected["FACEBOOK_MARKETPLACE_SESSION_COOKIE"] = candidate
        corrected["FACEBOOK_MARKETPLACE_IMPORT_ENABLED"] = "true"
        return corrected

    @staticmethod
    def _parse_list_setting(value: object, default: tuple[str, ...] = ()) -> tuple[str, ...]:
        if value in (None, ""):
            return default
        if isinstance(value, (list, tuple)):
            return tuple(str(item).strip() for item in value if str(item).strip())
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return default
            parsed = None
            try:
                parsed = json.loads(text)
            except (ValueError, TypeError):
                parsed = None
            if isinstance(parsed, (list, tuple)):
                return tuple(str(item).strip() for item in parsed if str(item).strip())
            parts = [segment.strip() for segment in text.split(",")]
            return tuple(part for part in parts if part)
        return default

    @property
    def admin_redirect_hosts(self) -> tuple[str, ...]:
        return self._parse_list_setting(
            self.ADMIN_REDIRECT_HOSTS, DEFAULT_ADMIN_REDIRECT_HOSTS
        )

    @property
    def cors_allowed_origins(self) -> tuple[str, ...]:
        return self._parse_list_setting(self.CORS_ALLOWED_ORIGINS, ())

    @property
    def upload_allowed_mime_types(self) -> tuple[str, ...]:
        return self._parse_list_setting(
            self.UPLOAD_ALLOWED_MIME_TYPES, DEFAULT_UPLOAD_ALLOWED_MIME_TYPES
        )

    @field_validator("SESSION_COOKIE_SAMESITE", mode="before")
    @classmethod
    def _normalize_samesite(cls, value: object) -> str:
        if value is None:
            return "lax"
        text = str(value).strip().lower()
        if text not in {"lax", "strict", "none"}:
            raise ValueError("SESSION_COOKIE_SAMESITE must be lax, strict, or none")
        return text

    @field_validator("BACKGROUND_JOB_BACKEND", mode="before")
    @classmethod
    def _normalize_background_job_backend(cls, value: object) -> str:
        if value is None:
            return "thread"
        text = str(value).strip().lower()
        if not text:
            return "thread"
        if text not in {"thread", "celery"}:
            raise ValueError("BACKGROUND_JOB_BACKEND must be 'thread' or 'celery'")
        return text

    @field_validator("CELERY_WORKER_POOL", mode="before")
    @classmethod
    def _normalize_celery_worker_pool(cls, value: object) -> str:
        if value is None:
            return "solo"
        text = str(value).strip().lower()
        if not text:
            return "solo"
        if text not in {"prefork", "solo", "threads", "eventlet", "gevent"}:
            raise ValueError(
                "CELERY_WORKER_POOL must be one of: prefork, solo, threads, eventlet, gevent"
            )
        return text

    @model_validator(mode="after")
    def _populate_admin_db(self):  # type: ignore[override]
        if self.ADMIN_DATABASE_URL is None:
            object.__setattr__(self, "ADMIN_DATABASE_URL", self.DATABASE_URL)
        return self

    @model_validator(mode="after")
    def _validate_security(self):  # type: ignore[override]
        env = (self.APP_ENV or "").strip().lower()
        allow_insecure = self.ALLOW_INSECURE_DEFAULTS or env in {
            "development",
            "dev",
            "test",
            "local",
        }
        if self.SESSION_COOKIE_SECURE is None:
            object.__setattr__(self, "SESSION_COOKIE_SECURE", not allow_insecure)
        if self.SESSION_COOKIE_SAMESITE == "none" and not self.SESSION_COOKIE_SECURE:
            raise ValueError("SESSION_COOKIE_SECURE must be true when SameSite is none")
        if not allow_insecure:
            if not self.SECRET_KEY or self.SECRET_KEY == "change-me":
                raise ValueError("SECRET_KEY must be set to a strong value")
            if not self.ADMIN_PASS or self.ADMIN_PASS == "admin":
                raise ValueError("ADMIN_PASS must be set to a strong value")
            if self.REQUIRE_API_TOKEN and not (self.API_TOKEN or "").strip():
                raise ValueError("API_TOKEN must be set when REQUIRE_API_TOKEN is true")
        return self


settings = Settings()
