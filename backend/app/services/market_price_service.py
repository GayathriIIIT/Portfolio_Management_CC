"""In-memory current-price service.

Current prices are intentionally kept out of the database (see docs/ARCHITECTURE.md
and database/schema.sql's `market_price` table, which is a *historical* append-only
log, not a live cache). This service holds the latest quote per symbol in a
process-local dict, refreshing from Yahoo Finance (via `yfinance`) once a cached
entry goes stale.
"""

from datetime import date, datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import contextlib
import io

import yfinance as yf

from app.extensions import db
from app.models.market_price import MarketPrice


class UnknownTickerError(ValueError):
    """Raised when yfinance has no usable data for a symbol."""


def _parse_cash_symbol(symbol):
    """If `symbol` looks like a cash symbol (`USD-CASH`, `EUR-CASH`), return the
    currency code (e.g. `USD`). Returns None for any real ticker."""
    if not isinstance(symbol, str) or not symbol.strip():
        return None
    upper = symbol.strip().upper()
    if upper.endswith("-CASH") and len(upper) > len("-CASH"):
        ccy = upper[: -len("-CASH")]
        if len(ccy) == 3 and ccy.isalpha():
            return ccy
    return None


def _is_cash_symbol(symbol):
    return _parse_cash_symbol(symbol) is not None


def _cash_quote(symbol):
    """Synthetic quote for a cash symbol (`{CCY}-CASH`): always 1.0 per unit.

    Cash is never sent to Yahoo Finance — a cash position is priced at its face
    value, so we short-circuit at every service boundary."""
    ccy = _parse_cash_symbol(symbol)
    if ccy is None:
        return None
    return {
        "price": 1.0,
        "name": f"{ccy} Cash",
        "exchange": None,
        "currency": ccy,
        "sector": "CASH",
    }


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

    Cash symbols (e.g. `USD-CASH`) are never sent to Yahoo: a cash position is
    always priced at its face value (1.0 per unit), so this returns a synthetic
    quote instead of resolving an imaginary ticker.
    """
    ccy = _parse_cash_symbol(symbol)
    if ccy is not None:
        return _cash_quote(symbol)

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


def _fetch_fundamentals(symbol):
    """Best-effort fundamental snapshot for `symbol` from yfinance `ticker.info`.

    Returns a dict of valuation/quality fields, or ``None`` on any failure.
    The fields are picked for the recommendation engine (P/E, P/B, dividend
    yield, margins) plus a market-cap sanity check, and are deliberately
    defensive: every field can be missing, so callers should use ``.get()``.
    """
    ccy = _parse_cash_symbol(symbol)
    if ccy is not None:
        return None

    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            ticker = yf.Ticker(symbol)
            info = ticker.info or {}
    except Exception:
        return None

    def _num(key):
        try:
            value = info.get(key)
            return float(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    return {
        "market_cap": _num("marketCap"),
        "trailing_pe": _num("trailingPE"),
        "forward_pe": _num("forwardPE"),
        "price_to_book": _num("priceToBook"),
        "dividend_yield": _num("dividendYield"),  # fraction (0.02 = 2%)
        "profit_margin": _num("profitMargins"),   # fraction (0.12 = 12%)
        "trailing_eps": _num("trailingEps"),
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
    elif normalized_range == "1m":
        cutoff = datetime.now(timezone.utc) - timedelta(days=31)
    elif normalized_range == "3m":
        cutoff = datetime.now(timezone.utc) - timedelta(days=92)
    elif normalized_range == "6m":
        cutoff = datetime.now(timezone.utc) - timedelta(days=184)
    elif normalized_range == "1y":
        cutoff = datetime.now(timezone.utc) - timedelta(days=366)
    else:
        cutoff = datetime.now(timezone.utc) - timedelta(days=31)

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
    """Returns (period_or_none, interval, start_date_or_none, end_date_or_none).

    For short ranges we use yfinance period= which is simpler.
    For 3m+ we use explicit start/end dates to avoid yfinance truncation quirks.
    """
    from datetime import date as _date
    normalized_range = (range_key or "1d").lower()
    today = _date.today()

    if normalized_range == "1d":
        return "1d", "5m", None, None
    if normalized_range == "7d":
        return "5d", "30m", None, None
    if normalized_range == "1m":
        return "1mo", "1h", None, None
    if normalized_range == "3m":
        start = (today - timedelta(days=92)).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")
        return None, "1d", start, end
    if normalized_range == "6m":
        start = (today - timedelta(days=184)).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")
        return None, "1d", start, end
    if normalized_range == "1y":
        start = (today - timedelta(days=366)).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")
        return None, "1d", start, end
    raise UnknownTickerError("'range' must be one of '1d', '7d', '1m', '3m', '6m', or '1y'")


def _format_chart_points(history):
    """Convert a yfinance history DataFrame into a list of {timestamp, price} dicts.

    Filters out NaN / None prices (common for the most recent in-progress trading
    day and for non-trading rows returned by yfinance).
    """
    import math
    points = []
    for timestamp, row in history.iterrows():
        price = row.get("Close")
        if price is None:
            continue
        try:
            price_f = float(price)
        except (TypeError, ValueError):
            continue
        if math.isnan(price_f) or math.isinf(price_f):
            continue
        ts = _coerce_utc_datetime(timestamp)
        if ts is None:
            continue
        points.append({"timestamp": ts.isoformat().replace("+00:00", "Z"), "price": price_f})
    return points


def _raw_daily_closes(symbol, start_date, end_date):
    """Return `{date: close}` daily closing prices for a symbol from Yahoo directly."""
    import math

    ticker = yf.Ticker(symbol)
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = (end_date + timedelta(days=1)).strftime("%Y-%m-%d")
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            history = ticker.history(start=start_str, end=end_str, interval="1d", auto_adjust=False)
    except Exception:
        return {}

    closes = {}
    for timestamp, row in history.iterrows():
        price = row.get("Close")
        if price is None:
            continue
        try:
            price_f = float(price)
        except (TypeError, ValueError):
            continue
        if math.isnan(price_f) or math.isinf(price_f):
            continue
        ts = _coerce_utc_datetime(timestamp)
        if ts is None:
            continue
        closes[ts.date()] = price_f
    return closes


def _daily_close_rows(security_id, db_session=None):
    """All `{date: close}` rows currently stored for a security in the market_price cache."""
    session = db_session or db.session
    if session is None:
        return {}
    rows = (
        session.query(MarketPrice)
        .filter(MarketPrice.security_id == security_id)
        .order_by(MarketPrice.as_of.asc())
        .all()
    )
    closes = {}
    for row in rows:
        ts = row.as_of
        if not hasattr(ts, "date"):
            continue
        if getattr(ts, "tzinfo", None) is not None:
            ts = ts.astimezone(timezone.utc)
        closes[ts.date()] = float(row.price)
    return closes


def _persist_daily_closes(security_id, closes, existing, db_session=None):
    """Insert daily-close rows that aren't already cached. Returns number stored."""
    session = db_session or db.session
    if session is None:
        return 0
    stored = 0
    for day, price in closes.items():
        if day in existing:
            continue
        session.add(
            MarketPrice(
                security_id=security_id,
                price=price,
                as_of=datetime(day.year, day.month, day.day, tzinfo=timezone.utc),
                source="yahoo",
            )
        )
        stored += 1
    if stored:
        try:
            session.commit()
        except Exception:
            session.rollback()
    return stored


