from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, current_app, jsonify, request

from app.api.errors import ApiError, NotFoundError
from app.extensions import db
from app.models import Portfolio, PortfolioTransaction, Security, SecurityHolding, WhatifPrice
from app.services import market_price_service
from app.services.market_price_service import (
    UnknownTickerError,
    fetch_realtime_quote,
    get_market_price_service,
)

BOND_SUGGESTION_SYMBOLS = {
    'BND', 'TLT', 'IEF', 'SHY', 'AGG', 'LQD', 'HYG', 'MUB', 'TIP', 'VGLT', 'BNDX', 'SCHO', 'US10Y-2030'
}
CASH_SUGGESTION_SYMBOLS = {'USD-CASH'}

bp = Blueprint("portfolios", __name__, url_prefix="/api/portfolios")


def _price_service():
    ttl = current_app.config.get("MARKET_PRICE_CACHE_TTL_SECONDS")
    return get_market_price_service(ttl_seconds=ttl)


def _get_price_for_holding(holding, override_prices=None):
    symbol = holding.security.symbol
    security_type = holding.security.type
    purchase_price = float(holding.avg_cost)
    if override_prices is not None and symbol in override_prices:
        return float(override_prices[symbol])
    if security_type in ("CASH"):
        return purchase_price
    try:
        return float(_price_service().get_current_price(symbol))
    except UnknownTickerError:
        return purchase_price


def _serialize_holding(holding, override_prices=None, base_currency="USD"):
    symbol = holding.security.symbol
    quantity = float(holding.quantity)
    raw_purchase_price = float(holding.avg_cost)
    security_type = holding.security.type
    sec_currency = holding.security.currency or "USD"

    if override_prices is not None and symbol in override_prices:
        raw_current_price = float(override_prices[symbol])
    elif security_type in ("CASH"):
        raw_current_price = raw_purchase_price
    else:
        try:
            raw_current_price = float(_price_service().get_current_price(symbol))
        except UnknownTickerError:
            raw_current_price = raw_purchase_price

    fx_rate = _price_service().get_fx_rate(sec_currency, base_currency)

    current_price = raw_current_price * fx_rate
    purchase_price = raw_purchase_price * fx_rate

    market_value = current_price * quantity
    cost_basis = purchase_price * quantity
    unrealized_pl = market_value - cost_basis
    unrealized_pl_pct = (unrealized_pl / cost_basis * 100) if cost_basis else 0.0

    # Self-healing first_purchased_at
    if holding.first_purchased_at is None:
        try:
            first_txn = PortfolioTransaction.query.filter_by(
                portfolio_id=holding.portfolio_id, security_id=holding.security_id
            ).order_by(PortfolioTransaction.executed_at.asc()).first()
            if first_txn:
                holding.first_purchased_at = first_txn.executed_at
            else:
                holding.first_purchased_at = holding.portfolio.created_at or datetime.now(timezone.utc)
            db.session.add(holding)
            db.session.commit()
        except Exception:
            db.session.rollback()

    # Annualized return (CAGR) of the position. Only meaningful once the position
    # has been held for at least a year: extrapolating a sub-year gain produces
    # absurd figures (e.g. a 2-week gain annualized to millions of %), so short
    # positions report no CAGR. For year+ positions without a money-weighted CAGR
    # (e.g. cash/bonds with no BUY/SELL ledger rows) we fall back to the simple
    # total return so the cell is never blank.
    cagr = None
    min_cagr_days = int(current_app.config.get("MIN_XIRR_HOLDING_DAYS", 365))
    first_date = holding.first_purchased_at
    if cost_basis > 0 and market_value >= 0 and first_date is not None:
        age_days = (
            _to_naive_utc(datetime.now(timezone.utc)) - _to_naive_utc(first_date)
        ).days
        if age_days >= min_cagr_days:
            try:
                cagr = _compute_holding_cagr(holding, market_value)
            except Exception:
                cagr = None
            if cagr is None:
                cagr = round(unrealized_pl_pct, 4)

    return {
        "id": holding.id,
        "symbol": symbol,
        "name": holding.security.name,
        "exchange": holding.security.exchange,
        "currency": sec_currency,
        "base_currency": base_currency,
        "fx_rate": fx_rate,
        "quantity": quantity,
        "native_purchase_price": raw_purchase_price,
        "native_current_price": raw_current_price,
        "purchase_price": purchase_price,
        "current_price": current_price,
        "market_value": market_value,
        "cost_basis": cost_basis,
        "unrealized_pl": unrealized_pl,
        "unrealized_pl_pct": unrealized_pl_pct,
        "first_purchased_at": holding.first_purchased_at.isoformat() if holding.first_purchased_at else None,
        "cagr": cagr,
    }


def _to_naive_utc(d):
    """Normalize any date/datetime to a naive UTC datetime for safe arithmetic."""
    import datetime as _dt
    if isinstance(d, _dt.datetime):
        if d.tzinfo is not None:
            # Convert to UTC then strip tzinfo
            d = d.astimezone(_dt.timezone.utc).replace(tzinfo=None)
        return d
    if isinstance(d, _dt.date):
        return _dt.datetime(d.year, d.month, d.day, 0, 0, 0)
    raise TypeError(f"Expected date or datetime, got {type(d)}")


