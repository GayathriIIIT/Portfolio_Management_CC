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
    if security_type in ("CASH", "BOND"):
        return purchase_price
    try:
        return float(_price_service().get_current_price(symbol))
    except UnknownTickerError:
        return purchase_price


def _serialize_holding(holding, override_prices=None):
    symbol = holding.security.symbol
    quantity = float(holding.quantity)
    purchase_price = float(holding.avg_cost)
    security_type = holding.security.type

    if override_prices is not None and symbol in override_prices:
        current_price = float(override_prices[symbol])
    elif security_type in ("CASH", "BOND"):
        current_price = purchase_price
    else:
        try:
            current_price = float(_price_service().get_current_price(symbol))
        except UnknownTickerError:
            current_price = purchase_price

    market_value = current_price * quantity
    cost_basis = purchase_price * quantity
    unrealized_pl = market_value - cost_basis
    unrealized_pl_pct = (unrealized_pl / cost_basis * 100) if cost_basis else 0.0

    return {
        "id": holding.id,
        "symbol": symbol,
        "quantity": quantity,
        "purchase_price": purchase_price,
        "current_price": current_price,
        "market_value": market_value,
        "unrealized_pl": unrealized_pl,
        "unrealized_pl_pct": unrealized_pl_pct,
    }


def _compute_portfolio_metrics(portfolio, override_prices=None):
    invested_value = 0.0
    current_value = 0.0
    holdings = []

    for holding in portfolio.holdings:
        quantity = float(holding.quantity)
        purchase_price = float(holding.avg_cost)
        current_price = _get_price_for_holding(holding, override_prices=override_prices)
        invested_value += quantity * purchase_price
        current_value += quantity * current_price
        holdings.append(_serialize_holding(holding, override_prices=override_prices))

    profit_loss = current_value - invested_value
    profit_loss_percentage = (profit_loss / invested_value * 100) if invested_value else 0.0

    return {
        "portfolio_id": portfolio.id,
        "invested_value": invested_value,
        "current_value": current_value,
        "profit_loss": profit_loss,
        "profit_loss_percentage": profit_loss_percentage,
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

    security = Security(
        symbol=symbol,
        name=info.get("name"),
        type="STOCK",
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
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise ApiError("'date' must be an ISO date string in YYYY-MM-DD format") from exc
    raise ApiError("'date' must be a valid date")


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

def _serialize_portfolio(portfolio, include_holdings=True):
    data = {
        "id": portfolio.id,
        "owner": portfolio.owner,
        "name": portfolio.name,
        "base_currency": portfolio.base_currency,
        "created_at": portfolio.created_at.isoformat() if portfolio.created_at else None,
    }
    if include_holdings:
        holdings = [_serialize_holding(h) for h in portfolio.holdings]
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
    owner = _require_string(payload, "owner")
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
                if holding.security.type in {"CASH", "BOND"}:
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

    db.session.commit()
    return jsonify(_serialize_holding(holding)), 201


@bp.post("/<int:portfolio_id>/buy")
def buy_holding(portfolio_id):
    portfolio = _get_portfolio_or_404(portfolio_id)
    payload = request.get_json(silent=True) or {}

    symbol = _require_string(payload, "symbol").upper()
    quantity = _require_positive_int(payload, "quantity")
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

    security = _get_or_create_security(symbol)
    holding = SecurityHolding.query.filter_by(
        portfolio_id=portfolio.id, security_id=security.id
    ).first()

    if holding is None:
        holding = SecurityHolding(
            portfolio_id=portfolio.id,
            security_id=security.id,
            quantity=quantity,
            avg_cost=price,
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
        executed_at=datetime.now(timezone.utc),
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
    quantity = _require_positive_int(payload, "quantity")
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

    fees = payload.get("fees", 0)
    if isinstance(fees, bool) or not isinstance(fees, (int, float)) or fees < 0:
        raise ApiError("'fees' must be a non-negative number")
    fees = float(fees)

    if existing_qty == quantity:
        db.session.delete(holding)
    else:
        holding.quantity = existing_qty - quantity

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
