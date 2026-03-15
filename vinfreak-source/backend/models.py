from datetime import datetime, timezone
from enum import Enum
from typing import Any, ClassVar, Optional
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, Text, UniqueConstraint, Index, String, literal_column, event, text
from sqlalchemy.types import UserDefinedType
from secrets import token_urlsafe
from pydantic import ConfigDict, BaseModel, PrivateAttr

# Allow "model_*" field names globally
BaseModel.model_config["protected_namespaces"] = ()

# Test suites frequently reload this module which would otherwise attempt to
# register duplicate ``Table`` objects with the global SQLModel metadata.
# Clearing only table metadata keeps imports idempotent without de-instrumenting
# classes that may still be referenced by already-imported test modules.
if SQLModel.metadata.tables:
    SQLModel.metadata.clear()


class Make(SQLModel, table=True):
    __tablename__ = "makes"
    id: int | None = Field(default=None, primary_key=True)
    name: str
    logo_url: str | None = None

    models: list["Model"] = Relationship(back_populates="make")
    cars: list["Car"] = Relationship(back_populates="make_rel")


class Model(SQLModel, table=True):
    __tablename__ = "models"
    id: int | None = Field(default=None, primary_key=True)
    name: str
    make_id: int | None = Field(default=None, foreign_key="makes.id")

    make: Make | None = Relationship(back_populates="models")
    cars: list["Car"] = Relationship(back_populates="model_rel")


class Category(SQLModel, table=True):
    __tablename__ = "categories"
    id: int | None = Field(default=None, primary_key=True)
    name: str

    cars: list["Car"] = Relationship(back_populates="category_rel")


class Geography(UserDefinedType):
    """Lightweight PostGIS geography(Point,4326) type descriptor."""

    cache_ok = True

    def get_col_spec(self, **kw):  # type: ignore[override]
        return "GEOGRAPHY(Point,4326)"

    def compile(self, dialect=None):  # type: ignore[override]
        name = getattr(dialect, "name", "") if dialect is not None else ""
        if name == "sqlite":
            return "BLOB"
        return super().compile(dialect=dialect)


class Dealership(SQLModel, table=True):
    __tablename__ = "dealerships"
    id: int | None = Field(default=None, primary_key=True)
    name: str
    logo_url: str | None = None
    location: str | None = None
    dealer_profile_id: int | None = Field(default=None, foreign_key="dealer_profiles.id")

    dealer_profile: Optional["DealerProfile"] = Relationship(
        back_populates="dealerships",
        sa_relationship_kwargs={"foreign_keys": "[Dealership.dealer_profile_id]"},
    )
    cars: list["Car"] = Relationship(back_populates="dealership")


class CarImport(SQLModel, table=True):
    __tablename__ = "car_imports"
    id: int | None = Field(default=None, primary_key=True)
    name: str
    uploaded_at: str | None = None
    file_name: str | None = None
    car_count: int | None = 0

    cars: list["Car"] = Relationship(back_populates="import_list")
    jobs: list["Job"] = Relationship(back_populates="import_job")


# Store enough information to reconstruct a deleted import and its cars.
class CarImportUndo(SQLModel, table=True):
    __tablename__ = "car_import_undo"

    token: str = Field(default_factory=lambda: token_urlsafe(12), primary_key=True)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    import_id: int | None = None
    import_name: str | None = None
    deleted_count: int | None = 0
    import_payload: str | None = Field(default=None, sa_column=Column(Text))
    cars_payload: str | None = Field(default=None, sa_column=Column(Text))