def _compute_holding_cagr(holding, market_value):
    """Money-weighted annualized return (CAGR) of a single position.

    Returns a percentage (e.g. 12.34 means 12.34%/yr) or ``None`` when it cannot
    be determined. It solves the IRR (XIRR) of the security's real BUY/SELL cash
    flows plus today's market value, so later purchases at different prices/dates
    are correctly weighted instead of being folded into one blended cost basis.

    The window is measured from the first transaction to now and the result is
    annualized; if the position was held for less than a configured minimum
    number of days, ``None`` is returned so a sub-year gain isn't shown as an
    implausibly large annualized figure.
    """
    min_days = int(current_app.config.get("MIN_CAGR_HOLDING_DAYS", 30))

    txns = (
        PortfolioTransaction.query.filter_by(
            portfolio_id=holding.portfolio_id, security_id=holding.security_id
        )
        .order_by(PortfolioTransaction.executed_at.asc())
        .all()
    )

    sec_curr = holding.security.currency or "USD"
    base_curr = holding.portfolio.base_currency or "USD"
    fx_rate = _price_service().get_fx_rate(sec_curr, base_curr)

    cash_flows = []
    for t in txns:
        if t.txn_type not in ("BUY", "SELL"):
            continue
        dt = _to_naive_utc(t.executed_at)
        qty = float(t.quantity)
        fees = float(t.fees or 0.0)
        if t.txn_type == "BUY":
            cash_flows.append((dt, -(qty * float(t.price) + fees) * fx_rate))
        else:
            proceeds = (qty * float(t.price) - fees) * fx_rate
            if proceeds > 0:
                cash_flows.append((dt, proceeds))

    if not cash_flows:
        return None

    d0 = cash_flows[0][0]
    holding_days = (datetime.now(timezone.utc).replace(tzinfo=None) - d0).days
    if holding_days < min_days:
        return None

    cash_flows.append((datetime.now(timezone.utc), market_value))

    invested = sum(-amt for _, amt in cash_flows if amt < 0)
    simple_return_pct = 0.0
    if invested > 0:
        proceeds = sum(amt for _, amt in cash_flows if amt > 0)
        simple_return_pct = ((market_value + proceeds - invested) / invested) * 100.0
    return _solve_xirr(cash_flows, simple_return_pct)


def _solve_xirr(cash_flows, simple_return_pct=0.0):
    cf = [(_to_naive_utc(d), float(a)) for d, a in cash_flows if a != 0]
    if not cf:
        return None

    has_pos = any(a > 0 for _, a in cf)
    has_neg = any(a < 0 for _, a in cf)
    if not (has_pos and has_neg):
        return None

    cf.sort(key=lambda x: x[0])
    d0 = cf[0][0]

    total_days = (cf[-1][0] - d0).days
    if total_days <= 0:
        return round(simple_return_pct, 4)

    def get_years(d):
        return (d - d0).days / 365.0

    years_cf = [(get_years(d), a) for d, a in cf]

    def f(r):
        # r must stay above -100%: for r <= -1 the base 1+r is non-positive and
        # raising it to a fractional power yields complex numbers (which used to
        # crash the solver and silently push the metric onto the simple-return
        # fallback, making "Annualized" identical to "Total Return").
        base = 1.0 + r
        if base <= 0.0:
            return float("inf") if any(a > 0 for _, a in years_cf) else float("-inf")
        val = 0.0
        for t, a in years_cf:
            val += a / (base ** t)
        return val

    # XIRR of a real (non-levered) portfolio always lies in (-100%, +inf):
    # f -> +inf just above -100% (late positive cash flows dominate) and f -> the
    # d0 outflow (< 0) as r -> +inf, so a sign change always exists. Pure
    # bisection stays inside this domain and can never evaluate complex numbers.
    low = -0.999999
    high = 1.0
    f_low = f(low)
    f_high = f(high)
    if not (f_low < 0 < f_high or f_high < 0 < f_low):
        h = 2.0
        f_h = f(h)
        while not (f_low < 0 < f_h or f_h < 0 < f_low) and h < 1.0e9:
            h *= 2.0
            f_h = f(h)
        high, f_high = h, f_h
        if not (f_low < 0 < f_high or f_high < 0 < f_low):
            return round(simple_return_pct, 4)

    for _ in range(200):
        mid = (low + high) / 2.0
        f_mid = f(mid)
        if abs(f_mid) < 1e-9:
            return round(mid * 100.0, 4)
        if f_low < 0 < f_mid or f_mid < 0 < f_low:
            high, f_high = mid, f_mid
        else:
            low, f_low = mid, f_mid

    return round(((low + high) / 2.0) * 100.0, 4)


def _calculate_alpha_vs_benchmark(d0, portfolio_return_pct, benchmark_sym="SPY"):
    if d0 is None:
        return None

    # Never hit the network during tests (which mock yfinance only for the price
    # service); alpha stays None and the test suite remains hermetic/fast.
    if current_app.config.get("TESTING"):
        return None

    import yfinance as yf
    try:
        d0_naive = _to_naive_utc(d0)
        today_naive = datetime.now(timezone.utc).replace(tzinfo=None)
        # yfinance caps history at a fixed window; cap 5 years so an old holding
        # doesn't request data the API refuses. Aligning the benchmark window to
        # the portfolio's actual start date keeps both returns over the same span.
        lookback_start = max(d0_naive, today_naive - timedelta(days=365 * 5))
        start_str = lookback_start.strftime("%Y-%m-%d")
        today_str = today_naive.strftime("%Y-%m-%d")
        ticker = yf.Ticker(benchmark_sym)
        hist = ticker.history(start=start_str, end=today_str)
        if hist.empty or "Close" not in hist.columns or len(hist.dropna(subset=["Close"])) < 2:
            return None

        # yfinance often returns a NaN close for the still-in-progress trading
        # day (and sometimes other broken rows). Drop them before measuring the
        # benchmark return, otherwise `first_price`/`last_price` become NaN and
        # alpha is silently None or emits an invalid NaN into the JSON payload.
        hist.index = hist.index.tz_localize(None) if hist.index.tz is not None else hist.index
        closes = hist["Close"].dropna()
        closes = closes[closes.index >= d0_naive]
        if len(closes) < 2:
            return None

        first_price = float(closes.iloc[0])
        last_price = float(closes.iloc[-1])
        if first_price > 0:
            bench_return = ((last_price - first_price) / first_price) * 100.0
            alpha = portfolio_return_pct - bench_return
            return round(alpha, 4)
    except Exception:
        pass
    return None


