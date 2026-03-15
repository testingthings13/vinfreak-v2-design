-- Dealer portal fields (PostgreSQL)

ALTER TABLE dealer_profiles
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS requested_dealership_id INTEGER REFERENCES dealerships(id);

CREATE INDEX IF NOT EXISTS ix_dealer_profiles_requested_dealership_id
  ON dealer_profiles(requested_dealership_id);
