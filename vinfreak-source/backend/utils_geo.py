"""Geospatial helpers used by importers and the /cars API."""

from __future__ import annotations

import csv
from functools import lru_cache
import ipaddress
import math
from pathlib import Path
import re
from typing import Any

import requests


EARTH_RADIUS_MILES = 3958.7613


def _coerce_float(value) -> float | None:
    """Best-effort conversion of a coordinate to ``float``."""

    if value is None:
        return None
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, int):
        return float(value)
    try:
        text = str(value).strip()
    except Exception:
        return None
    if not text:
        return None
    try:
        parsed = float(text)
    except ValueError:
        return None
    if math.isnan(parsed) or math.isinf(parsed):
        return None
    return parsed


def coerce_coordinate(value) -> float | None:
    """Public helper for safely parsing latitude/longitude values."""

    return _coerce_float(value)


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", " ", text.lower())
    slug = re.sub(r"\s+", " ", slug).strip()
    return slug


STATE_NAME_TO_ABBR: dict[str, str] = {
    "alabama": "al",
    "alaska": "ak",
    "arizona": "az",
    "arkansas": "ar",
    "california": "ca",
    "colorado": "co",
    "connecticut": "ct",
    "delaware": "de",
    "district of columbia": "dc",
    "florida": "fl",
    "georgia": "ga",
    "hawaii": "hi",
    "idaho": "id",
    "illinois": "il",
    "indiana": "in",
    "iowa": "ia",
    "kansas": "ks",
    "kentucky": "ky",
    "louisiana": "la",
    "maine": "me",
    "maryland": "md",
    "massachusetts": "ma",
    "michigan": "mi",
    "minnesota": "mn",
    "mississippi": "ms",
    "missouri": "mo",
    "montana": "mt",
    "nebraska": "ne",
    "nevada": "nv",
    "new hampshire": "nh",
    "new jersey": "nj",
    "new mexico": "nm",
    "new york": "ny",
    "north carolina": "nc",
    "north dakota": "nd",
    "ohio": "oh",
    "oklahoma": "ok",
    "oregon": "or",
    "pennsylvania": "pa",
    "rhode island": "ri",
    "south carolina": "sc",
    "south dakota": "sd",
    "tennessee": "tn",
    "texas": "tx",
    "utah": "ut",
    "vermont": "vt",
    "virginia": "va",
    "washington": "wa",
    "west virginia": "wv",
    "wisconsin": "wi",
    "wyoming": "wy",
}


_STATE_SLUG_TO_ABBR: dict[str, str] = {
    _slugify(name): abbr for name, abbr in STATE_NAME_TO_ABBR.items()
}
_STATE_SLUG_TO_ABBR.update({abbr.lower(): abbr for abbr in STATE_NAME_TO_ABBR.values()})
_STATE_SLUG_TO_ABBR.update({"washington dc": "dc", "dc": "dc"})
_STATE_SLUG_TO_ABBR.update({"districtofcolumbia": "dc"})


CITY_ALIASES: dict[str, str] = {
    "ft worth": "fort worth",
    "ft. worth": "fort worth",
    "ft worth tx": "fort worth",  # defensive when city includes state
    "ft lauderdale": "fort lauderdale",
    "ft. lauderdale": "fort lauderdale",
    "ft myers": "fort myers",
    "ft. myers": "fort myers",
    "st louis": "saint louis",
    "st. louis": "saint louis",
    "st paul": "saint paul",
    "st. paul": "saint paul",
    "st petersburg": "saint petersburg",
    "st. petersburg": "saint petersburg",
    "washington dc": "washington",
    "washington d c": "washington",
    "d.c": "washington",
    "nyc": "new york",
    "la": "los angeles",
    "sf": "san francisco",
    "k c": "kansas city",
    "kansas city missouri": "kansas city",
}


def _normalize_city(city: str) -> str:
    slug = _slugify(city)
    if not slug:
        return ""
    alias = CITY_ALIASES.get(slug)
    if alias:
        return alias
    return slug


def _normalize_state(state: str) -> str | None:
    slug = _slugify(state)
    if not slug:
        return None
    # Allow things like "texas" or "tx"
    abbr = _STATE_SLUG_TO_ABBR.get(slug)
    if abbr:
        return abbr
    # Sometimes state abbreviations come without spacing ("northcarolina")
    abbr = _STATE_SLUG_TO_ABBR.get(slug.replace(" ", ""))
    if abbr:
        return abbr
    return None