def _compute_portfolio_metrics(portfolio, override_prices=None):
    invested_value = 0.0
    current_value = 0.0
    holdings = []
    base_curr = portfolio.base_currency or "USD"

    for holding in portfolio.holdings:
        serialized = _serialize_holding(holding, override_prices=override_prices, base_currency=base_curr)
        invested_value += serialized["cost_basis"]
        current_value += serialized["market_value"]
        holdings.append(serialized)

    profit_loss = current_value - invested_value
    profit_loss_percentage = (profit_loss / invested_value * 100) if invested_value else 0.0

    # Calculate XIRR and Benchmark Alpha
    xirr = None
    alpha = None
    txns = PortfolioTransaction.query.filter_by(portfolio_id=portfolio.id).order_by(PortfolioTransaction.executed_at.asc()).all()
    cash_flows = []
    d0 = None

    if txns:
        has_external_cashflow = any(t.txn_type in ("DEPOSIT", "WITHDRAW") for t in txns)

        if has_external_cashflow:
            for t in txns:
                if t.txn_type in ("DEPOSIT", "WITHDRAW"):
                    dt = t.executed_at
                    if d0 is None or _to_naive_utc(dt) < _to_naive_utc(d0):
                        d0 = dt

                    sec_curr = t.security.currency or "USD"
                    fx_rate = _price_service().get_fx_rate(sec_curr, base_curr)
                    amount = float(t.quantity) * fx_rate

                    if t.txn_type == "DEPOSIT":
                        cash_flows.append((dt, -amount))
                    else:
                        cash_flows.append((dt, amount))
            if d0 is not None:
                cash_flows.append((datetime.now(timezone.utc), current_value))
        else:
            for t in txns:
                if t.txn_type in ("BUY", "SELL"):
                    dt = t.executed_at
                    if d0 is None or _to_naive_utc(dt) < _to_naive_utc(d0):
                        d0 = dt

                    sec_curr = t.security.currency or "USD"
                    fx_rate = _price_service().get_fx_rate(sec_curr, base_curr)
                    trade_value = (float(t.quantity) * float(t.price) + float(t.fees or 0)) * fx_rate

                    if t.txn_type == "BUY":
                        cash_flows.append((dt, -trade_value))
                    else:
                        proceeds = (float(t.quantity) * float(t.price) - float(t.fees or 0)) * fx_rate
                        cash_flows.append((dt, proceeds))
            if d0 is not None:
                total_stock_value = 0.0
                for holding in portfolio.holdings:
                    if holding.security.type != "CASH":
                        h_serialized = next((x for x in holdings if x["id"] == holding.id), None)
                        if h_serialized:
                            total_stock_value += h_serialized["market_value"]
                cash_flows.append((datetime.now(timezone.utc), total_stock_value))

    # Fallback for portfolios that hold positions but have no ledger rows yet
    # (e.g. holdings created before BUY/SELL entries were recorded). We infer a
    # money-weighted return by treating each position's cost basis as invested on
    # its first-purchase date and the portfolio's current value as the terminal
    # cash flow, so XIRR/Alpha aren't just blanked out to N/A.
    if not cash_flows and holdings:
        for serialized in holdings:
            cost = float(serialized["cost_basis"])
            if cost <= 0:
                continue
            holding = next(
                (h for h in portfolio.holdings if h.id == serialized["id"] and h.security.type != "CASH"),
                None,
            )
            if holding is None:
                continue
            start = holding.first_purchased_at or portfolio.created_at
            if start is None:
                continue
            start = _to_naive_utc(start)
            cash_flows.append((start, -cost))
            if d0 is None or start < d0:
                d0 = start
        if cash_flows:
            cash_flows.append((datetime.now(timezone.utc), current_value))

    if cash_flows:
        try:
            xirr = _solve_xirr(cash_flows, profit_loss_percentage)
            alpha = _calculate_alpha_vs_benchmark(d0, profit_loss_percentage, "SPY")
        except Exception:
            pass

    # Annualizing a sub-one-year investment window is meaningless (a tiny 2-week
    # gain extrapolates to millions of %), so suppress XIRR until the portfolio's
    # money has been at work for at least a full year. The frontend then hides
    # the "Annualized Return" card instead of showing an absurd figure.
    min_xirr_days = int(current_app.config.get("MIN_XIRR_HOLDING_DAYS", 365))
    if d0 is not None and (
        _to_naive_utc(datetime.now(timezone.utc)) - _to_naive_utc(d0)
    ).days < min_xirr_days:
        xirr = None
    elif xirr is None:
        # Never leave the metric blank: fall back to the portfolio's simple
        # return (only reached for year+ windows that still lack cash flows).
        xirr = round(profit_loss_percentage, 4)

    if alpha is None:
        alpha = 0.0

    return {
        "portfolio_id": portfolio.id,
        "base_currency": base_curr,
        "invested_value": invested_value,
        "current_value": current_value,
        "profit_loss": profit_loss,
        "profit_loss_percentage": profit_loss_percentage,
        "xirr": xirr,
        "alpha": alpha,
        "holdings": holdings,
    }


@bp.get("/market_price/realtime")
def realtime_market_price():
    """Fetch a fresh realtime price from Yahoo Finance for a given symbol.

    Query params: `symbol` (required)
    """
    symbol = request.args.get("symbol")
    if symbol is None or not isinstance(symbol, str) or not symbol.strip():
        raise ApiError("'symbol' query parameter is required", status_code=400)
    symbol = symbol.upper().strip()

    try:
        quote = fetch_realtime_quote(symbol)
    except UnknownTickerError as exc:
        raise ApiError(str(exc), status_code=400) from exc

    return jsonify({"symbol": symbol, **quote})


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def _require_string(payload, field, required=True):
    value = payload.get(field)
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise ApiError(f"'{field}' is required and must be a non-empty string")
        return None
    if not isinstance(value, str):
        raise ApiError(f"'{field}' must be a string")
    return value.strip()


def _require_positive_int(payload, field):
    value = payload.get(field)
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise ApiError(f"'{field}' must be a positive integer")
    return value


def _require_positive_number(payload, field):
    value = payload.get(field)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        raise ApiError(f"'{field}' must be a positive number")
    return float(value)


