-- Speed up nearest + filters
CREATE INDEX IF NOT EXISTS idx_cars_lat_lng ON cars (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_cars_auction_status ON cars (auction_status);
CREATE INDEX IF NOT EXISTS idx_cars_status ON cars (status);
CREATE INDEX IF NOT EXISTS idx_cars_make_model ON cars (make_id, model_id);