STATE_CENTROIDS: dict[str, tuple[float, float]] = {
    "al": (32.3792, -86.3077),
    "ak": (58.3019, -134.4197),
    "az": (33.4484, -112.0740),
    "ar": (34.7465, -92.2896),
    "ca": (38.5816, -121.4944),
    "co": (39.7392, -104.9903),
    "ct": (41.7658, -72.6734),
    "dc": (38.9072, -77.0369),
    "de": (39.1582, -75.5244),
    "fl": (30.4383, -84.2807),
    "ga": (33.7490, -84.3880),
    "hi": (21.3069, -157.8583),
    "id": (43.6150, -116.2023),
    "il": (39.7817, -89.6501),
    "in": (39.7684, -86.1581),
    "ia": (41.5868, -93.6250),
    "ks": (39.0473, -95.6752),
    "ky": (38.2009, -84.8733),
    "la": (30.4515, -91.1871),
    "ma": (42.3601, -71.0589),
    "md": (38.9784, -76.4922),
    "me": (44.3106, -69.7795),
    "mi": (42.7325, -84.5555),
    "mn": (44.9537, -93.0900),
    "mo": (38.5767, -92.1735),
    "ms": (32.2988, -90.1848),
    "mt": (46.5891, -112.0391),
    "nc": (35.7796, -78.6382),
    "nd": (46.8083, -100.7837),
    "ne": (40.8136, -96.7026),
    "nh": (43.2081, -71.5376),
    "nj": (40.2171, -74.7429),
    "nm": (35.6870, -105.9378),
    "nv": (39.1638, -119.7674),
    "ny": (42.6526, -73.7562),
    "oh": (39.9612, -82.9988),
    "ok": (35.4676, -97.5164),
    "or": (44.9429, -123.0351),
    "pa": (40.2732, -76.8867),
    "ri": (41.8240, -71.4128),
    "sc": (34.0007, -81.0348),
    "sd": (44.3683, -100.3509),
    "tn": (36.1627, -86.7816),
    "tx": (30.2672, -97.7431),
    "ut": (40.7608, -111.8910),
    "va": (37.5407, -77.4360),
    "vt": (44.2601, -72.5754),
    "wa": (47.0379, -122.9007),
    "wi": (43.0731, -89.4012),
    "wv": (38.3498, -81.6326),
    "wy": (41.1400, -104.8202),
    "pr": (18.4655, -66.1057),
    "gu": (13.4443, 144.7937),
    "vi": (18.3419, -64.9307),
}