def _get_portfolio_or_404(portfolio_id):
    portfolio = db.session.get(Portfolio, portfolio_id)
    if portfolio is None:
        raise NotFoundError(f"Portfolio {portfolio_id} not found")
    return portfolio


def _get_holding_or_404(portfolio_id, holding_id):
    holding = SecurityHolding.query.filter_by(id=holding_id, portfolio_id=portfolio_id).first()
    if holding is None:
        raise NotFoundError(f"Holding {holding_id} not found in portfolio {portfolio_id}")
    return holding


def _get_or_create_security(symbol):
    symbol = symbol.upper()
    security = Security.query.filter_by(symbol=symbol).first()
    if security is not None:
        return security

    try:
        info = _price_service().get_security_info(symbol)
    except UnknownTickerError:
        try:
            quote = fetch_realtime_quote(symbol)
        except UnknownTickerError as exc:
            raise ApiError(str(exc), status_code=400) from exc
        info = {
            "name": quote.get("name"),
            "exchange": quote.get("exchange"),
            "currency": quote.get("currency") or "USD",
            "sector": quote.get("sector"),
        }

    security_type = "STOCK"
    if symbol in CASH_SUGGESTION_SYMBOLS:
        security_type = "CASH"
    elif symbol in BOND_SUGGESTION_SYMBOLS:
        security_type = "BOND"

    security = Security(
        symbol=symbol,
        name=info.get("name"),
        type=security_type,
        exchange=info.get("exchange"),
        currency=info.get("currency") or "USD",
        sector=info.get("sector"),
    )
    db.session.add(security)
    db.session.flush()
    return security


def _get_live_price(symbol):
    try:
        quote = fetch_realtime_quote(symbol)
    except UnknownTickerError as exc:
        raise ApiError(str(exc), status_code=400) from exc
    return float(quote["price"])


def _coerce_date(value):
    d = None
    if isinstance(value, datetime):
        d = value.date()
    elif isinstance(value, date):
        d = value
    elif isinstance(value, str):
        try:
            d = date.fromisoformat(value)
        except ValueError as exc:
            raise ApiError("'date' must be an ISO date string in YYYY-MM-DD format") from exc
    else:
        raise ApiError("'date' must be a valid date")

    if d > date.today():
        raise ApiError("'date' cannot be in the future", status_code=400)
    return d



def _normalize_price_type(value):
    if value is None:
        return "close"
    if not isinstance(value, str):
        raise ApiError("'price_type' must be 'open', 'close', 'high', or 'low'")
    normalized = value.strip().lower()
    if normalized not in {"open", "close", "high", "low"}:
        raise ApiError("'price_type' must be 'open', 'close', 'high', or 'low'")
    return normalized


def _parse_symbol_list(payload):
    symbols = []
    symbol_value = payload.get("symbol")
    if isinstance(symbol_value, str) and symbol_value.strip():
        symbols = [symbol_value.strip().upper()]
    elif symbol_value is not None:
        raise ApiError("'symbol' must be a non-empty string")

    if "symbols" in payload:
        if symbols:
            raise ApiError("Provide either 'symbol' or 'symbols', not both")
        symbol_values = payload.get("symbols")
        if not isinstance(symbol_values, list):
            raise ApiError("'symbols' must be an array of ticker strings")
        for symbol in symbol_values:
            if not isinstance(symbol, str) or not symbol.strip():
                raise ApiError("All symbols in 'symbols' must be non-empty strings")
            symbols.append(symbol.strip().upper())

    return symbols


def _parse_quantities(payload, symbols):
    quantities = {}
    if "quantities" in payload:
        quantity_map = payload.get("quantities")
        if not isinstance(quantity_map, dict):
            raise ApiError("'quantities' must be an object of symbol to quantity values")
        for symbol, value in quantity_map.items():
            if not isinstance(symbol, str) or not symbol.strip():
                raise ApiError("All quantities keys must be non-empty symbol strings")
            if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
                raise ApiError(f"Quantity for '{symbol}' must be a positive number")
            quantities[symbol.upper().strip()] = float(value)
    elif "quantity" in payload:
        quantity_value = payload.get("quantity")
        if isinstance(quantity_value, bool) or not isinstance(quantity_value, (int, float)) or quantity_value <= 0:
            raise ApiError("'quantity' must be a positive number")
        for symbol in symbols:
            quantities[symbol] = float(quantity_value)
    return quantities


def _compute_symbol_cart_metrics(symbols, override_prices, quantities=None):
    quantities = quantities or {}
    invested_value = 0.0
    current_value = 0.0
    holdings = []

    for symbol in symbols:
        quantity = float(quantities.get(symbol, 1.0))
        if symbol not in override_prices:
            raise ApiError(f"Missing hypothetical price for symbol '{symbol}'")

        hypothetical_price = float(override_prices[symbol])
        try:
            current_price = float(_price_service().get_current_price(symbol))
        except UnknownTickerError as exc:
            raise ApiError(str(exc), status_code=400) from exc
        market_value = current_price * quantity
        cost_basis = hypothetical_price * quantity
        profit_loss = market_value - cost_basis
        profit_loss_percentage = (profit_loss / cost_basis * 100) if cost_basis else 0.0

        invested_value += cost_basis
        current_value += market_value
        holdings.append(
            {
                "symbol": symbol,
                "quantity": quantity,
                "hypothetical_price": hypothetical_price,
                "current_price": current_price,
                "market_value": market_value,
                "cost_basis": cost_basis,
                "profit_loss": profit_loss,
                "profit_loss_percentage": profit_loss_percentage,
            }
        )

    return {
        "portfolio_id": None,
        "invested_value": invested_value,
        "current_value": current_value,
        "profit_loss": current_value - invested_value,
        "profit_loss_percentage": (current_value - invested_value) / invested_value * 100 if invested_value else 0.0,
        "holdings": holdings,
    }


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

