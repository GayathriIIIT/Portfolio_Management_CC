from datetime import datetime, timezone

from app.extensions import db

ALERT_CONDITIONS = ("ABOVE", "BELOW")


class PriceAlert(db.Model):
    """A user-defined price target that fires when the market price crosses it.

    ``condition`` is "ABOVE" (fire when price >= target) or "BELOW" (fire when
    price <= target). A single-user feature, so no owner column. Triggered alerts
    are flagged and deactivated so they don't re-fire every poll; the bell UI
    surfaces them and the user clears them by deleting the alert.
    """

    __tablename__ = "price_alert"
    __table_args__ = (
        db.CheckConstraint(f"condition IN {ALERT_CONDITIONS}", name="chk_alert_condition"),
    )

    id = db.Column(db.BigInteger().with_variant(db.Integer, "sqlite"), primary_key=True)
    symbol = db.Column(db.String(32), nullable=False, index=True)
    target_price = db.Column(db.Numeric(18, 4), nullable=False)
    condition = db.Column(db.String(8), nullable=False, default="ABOVE")
    last_price = db.Column(db.Numeric(18, 4))
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    fired = db.Column(db.Boolean, nullable=False, default=False)
    fired_at = db.Column(db.DateTime)
    created_at = db.Column(
        db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )