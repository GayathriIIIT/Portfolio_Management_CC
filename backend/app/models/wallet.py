from app.extensions import db


class Wallet(db.Model):
    """The user's global trading wallet, one row per currency.

    Unlike a portfolio's ``{CCY}-CASH`` holding (the portfolio's own cash
    component), the wallet belongs to the user and is shared across every
    portfolio. Every BUY draws from it and every SELL pays into it; it never
    appears in a portfolio's value or charts.
    """

    __tablename__ = "wallet"

    currency = db.Column(db.String(3), primary_key=True)
    balance = db.Column(db.Numeric(20, 4), nullable=False, default=0)
