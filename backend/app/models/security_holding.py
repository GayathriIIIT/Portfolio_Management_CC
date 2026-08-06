from app.extensions import db


class SecurityHolding(db.Model):
    __tablename__ = "security_holding"
    __table_args__ = (
        db.UniqueConstraint("portfolio_id", "security_id", name="uq_hold"),
    )

    id = db.Column(db.BigInteger().with_variant(db.Integer, "sqlite"), primary_key=True)
    portfolio_id = db.Column(
        db.BigInteger, db.ForeignKey("portfolio.id", ondelete="CASCADE"), nullable=False
    )
    security_id = db.Column(db.BigInteger, db.ForeignKey("security.id"), nullable=False)
    quantity = db.Column(db.Numeric(18, 4), nullable=False)
    avg_cost = db.Column(db.Numeric(18, 4), nullable=False)
    first_purchased_at = db.Column(db.DateTime, nullable=True)
    # Manual current-price override in the security's native currency. Used
    # chiefly for bonds whose live Yahoo quote is stale/absent: when set, the
    # holding is valued at this price instead of the live quote, so P/L and
    # NAV reflect the user-entered price. NULL means "use the live price".
    price_override = db.Column(db.Numeric(18, 4), nullable=True)

    security = db.relationship("Security")

