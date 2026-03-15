import sys, json, re, requests
try:
    from ..utils import ensure_live_status, strip_zip
except ImportError:  # pragma: no cover
    from backend.utils import ensure_live_status, strip_zip  # type: ignore
try:
    from ..utils_geo import coerce_coordinate
except ImportError:  # pragma: no cover
    from utils_geo import coerce_coordinate  # type: ignore
try:
    from ..utils.address_parse import from_location_address
    from ..utils.location import (
        extract_zip_from_text,
        get_default_resolver,
        strip_zip_from_state,
    )
except ImportError:  # pragma: no cover
    from utils.address_parse import from_location_address  # type: ignore
    from utils.location import (  # type: ignore
        extract_zip_from_text,
        get_default_resolver,
        strip_zip_from_state,
    )
from datetime import datetime
try:  # pragma: no cover - support running as a script
    from ..utils_make import canonicalize_make_name
except ImportError:  # pragma: no cover
    from backend.utils_make import canonicalize_make_name  # type: ignore

from .base import BaseImporter

API = "http://127.0.0.1:8000"


def parse_year(title, fallback=None):
    m = re.match(r'^\s*(\d{4})\b', title or "")
    return int(m.group(1)) if m else fallback


def parse_state(status, address):
    if status:
        m = re.search(r'\(([A-Z]{2})\)', status)
        if m:
            return m.group(1)
    if address:
        m = re.search(r'\b([A-Z]{2})\b', address)
        if m:
            return m.group(1)
    return None


def parse_city(address):
    if not address:
        return None
    return address.split(",")[0].strip() or None


def map_drivetrain(s):
    if not s:
        return None
    s = s.lower()
    if "rear" in s:
        return "RWD"
    if "front" in s:
        return "FWD"
    if "all" in s:
        return "AWD"
    if "4-wheel" in s or "4wd" in s or "four" in s:
        return "4WD"
    return None


def map_transmission(s):
    if not s:
        return None
    s = s.lower()
    if "manual" in s:
        return "manual"
    if "auto" in s:
        return "automatic"
    return s


def map_body_type(obj):
    bt = obj.get("bodyStayle") or obj.get("bodyStyle")
    return bt.lower() if isinstance(bt, str) else None


def map_price(obj):
    offer = obj.get("offer") or {}
    price = offer.get("price")
    try:
        return float(str(price).replace(",", "")) if price is not None else None
    except Exception:
        return None


def join_list(lst):
    if isinstance(lst, list):
        return " \u2022 ".join([str(x).strip() for x in lst if str(x).strip()])
    return None


def _join_str(s):
    if isinstance(s, str) and s.strip():
        return join_list([x.strip() for x in s.splitlines() if x.strip()])
    return None