# NOTE: Car columns mirror existing DB plus optional deleted_at for soft delete.
class Car(SQLModel, table=True):
    __tablename__ = "cars"
    # Allow field names that would otherwise clash with Pydantic protected namespaces
    model_config = ConfigDict(protected_namespaces=())
    id: int | None = Field(default=None, primary_key=True)
    vin: str | None = None
    make: str | None = None
    make_id: int | None = Field(default=None, foreign_key="makes.id")
    model: str | None = None
    model_id: int | None = Field(default=None, foreign_key="models.id")
    category_id: int | None = Field(default=None, foreign_key="categories.id")
    dealership_id: int | None = Field(default=None, foreign_key="dealerships.id")
    dealer_profile_id: int | None = Field(default=None, foreign_key="dealer_profiles.id")
    import_list_id: int | None = Field(default=None, foreign_key="car_imports.id")
    trim: str | None = None
    year: int | None = None
    mileage: int | None = None
    price: float | None = None
    currency: str | None = None
    city: str | None = None
    state: str | None = None
    seller_type: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    geo_failed: bool | None = Field(default=False)
    exterior_color: str | None = None
    interior_color: str | None = None
    transmission: str | None = None
    drivetrain: str | None = None
    fuel_type: str | None = None
    body_type: str | None = None
    auction_status: str | None = None
    lot_number: str | None = None
    end_time: str | None = None
    time_left: str | None = None
    number_of_views: int | None = None
    number_of_bids: int | None = None
    freakscore: float | None = None
    engagement_score: float | None = None
    quality_score: float | None = None
    source: str | None = None
    url: str | None = None
    title: str | None = None
    description: str | None = None
    highlights: str | None = None
    equipment: str | None = None
    modifications: str | None = None
    known_flaws: str | None = None
    service_history: str | None = None
    ownership_history: str | None = None
    seller_notes: str | None = None
    other_items: str | None = None
    engine: str | None = None
    image_url: str | None = None
    images_json: str | None = None
    location_address: str | None = None
    location_url: str | None = None
    seller_name: str | None = None
    seller_url: str | None = None
    seller_rating: str | None = None
    seller_reviews: str | None = None
    created_at: str | None = None  # ISO8601
    updated_at: str | None = None  # ISO8601
    posted_at: str | None = None
    deleted_at: str | None = None  # soft delete (TEXT ISO8601)
    geo: str | bytes | None = Field(
        default=None,
        sa_column=Column(
            Geography().with_variant(Text(), "sqlite"),
            nullable=True,
        ),
    )

    dealership: Dealership | None = Relationship(back_populates="cars")
    dealer_profile: Optional["DealerProfile"] = Relationship(back_populates="cars")
    make_rel: Make | None = Relationship(back_populates="cars")
    model_rel: Model | None = Relationship(back_populates="cars")
    category_rel: Category | None = Relationship(back_populates="cars")
    import_list: CarImport | None = Relationship(back_populates="cars")
    comments: list["Comment"] = Relationship(back_populates="car")
    favorites: list["Favorite"] = Relationship(back_populates="car")
    search_events: list["SearchEvent"] = Relationship(back_populates="car")

    @classmethod
    def _column_or_literal(cls, column_name: str):
        """Return the mapped SQLAlchemy column or a literal fallback.

        Some deployment environments import lightweight stand-ins for the
        ``Car`` model that do not include SQLAlchemy instrumentation.  Accessing
        mapped attributes (for example ``Car.end_time``) on those stand-ins
        raises ``AttributeError`` which, in turn, breaks any query builders that
        expect the mapped attribute to exist.  This helper ensures callers can
        always obtain a SQL expression for ``column_name`` regardless of which
        ``Car`` implementation was imported.
        """

        try:
            column = getattr(cls, column_name)
        except AttributeError:
            column = None
        if column is not None:
            return column
        table_name = getattr(cls, "__tablename__", "cars")
        return literal_column(f"{table_name}.{column_name}")

    @classmethod
    def auction_status_column(cls):
        """Return a SQL expression for the ``auction_status`` column."""

        return cls._column_or_literal("auction_status")

    @classmethod
    def end_time_column(cls):
        """Return a SQL expression for the ``end_time`` column."""

        return cls._column_or_literal("end_time")

    @classmethod
    def posted_at_column(cls):
        """Return a SQL expression for the ``posted_at`` column.

        Mirrors :meth:`end_time_column` so that sort builders can safely access
        ``Car.posted_at`` even when the mapped attribute is missing.
        """

        return cls._column_or_literal("posted_at")