KNOWN_COORDINATES: dict[tuple[str, str], tuple[float, float]] = {
    ("anchorage", "ak"): (61.2181, -149.9003),
    ("ann arbor", "mi"): (42.2808, -83.7430),
    ("arlington", "tx"): (32.7357, -97.1081),
    ("arvada", "co"): (39.8028, -105.0875),
    ("asheville", "nc"): (35.5951, -82.5515),
    ("atlanta", "ga"): (33.7490, -84.3880),
    ("augusta", "ga"): (33.4735, -82.0105),
    ("austin", "tx"): (30.267153, -97.743057),
    ("bakersfield", "ca"): (35.3733, -119.0187),
    ("baltimore", "md"): (39.2904, -76.6122),
    ("baton rouge", "la"): (30.4515, -91.1871),
    ("bellevue", "wa"): (47.6104, -122.2007),
    ("birmingham", "al"): (33.5186, -86.8104),
    ("boston", "ma"): (42.3601, -71.0589),
    ("boise", "id"): (43.6150, -116.2023),
    ("boulder", "co"): (40.01499, -105.27055),
    ("buffalo", "ny"): (42.8864, -78.8784),
    ("cary", "nc"): (35.7915, -78.7811),
    ("charlotte", "nc"): (35.2271, -80.8431),
    ("chattanooga", "tn"): (35.0456, -85.3097),
    ("chandler", "az"): (33.3062, -111.8413),
    ("chesapeake", "va"): (36.7682, -76.2875),
    ("chicago", "il"): (41.8781, -87.6298),
    ("chula vista", "ca"): (32.6401, -117.0842),
    ("cincinnati", "oh"): (39.1031, -84.5120),
    ("cleveland", "oh"): (41.4993, -81.6944),
    ("colorado springs", "co"): (38.8339, -104.8214),
    ("columbia", "sc"): (34.0007, -81.0348),
    ("columbus", "oh"): (39.9612, -82.9988),
    ("corpus christi", "tx"): (27.8006, -97.3964),
    ("dallas", "tx"): (32.776665, -96.796989),
    ("dayton", "oh"): (39.7589, -84.1916),
    ("denver", "co"): (39.7392, -104.9903),
    ("des moines", "ia"): (41.5868, -93.6250),
    ("detroit", "mi"): (42.3314, -83.0458),
    ("denton", "tx"): (33.2148, -97.1331),
    ("durham", "nc"): (35.9940, -78.8986),
    ("el paso", "tx"): (31.7619, -106.4850),
    ("fayetteville", "ar"): (36.0822, -94.1719),
    ("fort collins", "co"): (40.5853, -105.0844),
    ("fort lauderdale", "fl"): (26.1224, -80.1373),
    ("fort worth", "tx"): (32.7555, -97.3308),
    ("fremont", "ca"): (37.5483, -121.9886),
    ("fresno", "ca"): (36.7378, -119.7871),
    ("frisco", "tx"): (33.1507, -96.8236),
    ("gilbert", "az"): (33.3528, -111.7890),
    ("glendale", "az"): (33.5387, -112.1860),
    ("grand rapids", "mi"): (42.9634, -85.6681),
    ("greensboro", "nc"): (36.0726, -79.7920),
    ("honolulu", "hi"): (21.3069, -157.8583),
    ("houston", "tx"): (29.760427, -95.369804),
    ("huntsville", "al"): (34.7304, -86.5861),
    ("indianapolis", "in"): (39.7684, -86.1581),
    ("irvine", "ca"): (33.6846, -117.8265),
    ("jackson", "ms"): (32.2988, -90.1848),
    ("jacksonville", "fl"): (30.3322, -81.6557),
    ("jersey city", "nj"): (40.7178, -74.0431),
    ("kansas city", "mo"): (39.0997, -94.5786),
    ("knoxville", "tn"): (35.9606, -83.9207),
    ("las vegas", "nv"): (36.1699, -115.1398),
    ("lexington", "ky"): (38.0406, -84.5037),
    ("lincoln", "ne"): (40.8136, -96.7026),
    ("little rock", "ar"): (34.7465, -92.2896),
    ("long beach", "ca"): (33.7701, -118.1937),
    ("los angeles", "ca"): (34.052235, -118.243683),
    ("louisville", "ky"): (38.2527, -85.7585),
    ("lubbock", "tx"): (33.5779, -101.8552),
    ("madison", "wi"): (43.0731, -89.4012),
    ("memphis", "tn"): (35.1495, -90.0490),
    ("mesa", "az"): (33.4152, -111.8315),
    ("miami", "fl"): (25.761681, -80.191788),
    ("milwaukee", "wi"): (43.0389, -87.9065),
    ("minneapolis", "mn"): (44.9778, -93.2650),
    ("modesto", "ca"): (37.6391, -120.9969),
    ("montgomery", "al"): (32.3792, -86.3077),
    ("nashville", "tn"): (36.1627, -86.7816),
    ("new orleans", "la"): (29.9511, -90.0715),
    ("new york", "ny"): (40.712776, -74.005974),
    ("newark", "nj"): (40.7357, -74.1724),
    ("north las vegas", "nv"): (36.1989, -115.1175),
    ("oakland", "ca"): (37.8044, -122.2712),
    ("oklahoma city", "ok"): (35.4676, -97.5164),
    ("omaha", "ne"): (41.2565, -95.9345),
    ("orlando", "fl"): (28.5383, -81.3792),
    ("pasadena", "ca"): (34.1478, -118.1445),
    ("pearland", "tx"): (29.5636, -95.2860),
    ("philadelphia", "pa"): (39.9526, -75.1652),
    ("phoenix", "az"): (33.4484, -112.0740),
    ("pittsburgh", "pa"): (40.4406, -79.9959),
    ("plano", "tx"): (33.0198, -96.6989),
    ("port st lucie", "fl"): (27.2730, -80.3582),
    ("portland", "or"): (45.5152, -122.6784),
    ("providence", "ri"): (41.8240, -71.4128),
    ("raleigh", "nc"): (35.7796, -78.6382),
    ("reno", "nv"): (39.5296, -119.8138),
    ("richmond", "va"): (37.5407, -77.4360),
    ("riverside", "ca"): (33.9806, -117.3755),
    ("sacramento", "ca"): (38.5816, -121.4944),
    ("saint louis", "mo"): (38.6270, -90.1994),
    ("saint paul", "mn"): (44.9537, -93.0900),
    ("salem", "or"): (44.9429, -123.0351),
    ("salt lake city", "ut"): (40.7608, -111.8910),
    ("san antonio", "tx"): (29.4241, -98.4936),
    ("san diego", "ca"): (32.7157, -117.1611),
    ("san francisco", "ca"): (37.774929, -122.419418),
    ("san jose", "ca"): (37.3382, -121.8863),
    ("santa ana", "ca"): (33.7455, -117.8677),
    ("savannah", "ga"): (32.0809, -81.0912),
    ("scottsdale", "az"): (33.4942, -111.9261),
    ("seattle", "wa"): (47.6062, -122.3321),
    ("shreveport", "la"): (32.5252, -93.7502),
    ("spokane", "wa"): (47.6588, -117.4260),
    ("springfield", "il"): (39.7817, -89.6501),
    ("springfield", "mo"): (37.2089, -93.2923),
    ("st petersburg", "fl"): (27.7676, -82.6403),
    ("tampa", "fl"): (27.9506, -82.4572),
    ("tempe", "az"): (33.4255, -111.9400),
    ("tucson", "az"): (32.2226, -110.9747),
    ("tulsa", "ok"): (36.1539, -95.9928),
    ("virginia beach", "va"): (36.8529, -75.9780),
    ("waco", "tx"): (31.5493, -97.1467),
    ("washington", "dc"): (38.9072, -77.0369),
    ("wichita", "ks"): (37.6872, -97.3301),
    ("wilmington", "nc"): (34.2257, -77.9447),
}


