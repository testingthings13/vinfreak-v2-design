"""Utilities for scraping and normalizing vehicle listing prices."""

from __future__ import annotations

import asyncio
import random
import re
from dataclasses import dataclass
from typing import Callable, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

try:  # pragma: no cover - optional dependency in some environments
    from playwright.async_api import (  # type: ignore
        TimeoutError as PlaywrightTimeoutError,
        async_playwright,
    )
except Exception:  # pragma: no cover - Playwright may be unavailable
    async_playwright = None  # type: ignore[assignment]

    class PlaywrightTimeoutError(Exception):  # type: ignore[override]
        """Fallback timeout error when Playwright isn't installed."""


__all__ = [
    "HostLimiter",
    "fetch_html",
    "fetch_html_with_playwright",
    "should_use_playwright",
    "extract_price",
    "format_usd",
    "normalize_price_text",
    "to_number_usd",
]

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def format_usd(value: float) -> str:
    """Return a $-prefixed, comma-separated amount rounded to the nearest int."""

    return f"${int(round(value)):,}"


# ---------------------------------------------------------------------------
# Money parsing & normalization
# ---------------------------------------------------------------------------

MONEY_STRICT = re.compile(
    r"(?:US?\s?D\s*)?([$€£]\s?(?:\d{1,3}(?:[,\s]\d{3})+|\d{4,})(?:\.\d{2})?)",
    re.I,
)
MONEY_SYMBOL_ONLY = re.compile(r"([$€£]\s?(?:\d{1,3}(?:[,\s]\d{3})+|\d{4,})(?:\.\d{2})?)")
COMPACT_RE = re.compile(r"(\$?\s*\d+(?:\.\d+)?)[\s\-]*([km])\b", re.I)
MILLION_WORD_RE = re.compile(r"(\$?\s*\d+(?:\.\d+)?)\s*(million)\b", re.I)
NUMERIC_PRICE_RE = re.compile(r"^\d+(?:\.\d{1,2})?$")
USD_PREFIXED_PRICE_RE = re.compile(
    r"^(?:USD|US\s*DOLLARS?|US\$)\s*([0-9][0-9,]*(?:\.\d{1,2})?)$",
    re.I,
)


def money_strict(text: str) -> Optional[str]:
    if not text:
        return None
    text = text.replace("\xa0", " ").strip()
    match = MONEY_STRICT.search(text)
    if not match:
        return None
    return match.group(1)


def money_symbol_only(text: str) -> Optional[str]:
    if not text:
        return None
    text = text.replace("\xa0", " ").strip()
    match = MONEY_SYMBOL_ONLY.search(text)
    return match.group(1) if match else None


def normalize_price_text(
    value: str,
    *,
    allow_compact_without_symbol: bool = False,
) -> Optional[str]:
    """Normalize strings like ``$109,900`` or ``$109k`` into ``$109,900``."""

    if not value:
        return None

    raw = value
    lowered = value.lower().strip()

    if allow_compact_without_symbol:
        match = COMPACT_RE.search(lowered)
        if match:
            number = float(re.sub(r"[^0-9.]", "", match.group(1)))
            unit = match.group(2).lower()
            number *= 1000 if unit == "k" else 1_000_000
            return format_usd(number)
        match = MILLION_WORD_RE.search(lowered)
        if match:
            number = float(re.sub(r"[^0-9.]", "", match.group(1))) * 1_000_000
            return format_usd(number)

    clean = raw.replace(",", "").replace(" ", "")
    match = re.search(r"[$€£]\s*(\d+(?:\.\d{2})?)", clean)
    if match:
        try:
            number = float(match.group(1))
        except ValueError:
            return None
        return format_usd(number)

    return None