@event.listens_for(Car, "before_insert", propagate=True)
@event.listens_for(Car, "before_update", propagate=True)
def _sync_car_geography(_mapper, connection, target):
    """Maintain the ``geo`` geography column when latitude/longitude change."""

    lat = getattr(target, "latitude", None)
    lng = getattr(target, "longitude", None)
    if lat is None or lng is None:
        target.geo = None
        return
    try:
        lat_val = float(lat)
        lng_val = float(lng)
    except (TypeError, ValueError):
        target.geo = None
        return

    dialect_name = getattr(connection.dialect, "name", "")
    if not dialect_name or "postgresql" not in dialect_name:
        target.geo = None
        return

    try:
        result = connection.execute(
            text(
                "SELECT ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography"
            ),
            {"lat": lat_val, "lng": lng_val},
        )
        target.geo = result.scalar()
    except Exception:
        target.geo = None

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CommentStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

    @classmethod
    def _missing_(cls, value: object):  # type: ignore[override]
        if isinstance(value, str):
            normalized = value.strip().lower()
            for member in cls:
                if member.value == normalized:
                    return member
        return None


class Comment(SQLModel, table=True):
    __tablename__ = "comments"

    id: int | None = Field(default=None, primary_key=True)
    car_id: int = Field(foreign_key="cars.id", index=True)
    display_name: str
    email: str | None = None
    # The database column storing the comment text was renamed from
    # ``comment`` to ``content``.  Map the model's ``body`` attribute to the
    # new name so SQLModel generates queries that match the production schema.
    # Setting ``key`` ensures the ORM attribute is still exposed as ``body``
    # even though the underlying column is called ``content``.
    body: str = Field(
        sa_column=Column("content", Text, nullable=False, key="body")
    )
    status: CommentStatus = Field(
        default=CommentStatus.APPROVED,
        sa_column=Column("status", String(20), nullable=False),
    )
    flagged: bool = Field(default=False, index=True)
    # ``flag_reason`` is the legacy column name in production. Avoid overriding
    # the SQLAlchemy ``key`` so generated queries continue to reference the
    # actual column name rather than a derived alias that doesn't exist in the
    # database.
    flagged_reason: str | None = Field(
        default=None,
        sa_column=Column("flag_reason", Text),
    )
    ip_address: str | None = None
    automation_source: str | None = Field(
        default=None,
        sa_column=Column("automation_source", String(64)),
    )
    automation_metadata: str | None = Field(
        default=None,
        sa_column=Column("automation_metadata", Text),
    )
    parent_id: int | None = Field(default=None, foreign_key="comments.id", index=True)
    # The production ``comments`` table does not include a dedicated
    # ``user_agent`` column.  Keeping the attribute out of the model avoids
    # generating queries that reference a non-existent column, which would
    # otherwise break the admin comments view.
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)

    _moderated_at: str | None = PrivateAttr(default=None)
    _moderated_by: str | None = PrivateAttr(default=None)

    def _get_private_value(self, key: str) -> Any:
        storage = getattr(self, "__pydantic_private__", None)
        if isinstance(storage, dict):
            return storage.get(key)
        return None

    def _set_private_value(self, key: str, value: Any) -> None:
        storage = getattr(self, "__pydantic_private__", None)
        if not isinstance(storage, dict):
            storage = {}
            object.__setattr__(self, "__pydantic_private__", storage)
        storage[key] = value

    @property
    def moderated_at(self) -> str | None:
        """Return the last moderation timestamp.

        The production database schema does not currently expose dedicated
        moderation columns, so fall back to the ``updated_at`` value when no
        in-memory override has been supplied.
        """

        override = self._get_private_value("_moderated_at")
        if override:
            return override
        return self.updated_at

    @moderated_at.setter
    def moderated_at(self, value: str | None) -> None:
        self._set_private_value("_moderated_at", value)

    @property
    def moderated_by(self) -> str | None:
        """Return the username of the moderator who last touched the comment."""

        stored = self._get_private_value("_moderated_by")
        if stored:
            return stored
        return None

    @moderated_by.setter
    def moderated_by(self, value: str | None) -> None:
        self._set_private_value("_moderated_by", value)

    car: Car | None = Relationship(back_populates="comments")
    parent: Optional["Comment"] = Relationship(
        sa_relationship_kwargs={"remote_side": "Comment.id"}, back_populates="replies"
    )
    replies: list["Comment"] = Relationship(back_populates="parent")
    reactions: list["CommentReaction"] = Relationship(back_populates="comment")


