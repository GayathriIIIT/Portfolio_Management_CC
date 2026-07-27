from datetime import datetime, timezone

from app.extensions import db


class Portfolio(db.Model):
    __tablename__ = "portfolio"

    id = db.Column(db.BigInteger().with_variant(db.Integer, "sqlite"), primary_key=True)
    owner = db.Column(db.String(128), nullable=False)
    name = db.Column(db.String(128), nullable=False)
    base_currency = db.Column(db.String(3), nullable=False, default="USD")
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    holdings = db.relationship(
        "SecurityHolding",
        backref="portfolio",
        cascade="all, delete-orphan",
        passive_deletes=False,
    )