def to_number_usd(
    text_amount: str,
    *,
    allow_compact_without_symbol: bool = False,
) -> Optional[int]:
    if not text_amount:
        return None

    lowered = text_amount.lower().replace(",", "").replace(" ", "")

    if allow_compact_without_symbol:
        match = COMPACT_RE.search(lowered)
        if match:
            number = float(re.sub(r"[^0-9.]", "", match.group(1)))
            unit = match.group(2).lower()
            number *= 1000 if unit == "k" else 1_000_000
            return int(round(number))
        match = MILLION_WORD_RE.search(lowered)
        if match:
            number = float(re.sub(r"[^0-9.]", "", match.group(1))) * 1_000_000
            return int(round(number))

    match = re.search(r"[$€£]\s*(\d+(?:\.\d{2})?)", lowered)
    if match:
        try:
            return int(round(float(match.group(1))))
        except ValueError:
            return None
    return None


def _normalize_price_candidate(value, *, currency_hint: str | None = None) -> Optional[str]:
    if value in (None, ""):
        return None

    if isinstance(value, (int, float)):
        if value <= 0:
            return None
        return format_usd(float(value))

    text = str(value).replace("\xa0", " ").strip()
    if not text:
        return None

    pretty = normalize_price_text(text, allow_compact_without_symbol=False)
    if pretty:
        return pretty

    currency = (currency_hint or "").strip().upper()
    if NUMERIC_PRICE_RE.fullmatch(text.replace(",", "")):
        try:
            amount = float(text.replace(",", ""))
        except ValueError:
            amount = 0.0
        if amount > 0:
            return format_usd(amount)

    if "USD" in currency:
        match = USD_PREFIXED_PRICE_RE.search(text)
        if match:
            try:
                amount = float(match.group(1).replace(",", ""))
            except ValueError:
                amount = 0.0
            if amount > 0:
                return format_usd(amount)

    return None


def _validated_price(value, *, currency_hint: str | None = None) -> Optional[str]:
    pretty = _normalize_price_candidate(value, currency_hint=currency_hint)
    if not pretty:
        return None
    return pretty if to_number_usd(pretty, allow_compact_without_symbol=False) else None


# ---------------------------------------------------------------------------
# Candidate extraction helpers
# ---------------------------------------------------------------------------

CONTEXT_WINDOW = 28
MONTHLY_RE = re.compile(
    r"\b(per\s*(mo|month)|/mo|/month|per\s*week|/wk|bi-?weekly)\b",
    re.I,
)
FEE_RE = re.compile(r"\b(fee|doc|documentation|destination|admin|processing)\b", re.I)
DEPOSIT_RE = re.compile(r"\b(deposit|down\s*payment|downpayment)\b", re.I)
_NON_VISIBLE_TAGS = {"script", "style", "noscript", "template"}


def pick_best_price_from_text(fulltext: str) -> Optional[str]:
    text = fulltext.replace("\xa0", " ")
    candidates: List[Tuple[int, int, str]] = []

    for match in MONEY_SYMBOL_ONLY.finditer(text):
        start = max(0, match.start() - CONTEXT_WINDOW)
        end = min(len(text), match.end() + CONTEXT_WINDOW)
        context = text[start:end]
        pretty = normalize_price_text(
            match.group(1), allow_compact_without_symbol=False
        )
        value = (
            to_number_usd(pretty, allow_compact_without_symbol=False) if pretty else None
        )
        if not value:
            continue
        score = value
        if MONTHLY_RE.search(context):
            score -= 200_000
        if FEE_RE.search(context):
            score -= 50_000
        if DEPOSIT_RE.search(context):
            score -= 50_000
        candidates.append((score, value, pretty))

    if not candidates:
        return None

    candidates.sort(reverse=True)
    for score, value, pretty in candidates:
        if value >= 5_000:
            return format_usd(value)
    _, value, _ = candidates[0]
    return format_usd(value)


def _visible_text(soup: BeautifulSoup) -> str:
    parts: list[str] = []
    for node in soup.find_all(string=True):
        parent = getattr(node, "parent", None)
        if parent is not None and getattr(parent, "name", "").lower() in _NON_VISIBLE_TAGS:
            continue
        text = str(node).replace("\xa0", " ").strip()
        if text:
            parts.append(text)
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Generic helpers: JSON-LD + label heuristics
# ---------------------------------------------------------------------------


