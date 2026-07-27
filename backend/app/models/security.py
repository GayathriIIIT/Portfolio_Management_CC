from app.extensions import db

SECURITY_TYPES = ("STOCK", "BOND", "CASH")


class Security(db.Model):
    __tablename__ = "security"
    __table_args__ = (
        db.CheckConstraint(f"type IN {SECURITY_TYPES}", name="chk_security_type"),
    )

    id = db.Column(db.BigInteger().with_variant(db.Integer, "sqlite"), primary_key=True)
    symbol = db.Column(db.String(32), nullable=False, unique=True)
    name = db.Column(db.String(255))
    type = db.Column(db.String(16), nullable=False)
    exchange = db.Column(db.String(32))
    currency = db.Column(db.String(3), nullable=False, default="USD")
    sector = db.Column(db.String(64))
    isin = db.Column(db.String(12))

    coupon_rate = db.Column(db.Numeric(6, 4))
    maturity_date = db.Column(db.Date)
    face_value = db.Column(db.Numeric(18, 4))

    interest_rate = db.Column(db.Numeric(6, 4))
