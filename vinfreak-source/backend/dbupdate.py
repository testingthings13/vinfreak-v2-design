import sqlite3
import json
from pathlib import Path
from datetime import datetime, timezone

BASE_DIR = Path(__file__).resolve().parent
# Paths


# Load JSON
data = json.loads(json_path.read_text(encoding="utf-8"))

# Connect to existing SQLite
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Make sure table exists
cur.execute("""
CREATE TABLE IF NOT EXISTS cars (
    vin TEXT PRIMARY KEY,
    make TEXT,
    model TEXT,
    trim TEXT,
    year INTEGER,
    mileage INTEGER,
    price REAL,
    currency TEXT,
    city TEXT,
    state TEXT,
    seller_type TEXT,
    exterior_color TEXT,
    interior_color TEXT,
    transmission TEXT,
    drivetrain TEXT,
    fuel_type TEXT,
    body_type TEXT,
    auction_status TEXT,
    end_time TEXT,
    time_left TEXT,
    number_of_views INTEGER,
    number_of_bids INTEGER,
    description TEXT,
    highlights TEXT,
    equipment TEXT,
    modifications TEXT,
    known_flaws TEXT,
    service_history TEXT,
    ownership_history TEXT,
    seller_notes TEXT,
    other_items TEXT,
    engine TEXT,
    posted_at TEXT,
    image_url TEXT,
    images_json TEXT,
    source TEXT,
    url TEXT
)
""")

# Insert new dataset
for car in data:
    cur.execute("""
    INSERT OR REPLACE INTO cars (
        vin, make, model, trim, year, mileage, price, currency, city, state, seller_type,
        exterior_color, interior_color, transmission, drivetrain, fuel_type,
    )
    """, (
        car.get("vin"),
        car.get("make"),
        car.get("model"),
        car.get("trim"),
        car.get("year"),
        car.get("mileage"),
        car.get("price"),
        car.get("currency"),
        car.get("city"),
        car.get("state"),
        car.get("seller_type"),
        car.get("exterior_color"),
        car.get("interior_color"),
        car.get("transmission"),
        car.get("drivetrain"),
        car.get("fuel_type"),
        car.get("body_type"),
        car.get("auction_status"),
        car.get("end_time"),
        car.get("time_left"),
        car.get("number_of_views"),
        car.get("number_of_bids"),
        car.get("description"),
        car.get("highlights"),
        car.get("equipment"),
        car.get("modifications"),
        car.get("known_flaws"),
        car.get("service_history"),
        car.get("ownership_history"),
        car.get("seller_notes"),
        car.get("other_items"),
        car.get("engine"),
        car.get("posted_at", datetime.now(timezone.utc).isoformat()),
        car.get("image_url"),
        car.get("images_json"),
        car.get("source", "imported"),
        car.get("url")
    ))

conn.commit()
conn.close()

print(f"✅ Added/updated {len(data)} cars into {db_path}")