def jsonld_price(soup: BeautifulSoup) -> Optional[str]:
    for tag in soup.find_all("script", {"type": "application/ld+json"}):
        try:
            import json

            data = json.loads(tag.string or "")
        except Exception:
            continue

        found = _scan_jsonld_price(data)
        if found:
            return found
    return None


def _scan_jsonld_price(obj) -> Optional[str]:
    if isinstance(obj, dict):
        currency_hint = str(
            obj.get("priceCurrency")
            or obj.get("currency")
            or obj.get("currencyCode")
            or ""
        )
        for key in ("price", "priceAmount", "currentPrice", "highPrice", "lowPrice"):
            if key in obj and obj[key] not in (None, ""):
                pretty = _validated_price(obj[key], currency_hint=currency_hint)
                if pretty:
                    return pretty

        offers = obj.get("offers")
        if offers:
            if isinstance(offers, dict):
                pretty = _validated_price(
                    offers.get("price"),
                    currency_hint=str(offers.get("priceCurrency") or offers.get("currency") or ""),
                )
                if pretty:
                    return pretty
            elif isinstance(offers, list):
                for offer in offers:
                    if not isinstance(offer, dict):
                        continue
                    pretty = _validated_price(
                        offer.get("price"),
                        currency_hint=str(
                            offer.get("priceCurrency") or offer.get("currency") or ""
                        ),
                    )
                    if pretty:
                        return pretty

        for value in obj.values():
            found = _scan_jsonld_price(value)
            if found:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _scan_jsonld_price(item)
            if found:
                return found
    return None


def label_heuristics(soup: BeautifulSoup) -> Optional[str]:
    labels = [
        "current bid",
        "winning bid",
        "high bid",
        "current price",
        "price",
        "buy now",
        "internet price",
        "sale price",
        "our price",
        "dealer price",
        "list price",
    ]
    for element in soup.select("h1,h2,h3,h4,h5,h6,div,span,strong,em,b"):
        text = element.get_text(" ", strip=True) or ""
        lowered = text.lower()
        if any(label in lowered for label in labels):
            symbol = money_symbol_only(text)
            if symbol:
                pretty = normalize_price_text(
                    symbol, allow_compact_without_symbol=False
                )
                if pretty and to_number_usd(pretty, allow_compact_without_symbol=False):
                    return pretty
    return pick_best_price_from_text(_visible_text(soup))


# ---------------------------------------------------------------------------
# Domain-specific parsers
# ---------------------------------------------------------------------------


_BRINGATRAILER_BID_DATA_ATTR_RE = re.compile(
    r"data-listing-current(?:ly)?\s*=\s*\"[^\"]+\"[^>]*>\s*(?:<[^>]*>\s*)*"
    r"(?:USD\s*)?([€£$]\s?(?:\d{1,3}(?:[,\s]\d{3})+|\d{4,})(?:\.\d{2})?)",
    re.I,
)
_BRINGATRAILER_CURRENT_BID_FORMATTED_RE = re.compile(
    r"\"current_bid_formatted\"\s*:\s*\"([^\"]+)\"",
    re.I,
)
_BRINGATRAILER_CURRENT_BID_RE = re.compile(
    r"\"current_bid\"\s*:\s*([0-9]+(?:\.[0-9]+)?)",
    re.I,
)


