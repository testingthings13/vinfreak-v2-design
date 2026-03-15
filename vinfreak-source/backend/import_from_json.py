import sys, json, re, requests, logging
try:
    from .utils import strip_zip
except ImportError:  # pragma: no cover
    from utils import strip_zip
try:
    from .utils_make import load_make_cache, match_make, canonicalize_make_name
except ImportError:  # pragma: no cover
    from utils_make import load_make_cache, match_make, canonicalize_make_name
try:
    from .utils_geo import coerce_coordinate, geocode_city_state
except ImportError:  # pragma: no cover
    from utils_geo import coerce_coordinate, geocode_city_state  # type: ignore
from datetime import datetime, timezone

API = "http://127.0.0.1:8000"

logger = logging.getLogger(__name__)

def parse_year(title, fallback=None):
    m = re.match(r'^\s*(\d{4})\b', title or "")
    return int(m.group(1)) if m else fallback

def parse_state(status, address):
    if status:
        m = re.search(r'\(([A-Z]{2})\)', status)
        if m: return m.group(1)
    if address:
        m = re.search(r'\b([A-Z]{2})\b', address)
        if m: return m.group(1)
    return None

def parse_city(address):
    if not address: return None
    parts = [p.strip() for p in address.split(",")]
    return parts[0] if parts else None

def map_drivetrain(s):
    if not s: return None
    s = s.lower()
    if "rear" in s: return "RWD"
    if "front" in s: return "FWD"
    if "all" in s: return "AWD"
    if "4-wheel" in s or "4wd" in s or "four" in s: return "4WD"
    return None

def map_transmission(s):
    if not s: return None
    s = s.lower()
    if "manual" in s: return "manual"
    if "auto" in s: return "automatic"
    return s

def num_clean(x, float_ok=False):
    if x is None: return None
    s = str(x).replace(",", "").strip()
    if s == "": return None
    try:
        return float(s) if float_ok else int(float(s))
    except:
        return None

def join_list(lst):
    if isinstance(lst, list):
        return " • ".join([str(x).strip() for x in lst if str(x).strip()])
    return None

def normalize(item):
    # core
    title = item.get("title")
    raw_make = item.get("carMark") or item.get("make")
    if isinstance(raw_make, str):
        raw_make = raw_make.strip() or None
    make = canonicalize_make_name(raw_make)
    model = item.get("model")
    vin = item.get("vin")
    year = item.get("year") or parse_year(title)
    price = num_clean(((item.get("offer") or {}).get("price")), float_ok=True)
    currency = (item.get("offer") or {}).get("currency")

    mileage = num_clean(item.get("mileage"))
    loc = item.get("location") or {}
    address = loc.get("address")
    city = parse_city(address)
    state = parse_state(item.get("status"), address)
    address = strip_zip(address)
    latitude = coerce_coordinate(
        loc.get("latitude")
        or loc.get("lat")
        or item.get("latitude")
        or item.get("lat")
    )
    longitude = coerce_coordinate(
        loc.get("longitude")
        or loc.get("lng")
        or loc.get("lon")
        or item.get("longitude")
        or item.get("lng")
        or item.get("lon")
    )
    if (latitude is None or longitude is None) and city and state:
        coords = geocode_city_state(city, state)
        if coords:
            latitude, longitude = coords

    transmission = map_transmission(item.get("transmission"))
    drivetrain = map_drivetrain(item.get("drivetrain"))
    exterior_color = item.get("exteriorColor")
    interior_color = item.get("interiorColor")
    body_type = item.get("bodyStyle") or item.get("bodyStayle")

    seller_type = item.get("sellerType")
    url = item.get("url")
    images_raw = item.get("images") or []
    imgs = []
    seen_urls: set[str] = set()
    for u in images_raw:
        u = str(u).strip()
        if u and u not in seen_urls:
            imgs.append(u)
            seen_urls.add(u)
    image_url = imgs[0] if imgs else None
    images_json = json.dumps(imgs[1:], ensure_ascii=False) if len(imgs) > 1 else None

    # extra meta
    auction_status = item.get("auctionStatus") or item.get("status")
    end_time = item.get("endTime")
    time_left = item.get("timeLeft")
    number_of_views = num_clean(item.get("numberOfViews"))
    number_of_bids = num_clean(item.get("numberOfBids"))

    # text blocks / lists
    description = item.get("description")
    highlights = item.get("highlights") or join_list(item.get("highlightsList"))
    equipment = item.get("equipment") or join_list(item.get("equipmentList"))
    modifications = join_list(item.get("modificationsList"))
    known_flaws = join_list(item.get("knownFlowsList") or item.get("knownFlawsList"))
    service_history = join_list(item.get("serviceHistoryList"))
    ownership_history = item.get("ownershipHistory")
    seller_notes = item.get("sellerNotes")
    other_items = item.get("otherItems")

    # seller/location
    location_url = loc.get("url")
    seller = item.get("seller") or {}
    seller_name = seller.get("name")
    seller_url = seller.get("url")
    seller_rating = seller.get("rating")
    seller_reviews = seller.get("reviews")

    lot_number = item.get("lotNumber") or item.get("lot_number")
    if not lot_number and url:
        m = re.search(r"/auctions/([^/]+)/", url)
        if m:
            lot_number = m.group(1)

    # basic validation for our API
    if not (model and year and price is not None and (make or title)):
        return None

    return {
        "vin": vin,
        "make": make,
        "model": model,
        "trim": None,
        "year": int(year),
        "mileage": mileage,
        "price": float(price),
        "currency": currency,
        "city": city,
        "state": state,
        "latitude": latitude,
        "longitude": longitude,
        "seller_type": seller_type,
        "exterior_color": exterior_color,
        "interior_color": interior_color,
        "transmission": transmission,
        "drivetrain": drivetrain,
        "fuel_type": None,
        "body_type": body_type,
        "auction_status": auction_status,
        "lot_number": lot_number,
        "end_time": end_time,
        "time_left": time_left,
        "number_of_views": number_of_views,
        "number_of_bids": number_of_bids,
        "description": description,
        "highlights": highlights,
        "equipment": equipment,
        "modifications": modifications,
        "known_flaws": known_flaws,
        "service_history": service_history,
        "ownership_history": ownership_history,
        "seller_notes": seller_notes,
        "other_items": other_items,
        "engine": item.get("engine"),
        "image_url": image_url,
        "images_json": images_json,
        "location_address": address,
        "location_url": location_url,
        "seller_name": seller_name,
        "seller_url": seller_url,
        "seller_rating": seller_rating,
        "seller_reviews": seller_reviews,
        "posted_at": datetime.now(timezone.utc).isoformat(),
        "source": "json_import",
        "url": url,
        "title": title,
    }


