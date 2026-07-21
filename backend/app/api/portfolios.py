from flask import Blueprint, current_app, jsonify, request

from app.api.errors import ApiError, NotFoundError
from app.extensions import db
from app.models import Portfolio, Security, SecurityHolding
from app.services.market_price_service import UnknownTickerError, get_market_price_service

bp = Blueprint("portfolios", __name__, url_prefix="/api/portfolios")


def _price_service():
    ttl = current_app.config.get("MARKET_PRICE_CACHE_TTL_SECONDS")
    return get_market_price_service(ttl_seconds=ttl)


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

def _serialize_holding(holding):
    symbol = holding.security.symbol
    quantity = float(holding.quantity)
    purchase_price = float(holding.avg_cost)
    security_type = holding.security.type

    if security_type in ("CASH", "BOND"):
        current_price = purchase_price
    else:
        try:
            current_price = _price_service().get_current_price(symbol)
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