def _serialize_portfolio(portfolio, include_holdings=True, override_prices=None):
    base_curr = portfolio.base_currency or "USD"
    data = {
        "id": portfolio.id,
        "owner": portfolio.owner,
        "name": portfolio.name,
        "base_currency": base_curr,
        "created_at": portfolio.created_at.isoformat() if portfolio.created_at else None,
    }
    if include_holdings:
        holdings = [_serialize_holding(h, override_prices=override_prices, base_currency=base_curr) for h in portfolio.holdings]
        data["holdings"] = holdings
        data["total_value"] = sum(h["market_value"] for h in holdings)
    else:
        data["holding_count"] = len(portfolio.holdings)
    return data


def _serialize_transaction(txn):
    return {
        "id": txn.id,
        "symbol": txn.security.symbol,
        "type": txn.txn_type,
        "quantity": float(txn.quantity),
        "price": float(txn.price),
        "fees": float(txn.fees),
        "executed_at": txn.executed_at.isoformat(),
    }


@bp.get("/<int:portfolio_id>/transactions")
def get_portfolio_transactions(portfolio_id):
    _get_portfolio_or_404(portfolio_id)
    transactions = (
        PortfolioTransaction.query.filter_by(portfolio_id=portfolio_id)
        .order_by(PortfolioTransaction.executed_at.desc())
        .all()
    )
    return jsonify([_serialize_transaction(txn) for txn in transactions])


# ---------------------------------------------------------------------------
# Portfolio CRUD
# ---------------------------------------------------------------------------

@bp.post("")
def create_portfolio():
    payload = request.get_json(silent=True) or {}
    owner = _require_string(payload, "owner", required=False) or "Default User"
    name = _require_string(payload, "name")
    base_currency = _require_string(payload, "base_currency", required=False) or "USD"

    portfolio = Portfolio(owner=owner, name=name, base_currency=base_currency)
    db.session.add(portfolio)
    db.session.commit()
    return jsonify(_serialize_portfolio(portfolio)), 201


@bp.get("")
def list_portfolios():
    portfolios = Portfolio.query.order_by(Portfolio.id).all()
    return jsonify([_serialize_portfolio(p, include_holdings=False) for p in portfolios])


@bp.get("/<int:portfolio_id>")
def get_portfolio(portfolio_id):
    portfolio = _get_portfolio_or_404(portfolio_id)
    return jsonify(_serialize_portfolio(portfolio))


@bp.get("/<int:portfolio_id>/analytics")
def get_portfolio_analytics(portfolio_id):
    portfolio = _get_portfolio_or_404(portfolio_id)
    return jsonify(_compute_portfolio_metrics(portfolio))


@bp.get("/<int:portfolio_id>/analytics/chart")
def get_portfolio_chart_data(portfolio_id):
    portfolio = _get_portfolio_or_404(portfolio_id)

    range_key = request.args.get("range", "1d")
    if isinstance(range_key, str):
        range_key = range_key.strip().lower()
    if range_key not in {"1d", "7d", "1m", "3m", "6m", "1y"}:
        raise ApiError("'range' must be one of '1d', '7d', '1m', '3m', '6m', or '1y'", status_code=400)

    benchmark_sym = request.args.get("benchmark", "SPY")
    benchmark_data = None
    if benchmark_sym and benchmark_sym.strip().upper() not in {"NONE", "OFF", ""}:
        benchmark_data = market_price_service.collect_benchmark_series(benchmark_sym.strip(), range_key=range_key)

    series = []
    for holding in portfolio.holdings:
        if holding.security.type in {"CASH"}:
            continue
        points = market_price_service.collect_and_store_price_series(
            holding.security.symbol,
            holding.security_id,
            range_key,
            db_session=db.session,
        )
        series.append({"symbol": holding.security.symbol, "points": points})

    return jsonify(
        {
            "portfolio_id": portfolio.id,
            "range": range_key,
            "series": series,
            "points": series[0]["points"] if series else [],
            "benchmark": benchmark_data,
        }
    )


@bp.post("/<int:portfolio_id>/refresh-prices")
def refresh_portfolio_prices(portfolio_id):
    portfolio = _get_portfolio_or_404(portfolio_id)
    payload = request.get_json(silent=True) or {}

    requested_symbols = _parse_symbol_list(payload)
    if not requested_symbols:
        requested_symbols = [
            holding.security.symbol
            for holding in portfolio.holdings
            if holding.security.type not in {"CASH"}
        ]

    override_prices = {}
    updated_symbols = []

    # Parallel quote fetch using ThreadPoolExecutor
    fetched_quotes, errors = market_price_service.fetch_quotes_parallel(requested_symbols)

    for symbol, quote in fetched_quotes.items():
        security = Security.query.filter_by(symbol=symbol).first()
        if security is None:
            security = Security(
                symbol=symbol,
                name=quote.get("name"),
                type="STOCK",
                exchange=quote.get("exchange"),
                currency=quote.get("currency") or "USD",
                sector=quote.get("sector"),
            )
            db.session.add(security)
            db.session.flush()
        else:
            security.name = quote.get("name") or security.name
            security.exchange = quote.get("exchange") or security.exchange
            security.currency = quote.get("currency") or "USD"
            security.sector = quote.get("sector") or security.sector

        if security.type not in {"CASH"}:
            price = float(quote["price"])
            override_prices[symbol] = price
            updated_symbols.append(symbol)
            _price_service().cache_quote(
                symbol,
                {
                    "price": price,
                    "name": quote.get("name"),
                    "exchange": quote.get("exchange"),
                    "currency": quote.get("currency") or "USD",
                    "sector": quote.get("sector"),
                },
            )

    db.session.commit()

    refreshed_portfolio = db.session.get(Portfolio, portfolio_id)
    return jsonify({
        "message": "Prices refreshed",
        "updated_symbols": updated_symbols,
        "errors": errors,
        "portfolio": _serialize_portfolio(refreshed_portfolio, override_prices=override_prices),
        "analytics": _compute_portfolio_metrics(refreshed_portfolio, override_prices=override_prices),
    })


