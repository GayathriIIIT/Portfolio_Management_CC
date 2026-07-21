from datetime import datetime, timezone

from app.extensions import db


class WhatifPrice(db.Model):
    """Hypothetical price per security for a named what-if scenario. No API endpoints yet."""

    __tablename__ = "whatif_price"
    __table_args__ = (
        db.UniqueConstraint(
            "portfolio_id", "scenario_name", "security_id", name="uq_wp"
        ),
    )

    id = db.Column(db.BigInteger().with_variant(db.Integer, "sqlite"), primary_key=True)
    portfolio_id = db.Column(
        db.BigInteger, db.ForeignKey("portfolio.id", ondelete="CASCADE"), nullable=False
    )
    scenario_name = db.Column(db.String(128), nullable=False)
    security_id = db.Column(db.BigInteger, db.ForeignKey("security.id"), nullable=False)
    hypothetical_price = db.Column(db.Numeric(18, 4), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
