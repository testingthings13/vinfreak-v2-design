#!/usr/bin/env python3
"""Backfill ``cars`` latitude/longitude/geo columns from offline datasets."""

from __future__ import annotations

import os
import sys
from typing import Sequence

from sqlalchemy import create_engine, text

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.utils.address_parse import from_location_address
from backend.utils.georesolver import GeoResolver


DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://vinfreak_prod_db_user:oJPcOci5K9iN6td8PMDdpeXzsPK3bGNF@dpg-d2tcnter433s73d9ncvg-a.frankfurt-postgres.render.com/vinfreak_prod_db",
)

engine = create_engine(DB_URL, future=True)
geo = GeoResolver(os.path.join(REPO_ROOT, "backend", "data", "geoindex"))
BATCH = 1000


def ensure_schema() -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
        conn.execute(
            text(
                """
                ALTER TABLE cars
                  ADD COLUMN IF NOT EXISTS latitude  double precision,
                  ADD COLUMN IF NOT EXISTS longitude double precision,
                  ADD COLUMN IF NOT EXISTS geo_failed boolean DEFAULT false;
                """
            )
        )
        conn.execute(text("UPDATE cars SET geo_failed = false WHERE geo_failed IS NULL;"))
        dt = conn.execute(
            text(
                """
                SELECT udt_name
                FROM information_schema.columns
                WHERE table_name='cars' AND column_name='geo'
                """
            )
        ).scalar()
        if dt != "geography":
            conn.execute(text("ALTER TABLE cars ADD COLUMN IF NOT EXISTS geo_geog geography(Point,4326);"))
            conn.execute(
                text(
                    """
                    UPDATE cars
                      SET geo_geog = ST_SetSRID(ST_MakePoint(longitude, latitude),4326)::geography
                      WHERE geo_geog IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;
                    """
                )
            )
            conn.execute(
                text(
                    r"""
                    DO $$
                    BEGIN
                      IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name='cars' AND column_name='geo'
                          AND data_type IN ('text','character varying')
                      ) THEN
                        EXECUTE $c$
                          UPDATE cars
                            SET geo_geog = ST_GeogFromText(geo)
                            WHERE geo_geog IS NULL AND geo ~ '^\s*POINT\s*\('
                        $c$;
                      END IF;
                    END$$;
                    """
                )
            )
            conn.execute(text("ALTER TABLE cars DROP COLUMN IF EXISTS geo;"))
            conn.execute(text("ALTER TABLE cars RENAME COLUMN geo_geog TO geo;"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS cars_geo_gix ON cars USING GIST (geo);"))


def _process_batch(rows: Sequence[object]) -> None:
    if not rows:
        return

    with engine.begin() as conn:
        updated = failed = 0
        for row in rows:
            mapping = dict(row)
            car_id = mapping["id"]
            addr = mapping.get("location_address") or ""
            city, state, zip5 = from_location_address(addr)

            lat, lng, *_ = geo.resolve(city=city, state=state, postal=zip5)

            if (lat is None or lng is None) and state:
                lat, lng, *_ = geo.resolve(city=None, state=state, postal=None)

            if lat is not None and lng is not None:
                conn.execute(
                    text(
                        """
                        UPDATE cars
                           SET latitude=:lat,
                               longitude=:lng,
                               geo=ST_SetSRID(ST_MakePoint(:lng,:lat),4326)::geography,
                               geo_failed=false
                         WHERE id=:id
                        """
                    ),
                    {"id": car_id, "lat": lat, "lng": lng},
                )
                updated += 1
            else:
                conn.execute(
                    text("UPDATE cars SET geo_failed=true WHERE id=:id"),
                    {"id": car_id},
                )
                failed += 1
        print(f"✅ batch={len(rows)} updated={updated} failed={failed}")


def backfill() -> None:
    while True:
        with engine.connect() as conn:
            rows = (
                conn.execute(
                    text(
                        """
                        SELECT id, location_address
                          FROM cars
                         WHERE (latitude IS NULL OR longitude IS NULL OR geo IS NULL)
                           AND COALESCE(geo_failed, false) = false
                         LIMIT :n
                        """
                    ),
                    {"n": BATCH},
                )
                .mappings()
                .all()
            )
        if not rows:
            break
        _process_batch(rows)
    print("Done.")


if __name__ == "__main__":
    ensure_schema()
    backfill()

