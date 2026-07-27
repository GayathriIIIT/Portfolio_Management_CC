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

    security = db.relationship("Security")