def _cached_daily_closes(symbol, security_id, start_date, end_date, db_session=None):
    """DB-first daily closes.

    Reads from the ``market_price`` cache; if nothing is cached for the range it
    fetches from Yahoo and persists the result, and if only the tail is missing
    it fetches just the days after the newest cached day. Repeated reconstructions
    therefore hit the database instead of Yahoo for historical data.
    """
    session = db_session or db.session
    if session is None:
        return _raw_daily_closes(symbol, start_date, end_date)

    cached = _daily_close_rows(security_id, db_session=session)
    closes = {d: px for d, px in cached.items() if start_date <= d <= end_date}

    newest = max(cached.keys()) if cached else None
    if newest is None or newest < end_date:
        fetch_from = (newest + timedelta(days=1)) if newest else start_date
        fetched = _raw_daily_closes(symbol, fetch_from, end_date)
        if fetched:
            _persist_daily_closes(security_id, fetched, cached, db_session=session)
            closes.update({d: px for d, px in fetched.items() if start_date <= d <= end_date})

    return closes


def backfill_daily_closes(symbol, security_id, start_date, end_date, db_session=None):
    """Force a full-range pull of a symbol's daily closes into the market_price cache.

    Unlike the on-demand cache path, this always fetches the whole window so a
    partially-cached range becomes complete. Idempotent — existing rows are kept.
    Returns ``{"fetched": int, "stored": int}``.
    """
    fetched = _raw_daily_closes(symbol, start_date, end_date)
    stored = 0
    session = db_session or db.session
    if session is not None and fetched:
        existing = _daily_close_rows(security_id, db_session=session)
        stored = _persist_daily_closes(security_id, fetched, existing, db_session=session)
    return {"fetched": len(fetched), "stored": stored}


