"""In-memory current-price service.

Current prices are intentionally kept out of the database (see docs/ARCHITECTURE.md
and database/schema.sql's `market_price` table, which is a *historical* append-only
log, not a live cache). This service holds the latest quote per symbol in a
process-local dict, refreshing from Yahoo Finance (via `yfinance`) once a cached
entry goes stale.
"""

from datetime import date, datetime, timedelta, timezone
import contextlib
import io

import yfinance as yf

from app.extensions import db
from app.models.market_price import MarketPrice


class UnknownTickerError(ValueError):
    """Raised when yfinance has no usable data for a symbol."""


def _fetch_price(ticker, symbol):
    """Best-effort current price lookup.

    Uses ticker.info first for live market data, then falls back to recent daily
    history from yfinance if that information is unavailable."""
    try:
        info = ticker.info or {}
        for key in ("currentPrice", "regularMarketPrice", "lastPrice", "previousClose"):
            price = info.get(key)
            if price is not None:
                return float(price)
    except Exception:
        pass

    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            history = ticker.history(period="1d")
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
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
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


def get_historical_price(symbol, trade_date, price_type="close"):
    """Fetch an Open, Close, High, or Low price for a symbol on a specific calendar date."""
    if isinstance(trade_date, datetime):
        trade_date = trade_date.date()
    elif isinstance(trade_date, str):
        trade_date = date.fromisoformat(trade_date)

    if not isinstance(trade_date, date):
        raise UnknownTickerError("'trade_date' must be a valid date")

    normalized_price_type = (price_type or "close").lower()
    if normalized_price_type not in {"open", "close", "high", "low"}:
        raise UnknownTickerError("'price_type' must be 'open', 'close', 'high', or 'low'")

    ticker = yf.Ticker(symbol)
    start_date = trade_date.strftime("%Y-%m-%d")
    end_date = (trade_date + timedelta(days=1)).strftime("%Y-%m-%d")

    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            history = ticker.history(start=start_date, end=end_date, auto_adjust=False)
    except Exception as exc:
        raise UnknownTickerError(
            f"Unable to resolve historical price for symbol '{symbol}' on {trade_date}"
        ) from exc

    if history.empty:
        raise UnknownTickerError(
            f"Unable to resolve historical price for symbol '{symbol}' on {trade_date}"
        )

    row = history.iloc[0]
    if normalized_price_type == "open":
        price = row.get("Open")
    elif normalized_price_type == "close":
        price = row.get("Close")
    elif normalized_price_type == "high":
        price = row.get("High")
    else:
        price = row.get("Low")

    if price is None:
        raise UnknownTickerError(
            f"Unable to resolve historical price for symbol '{symbol}' on {trade_date}"
        )
    return float(price)


def _coerce_utc_datetime(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        timestamp = value
    else:
        timestamp = getattr(value, "to_pydatetime", lambda: value)()
        if not isinstance(timestamp, datetime):
            return None
    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc)


def _persist_points(security_id, points, db_session=None):
    session = db_session or db.session
    if session is None:
        return

    for item in points:
        timestamp = _coerce_utc_datetime(item.get("timestamp"))
        if timestamp is None:
            continue
        existing = session.query(MarketPrice).filter_by(security_id=security_id, as_of=timestamp).first()
        if existing is not None:
            continue
        session.add(
            MarketPrice(
                security_id=security_id,
                price=float(item["price"]),
                as_of=timestamp,
                source=item.get("source", "yahoo"),
            )
        )
    session.commit()


def _get_series_from_db(security_id, range_key, db_session=None):
    session = db_session or db.session
    if session is None:
        return []

    normalized_range = (range_key or "1d").lower()
    if normalized_range == "1d":
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    elif normalized_range == "7d":
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    else:
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    rows = (
        session.query(MarketPrice)
        .filter(MarketPrice.security_id == security_id, MarketPrice.as_of >= cutoff)
        .order_by(MarketPrice.as_of.asc())
        .all()
    )

    return [
        {"timestamp": row.as_of, "price": float(row.price), "source": row.source or "db"}
        for row in rows
    ]


def _chart_period_interval(range_key):
    normalized_range = (range_key or "1d").lower()
    if normalized_range == "1d":
        return "1d", "5m"
    if normalized_range == "7d":
        return "5d", "30m"
    if normalized_range == "1m":
        return "1mo", "1h"
    if normalized_range == "3m":
        return "3mo", "1d"
    if normalized_range == "6m":
        return "6mo", "1d"
    if normalized_range == "1y":
        return "1y", "1d"
    raise UnknownTickerError("'range' must be one of '1d', '7d', '1m', '3m', '6m', or '1y'")


def _format_chart_points(history):
    points = []
    for timestamp, row in history.iterrows():
        price = row.get("Close")
        if price is None:
            continue
        ts = _coerce_utc_datetime(timestamp)
        if ts is None:
            continue
        points.append({"timestamp": ts.isoformat().replace("+00:00", "Z"), "price": float(price)})
    return points


def collect_and_store_price_series(symbol, security_id, range_key="1d", db_session=None):
    """Collect a chart-ready series for a symbol without persisting market history."""
    period, interval = _chart_period_interval(range_key)
    ticker = yf.Ticker(symbol)
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        history = ticker.history(period=period, interval=interval, auto_adjust=False)
    return _format_chart_points(history)


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

    def cache_quote(self, symbol, quote):
        symbol = symbol.upper()
        entry = {**quote, "fetched_at": datetime.now(timezone.utc)}
        self._cache[symbol] = entry
        return entry

    def get_current_price(self, symbol):
        return self._get_or_refresh(symbol)["price"]

    def get_historical_price(self, symbol, trade_date, price_type="close"):
        return get_historical_price(symbol, trade_date, price_type=price_type)

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