@bp.post("/<int:portfolio_id>/what-if")
def portfolio_what_if(portfolio_id):
    portfolio = _get_portfolio_or_404(portfolio_id)
    payload = request.get_json(silent=True) or {}
    scenario_name = _require_string(payload, "scenario_name", required=False) or _require_string(
        payload, "name", required=False
    ) or "default"

    override_prices = {}
    price_mode = "manual"
    trade_date = None
    price_type = "close"
    custom_symbols = _parse_symbol_list(payload)
    quantities = _parse_quantities(payload, custom_symbols)

    if "prices" in payload:
        price_map = payload.get("prices", {})
        if not isinstance(price_map, dict):
            raise ApiError("'prices' must be an object of symbol to price values")
        for symbol, value in price_map.items():
            if not isinstance(symbol, str) or not symbol.strip():
                raise ApiError("All price keys must be non-empty symbol strings")
            if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
                raise ApiError(f"Price for '{symbol}' must be a positive number")
            override_prices[symbol.upper().strip()] = float(value)

    if not custom_symbols and not override_prices and len(portfolio.holdings) == 0:
        raise ApiError("Portfolio has no active holdings to simulate", status_code=400)

    if "price" in payload:
        price_value = payload.get("price")
        if isinstance(price_value, bool) or not isinstance(price_value, (int, float)) or price_value <= 0:
            raise ApiError("'price' must be a positive number")
        if custom_symbols:
            for symbol in custom_symbols:
                override_prices[symbol] = float(price_value)
        else:
            override_prices = {holding.security.symbol: float(price_value) for holding in portfolio.holdings}
        price_mode = "manual"
    elif "date" in payload:
        trade_date = _coerce_date(payload.get("date"))
        price_type = _normalize_price_type(payload.get("price_type"))
        price_mode = "historical"
        if custom_symbols:
            for symbol in custom_symbols:
                try:
                    override_prices[symbol] = market_price_service.get_historical_price(
                        symbol, trade_date, price_type=price_type
                    )
                except UnknownTickerError as exc:
                    raise ApiError(str(exc), status_code=400) from exc
        else:
            for holding in portfolio.holdings:
                symbol = holding.security.symbol
                if holding.security.type in {"CASH"}:
                    override_prices[symbol] = float(holding.avg_cost)
                    continue
                try:
                    override_prices[symbol] = market_price_service.get_historical_price(
                        symbol, trade_date, price_type=price_type
                    )
                except UnknownTickerError as exc:
                    raise ApiError(str(exc), status_code=400) from exc
    elif custom_symbols and not override_prices:
        raise ApiError("Provide either 'price' or 'date' when requesting a symbol-based what-if")
    elif not custom_symbols and not override_prices:
        raise ApiError("Provide either 'prices', 'price', or 'date' in the request payload")

    try:
        for symbol, value in override_prices.items():
            security = _get_or_create_security(symbol)
            existing_row = WhatifPrice.query.filter_by(
                portfolio_id=portfolio.id,
                scenario_name=scenario_name,
                security_id=security.id,
            ).first()
            if existing_row is None:
                db.session.add(
                    WhatifPrice(
                        portfolio_id=portfolio.id,
                        scenario_name=scenario_name,
                        security_id=security.id,
                        hypothetical_price=value,
                        price_type=price_type if price_mode == "historical" else None,
                        trade_date=trade_date,
                        price_source=price_mode,
                    )
                )
            else:
                existing_row.hypothetical_price = value
                existing_row.price_type = price_type if price_mode == "historical" else None
                existing_row.trade_date = trade_date
                existing_row.price_source = price_mode

        db.session.commit()

        if custom_symbols:
            result = _compute_symbol_cart_metrics(custom_symbols, override_prices, quantities=quantities)
        else:
            result = _compute_portfolio_metrics(portfolio, override_prices=override_prices)

        result["scenario_name"] = scenario_name
        return jsonify(result)
    except Exception:
        db.session.rollback()
        raise