def collect_daily_closes(symbol, start_date, end_date, security_id=None, db_session=None):
    """Return `{date: close}` daily closing prices for a symbol from `start_date`
    to `end_date` (both `date` objects, inclusive).

    Used to reconstruct a portfolio's historical NAV series for risk metrics.
    Best effort: symbols/date ranges with no usable data yield an empty dict.

    When ``security_id`` is provided the result is served from (and written to)
    the ``market_price`` DB cache instead of hitting Yahoo on every call.
    """
    if security_id is not None:
        return _cached_daily_closes(symbol, security_id, start_date, end_date, db_session=db_session)
    return _raw_daily_closes(symbol, start_date, end_date)


def _collect_history(period, interval, start, end, symbol):
    """Thin wrapper around yfinance history with stdout/stderr silenced."""
    ticker = yf.Ticker(symbol)
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        if period is not None:
            return ticker.history(period=period, interval=interval, auto_adjust=False)
        return ticker.history(start=start, end=end, interval=interval, auto_adjust=False)


def collect_stock_chart_series(symbol, range_key="1y"):
    """Granular price points for a single-stock analytics graph.

    For short ranges this samples intraday bars (1h) so intraday volatility is
    visible on the chart instead of a flat line of daily closes. Longer ranges
    (6m, 1y) have no finer-than-daily data from Yahoo, so they stay daily.
    Returns a list of ``{timestamp, price}`` dicts.
    """
    from datetime import date as _date

    normalized = (range_key or "1y").lower()
    today = _date.today()

    period, interval, start, end = None, None, None, None
    if normalized == "1m":
        period, interval = "1mo", "1h"
    elif normalized == "3m":
        start = (today - timedelta(days=92)).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")
        interval = "1h"
    else:
        period, interval, start, end = _chart_period_interval(normalized)

    try:
        history = _collect_history(period, interval, start, end, symbol)
    except Exception:
        return []
    return _format_chart_points(history)


def collect_and_store_price_series(symbol, security_id, range_key="1d", db_session=None):
    """Collect a chart-ready price series for the given range.

    For short ranges (1d, 7d, 1m) uses yfinance period= parameter.
    For longer ranges (3m, 6m, 1y) uses explicit start/end dates which
    avoids a yfinance quirk where period= can return fewer rows than expected.

    Always fetches live from Yahoo at the range's native granularity so the
    asset chart keeps its intraday bars — this function is intentionally NOT
    served from the historical ``market_price`` cache, which only holds daily
    closes (see ``collect_daily_closes`` / ``backfill_daily_closes``).
    """
    period, interval, start, end = _chart_period_interval(range_key)
    ticker = yf.Ticker(symbol)
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        if period is not None:
            history = ticker.history(period=period, interval=interval, auto_adjust=False)
        else:
            history = ticker.history(start=start, end=end, interval=interval, auto_adjust=False)
    return _format_chart_points(history)


BENCHMARK_MAP = {
    "SPY": ("SPY", "S&P 500 ETF"),
    "QQQ": ("QQQ", "Nasdaq 100 ETF"),
    "DIA": ("DIA", "Dow Jones ETF"),
    "VT": ("VT", "Total World Stock ETF"),
    "^GSPC": ("^GSPC", "S&P 500 Index"),
}


def collect_benchmark_series(symbol="SPY", range_key="1d"):
    sym_info = BENCHMARK_MAP.get((symbol or "SPY").upper(), ((symbol or "SPY").upper(), (symbol or "SPY").upper()))
    actual_sym = sym_info[0]
    try:
        points = collect_and_store_price_series(actual_sym, None, range_key=range_key)
    except Exception:
        points = []

    if not points:
        return {"symbol": actual_sym, "name": sym_info[1], "points": []}

    first_price = points[0]["price"] if points else 1.0
    norm_points = []
    for pt in points:
        pct_return = ((pt["price"] - first_price) / first_price * 100.0) if first_price else 0.0
        norm_points.append({
            "timestamp": pt["timestamp"],
            "price": pt["price"],
            "pct_return": round(pct_return, 4),
        })

    return {"symbol": actual_sym, "name": sym_info[1], "points": norm_points}


