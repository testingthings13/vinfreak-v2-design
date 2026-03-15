import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Callable

import requests

from .base import BaseImporter
try:
    from ..integrations.neurowraith_runner import (
        LocalNeuroWraithRunner,
        LocalNeuroWraithRunnerError,
    )
except ImportError:  # pragma: no cover
    from integrations.neurowraith_runner import (  # type: ignore
        LocalNeuroWraithRunner,
        LocalNeuroWraithRunnerError,
    )
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
try:
    from ..utils import ensure_live_status
except ImportError:  # pragma: no cover
    from utils import ensure_live_status  # type: ignore

logger = logging.getLogger("vinfreak.neurowraith")


class NeuroWraithImporter(BaseImporter):
    """Importer that fetches vehicle data from the NeuroWraith scraping API."""

    API = "https://neurowraith-dev.onrender.com"
    USERNAME = "Chris"
    PASSWORD = "Chris"
    MODE_REMOTE = "remote"
    MODE_LOCAL = "local"
    MODE_AUTO = "auto"
    VALID_MODES = {MODE_REMOTE, MODE_LOCAL, MODE_AUTO}
    KM_TO_MILES = 0.621371
    INT32_MIN = -(2**31)
    INT32_MAX = 2**31 - 1
    INT_FIELDS = {
        "id",
        "make_id",
        "model_id",
        "category_id",
        "dealership_id",
        "import_list_id",
        "year",
        "mileage",
        "number_of_views",
        "number_of_bids",
    }
    # These fields map to ``INTEGER`` columns that should never receive
    # negative values. NeuroWraith occasionally emits negative placeholders
    # (for example "-61815" IDs) and we treat them as missing so the database
    # can assign proper auto-incrementing keys.
    NON_NEGATIVE_INT_FIELDS = INT_FIELDS.copy()
    _ERROR_KEYWORDS = (
        "error",
        "errors",
        "detail",
        "details",
        "message",
        "messages",
        "reason",
        "reasons",
        "traceback",
        "exception",
        "info",
        "description",
        "log",
        "logs",
        "stderr",
        "stdout",
    )
    _ERROR_PAYLOAD_MAX_LENGTH = 400
    TRANSIENT_STATUS_CODES = {429, 500, 502, 503, 504, 522, 524}
    TRANSIENT_MAX_RETRIES = 3
    TRANSIENT_BACKOFF_FACTOR = 1.5
    RETRY_AFTER_MAX_SECONDS = 60.0
    FALLBACK_LIMITS = (200, 150, 120, 100, 80, 60, 50, 40, 30, 25, 20, 15, 10)
    FALLBACK_MIN_LIMIT = 25
    HIGH_LIMIT_FALLBACK_FLOOR = 300
    HIGH_LIMIT_FALLBACK_STEP = 100
    _TRANSIENT_EXCEPTIONS = (
        requests.ConnectionError,
        requests.Timeout,
    )
    PRICE_UNAVAILABLE_RE = re.compile(
        r"\b("
        r"call(?:\s+us)?\s+for\s+pricing?|"
        r"contact(?:\s+us)?\s+for\s+pricing?|"
        r"inquire(?:\s+for)?\s+price|"
        r"price\s+upon\s+request|"
        r"poa"
        r")\b",
        re.IGNORECASE,
    )
    PHONE_RE = re.compile(
        r"(?:\+?1[\s\-.]?)?(?:\(\d{3}\)|\d{3})[\s\-.]?\d{3}[\s\-.]?\d{4}"
    )
    MAX_REASONABLE_PRICE = 100_000_000.0
    IMAGE_SRCSET_DESCRIPTOR_RE = re.compile(r"\s+\d+(?:\.\d+)?[wx]\s*$", re.IGNORECASE)
    IMAGE_TOKEN_DESCRIPTOR_RE = re.compile(r"^\d+(?:\.\d+)?[wx]$", re.IGNORECASE)
    TRACKING_IMAGE_HOST_FRAGMENTS = (
        "googleads.g.doubleclick.net",
        "doubleclick.net",
        "googletagmanager.com",
    )
    UNWANTED_IMAGE_PATTERNS = (
        "viewthroughconversion",
        "photo_unavailable",
        "/missing/photo_unavailable",
        "/h_70/",
        "/h_80/",
        "/h_90/",
        "/h_100/",
    )
    BRANDING_IMAGE_PATTERNS = (
        "/logo",
        "logo.",
        "dealer-",
        "backgrounds",
        "lotus-oc.png",
    )

    def __init__(self) -> None:
        self._session = requests.Session()
        self.last_effective_limit: int | None = None
        self.last_fetch_backend: str | None = None
        self._local_runner: LocalNeuroWraithRunner | None = None
        self.mode = self._load_mode()
        self.api_url = self._load_api_url()
        self.username = os.getenv("NEUROWRATH_USERNAME", self.USERNAME).strip() or self.USERNAME
        self.password = os.getenv("NEUROWRATH_PASSWORD", self.PASSWORD).strip() or self.PASSWORD
        self.local_fallback_to_remote = self._load_bool_env(
            "NEUROWRATH_LOCAL_FALLBACK_TO_REMOTE",
            default=True,
        )

    def _login(self) -> None:
        """Authenticate with the NeuroWraith service."""
        self._request_with_retry(
            lambda: self._session.post(
                f"{self.api_url}/login",
                data={"username": self.username, "password": self.password},
                timeout=15,
            )
        )

    def _load_api_url(self) -> str:
        value = os.getenv("NEUROWRATH_API_BASE_URL", self.API).strip()
        return value.rstrip("/") or self.API

    def _load_mode(self) -> str:
        raw_mode = os.getenv("NEUROWRATH_MODE", self.MODE_AUTO)
        mode = str(raw_mode or "").strip().lower()
        if mode not in self.VALID_MODES:
            return self.MODE_AUTO
        return mode

    @staticmethod
    def _load_bool_env(name: str, *, default: bool) -> bool:
        raw = os.getenv(name)
        if raw is None:
            return default
        value = raw.strip().lower()
        if value in {"1", "true", "yes", "y", "on"}:
            return True
        if value in {"0", "false", "no", "n", "off"}:
            return False
        return default

    def _get_local_runner(self) -> LocalNeuroWraithRunner:
        if self._local_runner is None:
            self._local_runner = LocalNeuroWraithRunner()
        return self._local_runner

    def _use_local_runner(self) -> bool:
        if self.mode == self.MODE_LOCAL:
            return True
        if self.mode == self.MODE_REMOTE:
            return False
        # auto mode: use local runner when configuration exists
        try:
            return self._get_local_runner().is_available()
        except Exception:
            return False

    @classmethod
    def _retry_after_seconds(cls, response: requests.Response | None) -> float | None:
        if response is None:
            return None
        headers = getattr(response, "headers", None)
        if headers is None or not hasattr(headers, "get"):
            return None
        raw_value = headers.get("Retry-After")
        if raw_value is None:
            return None

        seconds: float | None = None
        if isinstance(raw_value, (int, float)):
            seconds = float(raw_value)
        elif isinstance(raw_value, str):
            stripped = raw_value.strip()
            if not stripped:
                return None
            try:
                seconds = float(stripped)
            except ValueError:
                try:
                    retry_at = parsedate_to_datetime(stripped)
                except (TypeError, ValueError, IndexError, OverflowError):
                    return None
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=timezone.utc)
                seconds = (retry_at - datetime.now(timezone.utc)).total_seconds()

        if seconds is None or seconds <= 0:
            return None
        return min(float(seconds), cls.RETRY_AFTER_MAX_SECONDS)

    def _compute_retry_delay(
        self,
        attempt: int,
        response: requests.Response | None = None,
    ) -> float:
        base_delay = self.TRANSIENT_BACKOFF_FACTOR ** attempt
        capped_delay = min(30.0, base_delay)
        retry_after = self._retry_after_seconds(response)
        if retry_after is not None:
            return max(capped_delay, retry_after)
        return capped_delay

    def _request_with_retry(
        self,
        request_callable: Callable[[], requests.Response],
        *,
        max_retries: int | None = None,
    ) -> requests.Response:
        retries = self.TRANSIENT_MAX_RETRIES if max_retries is None else max_retries
        last_response = None
        last_exception: Exception | None = None
        for attempt in range(retries + 1):
            retry_response: requests.Response | None = None
            try:
                response = request_callable()
            except self._TRANSIENT_EXCEPTIONS as exc:  # type: ignore[arg-type]
                last_exception = exc
                if attempt == retries:
                    raise
            else:
                last_response = response
                status_code = getattr(response, "status_code", None)
                if (
                    isinstance(status_code, int)
                    and status_code in self.TRANSIENT_STATUS_CODES
                    and attempt < retries
                ):
                    last_exception = requests.HTTPError(response=response)
                    retry_response = response
                else:
                    response.raise_for_status()
                    return response

            if attempt < retries:
                time.sleep(self._compute_retry_delay(attempt, retry_response))

        if last_response is not None:
            last_response.raise_for_status()
            return last_response

        raise last_exception  # type: ignore[misc]

    def _coerce_limit_value(self, value: object) -> int | None:
        if value is None:
            return None
        try:
            limit = int(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 10
        if limit <= 0:
            return None
        return limit

    def _limit_candidates(self, requested: int, spider: str) -> list[int]:
        candidates = [requested]
        if spider in self.SPIDERS_WITHOUT_LIMIT_PARAM:
            return candidates
        # For high requested limits, try progressively smaller high limits first
        # (for example 1000 -> 900 -> 800) before dropping to legacy low-limit
        # fallbacks. This keeps large import requests from collapsing straight to
        # ~200 on the first transient upstream failure.
        highest_fallback = self.FALLBACK_LIMITS[0] if self.FALLBACK_LIMITS else 0
        if requested > highest_fallback:
            step = max(int(self.HIGH_LIMIT_FALLBACK_STEP), 1)
            floor = max(int(self.HIGH_LIMIT_FALLBACK_FLOOR), highest_fallback)
            current = ((requested - 1) // step) * step
            while current >= floor:
                if current < requested and current not in candidates:
                    candidates.append(current)
                current -= step
        for fallback in self.FALLBACK_LIMITS:
            if fallback < requested and fallback not in candidates:
                candidates.append(fallback)
        if not candidates:
            candidates.append(10)
        return candidates

    def _should_try_lower_limit(
        self, exc: requests.HTTPError, spider: str, attempted_limit: int
    ) -> bool:
        if spider in self.SPIDERS_WITHOUT_LIMIT_PARAM:
            return False
        if attempted_limit <= self.FALLBACK_MIN_LIMIT:
            return False
        response = getattr(exc, "response", None)
        status_code = getattr(response, "status_code", None)
        return isinstance(status_code, int) and status_code in self.TRANSIENT_STATUS_CODES

    def _fetch_for_limit(
        self,
        query: str | None,
        limit: int | None,
        spider: str,
    ) -> list[dict]:
        params: dict[str, object] = {"spider": spider}
        include_limit = spider not in self.SPIDERS_WITHOUT_LIMIT_PARAM and isinstance(limit, int)
        if include_limit and limit > 0:
            params["limit"] = limit
        if isinstance(query, str):
            stripped = query.strip()
            if stripped:
                params["q"] = stripped
        elif query is not None:
            params["q"] = query
        response = self._request_with_retry(
            lambda: self._session.get(
                f"{self.api_url}/jobs",
                params=params,
                timeout=15,
            )
        )
        job = response.json()
        job_id = job.get("job_id")
        if not job_id:
            raise RuntimeError("NeuroWraith did not return a job_id")
        job_id_str = str(job_id)

        normalized_status: str | None = None
        start = time.monotonic()
        if isinstance(limit, int) and limit > 0:
            max_wait = float(
                self.SPIDER_MAX_WAIT_SECONDS.get(spider, self.DEFAULT_MAX_WAIT_SECONDS)
            )
            deadline = start + max_wait
        else:
            # Explicit "no limit" runs should continue until the upstream job
            # reports completion (or failure) instead of timing out locally.
            max_wait = None
            deadline = None
        limit_for_interval = max(int(limit), 1) if isinstance(limit, int) and limit > 0 else 100
        poll_interval = 1.0 + min(max(limit_for_interval // 50, 0), 4)
        limit_label = str(limit) if isinstance(limit, int) and limit > 0 else "none"

        while True:
            jr = self._request_with_retry(
                lambda: self._session.get(f"{self.api_url}/jobs/{job_id}", timeout=15)
            )
            data = jr.json()
            status = data.get("status")
            normalized_status = status.lower() if isinstance(status, str) else status
            if normalized_status in {"done", "finished", "error", "stopped"}:
                break

            if deadline is not None and time.monotonic() >= deadline:
                raise RuntimeError(
                    "NeuroWraith job timed out after "
                    f"{int(max_wait or 0)}s (limit={limit_label}, last_status={status})"
                )

            time.sleep(poll_interval)

        if normalized_status not in {"done", "finished"}:
            detail_parts: list[str] = [f"job_id={job_id_str}"]
            error_details = self._extract_error_details(data)
            if error_details:
                detail_parts.append(error_details)
            else:
                payload_summary = self._summarize_error_payload(data)
                if payload_summary:
                    detail_parts.append(f"payload={payload_summary}")
            detail_suffix = f" ({'; '.join(detail_parts)})" if detail_parts else ""
            raise RuntimeError(
                f"NeuroWraith job failed with status: {status}{detail_suffix}"
            )

        items: list[dict] = []
        result = data.get("result")
        if isinstance(result, list):
            items = result
        else:
            download_url = data.get("download_url")
            if download_url:
                if not download_url.startswith("http"):
                    download_url = f"{self.api_url}{download_url}"

                download_wait = min(max(poll_interval, 1.0), 5.0)
                while True:
                    try:
                        dr = self._request_with_retry(
                            lambda: self._session.get(download_url, timeout=15)
                        )
                        payload = dr.json()
                    except (requests.RequestException, ValueError) as exc:
                        if deadline is not None and time.monotonic() >= deadline:
                            raise RuntimeError(
                                "NeuroWraith download timed out after "
                                f"{int(max_wait or 0)}s (limit={limit_label}, download_url={download_url})"
                            ) from exc
                        time.sleep(download_wait)
                        continue

                    if isinstance(payload, list):
                        items = payload
                    else:
                        items = []
                    break

        return self._normalize_items(items, spider)

    DEFAULT_MAX_WAIT_SECONDS = 2700.0
    SPIDER_MAX_WAIT_SECONDS: dict[str, float] = {
        # Cars & Bids jobs regularly exceed the default 45 minute timeout when
        # NeuroWraith has to paginate through recent auctions. Give these jobs
        # up to 90 minutes to finish to avoid spurious failures in scheduled
        # imports.
        "carsandbids": 5400.0,
    }
    SPIDERS_WITHOUT_LIMIT_PARAM: set[str] = set()

    def _normalize_items(self, items: list[dict], _spider: str) -> list[dict]:
        normalized: list[dict] = []
        for item in items:
            norm = self.normalize(item)
            if norm:
                normalized.append(norm)
        return normalized

    def _fetch_local(
        self,
        query: str | None,
        limit: int | None,
        spider: str,
    ) -> list[dict]:
        runner = self._get_local_runner()
        local_limit: int | None = limit
        if spider in self.SPIDERS_WITHOUT_LIMIT_PARAM:
            local_limit = None
        raw_items = runner.fetch(spider=spider, query=query, limit=local_limit)
        return self._normalize_items(raw_items, spider)

    def fetch(
        self,
        query: str | None = None,
        limit: int | None = 10,
        spider: str = "bringatrailer",
    ) -> list[dict]:
        """Launch a scrape job and return a list of normalized results."""
        effective_limit = self._coerce_limit_value(limit)
        self.last_effective_limit = None
        self.last_fetch_backend = None
        attempted_local = False
        if self._use_local_runner():
            attempted_local = True
            try:
                items = self._fetch_local(query, effective_limit, spider)
                self.last_effective_limit = effective_limit
                self.last_fetch_backend = "local"
                return items
            except LocalNeuroWraithRunnerError:
                if not self.local_fallback_to_remote:
                    raise
                logger.exception(
                    "Local NeuroWraith runner failed for spider %s; falling back to remote API",
                    spider,
                )
            except Exception:
                if not self.local_fallback_to_remote:
                    raise
                logger.exception(
                    "Unexpected local NeuroWraith failure for spider %s; falling back to remote API",
                    spider,
                )

        self._login()
        if effective_limit is None:
            items = self._fetch_for_limit(query, None, spider)
            self.last_effective_limit = None
            self.last_fetch_backend = "remote-fallback" if attempted_local else "remote"
            return items

        candidates = self._limit_candidates(effective_limit, spider)
        last_error: Exception | None = None

        for candidate in candidates:
            try:
                items = self._fetch_for_limit(query, candidate, spider)
            except requests.HTTPError as exc:
                if not self._should_try_lower_limit(exc, spider, candidate):
                    raise
                last_error = exc
                response = getattr(exc, "response", None)
                status_code = getattr(response, "status_code", "unknown")
                logger.warning(
                    "NeuroWraith fetch for spider %s failed with %s when limit=%s; retrying with a smaller limit",
                    spider,
                    status_code,
                    candidate,
                )
                continue
            self.last_effective_limit = candidate
            self.last_fetch_backend = "remote-fallback" if attempted_local else "remote"
            return items

        if last_error is not None:
            raise last_error

        return []

    def normalize(self, item: dict) -> dict | None:
        """Ensure NeuroWraith items expose image fields used by the Car model.

        The NeuroWraith API returns an ``images`` list but the application expects
        ``image_url`` for the primary image and ``images_json`` for all images. Map
        these fields when available and return the normalized item.
        """
        if not isinstance(item, dict):
            return None

        data = dict(item)

        location_obj = data.get("location") or {}
        raw_address = (
            data.get("location_address")
            or location_obj.get("address")
            or data.get("address")
        )
        if isinstance(raw_address, str) and raw_address.strip():
            data["location_address"] = raw_address.strip()
        lat = coerce_coordinate(
            data.get("latitude")
            or data.get("lat")
            or location_obj.get("latitude")
            or location_obj.get("lat")
        )
        lng = coerce_coordinate(
            data.get("longitude")
            or data.get("lng")
            or data.get("lon")
            or location_obj.get("longitude")
            or location_obj.get("lng")
            or location_obj.get("lon")
        )
        city_value = data.get("city")
        state_value = data.get("state")
        parsed_city, parsed_state, zip5 = from_location_address(raw_address or "")
        if parsed_city and not city_value:
            city_value = parsed_city
            data["city"] = city_value
        if parsed_state and not state_value:
            state_value = parsed_state
            data["state"] = state_value
        state_clean, state_zip = strip_zip_from_state(state_value)
        if state_clean is not None:
            state_value = state_clean
            data["state"] = state_clean
        if not zip5 and state_zip:
            zip5 = state_zip
        if not zip5:
            zip5 = extract_zip_from_text(raw_address)
        if lat is None or lng is None:
            resolver = get_default_resolver()
            resolved_lat, resolved_lng, *_ = resolver.resolve(
                city=city_value,
                state=state_value,
                postal=zip5,
            )
            if (resolved_lat is None or resolved_lng is None) and state_value:
                resolved_lat, resolved_lng, *_ = resolver.resolve(
                    city=None,
                    state=state_value,
                    postal=None,
                )
            if lat is None and resolved_lat is not None:
                lat = resolved_lat
            if lng is None and resolved_lng is not None:
                lng = resolved_lng
        if lat is not None:
            data["latitude"] = lat
        if lng is not None:
            data["longitude"] = lng

        images = self._extract_image_list(data.get("images"))
        additional_images = self._extract_additional_images(data)
        merged_images = self._merge_images(images, additional_images)
        if merged_images:
            data.setdefault("image_url", merged_images[0])
            data.setdefault("images_json", json.dumps(merged_images, ensure_ascii=False))

        mileage_value = self._extract_mileage(data)
        if mileage_value is not None:
            data["mileage"] = mileage_value
        elif isinstance(data.get("mileage"), dict):
            data["mileage"] = None

        price_value, currency = self._extract_price(data)
        if price_value is not None:
            data["price"] = price_value
        elif isinstance(data.get("price"), dict):
            data["price"] = None
        if currency and not data.get("currency"):
            data["currency"] = currency

        for key in self.INT_FIELDS:
            if key in data:
                allow_negative = key not in self.NON_NEGATIVE_INT_FIELDS
                data[key] = self._coerce_int(data.get(key), allow_negative=allow_negative)

        ensure_live_status(data)

        return data

    @classmethod
    def _extract_error_details(cls, payload) -> str | None:
        """Collect helpful error details from a NeuroWraith job payload."""

        def normalize_message(message) -> str | None:
            if message is None:
                return None
            if isinstance(message, str):
                stripped = message.strip()
                return stripped or None
            if isinstance(message, (int, float)):
                return str(message)
            if isinstance(message, (list, tuple, set)):
                parts = [normalize_message(part) for part in message]
                joined = "; ".join(part for part in parts if part)
                return joined or None
            if isinstance(message, dict):
                for key in cls._ERROR_KEYWORDS:
                    if key in message:
                        nested = normalize_message(message.get(key))
                        if nested:
                            return nested
                parts = [normalize_message(value) for value in message.values()]
                joined = "; ".join(part for part in parts if part)
                return joined or None
            return str(message)

        def collect_messages(obj) -> list[str]:
            collected: list[str] = []
            if isinstance(obj, dict):
                for key, value in obj.items():
                    key_lower = str(key).lower()
                    if any(keyword in key_lower for keyword in cls._ERROR_KEYWORDS):
                        normalized = normalize_message(value)
                        if normalized:
                            collected.append(normalized)
                    else:
                        collected.extend(collect_messages(value))
            elif isinstance(obj, (list, tuple, set)):
                for item in obj:
                    collected.extend(collect_messages(item))
            return collected

        if not isinstance(payload, dict):
            return None

        messages = collect_messages(payload)
        unique_messages: list[str] = []
        seen: set[str] = set()
        for message in messages:
            if message not in seen:
                unique_messages.append(message)
                seen.add(message)
        return "; ".join(unique_messages) or None

    @classmethod
    def _summarize_error_payload(cls, payload) -> str | None:
        """Return a compact string representation of an error payload."""

        if payload is None:
            return None

        summary: str | None
        try:
            summary = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        except (TypeError, ValueError):
            summary = repr(payload)

        if not summary:
            return None

        summary = summary.strip()
        if not summary:
            return None

        max_length = cls._ERROR_PAYLOAD_MAX_LENGTH
        if len(summary) > max_length:
            summary = summary[: max_length - 1] + "\u2026"
        return summary

    @classmethod
    def _coerce_int(cls, value, *, allow_negative: bool = True):
        """Best-effort conversion of raw integer-like values.

        The NeuroWraith API occasionally returns numbers outside the signed
        32-bit range expected by the database (for example mileage strings with
        stray punctuation). Attempt to coerce those values into integers while
        discarding anything that would overflow the ``INTEGER`` column.
        """

        if value is None:
            return None

        if isinstance(value, bool):
            value = int(value)
        elif isinstance(value, (int, float)):
            value = int(value)
        elif isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None

            multiplier = 1
            if re.search(r"(\d+(?:\.\d+)?)\s*[kK]\b", stripped):
                multiplier = 1000

            cleaned = re.sub(r"[^0-9.\-]", "", stripped)
            if cleaned in {"", ".", "-", "-.", ".-"}:
                return None
            try:
                value = int(float(cleaned) * multiplier)
            except ValueError:
                return None
        else:
            return None

        if not allow_negative and value < 0:
            return None
        if value < cls.INT32_MIN or value > cls.INT32_MAX:
            return None
        return value

    @classmethod
    def _extract_mileage(cls, data: dict):
        """Extract the best mileage estimate from NeuroWraith payloads."""

        # Handle objects such as {"value": 12345, "unit": "miles"}
        mileage_obj = data.get("mileage")
        if isinstance(mileage_obj, dict):
            value = cls._coerce_int(mileage_obj.get("value"), allow_negative=False)
            unit = str(mileage_obj.get("unit") or mileage_obj.get("units") or "").lower()
            if value is not None:
                if "km" in unit or "kilometer" in unit:
                    return int(round(value * cls.KM_TO_MILES))
                return value

        # Direct mileage keys expressed in miles
        mile_keys = (
            "mileage",
            "mileage_value",
            "mileageMiles",
            "mileage_miles",
            "mileage_mi",
            "mileageMilesValue",
            "odometer",
            "odometer_miles",
            "odometerValue",
            "odometerMiles",
        )
        for key in mile_keys:
            if key in data:
                value = cls._coerce_int(data.get(key), allow_negative=False)
                if value is not None:
                    return value

        # Mileage provided in kilometres
        km_keys = (
            "mileage_km",
            "mileageKm",
            "mileageKilometers",
            "kilometers",
            "kms",
            "odometer_km",
            "odometerKm",
            "odometerKilometers",
        )
        for key in km_keys:
            if key in data:
                value = cls._coerce_int(data.get(key), allow_negative=False)
                if value is not None:
                    return int(round(value * cls.KM_TO_MILES))

        # Textual mileage fallbacks with explicit units
        text_keys = (
            "mileage_text",
            "mileageText",
            "odometer_text",
            "odometerText",
        )
        units = str(
            data.get("mileage_units")
            or data.get("mileageUnits")
            or data.get("odometer_units")
            or data.get("odometerUnits")
            or ""
        ).lower()
        for key in text_keys:
            value = data.get(key)
            if isinstance(value, str):
                coerced = cls._coerce_int(value, allow_negative=False)
                if coerced is not None:
                    if "km" in units or "kilometer" in units:
                        return int(round(coerced * cls.KM_TO_MILES))
                    return coerced

        return None

    @staticmethod
    def _merge_images(*sources: list[str]) -> list[str]:
        merged: list[str] = []
        seen: set[str] = set()
        for seq in sources:
            for entry in seq:
                if not isinstance(entry, str):
                    continue
                stripped = entry.strip()
                if not stripped or stripped in seen:
                    continue
                merged.append(stripped)
                seen.add(stripped)
        return merged

    @classmethod
    def _extract_image_list(cls, value) -> list[str]:
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            try:
                parsed = json.loads(stripped)
            except ValueError:
                parsed = None
            if isinstance(parsed, list):
                value = parsed
            else:
                cleaned = stripped.replace("\r", "\n")
                if "\n" in cleaned:
                    parts = [part.strip() for part in cleaned.split("\n") if part.strip()]
                    return parts
                parts = [part.strip() for part in re.split(r",|\s", stripped) if part.strip()]
                return parts

        if isinstance(value, (list, tuple, set)):
            return [str(v).strip() for v in value if isinstance(v, str) and str(v).strip()]
        return []

    @classmethod
    def _extract_additional_images(cls, data: dict) -> list[str]:
        keys = (
            "additional_image_urls",
            "additionalImageUrls",
            "Additional image URLs",
            "additional_images",
            "additionalImages",
        )
        for key in keys:
            if key in data:
                return cls._extract_image_list(data.get(key))
        return []

    @classmethod
    def _coerce_price(cls, value):
        currency = None
        if value is None:
            return None, None
        if isinstance(value, (int, float)):
            return float(value), None
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None, None
            cleaned = re.sub(r"[^0-9.]+", "", stripped)
            if cleaned in {"", "."}:
                return None, None
            try:
                return float(cleaned), None
            except ValueError:
                return None, None
        if isinstance(value, dict):
            currency = value.get("currency")
            for key in ("amount", "value", "price", "usd", "usd_amount", "usdAmount"):
                if key in value:
                    price, nested_currency = cls._coerce_price(value.get(key))
                    if price is not None:
                        if not currency:
                            currency = nested_currency
                        return price, currency
            return None, currency
        return None, None

    @classmethod
    def _extract_price(cls, data: dict) -> tuple[float | None, str | None]:
        keys = (
            "price",
            "price_value",
            "priceValue",
            "price_usd",
            "priceUSD",
            "price_text",
            "priceText",
            "asking_price",
            "askingPrice",
            "list_price",
            "listPrice",
            "sale_price",
            "salePrice",
        )
        for key in keys:
            if key in data:
                price, currency = cls._coerce_price(data.get(key))
                if price is not None:
                    if not currency and isinstance(data.get(key), dict):
                        currency = data.get(key, {}).get("currency")  # type: ignore[union-attr]
                    return price, currency

        offer = data.get("offer")
        if isinstance(offer, dict):
            price, currency = cls._extract_price(offer)
            if price is not None:
                return price, currency or offer.get("currency")

        return None, None

