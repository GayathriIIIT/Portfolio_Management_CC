from flask import Blueprint, jsonify, request

from app.api.errors import ApiError
from app.extensions import db
from app.models import Wallet

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
