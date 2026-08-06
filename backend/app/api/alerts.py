from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from app.api.errors import ApiError, NotFoundError
from app.extensions import db
from app.models import PriceAlert
from app.models.price_alert import ALERT_CONDITIONS
from app.services.market_price_service import get_market_price_service

bp = Blueprint("alerts", __name__, url_prefix="/api/alerts")


def _serialize(alert, current_price=None):
    return {
        "id": alert.id,
        "symbol": alert.symbol,
        "target_price": float(alert.target_price),
        "condition": alert.condition,
        "last_price": float(alert.last_price) if alert.last_price is not None else current_price,
        "current_price": current_price,
        "is_active": alert.is_active,
        "fired": alert.fired,
        "fired_at": alert.fired_at.isoformat() if alert.fired_at else None,
        "created_at": alert.created_at.isoformat() if alert.created_at else None,
    }


def check_active_alerts():
    """Evaluate all active, un-fired alerts and flip any whose target has been
    crossed. Idempotent and safe to call from the background price thread.

    Requires an app context (the caller is expected to run inside one). Best
    effort: an unresolvable symbol is skipped, never fatal.
    """
    service = get_market_price_service()
    alerts = PriceAlert.query.filter_by(is_active=True, fired=False).all()
    changed = False
    for alert in alerts:
        try:
            price = float(service.get_current_price(alert.symbol))
        except Exception:
            continue
        alert.last_price = price
        target = float(alert.target_price)
        if alert.condition == "ABOVE" and price >= target:
            alert.fired = True
            alert.fired_at = datetime.now(timezone.utc)
            alert.is_active = False
            changed = True
        elif alert.condition == "BELOW" and price <= target:
            alert.fired = True
            alert.fired_at = datetime.now(timezone.utc)
            alert.is_active = False
            changed = True
        else:
            changed = True
    if changed:
        db.session.commit()
    return True


def _current_prices(symbols):
    service = get_market_price_service()
    out = {}
    for sym in symbols:
        try:
            out[sym] = float(service.get_current_price(sym))
        except Exception:
            out[sym] = None
    return out


@bp.get("")
def list_alerts():
    alerts = PriceAlert.query.order_by(PriceAlert.created_at.desc()).all()
    prices = _current_prices([a.symbol for a in alerts])
    return jsonify([_serialize(a, current_price=prices.get(a.symbol)) for a in alerts])


@bp.post("")
def create_alert():
    payload = request.get_json(silent=True) or {}
    symbol = str(payload.get("symbol") or "").upper().strip()
    if not symbol:
        raise ApiError("'symbol' is required", status_code=400)
    target = payload.get("target_price")
    if isinstance(target, bool) or not isinstance(target, (int, float)) or target <= 0:
        raise ApiError("'target_price' must be a positive number", status_code=400)
    condition = str(payload.get("condition", "ABOVE") or "ABOVE").upper()
    if condition not in ALERT_CONDITIONS:
        raise ApiError(f"'condition' must be one of {', '.join(ALERT_CONDITIONS)}", status_code=400)

    alert = PriceAlert(symbol=symbol, target_price=float(target), condition=condition)
    db.session.add(alert)
    db.session.commit()
    prices = _current_prices([alert.symbol])
    return jsonify(_serialize(alert, current_price=prices.get(alert.symbol))), 201


@bp.delete("/<int:alert_id>")
def delete_alert(alert_id):
    alert = db.session.get(PriceAlert, alert_id)
    if alert is None:
        raise NotFoundError(f"Alert {alert_id} not found")
    db.session.delete(alert)
    db.session.commit()
    return "", 204


@bp.post("/check")
def run_check():
    """Force an alert evaluation now and return the updated list so the UI bell
    can refresh without waiting for the background poll."""
    check_active_alerts()
    alerts = PriceAlert.query.order_by(PriceAlert.created_at.desc()).all()
    prices = _current_prices([a.symbol for a in alerts])
    return jsonify([_serialize(a, current_price=prices.get(a.symbol)) for a in alerts])