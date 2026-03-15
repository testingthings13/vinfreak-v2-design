from typing import Any
import warnings

from sqlmodel import create_engine, SQLModel, Session
from sqlalchemy import text, inspect, event
from sqlalchemy.exc import SAWarning
from sqlalchemy.pool import StaticPool
import math
# ``db`` needs to work both when the package is imported as ``backend`` and
# when modules are executed from within the ``backend`` directory directly (as
# happens in some deployment environments).  Import ``settings`` in a way that
# supports both execution modes.
def _get_settings():  # pragma: no cover - exercised indirectly in deployment
    try:
        from backend_settings import settings as current  # type: ignore
    except ImportError:
        from .backend_settings import settings as current
    return current

try:
    from backend.models import (
        Make,
        Model,
        Category,
        Dealership,
        Car,
        CarImport,
        CarImportUndo,
        NeuroWraithRun,
        User,
        Role,
        UserRole,
        DealerProfile,
        DealerInventoryStat,
        Favorite,
        SavedSearch,
        Alert,
        SearchEvent,
        Job,
        CarLike,
        Comment,
        CommentBlocklist,
        CommentReaction,
    )
except ModuleNotFoundError:
    from models import (  # type: ignore
        Make,
        Model,
        Category,
        Dealership,
        Car,
        CarImport,
        CarImportUndo,
        NeuroWraithRun,
        User,
        Role,
        UserRole,
        DealerProfile,
        DealerInventoryStat,
        Favorite,
        SavedSearch,
        Alert,
        SearchEvent,
        Job,
        CarLike,
        Comment,
        CommentBlocklist,
        CommentReaction,
    )
except Exception:  # during tests models may be stubbed
    Make = None
    Model = None
    Category = None
    Dealership = None
    Car = None
    CarImport = None
    CarImportUndo = None
    NeuroWraithRun = None
    User = None
    Role = None
    UserRole = None
    DealerProfile = None
    DealerInventoryStat = None
    Favorite = None
    SavedSearch = None
    Alert = None
    SearchEvent = None
    Job = None
    CarLike = None
    Comment = None
    CommentBlocklist = None
    CommentReaction = None



def ensure_columns():
    """Idempotently add missing columns for known legacy schemas."""

    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    with engine.begin() as conn:
        if "cars" in table_names:
            with warnings.catch_warnings():
                warnings.filterwarnings(
                    "ignore",
                    message=r"Did not recognize type 'geography' of column 'geo'",
                    category=SAWarning,
                )
                car_cols = {col["name"] for col in inspector.get_columns("cars")}
            wanted = {
                "lot_number": "TEXT",
                "auction_status": "TEXT",
                "seller_rating": "REAL",
                "seller_reviews": "INTEGER",
                "make_id": "INTEGER",
                "model_id": "INTEGER",
                "category_id": "INTEGER",
                "dealership_id": "INTEGER",
                "dealer_profile_id": "INTEGER",
                "seller_type": "TEXT",
                "exterior_color": "TEXT",
                "interior_color": "TEXT",
                "transmission": "TEXT",
                "drivetrain": "TEXT",
                "fuel_type": "TEXT",
                "body_type": "TEXT",
                "end_time": "TEXT",
                "time_left": "TEXT",
                "number_of_views": "INTEGER",
                "number_of_bids": "INTEGER",
                "freakscore": "REAL",
                "engagement_score": "REAL",
                "quality_score": "REAL",
                "highlights": "TEXT",
                "equipment": "TEXT",
                "modifications": "TEXT",
                "known_flaws": "TEXT",
                "service_history": "TEXT",
                "ownership_history": "TEXT",
                "seller_notes": "TEXT",
                "other_items": "TEXT",
                "engine": "TEXT",
                "images_json": "TEXT",
                "location_address": "TEXT",
                "location_url": "TEXT",
                "latitude": "REAL",
                "longitude": "REAL",
                "geo_failed": "BOOLEAN DEFAULT FALSE",
                "geo": "TEXT",
                "seller_url": "TEXT",
                "created_at": "TEXT",
                "updated_at": "TEXT",
                "posted_at": "TEXT",
                "deleted_at": "TEXT",
                "import_list_id": "INTEGER",
            }
            for col, typ in wanted.items():
                if col not in car_cols:
                    conn.exec_driver_sql(f"ALTER TABLE cars ADD COLUMN {col} {typ}")

        if "comments" in table_names:
            comment_cols = {col["name"] for col in inspector.get_columns("comments")}
            if "content" not in comment_cols and "comment" in comment_cols:
                # ``Comment.body`` maps to the ``content`` column in modern
                # deployments.  Rename the legacy ``comment`` column so ORM
                # writes issued by GPTCommenter target the correct field.
                conn.exec_driver_sql(
                    "ALTER TABLE comments RENAME COLUMN comment TO content"
                )
                comment_cols.remove("comment")
                comment_cols.add("content")
            if "parent_id" not in comment_cols:
                conn.exec_driver_sql("ALTER TABLE comments ADD COLUMN parent_id INTEGER")
            # ``CREATE INDEX IF NOT EXISTS`` is supported by both SQLite and
            # PostgreSQL.  Executing the statement even when the column was
            # newly added above keeps the logic simple and idempotent.
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_comments_parent_id ON comments(parent_id)"
            )
            if "automation_source" not in comment_cols:
                conn.exec_driver_sql(
                    "ALTER TABLE comments ADD COLUMN automation_source VARCHAR(64)"
                )
            if "automation_metadata" not in comment_cols:
                conn.exec_driver_sql(
                    "ALTER TABLE comments ADD COLUMN automation_metadata TEXT"
                )

        if "makes" in table_names:
            make_cols = {col["name"] for col in inspector.get_columns("makes")}
            if "logo_url" not in make_cols:
                conn.exec_driver_sql("ALTER TABLE makes ADD COLUMN logo_url TEXT")

        if "dealerships" in table_names:
            dealership_cols = {col["name"] for col in inspector.get_columns("dealerships")}
            if "location" not in dealership_cols:
                conn.exec_driver_sql("ALTER TABLE dealerships ADD COLUMN location TEXT")
            if "dealer_profile_id" not in dealership_cols:
                conn.exec_driver_sql("ALTER TABLE dealerships ADD COLUMN dealer_profile_id INTEGER")

        if "dealer_profiles" in table_names:
            dealer_profile_cols = {col["name"] for col in inspector.get_columns("dealer_profiles")}
            if "location" not in dealer_profile_cols:
                conn.exec_driver_sql("ALTER TABLE dealer_profiles ADD COLUMN location TEXT")
            if "requested_dealership_id" not in dealer_profile_cols:
                conn.exec_driver_sql(
                    "ALTER TABLE dealer_profiles ADD COLUMN requested_dealership_id INTEGER"
                )