def _normalize_zip(value: str | int | None) -> str | None:
    """Return a clean 5-digit ZIP code or ``None`` if not parseable."""

    if value is None:
        return None
    try:
        text = str(value)
    except Exception:
        return None
    digits = re.sub(r"[^0-9]", "", text)
    if len(digits) < 5:
        return None
    return digits[:5]


STATE_ZIP_RANGES: dict[str, tuple[tuple[int, int], ...]] = {
    "AL": ((350, 369),),
    "AK": ((995, 999),),
    "AZ": ((850, 865),),
    "AR": ((716, 729), (755, 755)),
    "CA": ((900, 961),),
    "CO": ((800, 816),),
    "CT": ((60, 69),),
    "DC": ((200, 205),),
    "DE": ((197, 199),),
    "FL": ((320, 349),),
    "GA": ((300, 319), (398, 399)),
    "HI": ((967, 968),),
    "IA": ((500, 528),),
    "ID": ((832, 838),),
    "IL": ((600, 629),),
    "IN": ((460, 479),),
    "KS": ((660, 679),),
    "KY": ((400, 427),),
    "LA": ((700, 715),),
    "MA": ((10, 27), (55, 55)),
    "MD": ((206, 219),),
    "ME": ((39, 49),),
    "MI": ((480, 499),),
    "MN": ((550, 567),),
    "MO": ((630, 658),),
    "MS": ((386, 397),),
    "MT": ((590, 599),),
    "NC": ((270, 289),),
    "ND": ((580, 588),),
    "NE": ((680, 693),),
    "NH": ((30, 38),),
    "NJ": ((70, 89),),
    "NM": ((870, 884),),
    "NV": ((889, 898),),
    "NY": ((5, 5), (100, 149)),
    "OH": ((430, 459),),
    "OK": ((730, 749),),
    "OR": ((970, 979),),
    "PA": ((150, 196),),
    "PR": ((6, 9),),
    "RI": ((28, 29),),
    "SC": ((290, 299),),
    "SD": ((570, 577),),
    "TN": ((370, 385),),
    "TX": ((733, 733), (750, 799), (885, 885)),
    "UT": ((840, 847),),
    "VA": ((201, 201), (220, 246)),
    "VT": ((50, 59),),
    "WA": ((980, 994),),
    "WI": ((530, 549),),
    "WV": ((247, 268),),
    "WY": ((820, 831),),
    "GU": ((969, 969),),
    "VI": ((8, 8),),
}