def parse_bringatrailer(html: str, soup: BeautifulSoup) -> Optional[str]:
    price = jsonld_price(soup)
    if price:
        return price

    for match in _BRINGATRAILER_BID_DATA_ATTR_RE.finditer(html):
        pretty = _validated_price(match.group(1), currency_hint="USD")
        if pretty:
            return pretty

    for match in _BRINGATRAILER_CURRENT_BID_FORMATTED_RE.finditer(html):
        pretty = _validated_price(match.group(1), currency_hint="USD")
        if pretty:
            return pretty

    bid_match = _BRINGATRAILER_CURRENT_BID_RE.search(html)
    if bid_match:
        pretty = _validated_price(bid_match.group(1), currency_hint="USD")
        if pretty:
            return pretty

    nodes = soup.find_all(string=re.compile(r"\b(Current|Winning)\s+Bid\b", re.I))
    for label in nodes:
        parent = getattr(label, "parent", None)
        if parent is not None and getattr(parent, "name", "").lower() in _NON_VISIBLE_TAGS:
            continue
        symbol = money_strict(label) or (
            money_strict(parent.get_text(" ", strip=True)) if parent else None
        )
        if symbol:
            pretty = normalize_price_text(symbol, allow_compact_without_symbol=False)
            if pretty and to_number_usd(pretty, allow_compact_without_symbol=False):
                return pretty
        if parent:
            for sibling in list(parent.next_siblings)[:4]:
                try:
                    text = getattr(sibling, "get_text", lambda *_: str(sibling))(
                        " ", strip=True
                    )
                except Exception:
                    text = ""
                symbol = money_symbol_only(text)
                if symbol:
                    pretty = normalize_price_text(symbol, allow_compact_without_symbol=False)
                    if pretty and to_number_usd(pretty, allow_compact_without_symbol=False):
                        return pretty
    panel = soup.find(string=re.compile(r"\bBid on This Listing\b", re.I))
    if panel:
        container = panel.find_parent()
        if container:
            text = container.get_text(" ", strip=True)
            symbol = money_strict(text) or money_symbol_only(text)
            if symbol:
                pretty = normalize_price_text(symbol, allow_compact_without_symbol=False)
                if pretty and to_number_usd(pretty, allow_compact_without_symbol=False):
                    return pretty
    return label_heuristics(soup)


_CARSANDBIDS_AMOUNT_CENTS_RE = re.compile(
    r"\"(?:current|high)Bid\"\s*:\s*\{[\s\S]*?\"amountCents\"\s*:\s*(\d+)",
    re.I | re.DOTALL,
)
_CARSANDBIDS_DISPLAY_RE = re.compile(
    r"\"(?:current|high)Bid\"\s*:\s*\{[\s\S]*?\"(?:displayAmount|amount)\"\s*:\s*\"([^\"]+)\"",
    re.I | re.DOTALL,
)
_CARSANDBIDS_AMOUNT_RE = re.compile(
    r"\"(?:current|high)Bid\"\s*:\s*\{[\s\S]*?\"amount\"\s*:\s*([0-9]+(?:\.[0-9]+)?)",
    re.I | re.DOTALL,
)
_CARSANDBIDS_OFFER_PRICE_RE = re.compile(
    r"\"offer\"\s*:\s*\{[\s\S]*?\"price\"\s*:\s*([0-9]+(?:\.[0-9]+)?)",
    re.I | re.DOTALL,
)