def _normalize_db_url(raw_url: str) -> str:
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return raw_url


def _create_engine_for(url: str):
    current_settings = _get_settings()
    engine_kwargs: dict[str, Any] = {"echo": False}
    connect_args: dict[str, Any] = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        normalized = url.replace("sqlite:///", "sqlite://", 1)
        if normalized in {"sqlite://", "sqlite://:memory:", "sqlite:///:memory:"}:
            engine_kwargs["poolclass"] = StaticPool
    elif url.startswith("postgresql"):
        pool_size = int(getattr(current_settings, "DB_POOL_SIZE", 10) or 10)
        max_overflow = int(getattr(current_settings, "DB_MAX_OVERFLOW", 10) or 10)
        pool_timeout = int(getattr(current_settings, "DB_POOL_TIMEOUT_SECONDS", 30) or 30)
        pool_recycle = int(getattr(current_settings, "DB_POOL_RECYCLE_SECONDS", 1800) or 1800)
        pool_size = max(1, pool_size)
        max_overflow = max(0, max_overflow)
        pool_timeout = max(1, pool_timeout)
        pool_recycle = max(0, pool_recycle)
        engine_kwargs.update(
            {
                "pool_size": pool_size,
                "max_overflow": max_overflow,
                "pool_timeout": pool_timeout,
                "pool_recycle": pool_recycle,
                "pool_pre_ping": bool(getattr(current_settings, "DB_POOL_PRE_PING", True)),
                "pool_use_lifo": bool(getattr(current_settings, "DB_POOL_USE_LIFO", True)),
            }
        )
    return create_engine(url, connect_args=connect_args, **engine_kwargs)


def _ensure_engine_current() -> None:
    global engine
    desired_url = _normalize_db_url(_get_settings().DATABASE_URL)
    current_url = str(engine.url) if "engine" in globals() else None
    if current_url != desired_url:
        if "engine" in globals():
            try:
                engine.dispose()
            except Exception:
                pass
        engine = _create_engine_for(desired_url)


engine = _create_engine_for(_normalize_db_url(_get_settings().DATABASE_URL))


def _register_sqlite_functions(dbapi_connection, _):  # pragma: no cover - exercised in tests
    try:
        funcs = {
            "sin": math.sin,
            "cos": math.cos,
            "asin": math.asin,
            "acos": math.acos,
            "sqrt": math.sqrt,
            "radians": math.radians,
        }
        for name, fn in funcs.items():
            dbapi_connection.create_function(name, 1, fn)
        dbapi_connection.create_function("pow", 2, math.pow)
    except Exception:
        return