@bp.get("/<int:portfolio_id>/what-if")
def list_portfolio_what_if(portfolio_id):
    _get_portfolio_or_404(portfolio_id)
    rows = (
        WhatifPrice.query.filter_by(portfolio_id=portfolio_id)
        .order_by(WhatifPrice.created_at.desc(), WhatifPrice.scenario_name, WhatifPrice.security_id)
        .all()
    )

    entries = []
    for row in rows:
        security = db.session.get(Security, row.security_id)
        entries.append(
            {
                "id": row.id,
                "scenario_name": row.scenario_name,
                "symbol": security.symbol if security else None,
                "hypothetical_price": float(row.hypothetical_price),
                "price_source": row.price_source,
                "price_type": row.price_type,
                "trade_date": row.trade_date.isoformat() if row.trade_date else None,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
        )

    return jsonify(entries)


@bp.delete("/<int:portfolio_id>/what-if/<int:whatif_id>")
def delete_portfolio_what_if_entry(portfolio_id, whatif_id):
    _get_portfolio_or_404(portfolio_id)
    row = WhatifPrice.query.filter_by(id=whatif_id, portfolio_id=portfolio_id).first()
    if row is None:
        raise ApiError("What-if entry not found", status_code=404)

    db.session.delete(row)
    db.session.commit()
    return "", 204


@bp.put("/<int:portfolio_id>")
def update_portfolio(portfolio_id):
    portfolio = _get_portfolio_or_404(portfolio_id)
    payload = request.get_json(silent=True) or {}

    if "owner" in payload:
        portfolio.owner = _require_string(payload, "owner")
    if "name" in payload:
        portfolio.name = _require_string(payload, "name")
    if "base_currency" in payload:
        portfolio.base_currency = _require_string(payload, "base_currency")

    db.session.commit()
    return jsonify(_serialize_portfolio(portfolio))


@bp.delete("/<int:portfolio_id>")
def delete_portfolio(portfolio_id):
    portfolio = _get_portfolio_or_404(portfolio_id)
    db.session.delete(portfolio)
    db.session.commit()
    return "", 204


# ---------------------------------------------------------------------------
# Security holding CRUD (nested under a portfolio)
# ---------------------------------------------------------------------------

@bp.post("/<int:portfolio_id>/holdings")
def add_holding(portfolio_id):
    portfolio = _get_portfolio_or_404(portfolio_id)
    payload = request.get_json(silent=True) or {}

    symbol = _require_string(payload, "symbol").upper()
    quantity = _require_positive_int(payload, "quantity")
    purchase_price = _require_positive_number(payload, "purchase_price")

    security = _get_or_create_security(symbol)
    holding = SecurityHolding.query.filter_by(
        portfolio_id=portfolio.id, security_id=security.id
    ).first()

    if holding is None:
        holding = SecurityHolding(
            portfolio_id=portfolio.id,
            security_id=security.id,
            quantity=quantity,
            avg_cost=purchase_price,
            first_purchased_at=datetime.now(timezone.utc),
        )
        db.session.add(holding)
    else:
        existing_qty = float(holding.quantity)
        existing_cost = float(holding.avg_cost)
        total_qty = existing_qty + quantity
        holding.avg_cost = (
            (existing_qty * existing_cost) + (quantity * purchase_price)
        ) / total_qty
        holding.quantity = total_qty

    # Record the purchase in the ledger too, so transaction history and the
    # portfolio-level XIRR / per-holding CAGR stay consistent with "Add Position".
    db.session.add(
        PortfolioTransaction(
            portfolio_id=portfolio.id,
            security_id=security.id,
            txn_type="BUY",
            quantity=quantity,
            price=purchase_price,
            fees=0.0,
            executed_at=datetime.now(timezone.utc),
        )
    )

    db.session.commit()
    return jsonify(_serialize_holding(holding)), 201


@bp.post("/<int:portfolio_id>/buy")
def buy_holding(portfolio_id):
    portfolio = _get_portfolio_or_404(portfolio_id)
    payload = request.get_json(silent=True) or {}

    symbol = _require_string(payload, "symbol").upper()
    quantity = _require_positive_number(payload, "quantity")
    price = payload.get("price")
    if price is None:
        try:
            price = _price_service().get_current_price(symbol)
        except UnknownTickerError as exc:
            raise ApiError(str(exc), status_code=400) from exc
    elif isinstance(price, bool) or not isinstance(price, (int, float)) or price <= 0:
        raise ApiError("'price' must be a positive number")
    else:
        price = float(price)

    fees = payload.get("fees", 0)
    if isinstance(fees, bool) or not isinstance(fees, (int, float)) or fees < 0:
        raise ApiError("'fees' must be a non-negative number")
    fees = float(fees)

    total_cost = (price * quantity) + fees

    # Adjust cash balance if cash position exists
    cash_symbol = f"{portfolio.base_currency or 'USD'}-CASH"
    cash_sec = Security.query.filter_by(symbol=cash_symbol).first()
    if cash_sec is not None:
        cash_holding = SecurityHolding.query.filter_by(
            portfolio_id=portfolio.id, security_id=cash_sec.id
        ).first()
        if cash_holding is not None:
            avail_cash = float(cash_holding.quantity)
            if avail_cash < total_cost:
                raise ApiError(
                    f"Insufficient cash balance. Order total: ${total_cost:.2f}, Available cash: ${avail_cash:.2f}",
                    status_code=400,
                )
            cash_holding.quantity = avail_cash - total_cost

    security = _get_or_create_security(symbol)
    holding = SecurityHolding.query.filter_by(
        portfolio_id=portfolio.id, security_id=security.id
    ).first()

    executed_at = datetime.now(timezone.utc)

    if holding is None:
        holding = SecurityHolding(
            portfolio_id=portfolio.id,
            security_id=security.id,
            quantity=quantity,
            avg_cost=price,
            first_purchased_at=executed_at,
        )
        db.session.add(holding)
    else:
        existing_qty = float(holding.quantity)
        existing_cost = float(holding.avg_cost)
        total_qty = existing_qty + quantity
        holding.avg_cost = ((existing_qty * existing_cost) + (quantity * price)) / total_qty
        holding.quantity = total_qty

    transaction = PortfolioTransaction(
        portfolio_id=portfolio.id,
        security_id=security.id,
        txn_type="BUY",
        quantity=quantity,
        price=price,
        fees=fees,
        executed_at=executed_at,
    )
    db.session.add(transaction)
    db.session.commit()

    return jsonify({
        "message": "Buy order executed",
        "holding": _serialize_holding(holding),
        "transaction": {
            "id": transaction.id,
            "txn_type": transaction.txn_type,
            "quantity": float(transaction.quantity),
            "price": float(transaction.price),
            "fees": float(transaction.fees),
            "executed_at": transaction.executed_at.isoformat(),
        },
    }), 201


@bp.post("/<int:portfolio_id>/sell")
def sell_holding(portfolio_id):
    portfolio = _get_portfolio_or_404(portfolio_id)
    payload = request.get_json(silent=True) or {}

    symbol = _require_string(payload, "symbol").upper()
    quantity = _require_positive_number(payload, "quantity")
    price = payload.get("price")
    if price is None:
        try:
            price = _price_service().get_current_price(symbol)
        except UnknownTickerError as exc:
            raise ApiError(str(exc), status_code=400) from exc
    elif isinstance(price, bool) or not isinstance(price, (int, float)) or price <= 0:
        raise ApiError("'price' must be a positive number")
    else:
        price = float(price)

    fees = payload.get("fees", 0)
    if isinstance(fees, bool) or not isinstance(fees, (int, float)) or fees < 0:
        raise ApiError("'fees' must be a non-negative number")
    fees = float(fees)

    net_proceeds = (price * quantity) - fees
    if net_proceeds < 0:
        raise ApiError("Brokerage fees exceed trade proceeds", status_code=400)

    security = Security.query.filter_by(symbol=symbol).first()
    if security is None:
        raise NotFoundError(f"Security {symbol} not found in portfolio {portfolio_id}")

    holding = SecurityHolding.query.filter_by(
        portfolio_id=portfolio.id, security_id=security.id
    ).first()
    if holding is None:
        raise NotFoundError(f"Holding for security {symbol} not found in portfolio {portfolio_id}")

    existing_qty = float(holding.quantity)
    if quantity > existing_qty:
        raise ApiError("Sell quantity exceeds current holding quantity", status_code=400)

    if existing_qty == quantity:
        db.session.delete(holding)
    else:
        holding.quantity = existing_qty - quantity

    # Credit proceeds to cash balance if cash position exists
    cash_symbol = f"{portfolio.base_currency or 'USD'}-CASH"
    cash_sec = Security.query.filter_by(symbol=cash_symbol).first()
    if cash_sec is not None:
        cash_holding = SecurityHolding.query.filter_by(
            portfolio_id=portfolio.id, security_id=cash_sec.id
        ).first()
        if cash_holding is not None:
            cash_holding.quantity = float(cash_holding.quantity) + net_proceeds

    transaction = PortfolioTransaction(
        portfolio_id=portfolio.id,
        security_id=security.id,
        txn_type="SELL",
        quantity=quantity,
        price=price,
        fees=fees,
        executed_at=datetime.now(timezone.utc),
    )
    db.session.add(transaction)
    db.session.commit()

    return jsonify({
        "message": "Sell order executed",
        "transaction": {
            "id": transaction.id,
            "txn_type": transaction.txn_type,
            "quantity": float(transaction.quantity),
            "price": float(transaction.price),
            "fees": float(transaction.fees),
            "executed_at": transaction.executed_at.isoformat(),
        },
    }), 201


@bp.get("/<int:portfolio_id>/holdings")
def list_holdings(portfolio_id):
    portfolio = _get_portfolio_or_404(portfolio_id)
    return jsonify([_serialize_holding(h) for h in portfolio.holdings])


@bp.get("/<int:portfolio_id>/holdings/<int:holding_id>")
def get_holding(portfolio_id, holding_id):
    _get_portfolio_or_404(portfolio_id)
    holding = _get_holding_or_404(portfolio_id, holding_id)
    return jsonify(_serialize_holding(holding))


@bp.put("/<int:portfolio_id>/holdings/<int:holding_id>")
def update_holding(portfolio_id, holding_id):
    _get_portfolio_or_404(portfolio_id)
    holding = _get_holding_or_404(portfolio_id, holding_id)
    payload = request.get_json(silent=True) or {}

    if "quantity" in payload:
        holding.quantity = _require_positive_int(payload, "quantity")
    if "purchase_price" in payload:
        holding.avg_cost = _require_positive_number(payload, "purchase_price")

    db.session.commit()
    return jsonify(_serialize_holding(holding))


@bp.delete("/<int:portfolio_id>/holdings/<int:holding_id>")
def delete_holding(portfolio_id, holding_id):
    _get_portfolio_or_404(portfolio_id)
    holding = _get_holding_or_404(portfolio_id, holding_id)
    db.session.delete(holding)
    db.session.commit()
    return "", 204


@bp.post("/<int:portfolio_id>/deposit")
def deposit_cash(portfolio_id):
    portfolio = _get_portfolio_or_404(portfolio_id)
    payload = request.get_json(silent=True) or {}
    
    amount = _require_positive_number(payload, "amount")
    currency = payload.get("currency", "USD").upper()
    symbol = f"{currency}-CASH"
    
    security = Security.query.filter_by(symbol=symbol).first()
    if security is None:
        security = Security(
            symbol=symbol,
            name=f"{currency} Cash",
            type="CASH",
            currency=currency,
            interest_rate=0.045
        )
        db.session.add(security)
        db.session.flush()

    holding = SecurityHolding.query.filter_by(
        portfolio_id=portfolio.id, security_id=security.id
    ).first()
    
    if holding is None:
        holding = SecurityHolding(
            portfolio_id=portfolio.id,
            security_id=security.id,
            quantity=amount,
            avg_cost=1.0,
        )
        db.session.add(holding)
    else:
        holding.quantity = float(holding.quantity) + amount

    transaction = PortfolioTransaction(
        portfolio_id=portfolio.id,
        security_id=security.id,
        txn_type="DEPOSIT",
        quantity=amount,
        price=1.0,
        fees=0.0,
        executed_at=datetime.now(timezone.utc),
    )
    db.session.add(transaction)
    db.session.commit()
    
    return jsonify({
        "message": "Cash deposited successfully",
        "holding": _serialize_holding(holding),
        "transaction": _serialize_transaction(transaction)
    }), 201


@bp.post("/<int:portfolio_id>/withdraw")
def withdraw_cash(portfolio_id):
    portfolio = _get_portfolio_or_404(portfolio_id)
    payload = request.get_json(silent=True) or {}
    
    amount = _require_positive_number(payload, "amount")
    currency = payload.get("currency", "USD").upper()
    symbol = f"{currency}-CASH"
    
    security = Security.query.filter_by(symbol=symbol).first()
    if security is None:
        raise NotFoundError(f"Cash position for {currency} not found in this portfolio")
        
    holding = SecurityHolding.query.filter_by(
        portfolio_id=portfolio.id, security_id=security.id
    ).first()
    
    if holding is None or float(holding.quantity) < amount:
        raise ApiError("Insufficient cash balance for withdrawal", status_code=400)
        
    holding.quantity = float(holding.quantity) - amount
    if float(holding.quantity) == 0.0:
        db.session.delete(holding)
        
    transaction = PortfolioTransaction(
        portfolio_id=portfolio.id,
        security_id=security.id,
        txn_type="WITHDRAW",
        quantity=amount,
        price=1.0,
        fees=0.0,
        executed_at=datetime.now(timezone.utc),
    )
    db.session.add(transaction)
    db.session.commit()
    
    return jsonify({
        "message": "Cash withdrawn successfully",
        "transaction": _serialize_transaction(transaction)
    }), 201