STATE_CAPITAL_BY_ABBR: dict[str, str] = {
    "AL": "Montgomery",
    "AK": "Juneau",
    "AZ": "Phoenix",
    "AR": "Little Rock",
    "CA": "Sacramento",
    "CO": "Denver",
    "CT": "Hartford",
    "DC": "Washington",
    "DE": "Dover",
    "FL": "Tallahassee",
    "GA": "Atlanta",
    "HI": "Honolulu",
    "IA": "Des Moines",
    "ID": "Boise",
    "IL": "Springfield",
    "IN": "Indianapolis",
    "KS": "Topeka",
    "KY": "Frankfort",
    "LA": "Baton Rouge",
    "MA": "Boston",
    "MD": "Annapolis",
    "ME": "Augusta",
    "MI": "Lansing",
    "MN": "Saint Paul",
    "MO": "Jefferson City",
    "MS": "Jackson",
    "MT": "Helena",
    "NC": "Raleigh",
    "ND": "Bismarck",
    "NE": "Lincoln",
    "NH": "Concord",
    "NJ": "Trenton",
    "NM": "Santa Fe",
    "NV": "Carson City",
    "NY": "Albany",
    "OH": "Columbus",
    "OK": "Oklahoma City",
    "OR": "Salem",
    "PA": "Harrisburg",
    "PR": "San Juan",
    "RI": "Providence",
    "SC": "Columbia",
    "SD": "Pierre",
    "TN": "Nashville",
    "TX": "Austin",
    "UT": "Salt Lake City",
    "VA": "Richmond",
    "VT": "Montpelier",
    "WA": "Olympia",
    "WI": "Madison",
    "WV": "Charleston",
    "WY": "Cheyenne",
    "GU": "Hagåtña",
    "VI": "Charlotte Amalie",
}

ZIP_CITY_HINTS: tuple[tuple[int, int, str, str | None], ...] = (
    (5, 5, "Holtsville", "NY"),
    (6, 9, "San Juan", "PR"),
    (28, 29, "Providence", "RI"),
    (30, 38, "Manchester", "NH"),
    (39, 49, "Portland", "ME"),
    (50, 59, "Burlington", "VT"),
    (60, 69, "Hartford", "CT"),
    (70, 89, "Newark", "NJ"),
    (100, 116, "New York", "NY"),
    (117, 119, "Hempstead", "NY"),
    (120, 129, "Albany", "NY"),
    (130, 139, "Syracuse", "NY"),
    (140, 149, "Buffalo", "NY"),
    (150, 168, "Pittsburgh", "PA"),
    (169, 196, "Philadelphia", "PA"),
    (197, 199, "Wilmington", "DE"),
    (200, 205, "Washington", "DC"),
    (206, 219, "Baltimore", "MD"),
    (220, 246, "Richmond", "VA"),
    (270, 289, "Charlotte", "NC"),
    (290, 299, "Columbia", "SC"),
    (300, 319, "Atlanta", "GA"),
    (320, 329, "Orlando", "FL"),
    (330, 339, "Miami", "FL"),
    (350, 369, "Birmingham", "AL"),
    (370, 385, "Nashville", "TN"),
    (386, 397, "Jackson", "MS"),
    (398, 399, "Albany", "GA"),
    (430, 459, "Columbus", "OH"),
    (460, 479, "Indianapolis", "IN"),
    (480, 499, "Detroit", "MI"),
    (500, 528, "Des Moines", "IA"),
    (530, 549, "Milwaukee", "WI"),
    (550, 567, "Minneapolis", "MN"),
    (570, 577, "Sioux Falls", "SD"),
    (580, 588, "Fargo", "ND"),
    (590, 599, "Billings", "MT"),
    (600, 629, "Chicago", "IL"),
    (630, 658, "Saint Louis", "MO"),
    (660, 679, "Topeka", "KS"),
    (680, 693, "Omaha", "NE"),
    (700, 715, "New Orleans", "LA"),
    (716, 729, "Little Rock", "AR"),
    (730, 749, "Oklahoma City", "OK"),
    (750, 769, "Dallas", "TX"),
    (770, 778, "Houston", "TX"),
    (779, 787, "San Antonio", "TX"),
    (788, 799, "El Paso", "TX"),
    (800, 809, "Denver", "CO"),
    (810, 816, "Colorado Springs", "CO"),
    (820, 831, "Cheyenne", "WY"),
    (832, 838, "Boise", "ID"),
    (840, 847, "Salt Lake City", "UT"),
    (850, 865, "Phoenix", "AZ"),
    (870, 884, "Albuquerque", "NM"),
    (889, 898, "Las Vegas", "NV"),
    (900, 918, "Los Angeles", "CA"),
    (919, 926, "San Diego", "CA"),
    (927, 939, "Anaheim", "CA"),
    (940, 948, "San Francisco", "CA"),
    (949, 951, "San Jose", "CA"),
    (952, 960, "Sacramento", "CA"),
    (961, 961, "South Lake Tahoe", "CA"),
    (967, 968, "Honolulu", "HI"),
    (970, 976, "Portland", "OR"),
    (977, 979, "Bend", "OR"),
    (980, 986, "Seattle", "WA"),
    (988, 994, "Spokane", "WA"),
    (995, 999, "Anchorage", "AK"),
)


