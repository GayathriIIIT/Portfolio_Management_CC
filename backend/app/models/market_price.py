from app.extensions import db


class MarketPrice(db.Model):
    """Append-only quote history per security. No API endpoints yet — current prices
    are served live by services.market_price_service.MarketPriceService instead."""

    __tablename__ = "market_price"
    __table_args__ = (
        db.UniqueConstraint("security_id", "as_of", name="uq_price"),
    )

    id = db.Column(db.BigInteger().with_variant(db.Integer, "sqlite"), primary_key=True)
    security_id = db.Column(db.BigInteger, db.ForeignKey("security.id"), nullable=False)
    price = db.Column(db.Numeric(18, 4), nullable=False)
    as_of = db.Column(db.DateTime, nullable=False)
    source = db.Column(db.String(32))
