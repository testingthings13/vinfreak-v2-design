"""Utilities for scraping single-listing pages from PCA Mart."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from requests import Response
from requests.exceptions import RequestException

PCA_MART_HOST = "mart.pca.org"
DEFAULT_TIMEOUT_SECONDS = 30.0
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/133.0.0.0 Safari/537.36 VINFREAK-PCA/1.0"
)
AD_ID_RE = re.compile(r"/ads/(\d+)", re.IGNORECASE)
MONEY_RE = re.compile(r"(-?\d[\d,]*(?:\.\d+)?)")
VIN_RE = re.compile(r"\b[A-HJ-NPR-Z0-9]{17}\b", re.IGNORECASE)


class PCAMartListingError(RuntimeError):
    """Raised when PCA Mart listing URLs or pages cannot be parsed."""


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _strip_matching_quotes(value: str) -> str:
    text = str(value or "").strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {"'", '"'}:
        return text[1:-1].strip()
    return text


def _parse_float(value: str | None) -> float | None:
    if not value:
        return None
    match = MONEY_RE.search(str(value))
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", ""))
    except ValueError:
        return None


def _parse_int(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"\d[\d,]*", str(value))
    if not match:
        return None
    try:
        return int(match.group(0).replace(",", ""))
    except ValueError:
        return None


def _meta_content(soup: BeautifulSoup, *, property_name: str) -> str:
    tag = soup.select_one(f"meta[property='{property_name}']")
    if not tag:
        return ""
    return _clean_text(tag.get("content"))


def _extract_title(soup: BeautifulSoup) -> str:
    heading = soup.select_one(".main-content h1[style*='font-size:400%']")
    if heading:
        text = _clean_text(heading.get_text(" ", strip=True))
        if text:
            return text

    og_title = _meta_content(soup, property_name="og:title")
    if og_title:
        title_text = og_title
        if ":" in title_text:
            prefix, remainder = title_text.split(":", 1)
            if prefix.strip().lower() in {"for sale", "for sale"}:
                title_text = remainder
        if "|" in title_text:
            title_text = title_text.split("|", 1)[0]
        title_text = _clean_text(title_text)
        if title_text:
            return title_text

    for heading_tag in soup.find_all("h1"):
        text = _clean_text(heading_tag.get_text(" ", strip=True))
        if text and text.lower() not in {"the mart", "porsche club of america"}:
            return text
    return "PCA Mart Listing"


def _synthetic_vin(ad_id: str | None, listing_url: str) -> str:
    seed = f"{ad_id or ''}|{listing_url}"
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest().upper()
    # 17-char deterministic fallback so repeated imports update the same row.
    return f"PCA{digest[:14]}"


def _detail_text(soup: BeautifulSoup) -> str:
    detail_block = soup.select_one(".col-md-12.col-lg-4.col-xl-4")
    if not detail_block:
        return _clean_text(soup.get_text("\n", strip=True))
    return _clean_text(detail_block.get_text("\n", strip=True))


def _extract_images(soup: BeautifulSoup, *, listing_url: str) -> list[str]:
    images: list[str] = []
    seen: set[str] = set()
    base_href = ""
    base_tag = soup.find("base", href=True)
    if base_tag:
        base_href = _clean_text(base_tag.get("href"))
    base_url = urljoin(listing_url, base_href) if base_href else listing_url
    for anchor in soup.select(".fotorama a[href]"):
        href = _clean_text(anchor.get("href"))
        if not href:
            continue
        if (
            not re.match(r"^[a-z][a-z0-9+\-.]*://", href, re.IGNORECASE)
            and not href.startswith("//")
            and not href.startswith("/")
            and href.lower().startswith("includes/")
        ):
            absolute = f"https://{PCA_MART_HOST}/{href.lstrip('/')}"
        else:
            absolute = urljoin(base_url, href)
        if absolute in seen:
            continue
        seen.add(absolute)
        images.append(absolute)
    if images:
        return images

    og_image = _meta_content(soup, property_name="og:image")
    if og_image:
        return [urljoin(listing_url, og_image)]
    return []


def normalize_listing_url(url: str) -> str:
    candidate = _strip_matching_quotes(str(url or "").strip())
    if not candidate:
        raise PCAMartListingError("PCA listing URL is required.")
    if re.fullmatch(r"\d+", candidate):
        return f"https://{PCA_MART_HOST}/ads/{candidate}"
    path_only_match = re.fullmatch(r"/?ads/(\d+)", candidate, flags=re.IGNORECASE)
    if path_only_match:
        return f"https://{PCA_MART_HOST}/ads/{path_only_match.group(1)}"
    if not re.match(r"^[a-z][a-z0-9+\-.]*://", candidate, re.IGNORECASE):
        candidate = f"https://{candidate.lstrip('/')}"
    parsed = urlparse(candidate)
    host = (parsed.netloc or "").split(":", 1)[0].strip().lower()
    if host != PCA_MART_HOST:
        raise PCAMartListingError(
            f"Unsupported host '{host or '<empty>'}'. Use URLs from {PCA_MART_HOST}."
        )
    ad_match = AD_ID_RE.search(parsed.path or "")
    if not ad_match:
        raise PCAMartListingError(
            "Invalid PCA Mart listing URL. Expected format like https://mart.pca.org/ads/80636."
        )
    ad_id = ad_match.group(1)
    return f"https://{PCA_MART_HOST}/ads/{ad_id}"


def parse_listing_html(html: str, listing_url: str) -> dict[str, Any]:
    if not isinstance(html, str) or not html.strip():
        raise PCAMartListingError("Listing page is empty.")

    canonical_url = normalize_listing_url(listing_url)
    ad_match = AD_ID_RE.search(urlparse(canonical_url).path or "")
    ad_id = ad_match.group(1) if ad_match else None

    soup = BeautifulSoup(html, "lxml")
    title = _extract_title(soup)
    side_text = _detail_text(soup)
    full_text = _clean_text(soup.get_text("\n", strip=True))
    published_match = re.search(r"Published:\s*([0-9]{1,2}/[0-9]{1,2}/[0-9]{4})", full_text)

    year: int | None = None
    model: str | None = None
    title_match = re.match(r"^\s*(\d{4})\s+(.+?)\s*$", title)
    if title_match:
        try:
            year = int(title_match.group(1))
        except ValueError:
            year = None
        model = _clean_text(title_match.group(2))
    else:
        model = title

    price_text = ""
    price_tag = soup.select_one(".classified-price")
    if price_tag:
        price_text = _clean_text(price_tag.get_text(" ", strip=True))
    if not price_text:
        price_text = _meta_content(soup, property_name="og:description")
    price = _parse_float(price_text)

    mileage_match = re.search(r"Mileage:\s*([0-9,]+)", side_text, re.IGNORECASE)
    mileage = _parse_int(mileage_match.group(1) if mileage_match else None)

    exterior_match = re.search(
        r"Exterior:\s*(.+?)(?:\s+Generation:|\s+Interior:|$)",
        side_text,
        re.IGNORECASE,
    )
    interior_match = re.search(
        r"Interior:\s*(.+?)(?:\s+Transmission:|\s+Body\s*Style:|$)",
        side_text,
        re.IGNORECASE,
    )
    transmission_match = re.search(
        r"Transmission:\s*(.+?)(?:\s+Body\s*Style:|$)",
        side_text,
        re.IGNORECASE,
    )
    body_style_match = re.search(
        r"Body\s*Style:\s*(.+?)(?:\s+YOU\s+MUST|$)",
        side_text,
        re.IGNORECASE,
    )

    description_tag = soup.select_one(".martAdDescription")
    description = _clean_text(description_tag.get_text(" ", strip=True)) if description_tag else ""
    if not description:
        description = _meta_content(soup, property_name="og:description")

    vin_match = VIN_RE.search(full_text)
    vin_value = _clean_text(vin_match.group(0)) if vin_match else ""
    if not vin_value:
        vin_value = _synthetic_vin(ad_id, canonical_url)

    posted_at = datetime.now(timezone.utc).isoformat()
    if published_match:
        try:
            published_dt = datetime.strptime(published_match.group(1), "%m/%d/%Y")
            posted_at = published_dt.replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            pass

    images = _extract_images(soup, listing_url=canonical_url)
    image_url = images[0] if images else None
    images_json = json.dumps(images[1:], ensure_ascii=False) if len(images) > 1 else None

    return {
        "vin": vin_value,
        "lot_number": ad_id,
        "title": title,
        "year": year,
        "make": "Porsche",
        "model": model,
        "price": price,
        "currency": "USD" if price is not None else None,
        "mileage": mileage,
        "exterior_color": _clean_text(exterior_match.group(1)) if exterior_match else None,
        "interior_color": _clean_text(interior_match.group(1)) if interior_match else None,
        "transmission": _clean_text(transmission_match.group(1)) if transmission_match else None,
        "body_type": _clean_text(body_style_match.group(1)) if body_style_match else None,
        "description": description or None,
        "posted_at": posted_at,
        "auction_status": "LIVE",
        "source": "pca",
        "url": canonical_url,
        "image_url": image_url,
        "images_json": images_json,
    }


def fetch_listing(
    listing_url: str,
    *,
    session: requests.Session | None = None,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    canonical_url = normalize_listing_url(listing_url)
    sess = session or requests.Session()
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        response: Response = sess.get(canonical_url, headers=headers, timeout=timeout_seconds)
    except RequestException as exc:  # pragma: no cover - network failure path
        raise PCAMartListingError(f"Failed to fetch PCA listing: {exc}") from exc
    if response.status_code >= 400:
        raise PCAMartListingError(
            f"PCA listing request failed with status {response.status_code}."
        )
    return parse_listing_html(response.text, str(response.url or canonical_url))