class CommentReaction(SQLModel, table=True):
    __tablename__ = "comment_reactions"
    __table_args__ = (
        UniqueConstraint("comment_id", "ip_address", name="uq_comment_reaction_ip"),
        Index("idx_comment_reaction_comment", "comment_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    comment_id: int = Field(foreign_key="comments.id")
    reaction: str = Field(sa_column=Column(String(32), nullable=False))
    ip_address: str | None = Field(default=None, index=True)
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)

    comment: Comment | None = Relationship(back_populates="reactions")


class CommentBlocklist(SQLModel, table=True):
    __tablename__ = "comment_blocklist"

    id: int | None = Field(default=None, primary_key=True)
    phrase: str = Field(sa_column=Column(Text, nullable=False, unique=True))
    created_at: str = Field(default_factory=_now_iso)
    added_by: str | None = None


class Media(SQLModel, table=True):
    __tablename__ = "media"
    id: int | None = Field(default=None, primary_key=True)
    filename: str | None = None
    url: str | None = None
    uploaded_at: str | None = None


class CarLike(SQLModel, table=True):
    __tablename__ = "car_likes"
    __table_args__ = (
        UniqueConstraint("car_id", "session_id", name="uq_car_likes_car_session"),
        Index("ix_car_likes_session_id", "session_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    car_id: int = Field(foreign_key="cars.id", index=True)
    session_id: str = Field(sa_column=Column(Text, nullable=False))
    created_at: str = Field(default_factory=_now_iso)

class Setting(SQLModel, table=True):
    __tablename__ = "settings"
    key: str | None = Field(default=None, primary_key=True)
    value: str | None = None

    # Known keys
    SITE_TITLE: ClassVar[str] = "site_title"
    SITE_TAGLINE: ClassVar[str] = "site_tagline"
    THEME: ClassVar[str] = "theme"
    LOGO_URL: ClassVar[str] = "logo_url"
    LOGO_WIDTH: ClassVar[str] = "logo_width"
    LOGO_HEIGHT: ClassVar[str] = "logo_height"
    FAVICON_URL: ClassVar[str] = "favicon_url"
    CONTACT_EMAIL: ClassVar[str] = "contact_email"
    DEFAULT_PAGE_SIZE: ClassVar[str] = "default_page_size"
    MAINTENANCE_BANNER: ClassVar[str] = "maintenance_banner"
    BRAND_FILTER_MAKE_IDS: ClassVar[str] = "brand_filter_make_ids"
    HOME_TOP_FILTERS_ENABLED: ClassVar[str] = "home_top_filters_enabled"
    HOME_MAKE_FILTER_ENABLED: ClassVar[str] = "home_make_filter_enabled"
    HOME_DEALERSHIP_FILTER_ENABLED: ClassVar[str] = "home_dealership_filter_enabled"
    HOME_NEW_LISTING_BADGE_ENABLED: ClassVar[str] = "home_new_listing_badge_enabled"
    HOME_INVENTORY_TYPE_PILLS_ENABLED: ClassVar[str] = "home_inventory_type_pills_enabled"
    HOME_SORT_LABEL_ENABLED: ClassVar[str] = "home_sort_label_enabled"
    HOME_FILTER_COUNTS_ENABLED: ClassVar[str] = "home_filter_counts_enabled"
    HOME_FOOTER_PANELS_ENABLED: ClassVar[str] = "home_footer_panels_enabled"
    FREAKSTATS_PROMPT: ClassVar[str] = "freakstats_prompt"
    FREAKSTATS_SYSTEM_PROMPT: ClassVar[str] = "freakstats_system_prompt"
    FREAKSTATS_USER_PROMPT: ClassVar[str] = "freakstats_user_prompt"
    FREAKSTATS_SYSTEM_PROMPT_RETAIL: ClassVar[str] = "freakstats_system_prompt_retail"
    FREAKSTATS_USER_PROMPT_RETAIL: ClassVar[str] = "freakstats_user_prompt_retail"
    FREAKSTATS_SYSTEM_PROMPT_AUCTION: ClassVar[str] = "freakstats_system_prompt_auction"
    FREAKSTATS_USER_PROMPT_AUCTION: ClassVar[str] = "freakstats_user_prompt_auction"
    FREAKSTATS_LOADER_URL: ClassVar[str] = "freakstats_loader_url"
    FREAKSTATS_ICON_URL: ClassVar[str] = "freakstats_icon_url"
    FREAKSTATS_ICON_WIDTH: ClassVar[str] = "freakstats_icon_width"
    FREAKSTATS_ICON_HEIGHT: ClassVar[str] = "freakstats_icon_height"
    FREAKSTATS_RETAIL_STATUSES: ClassVar[str] = "freakstats_retail_statuses"
    FREAKSTATS_AUCTION_STATUSES: ClassVar[str] = "freakstats_auction_statuses"
    NEUROWRATH_SCHEDULE: ClassVar[str] = "neurowraith_schedule"
    GPT_COMMENTER_PROMPT: ClassVar[str] = "gpt_commenter_prompt"
    GPT_COMMENTER_STATUSES: ClassVar[str] = "gpt_commenter_statuses"
    GPT_COMMENTER_INITIAL_STATUS: ClassVar[str] = "gpt_commenter_initial_status"
    GPT_COMMENTER_MAX_PER_LISTING: ClassVar[str] = "gpt_commenter_max_per_listing"
    GPT_COMMENTER_MAX_PER_RUN: ClassVar[str] = "gpt_commenter_max_per_run"
    GPT_COMMENTER_TARGET_CAR_IDS: ClassVar[str] = "gpt_commenter_target_car_ids"
    FACEBOOK_MARKETPLACE_QUERY_PRESETS: ClassVar[str] = "facebook_marketplace_query_presets"
    FACEBOOK_MARKETPLACE_SLACK_CHECKPOINT: ClassVar[str] = (
        "facebook_marketplace_slack_checkpoint"
    )


class NeuroWraithRun(SQLModel, table=True):
    __tablename__ = "neurowraith_runs"
    id: int | None = Field(default=None, primary_key=True)
    spider: str
    dealership_hint: str | None = None
    dealership_id: int | None = Field(default=None, foreign_key="dealerships.id")
    dealership_label: str | None = None
    run_type: str = Field(default="manual")
    started_at: str = Field(default_factory=_now_iso)
    finished_at: str | None = None
    limit_requested: int | None = None
    inserted: int = 0
    updated: int = 0
    skipped: int = 0
    succeeded: bool = True
    error: str | None = None

class User(SQLModel, table=True):
    __tablename__ = "users"
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    display_name: str | None = None
    status: str | None = None
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)

    user_roles: list["UserRole"] = Relationship(back_populates="user")
    dealer_profiles: list["DealerProfile"] = Relationship(back_populates="owner")
    favorites: list["Favorite"] = Relationship(back_populates="user")
    saved_searches: list["SavedSearch"] = Relationship(back_populates="user")
    alerts: list["Alert"] = Relationship(back_populates="user")
    search_events: list["SearchEvent"] = Relationship(back_populates="user")
    jobs: list["Job"] = Relationship(back_populates="created_by")

class Role(SQLModel, table=True):
    __tablename__ = "roles"
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    scope: str | None = None
    description: str | None = None

    user_roles: list["UserRole"] = Relationship(back_populates="role")

class UserRole(SQLModel, table=True):
    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    role_id: int = Field(foreign_key="roles.id", index=True)
    created_at: str = Field(default_factory=_now_iso)

    user: User | None = Relationship(back_populates="user_roles")
    role: Role | None = Relationship(back_populates="user_roles")

class DealerProfile(SQLModel, table=True):
    __tablename__ = "dealer_profiles"
    id: int | None = Field(default=None, primary_key=True)
    owner_user_id: int | None = Field(default=None, foreign_key="users.id")
    display_name: str | None = None
    status: str | None = None
    contact_email: str | None = None
    phone: str | None = None
    website: str | None = None
    location: str | None = None
    requested_dealership_id: int | None = Field(
        default=None, foreign_key="dealerships.id"
    )
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)

    owner: User | None = Relationship(back_populates="dealer_profiles")
    cars: list["Car"] = Relationship(back_populates="dealer_profile")
    inventory_stats: list["DealerInventoryStat"] = Relationship(back_populates="dealer_profile")
    dealerships: list["Dealership"] = Relationship(
        back_populates="dealer_profile",
        sa_relationship_kwargs={"foreign_keys": "[Dealership.dealer_profile_id]"},
    )

class DealerInventoryStat(SQLModel, table=True):
    __tablename__ = "dealer_inventory_stats"
    id: int | None = Field(default=None, primary_key=True)
    dealer_profile_id: int = Field(foreign_key="dealer_profiles.id", index=True)
    period_start: str | None = None
    period_end: str | None = None
    views: int | None = 0
    leads: int | None = 0
    favorites: int | None = 0
    shares: int | None = 0
    detail_views: int | None = 0
    created_at: str = Field(default_factory=_now_iso)

    dealer_profile: DealerProfile | None = Relationship(back_populates="inventory_stats")

class Favorite(SQLModel, table=True):
    __tablename__ = "favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "car_id", name="uq_favorites_user_car"),
        Index("ix_favorites_user_id", "user_id"),
        Index("ix_favorites_car_id", "car_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    car_id: int = Field(foreign_key="cars.id")
    created_at: str = Field(default_factory=_now_iso)

    user: User | None = Relationship(back_populates="favorites")
    car: Car | None = Relationship(back_populates="favorites")

class SavedSearch(SQLModel, table=True):
    __tablename__ = "saved_searches"
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str | None = None
    filters_json: str = Field(
        default="{}",
        sa_column=Column(Text, nullable=False),
    )
    notify_enabled: bool = Field(default=True)
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)

    user: User | None = Relationship(back_populates="saved_searches")
    alerts: list["Alert"] = Relationship(back_populates="saved_search")

class Alert(SQLModel, table=True):
    __tablename__ = "alerts"
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    saved_search_id: int | None = Field(default=None, foreign_key="saved_searches.id")
    channel: str | None = None
    frequency: str | None = None
    last_sent_at: str | None = None
    next_run_at: str | None = None
    active: bool = Field(default=True)
    created_at: str = Field(default_factory=_now_iso)

    user: User | None = Relationship(back_populates="alerts")
    saved_search: SavedSearch | None = Relationship(back_populates="alerts")

class SearchEvent(SQLModel, table=True):
    __tablename__ = "search_events"
    __table_args__ = (
        Index("ix_search_events_car_id_created_at", "car_id", "created_at"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int | None = Field(default=None, foreign_key="users.id", index=True)
    car_id: int | None = Field(default=None, foreign_key="cars.id", index=True)
    event_type: str
    weight: float | None = None
    context_json: str | None = Field(default=None, sa_column=Column(Text))
    created_at: str = Field(default_factory=_now_iso)

    user: User | None = Relationship(back_populates="search_events")
    car: Car | None = Relationship(back_populates="search_events")

class Job(SQLModel, table=True):
    __tablename__ = "jobs"
    id: int | None = Field(default=None, primary_key=True)
    created_by_user_id: int | None = Field(default=None, foreign_key="users.id", index=True)
    car_import_id: int | None = Field(default=None, foreign_key="car_imports.id", index=True)
    job_type: str
    status: str | None = None
    payload_json: str | None = Field(default=None, sa_column=Column(Text))
    result_json: str | None = Field(default=None, sa_column=Column(Text))
    error: str | None = Field(default=None, sa_column=Column(Text))
    scheduled_for: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)

    created_by: User | None = Relationship(back_populates="jobs")
    import_job: CarImport | None = Relationship(back_populates="jobs")

class AdminAudit(SQLModel, table=True):
    __tablename__ = "admin_audit"
    id: int | None = Field(default=None, primary_key=True)
    actor: str | None = None
    action: str | None = None   # create/update/delete/settings
    table_name: str | None = None
    row_id: str | None = None
    before_json: str | None = None
    after_json: str | None = None
    ip: str | None = None
    created_at: str | None = None  # ISO8601
class AdminUser(SQLModel, table=True):
    __tablename__ = "admin_users"
    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)
    can_add_cars: bool = Field(default=False)
    permissions: str = Field(default="[]")
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)
    last_login_at: str | None = None  # ISO8601