if _normalize_db_url(_get_settings().DATABASE_URL).startswith("sqlite"):
    event.listen(engine, "connect", _register_sqlite_functions)

def init_db():
    """Initialize application database."""
    _ensure_engine_current()
    # Create tables if they do not already exist.  Previously the ``cars``
    # table was omitted here because the project started with a pre-existing
    # database.  Deployments that began with an empty database therefore
    # never had the ``cars`` table created which meant API calls like
    # ``/cars`` would fail with "no such table: cars".  By including
    # ``Car.__table__`` in the create_all call we ensure the table exists on
    # fresh installs while remaining a no-op when the table is already
    # present.
    tables = [
        Make.__table__,
        Model.__table__,
        Category.__table__,
        Dealership.__table__,
        Car.__table__,

        CarImport.__table__,
        CarImportUndo.__table__,
        NeuroWraithRun.__table__,
        User.__table__,
        Role.__table__,
        UserRole.__table__,
        DealerProfile.__table__,
        DealerInventoryStat.__table__,
        Favorite.__table__,
        SavedSearch.__table__,
        Alert.__table__,
        SearchEvent.__table__,
        Job.__table__,
        CarLike.__table__,
        Comment.__table__,
        CommentBlocklist.__table__,
    ]
    if CommentReaction is not None:
        tables.append(CommentReaction.__table__)

    SQLModel.metadata.create_all(
        engine,
        tables=tables,
    )
    ensure_columns()
    current_settings = _get_settings()
    normalized_url = _normalize_db_url(current_settings.DATABASE_URL)
    if normalized_url.startswith("sqlite"):
        # --- ensure cars.lot_number exists for legacy DBs ---
        try:
            with Session(engine) as s:
                rows = s.exec(text("PRAGMA table_info('cars')")).all()
                # rows can be tuples or Row objects depending on SQLAlchemy version
                def colname(r):
                    try:
                        return r["name"]
                    except Exception:
                        return r[1]
                cols = {colname(r) for r in rows}
                if "lot_number" not in cols:
                    s.exec(text("ALTER TABLE cars ADD COLUMN lot_number TEXT"))
        except Exception as e:
            # don't block startup if pragma/alter fails
            print("init_db: lot_number ensure failed:", e)
        # ----------------------------------------------------
        with Session(engine) as s:
            # Ensure cars table has deleted_at column (soft delete)
            pragma = s.exec(text("PRAGMA table_info(cars)")).mappings().all()
            cols = {r['name'] for r in pragma}
            if "deleted_at" not in cols:
                s.exec(text("ALTER TABLE cars ADD COLUMN deleted_at TEXT"))
            # Indices
            s.exec(text("CREATE INDEX IF NOT EXISTS idx_cars_vin ON cars(vin)"))
            s.exec(text("CREATE INDEX IF NOT EXISTS idx_cars_year ON cars(year)"))
            s.exec(text("CREATE INDEX IF NOT EXISTS idx_cars_make ON cars(make)"))
            s.exec(text("CREATE INDEX IF NOT EXISTS idx_cars_model ON cars(model)"))
            s.exec(text("CREATE INDEX IF NOT EXISTS idx_cars_posted_at ON cars(posted_at)"))
            s.exec(text("CREATE INDEX IF NOT EXISTS idx_cars_status ON cars(auction_status)"))
            s.exec(text("CREATE INDEX IF NOT EXISTS idx_cars_import_list ON cars(import_list_id)"))
            s.commit()
    else:
        with Session(engine) as s:
            # Indices for non-SQLite databases
            s.exec(text("CREATE INDEX IF NOT EXISTS idx_cars_vin ON cars(vin)"))
            s.exec(text("CREATE INDEX IF NOT EXISTS idx_cars_year ON cars(year)"))
            s.exec(text("CREATE INDEX IF NOT EXISTS idx_cars_make ON cars(make)"))
            s.exec(text("CREATE INDEX IF NOT EXISTS idx_cars_model ON cars(model)"))
            s.exec(text("CREATE INDEX IF NOT EXISTS idx_cars_posted_at ON cars(posted_at)"))
            s.exec(text("CREATE INDEX IF NOT EXISTS idx_cars_status ON cars(auction_status)"))
            s.exec(text("CREATE INDEX IF NOT EXISTS idx_cars_import_list ON cars(import_list_id)"))
            s.commit()