class CarsAndBidsImporter(BaseImporter):
    """Importer for Cars & Bids JSON exports."""

    def normalize(self, item: dict) -> dict | None:
        title = item.get("title") or ""
        make = item.get("carMark") or item.get("make")
        make = canonicalize_make_name(make)
        model = item.get("model")
        vin = item.get("vin")
        year = item.get("year") or parse_year(title)
        price = map_price(item)

        mileage = item.get("mileage")
        loc = item.get("location") or {}
        address = loc.get("address")
        raw_address = address
        city = parse_city(address)
        state = parse_state(item.get("status"), address)
        address = strip_zip(address)
        parsed_city, parsed_state, zip5 = from_location_address(raw_address or "")
        if parsed_city and not city:
            city = parsed_city
        if parsed_state and not state:
            state = parsed_state
        location_url = loc.get("url")
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
        state_clean, state_zip = strip_zip_from_state(state)
        if state_clean is not None:
            state = state_clean
        if not zip5 and state_zip:
            zip5 = state_zip
        if not zip5:
            zip5 = extract_zip_from_text(raw_address)
        if latitude is None or longitude is None:
            resolver = get_default_resolver()
            resolved_lat = resolved_lng = None
            if city and state:
                # Prefer city/state centroids when both are available.
                resolved_lat, resolved_lng, *_ = resolver.resolve(
                    city=city,
                    state=state,
                    postal=None,
                )
            if (resolved_lat is None or resolved_lng is None) and zip5:
                resolved_lat, resolved_lng, *_ = resolver.resolve(
                    city=city,
                    state=state,
                    postal=zip5,
                )
            if (resolved_lat is None or resolved_lng is None) and state:
                resolved_lat, resolved_lng, *_ = resolver.resolve(
                    city=None,
                    state=state,
                    postal=None,
                )
            if latitude is None and resolved_lat is not None:
                latitude = resolved_lat
            if longitude is None and resolved_lng is not None:
                longitude = resolved_lng
        transmission = map_transmission(item.get("transmission"))
        drivetrain = map_drivetrain(item.get("drivetrain"))
        exterior_color = item.get("exteriorColor")
        interior_color = item.get("interiorColor")
        body_type = map_body_type(item)
        seller_type = item.get("sellerType")
        images = item.get("images") or []
        image_url = images[0] if images else None
        images_json = json.dumps(images, ensure_ascii=False) if images else None
        url = item.get("url")

        description = item.get("description")
        highlights = item.get("highlights") or join_list(item.get("highlightsList"))
        equipment = item.get("equipment") or join_list(item.get("equipmentList"))
        modifications = join_list(item.get("modificationsList"))
        known_flaws = (
            join_list(item.get("knownFlowsList") or item.get("knownFlawsList"))
            or _join_str(item.get("knownFlows") or item.get("knownFlaws"))
        )
        service_history = (
            join_list(item.get("serviceHistoryList"))
            or _join_str(item.get("serviceHistory"))
        )
        ownership_history = (
            join_list(item.get("ownershipHistoryList"))
            or _join_str(item.get("ownershipHistory"))
        )
        seller_notes = (
            join_list(item.get("sellerNotesList"))
            or _join_str(item.get("sellerNotes"))
        )
        other_items = (
            join_list(item.get("otherItemsList"))
            or _join_str(item.get("otherItems"))
        )
        engine = item.get("engine")

        auction_status = item.get("auctionStatus") or item.get("status")
        end_time = item.get("endTime")
        time_left = item.get("timeLeft")
        number_of_views = item.get("numberOfViews")
        number_of_bids = item.get("numberOfBids")
        currency = (item.get("offer") or {}).get("currency")

        trim = None
        if make and model and title:
            t = re.sub(r'^\s*\d{4}\s+', '', title)
            t = re.sub(fr'^{re.escape(make)}\s+', '', t, flags=re.I)
            t = re.sub(fr'^{re.escape(model)}\s*', '', t, flags=re.I).strip(" -–:|")
            trim = t if t and len(t) <= 40 else None

        if not (make and model and year and price is not None):
            return None

        m_val = None
        if isinstance(mileage, (int, float)):
            m_val = int(mileage)
        elif isinstance(mileage, str):
            s = mileage.replace(",", "").strip()
            if s.isdigit():
                m_val = int(s)

        data = {
            "vin": vin,
            "make": make,
            "model": model,
            "trim": trim,
            "year": int(year),
            "mileage": m_val,
            "price": price,
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
            "engine": engine,
            "image_url": image_url,
            "images_json": images_json,
            "source": "carsandbids",
            "url": url,
        }

        ensure_live_status(data)

        return data


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
    if len(sys.argv) < 2:
        print("Usage: python -m backend.importers.carsandbids <path_to_json>")
        sys.exit(1)
    path = sys.argv[1]
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"Loaded {len(data)} raw items")

    importer = CarsAndBidsImporter()
    records = []
    skipped = 0
    for it in data:
        row = importer.normalize(it)
        if row:
            records.append(row)
        else:
            skipped += 1
    print(f"Prepared {len(records)} items, skipped {skipped} (missing fields).")

    total_inserted = 0
    total_skipped = 0
    for batch in chunked(records, 200):
        r = requests.post(f"{API}/cars/bulk", json=batch, timeout=60)
        if r.ok:
            try:
                res = r.json()
                total_inserted += res.get("inserted", 0)
                total_skipped += res.get("skipped", 0)
                print("Batch OK:", res)
            except Exception:
                print("Batch OK but not JSON:", r.text[:400])
        else:
            print("Batch FAILED:", r.status_code, r.text[:400])

    print(f"Done. Inserted: {total_inserted}, skipped: {total_skipped}")


def normalize(item: dict) -> dict | None:
    """Convenience wrapper returning CarsAndBidsImporter().normalize."""
    return CarsAndBidsImporter().normalize(item)


if __name__ == "__main__":
    main()
