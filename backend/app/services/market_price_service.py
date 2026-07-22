"""In-memory current-price service.

Current prices are intentionally kept out of the database (see docs/ARCHITECTURE.md
and database/schema.sql's `market_price` table, which is a *historical* append-only
log, not a live cache). This service holds the latest quote per symbol in a
process-local dict, refreshing from Yahoo Finance (via `yfinance`) once a cached
entry goes stale.
"""

from datetime import datetime, timezone

import yfinance as yf


class UnknownTickerError(ValueError):
    """Raised when yfinance has no usable data for a symbol."""


def _fetch_price(ticker, symbol):
    """Best-effort current price lookup. `fast_info` is preferred (cheap) but its
    lazy properties can raise on flaky/empty Yahoo responses (rate limiting,
    delisted symbols, transient API errors) instead of just returning None, so
    every access is guarded. Falls back to recent daily history if needed."""
    try:
        fast_info = ticker.fast_info
        price = fast_info.get("lastPrice") if hasattr(fast_info, "get") else None
        if price is None:
            price = getattr(fast_info, "last_price", None)
        if price is not None:
            return float(price)
    except Exception:
        pass

    try:
        history = ticker.history(period="5d")
        if not history.empty:
            return float(history["Close"].dropna().iloc[-1])
    except Exception:
        pass

    return None


def _fetch_quote(symbol):
    """Hits yfinance for the latest price + security master data for `symbol`.

    Isolated in its own function so tests can monkeypatch just this call
    instead of mocking the yfinance library wholesale. Any failure to reach
    Yahoo or parse its response (rate limiting, network errors, unknown
    symbols) is normalized to a single `UnknownTickerError` so callers only
    need to handle one failure mode.
    """
    ticker = yf.Ticker(symbol)

    price = _fetch_price(ticker, symbol)
    if price is None:
        raise UnknownTickerError(
            f"Unable to resolve current price for symbol '{symbol}' "
            "(Yahoo Finance unavailable, rate-limited, or unknown ticker)"
        )

    info = {}
    try:
        info = ticker.info or {}
    except Exception:
        info = {}

    return {
        "price": price,
        "name": info.get("longName") or info.get("shortName"),
        "exchange": info.get("exchange"),
        "currency": info.get("currency") or "USD",
        "sector": info.get("sector"),
    }


class MarketPriceService:
    """Process-local cache of `{symbol: {price, fetched_at, name, exchange, currency, sector}}`."""

    def __init__(self, ttl_seconds=60):
        self.ttl_seconds = ttl_seconds
        self._cache = {}

    def _is_fresh(self, entry):
        age = (datetime.now(timezone.utc) - entry["fetched_at"]).total_seconds()
        return age < self.ttl_seconds

    def _get_or_refresh(self, symbol):
        symbol = symbol.upper()
        entry = self._cache.get(symbol)
        if entry is not None and self._is_fresh(entry):
            return entry

        quote = _fetch_quote(symbol)
        entry = {**quote, "fetched_at": datetime.now(timezone.utc)}
        self._cache[symbol] = entry
        return entry

    def get_current_price(self, symbol):
        return self._get_or_refresh(symbol)["price"]

    def get_security_info(self, symbol):
        entry = self._get_or_refresh(symbol)
        return {
            "name": entry["name"],
            "exchange": entry["exchange"],
            "currency": entry["currency"],
            "sector": entry["sector"],
        }

    def clear_cache(self):
        self._cache.clear()


_default_service = None


def get_market_price_service(ttl_seconds=None):
    global _default_service
    if _default_service is None:
        _default_service = MarketPriceService(ttl_seconds=ttl_seconds or 60)
    elif ttl_seconds is not None:
        _default_service.ttl_seconds = ttl_seconds
    return _default_service


def fetch_realtime_quote(symbol):
    """Force a fresh yfinance fetch bypassing the service cache.

    Returns the same dict as `_fetch_quote` or raises `UnknownTickerError`.
    """
    return _fetch_quote(symbol)
