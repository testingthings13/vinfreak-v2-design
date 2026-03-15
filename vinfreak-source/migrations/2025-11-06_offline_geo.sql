-- Ensure PostGIS and proper coordinate columns
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS latitude  double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS geo_failed boolean DEFAULT false;

UPDATE cars SET geo_failed = false WHERE geo_failed IS NULL;

DO $$
DECLARE dt text;
BEGIN
  SELECT udt_name INTO dt
  FROM information_schema.columns
  WHERE table_name='cars' AND column_name='geo';
  IF dt IS DISTINCT FROM 'geography' THEN
    ALTER TABLE cars ADD COLUMN IF NOT EXISTS geo_geog geography(Point,4326);
    UPDATE cars
      SET geo_geog = ST_SetSRID(ST_MakePoint(longitude, latitude),4326)::geography
      WHERE geo_geog IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='cars' AND column_name='geo'
        AND data_type IN ('text','character varying')
    ) THEN
      UPDATE cars
        SET geo_geog = ST_GeogFromText(geo)
        WHERE geo_geog IS NULL AND geo ~ '^\s*POINT\s*\(';
    END IF;
    ALTER TABLE cars DROP COLUMN IF EXISTS geo;
    ALTER TABLE cars RENAME COLUMN geo_geog TO geo;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS cars_geo_gix ON cars USING GIST (geo);
