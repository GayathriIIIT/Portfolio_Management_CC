from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request

from app.api.errors import ApiError, NotFoundError
from app.extensions import db
from app.models import Portfolio, PortfolioTransaction, Security, SecurityHolding, WhatifPrice
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
    except UnknownTickerError as exc:
        raise ApiError(str(exc), status_code=400) from exc

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
    scenario_name = payload.get("scenario_name") or payload.get("name") or "default"
    price_map = payload.get("prices", {})

    if not isinstance(price_map, dict):
        raise ApiError("'prices' must be an object of symbol to price values")

    override_prices = {}
    for symbol, value in price_map.items():
        if not isinstance(symbol, str) or not symbol.strip():
            raise ApiError("All price keys must be non-empty symbol strings")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
            raise ApiError(f"Price for '{symbol}' must be a positive number")
        override_prices[symbol.upper().strip()] = float(value)

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
                )
            )
        else:
            existing_row.hypothetical_price = value

    db.session.commit()

    return jsonify(_compute_portfolio_metrics(portfolio, override_prices=override_prices))


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
