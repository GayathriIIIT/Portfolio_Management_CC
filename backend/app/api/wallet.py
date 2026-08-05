from flask import Blueprint, jsonify, request

from app.api.errors import ApiError
from app.extensions import db
from app.models import Wallet
from app.services.market_price_service import get_market_price_service

bp = Blueprint("wallet", __name__, url_prefix="/api/wallet")


def _get_wallet(currency):
    return Wallet.query.filter_by(currency=(currency or "USD").upper()).first()


def _ensure_wallet(currency):
    ccy = (currency or "USD").upper()
    wallet = _get_wallet(ccy)
    if wallet is None:
        wallet = Wallet(currency=ccy, balance=0)
        db.session.add(wallet)
        db.session.flush()
    return wallet


def _fx_service():
    return get_market_price_service(ttl_seconds=60)


def _require_positive_number(payload, field):
    value = payload.get(field)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        raise ApiError(f"'{field}' must be a positive number")
    return float(value)


def _serialize_wallet(wallet):
    return {"currency": wallet.currency, "balance": float(wallet.balance)}


@bp.get("")
def get_wallet():
    wallets = Wallet.query.order_by(Wallet.currency).all()
    return jsonify([_serialize_wallet(w) for w in wallets])


@bp.post("/deposit")
def deposit_wallet():
    payload = request.get_json(silent=True) or {}
    amount = _require_positive_number(payload, "amount")
    currency = str(payload.get("currency", "USD") or "USD").upper()

    wallet = _ensure_wallet(currency)
    wallet.balance = float(wallet.balance) + amount
    db.session.commit()
    return jsonify(_serialize_wallet(wallet))


@bp.post("/withdraw")
def withdraw_wallet():
    payload = request.get_json(silent=True) or {}
    amount = _require_positive_number(payload, "amount")
    currency = str(payload.get("currency", "USD") or "USD").upper()

    wallet = _ensure_wallet(currency)
    if float(wallet.balance) < amount:
        raise ApiError(
            f"Insufficient wallet balance. Available: ${float(wallet.balance):.2f}",
            status_code=400,
        )
    wallet.balance = float(wallet.balance) - amount
    db.session.commit()
    return jsonify(_serialize_wallet(wallet))


def _is_iso_code(field, value):
    ccy = str(value or "").upper().strip()
    if len(ccy) != 3 or not ccy.isalpha():
        raise ApiError(f"'{field}' must be a 3-letter ISO currency code", status_code=400)
    return ccy


@bp.get("/rate")
def wallet_fx_rate():
    """Preview FX rate between two currencies without moving money.

    Strict: a missing pair returns 502 rather than a silent 1.0 so the UI can
    surface "rate unavailable" instead of quoting a fake conversion.
    """
    from_c = _is_iso_code("from", request.args.get("from", "USD"))
    to_c = _is_iso_code("to", request.args.get("to", "USD"))
    try:
        rate = _fx_service().get_fx_rate(from_c, to_c, strict=True)
    except Exception:
        raise ApiError(f"Could not fetch FX rate for {from_c} -> {to_c}", status_code=502)
    return jsonify({"from": from_c, "to": to_c, "rate": rate})


@bp.post("/exchange")
def exchange_wallet():
    """Convert one wallet currency into another at the live FX rate.

    Debits the source currency and credits the target currency at the current
    Yahoo rate (strict: a missing pair is an error, never a silent 1.0).
    Body: ``{ "from": "USD", "to": "EUR", "amount": 100 }``.
    """
    payload = request.get_json(silent=True) or {}
    amount = _require_positive_number(payload, "amount")
    from_c = _is_iso_code("from", payload.get("from", "USD"))
    to_c = _is_iso_code("to", payload.get("to", "USD"))
    if from_c == to_c:
        raise ApiError("Cannot exchange a currency into itself", status_code=400)

    source = _ensure_wallet(from_c)
    if float(source.balance) < amount:
        raise ApiError(
            f"Insufficient {from_c} balance. Available: {float(source.balance):.2f} {from_c}",
            status_code=400,
        )

    try:
        rate = _fx_service().get_fx_rate(from_c, to_c, strict=True)
    except Exception as exc:
        raise ApiError(f"Could not fetch FX rate for {from_c} -> {to_c}", status_code=502) from exc

    received = round(amount * rate, 4)

    source.balance = float(source.balance) - amount
    target = _ensure_wallet(to_c)
    target.balance = float(target.balance) + received
    db.session.commit()

    return jsonify({
        "from_currency": from_c,
        "to_currency": to_c,
        "rate": rate,
        "received": received,
        "from": _serialize_wallet(source),
        "to": _serialize_wallet(target),
    })