def _state_for_prefix(prefix: int) -> str | None:
    for abbr, ranges in STATE_ZIP_RANGES.items():
        for start, end in ranges:
            if start <= prefix <= end:
                return abbr
    return None


@lru_cache(maxsize=1)
def _postal_centroids() -> dict[str, tuple[float, float]]:
    """Load offline ZIP centroid coordinates keyed by 5-digit postal code."""

    csv_path = Path(__file__).resolve().parent / "data" / "geoindex" / "postal_centroids.csv"
    if not csv_path.exists():
        return {}
    out: dict[str, tuple[float, float]] = {}
    try:
        with csv_path.open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                postal = _normalize_zip(row.get("postal"))
                lat = _coerce_float(row.get("lat"))
                lng = _coerce_float(row.get("lng"))
                if not postal or lat is None or lng is None:
                    continue
                out[postal] = (lat, lng)
    except OSError:
        return {}
    return out


@lru_cache(maxsize=64)
def _known_cities_for_state(state_abbr: str) -> tuple[tuple[str, float, float], ...]:
    key = (state_abbr or "").strip().lower()
    if not key:
        return ()
    rows: list[tuple[str, float, float]] = []
    for (city, state), (lat, lng) in KNOWN_COORDINATES.items():
        if state == key:
            rows.append((city, lat, lng))
    return tuple(rows)


def _display_city_name(city: str) -> str:
    return " ".join(part.capitalize() for part in city.split())


def _nearest_known_city_for_coords(state_abbr: str, lat: float, lng: float) -> str | None:
    candidates = _known_cities_for_state(state_abbr)
    if not candidates:
        return None
    best_city: str | None = None
    best_distance = float("inf")
    for city, city_lat, city_lng in candidates:
        miles = haversine_miles(lat, lng, city_lat, city_lng)
        if miles < best_distance:
            best_distance = miles
            best_city = city
    # Avoid forcing clearly wrong city labels when curated coverage is sparse.
    if best_city is None or best_distance > 120.0:
        return None
    return _display_city_name(best_city)


def geocode_zip(zip_code: str | int | None) -> dict[str, Any] | None:
    """Resolve a U.S. ZIP code to approximate coordinates.

    Exact ZIP centroids are used when available from offline datasets. When a
    ZIP is unknown to the centroid dataset, the function falls back to prefix
    ranges blended with city/state geocoding helpers.
    """

    normalized = _normalize_zip(zip_code)
    if not normalized:
        return None
    try:
        prefix = int(normalized[:3])
    except ValueError:
        return None
    state = _state_for_prefix(prefix)
    if not state:
        return None
    target_city = None
    target_state = state
    for start, end, city_name, override_state in ZIP_CITY_HINTS:
        if start <= prefix <= end and (override_state is None or override_state == state):
            target_city = city_name
            if override_state:
                target_state = override_state
            break
    lat = lng = None
    centroid = _postal_centroids().get(normalized)
    if centroid:
        lat, lng = centroid
        nearest_city = _nearest_known_city_for_coords(target_state, lat, lng)
        if nearest_city:
            target_city = nearest_city
    if target_city:
        if lat is None or lng is None:
            coords = geocode_city_state(target_city, target_state)
            if coords:
                lat, lng = coords
    if lat is None or lng is None:
        coords = STATE_CENTROIDS.get(target_state.lower())
        if coords:
            lat, lng = coords
    if lat is None or lng is None:
        return None
    city_value = target_city or STATE_CAPITAL_BY_ABBR.get(target_state) or target_state
    return {
        "postal_code": normalized,
        "latitude": round(lat, 6),
        "longitude": round(lng, 6),
        "city": city_value,
        "state": target_state,
    }


