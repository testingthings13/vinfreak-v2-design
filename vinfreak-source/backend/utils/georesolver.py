import csv
import os
import re
import unicodedata
from typing import Dict, Iterable, Tuple


US_STATE_FULL = {
    "AL": "Alabama",
    "AK": "Alaska",
    "AZ": "Arizona",
    "AR": "Arkansas",
    "CA": "California",
    "CO": "Colorado",
    "CT": "Connecticut",
    "DE": "Delaware",
    "FL": "Florida",
    "GA": "Georgia",
    "HI": "Hawaii",
    "ID": "Idaho",
    "IL": "Illinois",
    "IN": "Indiana",
    "IA": "Iowa",
    "KS": "Kansas",
    "KY": "Kentucky",
    "LA": "Louisiana",
    "ME": "Maine",
    "MD": "Maryland",
    "MA": "Massachusetts",
    "MI": "Michigan",
    "MN": "Minnesota",
    "MS": "Mississippi",
    "MO": "Missouri",
    "MT": "Montana",
    "NE": "Nebraska",
    "NV": "Nevada",
    "NH": "New Hampshire",
    "NJ": "New Jersey",
    "NM": "New Mexico",
    "NY": "New York",
    "NC": "North Carolina",
    "ND": "North Dakota",
    "OH": "Ohio",
    "OK": "Oklahoma",
    "OR": "Oregon",
    "PA": "Pennsylvania",
    "RI": "Rhode Island",
    "SC": "South Carolina",
    "SD": "South Dakota",
    "TN": "Tennessee",
    "TX": "Texas",
    "UT": "Utah",
    "VT": "Vermont",
    "VA": "Virginia",
    "WA": "Washington",
    "WV": "West Virginia",
    "WI": "Wisconsin",
    "WY": "Wyoming",
    "DC": "District of Columbia",
    "PR": "Puerto Rico",
    "GU": "Guam",
    "VI": "Virgin Islands",
    "AS": "American Samoa",
    "MP": "Northern Mariana Islands",
}


class GeoResolver:
    """Resolve approximate coordinates from offline centroid datasets."""

    def __init__(self, data_dir: str = "backend/data/geoindex") -> None:
        self.by_zip: Dict[str, Tuple[float, float]] = {}
        self.by_city_state: Dict[str, Tuple[float, float]] = {}
        self.by_state: Dict[str, Tuple[float, float]] = {}
        self._load(data_dir)

    def _load(self, data_dir: str) -> None:
        def _load_csv(path: str) -> Iterable[dict]:
            if not os.path.exists(path):
                return []
            with open(path, newline="", encoding="utf-8") as handle:
                return list(csv.DictReader(handle))

        for row in _load_csv(os.path.join(data_dir, "postal_centroids.csv")):
            postal = self._norm(row.get("postal"))
            if not postal:
                continue
            try:
                lat = float(row["lat"])
                lng = float(row["lng"])
            except (TypeError, ValueError, KeyError):
                continue
            self.by_zip[postal] = (lat, lng)

        for row in _load_csv(os.path.join(data_dir, "city_centroids.csv")):
            city = self._norm(row.get("city"))
            state = self._norm(row.get("state"))
            if not city or not state:
                continue
            try:
                lat = float(row["lat"])
                lng = float(row["lng"])
            except (TypeError, ValueError, KeyError):
                continue
            key = f"{city}|{state}"
            self.by_city_state[key] = (lat, lng)

        for row in _load_csv(os.path.join(data_dir, "state_centroids.csv")):
            state = self._norm(row.get("state"))
            if not state:
                continue
            try:
                lat = float(row["lat"])
                lng = float(row["lng"])
            except (TypeError, ValueError, KeyError):
                continue
            self.by_state[state] = (lat, lng)

    # --- Normalization helpers (deterministic, ASCII-only keys) ---
    def _strip_accents(self, value: str) -> str:
        normalized = unicodedata.normalize("NFKD", value or "")
        return normalized.encode("ascii", "ignore").decode("ascii")

    def _norm(self, value: str | None) -> str:
        stripped = self._strip_accents(value or "")
        cleaned = re.sub(r"[^A-Za-z0-9\s]", " ", stripped)
        collapsed = re.sub(r"\s+", " ", cleaned).strip().upper()
        return collapsed

    def _expand_state_full(self, s: str) -> str:
        up = (s or "").strip().upper()
        return US_STATE_FULL.get(up, s)

    def resolve(
        self,
        *,
        city: str | None = None,
        state: str | None = None,
        postal: str | None = None,
    ) -> tuple[float | None, float | None, str | None, str | None]:
        postal_norm = self._norm(postal)
        city_norm = self._norm(city)
        state_norm = self._norm(state)
        expanded = self._expand_state_full(state or "") if state else None
        state_lookup = self._norm(expanded) if expanded else state_norm

        if postal_norm and postal_norm in self.by_zip:
            lat, lng = self.by_zip[postal_norm]
            return lat, lng, "zip", "exact"

        if city_norm and state_lookup:
            key = f"{city_norm}|{state_lookup}"
            if key in self.by_city_state:
                lat, lng = self.by_city_state[key]
                return lat, lng, "city", "city"

        if state_lookup and state_lookup in self.by_state:
            lat, lng = self.by_state[state_lookup]
            return lat, lng, "state", "state"

        return None, None, None, None