def fetch_quotes_parallel(symbols, max_workers=8):
    """Fetch realtime quotes for multiple symbols concurrently using ThreadPoolExecutor."""
    results = {}
    errors = {}
    if not symbols:
        return results, errors

    clean_symbols = list(set(sym.upper().strip() for sym in symbols if sym and sym.strip()))
    workers = min(len(clean_symbols) or 1, max_workers)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_to_sym = {executor.submit(fetch_realtime_quote, sym): sym for sym in clean_symbols}
        for future in as_completed(future_to_sym):
            sym = future_to_sym[future]
            try:
                results[sym] = future.result()
            except Exception as exc:
                errors[sym] = str(exc)

    return results, errors


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
        cash = _cash_quote(symbol)
        if cash is not None:
            return cash
        entry = self._cache.get(symbol)
        if entry is not None and self._is_fresh(entry):
            return entry

        quote = _fetch_quote(symbol)
        entry = {**quote, "fetched_at": datetime.now(timezone.utc)}
        self._cache[symbol] = entry
        return entry

    def get_fx_rate(self, from_currency, to_currency, strict=False):
        """Fetch or return cached FX exchange rate from `from_currency` to `to_currency`.

        When `strict` is True (used by the wallet exchange endpoint) a failed
        lookup raises UnknownTickerError instead of silently returning 1.0, so a
        bad rate can never quietly zero out a real conversion.
        """
        if not from_currency or not to_currency or from_currency.upper().strip() == to_currency.upper().strip():
            return 1.0

        from_c = from_currency.upper().strip()
        to_c = to_currency.upper().strip()

        # Handle CASH suffix if present (e.g. USD-CASH -> USD)
        if "-CASH" in from_c:
            from_c = from_c.split("-CASH")[0]
        if "-CASH" in to_c:
            to_c = to_c.split("-CASH")[0]

        if from_c == to_c:
            return 1.0

        key = f"FX_{from_c}_{to_c}"
        entry = self._cache.get(key)
        if entry is not None and self._is_fresh(entry):
            return entry["rate"]

        rate = 1.0
        pair_symbol = f"{from_c}{to_c}=X"
        fetched = False
        try:
            quote = _fetch_quote(pair_symbol)
            rate = float(quote["price"])
            fetched = True
        except Exception:
            inv_symbol = f"{to_c}{from_c}=X"
            try:
                inv_quote = _fetch_quote(inv_symbol)
                rate = 1.0 / float(inv_quote["price"])
                fetched = True
            except Exception:
                rate = 1.0

        if not fetched and strict:
            raise UnknownTickerError(
                f"Could not fetch FX rate for {from_c} -> {to_c}"
            )

        self._cache[key] = {"rate": rate, "fetched_at": datetime.now(timezone.utc)}
        return rate

    def cache_quote(self, symbol, quote):
        symbol = symbol.upper()
        entry = {**quote, "fetched_at": datetime.now(timezone.utc)}
        self._cache[symbol] = entry
        return entry

    def get_fundamentals(self, symbol, ttl_seconds=3600):
        """Best-effort fundamental snapshot for `symbol` from yfinance `ticker.info`.

        Returns a dict of valuation/quality fields (see ``_fetch_fundamentals``)
        or ``None`` on any failure/cash symbol. Thanksgiving: crumbs are much
        slower to change than prices, so the entry is cached for ~1h instead of
        the 60s price TTL. Callers must treat ``None`` as "no fundamentals".
        """
        symbol = symbol.upper()
        cash = _parse_cash_symbol(symbol)
        if cash is not None:
            return None

        key = f"FUND_{symbol}"
        entry = self._cache.get(key)
        if entry is not None:
            age = (datetime.now(timezone.utc) - entry["fetched_at"]).total_seconds()
            if age < ttl_seconds:
                return entry["data"]

        data = _fetch_fundamentals(symbol)
        self._cache[key] = {"data": data, "fetched_at": datetime.now(timezone.utc)}
        return data

    def get_current_price(self, symbol):
        return self._get_or_refresh(symbol)["price"]

    def get_quote(self, symbol):
        """Full latest quote (price, name, exchange, currency, sector) for `symbol`."""
        return self._get_or_refresh(symbol)

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
    Cash symbols short-circuit to their synthetic quote."""
    cash = _cash_quote(symbol)
    if cash is not None:
        return cash
    return _fetch_quote(symbol)