def get_importer(dealership: str, dealership_id: int | None = None):
    """Return a normalizer function and dealership details."""
    slug = (dealership or "").strip().lower()
    imp = normalize  # default normalizer defined above
    resolved_id = dealership_id

    try:
        if slug == "porsche":
            import import_cars as mod  # type: ignore
            imp = mod.normalize
        elif slug == "carsandbids":
            import import_carsandbids as mod  # type: ignore
            imp = mod.normalize
    except Exception:
        pass

    # Attempt to resolve dealership id from API if not provided explicitly
    if resolved_id is None and slug:
        try:
            resp = requests.get(f"{API}/dealerships", timeout=10)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.error("Failed to fetch dealership list: %s", exc)
            raise RuntimeError(f"Failed to resolve dealership '{slug}'") from exc

        if not isinstance(data, list):
            logger.error("Unexpected dealerships response format: %r", data)
            raise RuntimeError(f"Failed to resolve dealership '{slug}'")

        for d in data:
            if not isinstance(d, dict):
                logger.error("Invalid dealership entry: %r", d)
                raise RuntimeError(f"Failed to resolve dealership '{slug}'")
            if str(d.get("id")) == slug or d.get("name", "").lower() == slug:
                resolved_id = d.get("id")
                break

        if resolved_id is None:
            raise RuntimeError(f"Dealership '{slug}' could not be resolved")

    source = slug or "json_import"
    return imp, resolved_id, source

def chunked(seq, n):
    buf = []
    for x in seq:
        buf.append(x)
        if len(buf) >= n:
            yield buf
            buf = []
    if buf:
        yield buf

def main():
    if len(sys.argv) < 3:
        print("Usage: python import_from_json.py <dealership> <path_to_json> [dealership_id]")
        sys.exit(1)

    dealership = sys.argv[1]
    path = sys.argv[2]
    dealership_id = int(sys.argv[3]) if len(sys.argv) > 3 else None
    data = json.load(open(path, "r", encoding="utf-8"))
    print(f"Loaded {len(data)} raw items")

    importer, dealership_id, source = get_importer(dealership, dealership_id)

    records, skipped = [], 0
    for it in data:
        r = importer(it)
        if r:
            if dealership_id is not None:
                r["dealership_id"] = dealership_id
            r["source"] = r.get("source") or source
            records.append(r)
        else:
            skipped += 1
    print(f"Prepared {len(records)} items, skipped {skipped}.")

    try:
        make_cache = load_make_cache()
    except Exception:
        make_cache = []
    if make_cache:
        for row in records:
            if row.get("make_id"):
                continue
            inferred_id, inferred_name = match_make(
                row.get("make"),
                row.get("title"),
                make_cache,
            )
            if inferred_id:
                row["make_id"] = inferred_id
                row["make"] = inferred_name

    ins = sk = 0
    for batch in chunked(records, 200):
        resp = requests.post(f"{API}/admin/cars/bulk", json=batch, timeout=60)
        if resp.ok:
            res = resp.json()
            ins += res.get("inserted", 0)
            sk += res.get("skipped", 0)
            print("Batch OK:", res)
        else:
            print("Batch FAILED:", resp.status_code, resp.text[:300])
    print(f"Done. Inserted: {ins}, skipped: {sk}")

if __name__ == "__main__":
    main()
