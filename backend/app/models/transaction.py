from app.extensions import db

TXN_TYPES = ("BUY", "SELL", "DEPOSIT", "WITHDRAW")


class PortfolioTransaction(db.Model):
    """Immutable ledger of BUY/SELL/DEPOSIT/WITHDRAW events. No API endpoints yet."""

    __tablename__ = "portfolio_transaction"
    __table_args__ = (
        db.CheckConstraint(f"txn_type IN {TXN_TYPES}", name="chk_txn_type"),
    )

    id = db.Column(db.BigInteger().with_variant(db.Integer, "sqlite"), primary_key=True)
    portfolio_id = db.Column(
        db.BigInteger, db.ForeignKey("portfolio.id", ondelete="CASCADE"), nullable=False
    )
    security_id = db.Column(db.BigInteger, db.ForeignKey("security.id"), nullable=False)
    security = db.relationship("Security")
    txn_type = db.Column(db.String(16), nullable=False)
    quantity = db.Column(db.Numeric(18, 4), nullable=False)
    price = db.Column(db.Numeric(18, 4), nullable=False)
    fees = db.Column(db.Numeric(18, 4), default=0)
    executed_at = db.Column(db.DateTime, nullable=False)