def parse_carsandbids(html: str, soup: BeautifulSoup) -> Optional[str]:
    price = jsonld_price(soup)
    if price:
        return price

    cents_match = _CARSANDBIDS_AMOUNT_CENTS_RE.search(html)
    if cents_match:
        try:
            cents = int(cents_match.group(1))
        except (TypeError, ValueError):
            cents = None
        if cents:
            return format_usd(cents / 100)

    for match in _CARSANDBIDS_DISPLAY_RE.finditer(html):
        symbol = money_strict(match.group(1)) or money_symbol_only(match.group(1))
        if symbol:
            pretty = normalize_price_text(symbol, allow_compact_without_symbol=False)
            if pretty and to_number_usd(pretty, allow_compact_without_symbol=False):
                return pretty

    amount_match = _CARSANDBIDS_AMOUNT_RE.search(html)
    if amount_match:
        pretty = _validated_price(amount_match.group(1), currency_hint="USD")
        if pretty:
            return pretty

    offer_match = _CARSANDBIDS_OFFER_PRICE_RE.search(html)
    if offer_match:
        pretty = _validated_price(offer_match.group(1), currency_hint="USD")
        if pretty:
            return pretty

    for tag in soup.find_all(
        lambda el: el.has_attr("data-testid")
        and "bid" in (el.get("data-testid") or "").lower()
    ):
        text = tag.get_text(" ", strip=True)
        symbol = money_strict(text) or money_symbol_only(text)
        if symbol:
            pretty = normalize_price_text(symbol, allow_compact_without_symbol=False)
            if pretty and to_number_usd(pretty, allow_compact_without_symbol=False):
                return pretty

    for tag in soup.find_all(attrs={"aria-label": re.compile("bid", re.I)}):
        text = tag.get_text(" ", strip=True)
        symbol = money_strict(text) or money_symbol_only(text)
        if symbol:
            pretty = normalize_price_text(symbol, allow_compact_without_symbol=False)
            if pretty and to_number_usd(pretty, allow_compact_without_symbol=False):
                return pretty

    for element in soup.find_all(string=re.compile(r"(current|high)\s+bid", re.I)):
        parent = element.parent
        if parent is not None and getattr(parent, "name", "").lower() in _NON_VISIBLE_TAGS:
            continue
        symbol = money_strict(element) or (
            money_strict(parent.get_text(" ", strip=True)) if parent else None
        )
        if symbol:
            pretty = normalize_price_text(symbol, allow_compact_without_symbol=False)
            if pretty and to_number_usd(pretty, allow_compact_without_symbol=False):
                return pretty
        if parent:
            for sibling in list(parent.next_siblings)[:4]:
                try:
                    text = getattr(sibling, "get_text", lambda *_: str(sibling))(
                        " ", strip=True
                    )
                except Exception:
                    text = ""
                symbol = money_symbol_only(text)
                if symbol:
                    pretty = normalize_price_text(symbol, allow_compact_without_symbol=False)
                    if pretty and to_number_usd(pretty, allow_compact_without_symbol=False):
                        return pretty
    return label_heuristics(soup)


DOMAIN_PARSERS: Dict[str, Callable[[str, BeautifulSoup], Optional[str]]] = {
    "bringatrailer.com": parse_bringatrailer,
    "carsandbids.com": parse_carsandbids,
}


# ---------------------------------------------------------------------------
# Fetching with politeness controls
# ---------------------------------------------------------------------------


class HostLimiter:
    def __init__(self, per_host: int = 3):
        self.per_host = per_host
        self._locks: Dict[str, asyncio.Semaphore] = {}

    def get(self, host: str) -> asyncio.Semaphore:
        if host not in self._locks:
            self._locks[host] = asyncio.Semaphore(self.per_host)
        return self._locks[host]


DEFAULT_LIMITER = HostLimiter(per_host=3)


_PLAYWRIGHT_HOSTS = ("carsandbids.com",)
_playwright_lock: asyncio.Lock | None = None
_playwright = None
_playwright_browser = None
_playwright_context = None


async def _ensure_playwright_context():
    """Lazily start Playwright browser context for protected hosts."""

    if async_playwright is None:
        return None

    global _playwright_lock, _playwright, _playwright_browser, _playwright_context

    if _playwright_lock is None:
        _playwright_lock = asyncio.Lock()

    async with _playwright_lock:
        if _playwright_context is not None and not getattr(
            _playwright_context, "is_closed", lambda: False
        )():
            return _playwright_context

        if _playwright is None:
            _playwright = await async_playwright().start()

        if _playwright_browser is None or not getattr(
            _playwright_browser, "is_connected", lambda: False
        )():
            _playwright_browser = await _playwright.chromium.launch(headless=True)

        _playwright_context = await _playwright_browser.new_context(
            user_agent=UA,
            locale="en-US",
            ignore_https_errors=True,
        )
        return _playwright_context