@lru_cache(maxsize=512)
def geocode_city_state(city: str | None, state: str | None) -> tuple[float, float] | None:
    """Return approximate coordinates for a ``city, state`` pair.

    The importer layer calls this helper when raw data does not include
    explicit latitude/longitude coordinates.  A curated lookup table of large
    U.S. metro areas is bundled, and additional coverage is achieved by
    falling back to state centroids when a specific city is unknown.
    """

    if not city or not state:
        return None

    state_abbr = _normalize_state(str(state))
    if not state_abbr:
        return None

    city_key = _normalize_city(str(city))
    if not city_key:
        return None

    coords = KNOWN_COORDINATES.get((city_key, state_abbr))
    if coords:
        return coords

    # Try stripping common suffixes like " city" or " county"
    if city_key.endswith(" city"):
        coords = KNOWN_COORDINATES.get((city_key[:-5].strip(), state_abbr))
        if coords:
            return coords
    if city_key.endswith(" county"):
        coords = KNOWN_COORDINATES.get((city_key[:-7].strip(), state_abbr))
        if coords:
            return coords

    return STATE_CENTROIDS.get(state_abbr)


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance between two points on Earth using Haversine."""

    rlat1 = math.radians(lat1)
    rlat2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    sin_dlat = math.sin(dlat / 2.0)
    sin_dlng = math.sin(dlng / 2.0)
    a = sin_dlat ** 2 + math.cos(rlat1) * math.cos(rlat2) * sin_dlng ** 2
    c = 2 * math.asin(min(1.0, math.sqrt(a)))
    return EARTH_RADIUS_MILES * c


def _normalize_ip(ip_text: str | None) -> str | None:
    if not ip_text:
        return None
    try:
        primary = ip_text.split(",")[0].strip()
    except Exception:
        return None
    if not primary:
        return None
    try:
        addr = ipaddress.ip_address(primary)
    except ValueError:
        return None
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
        primary = str(addr)
    if (
        addr.is_private
        or addr.is_loopback
        or addr.is_reserved
        or addr.is_unspecified
        or addr.is_multicast
    ):
        return None
    return primary


def geolocate_ip(ip_text: str | None) -> dict[str, Any] | None:
    """Resolve an IP address to approximate location data.

    The helper intentionally keeps the implementation lightweight by relying on
    public HTTPS JSON providers. A short timeout is used so failures do not
    block the request lifecycle, and all network errors are treated as a miss
    that simply returns ``None``.
    """

    normalized = _normalize_ip(ip_text)
    if not normalized:
        return None

    session = requests.Session()
    sources = (
        (
            "ipapi",
            f"https://ipapi.co/{normalized}/json/",
            ("latitude", "longitude", "city", "region", "postal", "country_name"),
        ),
        (
            "ipwhois",
            f"https://ipwho.is/{normalized}",
            ("latitude", "longitude", "city", "region", "postal", "country"),
        ),
    )

    for name, url, keys in sources:
        try:
            resp = session.get(url, timeout=3)
        except requests.RequestException:
            continue
        if resp.status_code >= 400:
            continue
        try:
            data = resp.json()
        except ValueError:
            continue

        if name == "ipwhois" and not data.get("success", True):
            continue
        if name == "ipapi" and data.get("error"):
            continue

        lat_key, lng_key, city_key, region_key, postal_key, country_key = keys
        lat = _coerce_float(data.get(lat_key))
        lng = _coerce_float(data.get(lng_key))
        if lat is None or lng is None:
            continue
        city = data.get(city_key) or None
        region = data.get(region_key) or None
        postal = data.get(postal_key) or None
        country = data.get(country_key) or None
        accuracy_km = _coerce_float(data.get("accuracy") or data.get("accuracy_radius"))

        result = {
            "ip": normalized,
            "latitude": round(lat, 6),
            "longitude": round(lng, 6),
            "city": city,
            "state": region,
            "postal_code": postal,
            "country": country,
            "source": name,
        }
        if accuracy_km is not None:
            result["accuracy_km"] = round(accuracy_km, 3)
        return result

    return None


__all__ = [
    "EARTH_RADIUS_MILES",
    "coerce_coordinate",
    "geocode_zip",
    "geocode_city_state",
    "geolocate_ip",
    "haversine_miles",
]

