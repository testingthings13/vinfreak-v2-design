-- V2 core tables and additive columns (PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  status TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(email);

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT,
  description TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_name ON roles(name);

CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  role_id INTEGER NOT NULL REFERENCES roles(id),
  created_at TEXT,
  CONSTRAINT uq_user_roles_user_role UNIQUE (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS ix_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS ix_user_roles_role_id ON user_roles(role_id);

CREATE TABLE IF NOT EXISTS dealer_profiles (
  id SERIAL PRIMARY KEY,
  owner_user_id INTEGER REFERENCES users(id),
  display_name TEXT,
  status TEXT,
  contact_email TEXT,
  phone TEXT,
  website TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS ix_dealer_profiles_owner_user_id ON dealer_profiles(owner_user_id);

CREATE TABLE IF NOT EXISTS dealer_inventory_stats (
  id SERIAL PRIMARY KEY,
  dealer_profile_id INTEGER NOT NULL REFERENCES dealer_profiles(id),
  period_start TEXT,
  period_end TEXT,
  views INTEGER DEFAULT 0,
  leads INTEGER DEFAULT 0,
  favorites INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  detail_views INTEGER DEFAULT 0,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS ix_dealer_inventory_stats_profile_id ON dealer_inventory_stats(dealer_profile_id);

CREATE TABLE IF NOT EXISTS favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  car_id INTEGER NOT NULL REFERENCES cars(id),
  created_at TEXT,
  CONSTRAINT uq_favorites_user_car UNIQUE (user_id, car_id)
);

CREATE INDEX IF NOT EXISTS ix_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS ix_favorites_car_id ON favorites(car_id);

CREATE TABLE IF NOT EXISTS saved_searches (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT,
  filters_json TEXT NOT NULL DEFAULT '{}',
  notify_enabled BOOLEAN DEFAULT TRUE,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS ix_saved_searches_user_id ON saved_searches(user_id);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  saved_search_id INTEGER REFERENCES saved_searches(id),
  channel TEXT,
  frequency TEXT,
  last_sent_at TEXT,
  next_run_at TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS ix_alerts_user_id ON alerts(user_id);
CREATE INDEX IF NOT EXISTS ix_alerts_saved_search_id ON alerts(saved_search_id);

CREATE TABLE IF NOT EXISTS search_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  car_id INTEGER REFERENCES cars(id),
  event_type TEXT NOT NULL,
  weight DOUBLE PRECISION,
  context_json TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS ix_search_events_user_id ON search_events(user_id);
CREATE INDEX IF NOT EXISTS ix_search_events_car_id ON search_events(car_id);
CREATE INDEX IF NOT EXISTS ix_search_events_car_id_created_at ON search_events(car_id, created_at);

CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  created_by_user_id INTEGER REFERENCES users(id),
  car_import_id INTEGER REFERENCES car_imports(id),
  job_type TEXT NOT NULL,
  status TEXT,
  payload_json TEXT,
  result_json TEXT,
  error TEXT,
  scheduled_for TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS ix_jobs_created_by_user_id ON jobs(created_by_user_id);
CREATE INDEX IF NOT EXISTS ix_jobs_car_import_id ON jobs(car_import_id);

ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS dealer_profile_id INTEGER REFERENCES dealer_profiles(id),
  ADD COLUMN IF NOT EXISTS freakscore DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS engagement_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS quality_score DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS ix_cars_dealer_profile_id ON cars(dealer_profile_id);

ALTER TABLE dealerships
  ADD COLUMN IF NOT EXISTS dealer_profile_id INTEGER REFERENCES dealer_profiles(id);

CREATE INDEX IF NOT EXISTS ix_dealerships_dealer_profile_id ON dealerships(dealer_profile_id);