def should_use_playwright(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return _should_use_playwright(host)


def _should_use_playwright(host: str) -> bool:
    return any(host.endswith(domain) for domain in _PLAYWRIGHT_HOSTS)


async def _fetch_html_with_playwright(url: str) -> Optional[str]:
    """Fetch a URL using Playwright when standard requests fail."""

    try:
        context = await _ensure_playwright_context()
        if context is None:
            return None
        page = await context.new_page()
        try:
            response = await page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=30_000,
            )
            if response is not None and response.status >= 400:
                return None
            await page.wait_for_timeout(1000)
            return await page.content()
        finally:
            await page.close()
    except PlaywrightTimeoutError:
        return None
    except asyncio.CancelledError:  # pragma: no cover - cancellation pass-through
        raise
    except Exception:
        return None


async def fetch_html_with_playwright(url: str) -> Optional[str]:
    """Public wrapper to fetch HTML using Playwright for trusted hosts."""

    return await _fetch_html_with_playwright(url)


async def fetch_html(
    client: httpx.AsyncClient,
    url: str,
    limiter: HostLimiter | None = None,
    *,
    delay_range: Tuple[float, float] = (0.12, 0.42),
) -> Optional[str]:
    """Fetch a URL returning raw HTML or ``None`` on error."""

    limiter = limiter or DEFAULT_LIMITER
    host = (urlparse(url).hostname or "").lower()
    use_playwright = _should_use_playwright(host)
    try:
        async with limiter.get(host):
            minimum, maximum = delay_range
            await asyncio.sleep(minimum + random.random() * max(0.0, maximum - minimum))
            response = await client.get(
                url,
                timeout=30,
                headers={
                    "User-Agent": UA,
                    "Accept-Language": "en-US,en;q=0.8",
                    "Accept": "text/html",
                },
            )
        if response.status_code in {403, 429, 503} and use_playwright:
            html = await _fetch_html_with_playwright(url)
            if html:
                return html
        if response.status_code >= 400:
            return None
        response.encoding = response.encoding or response.apparent_encoding
        return response.text
    except asyncio.CancelledError:  # pragma: no cover - cancellation pass-through
        raise
    except Exception:
        if use_playwright:
            return await _fetch_html_with_playwright(url)
        return None


# ---------------------------------------------------------------------------
# Price extraction orchestration
# ---------------------------------------------------------------------------


def extract_price(url: str, html: Optional[str]) -> Tuple[Optional[str], str]:
    if not html:
        return None, "fetch_failed"

    host = (urlparse(url).hostname or "").lower()
    lowered = html.lower()

    if "carsandbids.com" in host and _looks_like_cloudflare_challenge(lowered):
        return None, "cloudflare_challenge"
    if "bringatrailer.com" in host and _looks_like_bringatrailer_login_wall(lowered):
        return None, "login_required"

    soup = BeautifulSoup(html, "lxml")

    for domain, parser in DOMAIN_PARSERS.items():
        if domain in host:
            price = parser(html, soup)
            if price:
                return price, f"parser:{domain}"
            return None, f"parser:{domain}-not_found"

    price = jsonld_price(soup)
    if price:
        return price, "jsonld"
    price = label_heuristics(soup)
    if price:
        return price, "heuristics"
    return None, "not_found"


def _looks_like_cloudflare_challenge(lowered_html: str) -> bool:
    return (
        "just a moment" in lowered_html
        and "enable javascript and cookies to continue" in lowered_html
        and "cf_chl_" in lowered_html
    )


def _looks_like_bringatrailer_login_wall(lowered_html: str) -> bool:
    return (
        "<title>log in</title>" in lowered_html
        and ("/account/login/" in lowered_html or "wp-login.php" in lowered_html)
    )


@dataclass
class PriceResult:
    url: str
    price_text: Optional[str]
    method: str


def summarize_results(results: Iterable[PriceResult]) -> Dict[str, int]:
    summary: Dict[str, int] = {}
    for item in results:
        summary[item.method] = summary.get(item.method, 0) + 1
    return summary
