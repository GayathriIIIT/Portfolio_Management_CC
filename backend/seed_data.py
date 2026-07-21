"""Populate every table in database/schema.sql with sample data.

Portfolio/Security/SecurityHolding could be created through the REST API, but
PortfolioTransaction/MarketPrice/WhatifPrice have no endpoints yet (see
backend/README.md "Scope notes"), so this script writes directly via the
SQLAlchemy models instead. It's idempotent: re-running it looks up existing
rows by their natural key (owner+name, symbol, etc.) instead of duplicating.

Usage:
    python seed_data.py
"""

from datetime import date, datetime, timedelta, timezone

from dotenv import load_dotenv

load_dotenv()

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import (  # noqa: E402
    MarketPrice,
    Portfolio,
    PortfolioTransaction,
    Security,
    SecurityHolding,
    WhatifPrice,
)

app = create_app()


def get_or_create_portfolio(owner, name, base_currency="USD"):
    portfolio = Portfolio.query.filter_by(owner=owner, name=name).first()
    if portfolio is None:
        portfolio = Portfolio(owner=owner, name=name, base_currency=base_currency)
        db.session.add(portfolio)
        db.session.flush()
        print(f"  + portfolio {owner}/{name}")
    return portfolio


def get_or_create_security(symbol, **fields):
    security = Security.query.filter_by(symbol=symbol).first()
    if security is None:
        security = Security(symbol=symbol, **fields)
        db.session.add(security)
        db.session.flush()
        print(f"  + security {symbol}")
    return security


def get_or_create_holding(portfolio, security, quantity, avg_cost):
    holding = SecurityHolding.query.filter_by(
        portfolio_id=portfolio.id, security_id=security.id
    ).first()
    if holding is None:
        holding = SecurityHolding(
            portfolio_id=portfolio.id,
            security_id=security.id,
            quantity=quantity,
            avg_cost=avg_cost,
        )
        db.session.add(holding)
        print(f"  + holding {portfolio.owner}/{portfolio.name} -> {security.symbol}")
    return holding


def add_transaction(portfolio, security, txn_type, quantity, price, executed_at, fees=0):
    exists = PortfolioTransaction.query.filter_by(
        portfolio_id=portfolio.id,
        security_id=security.id,
        txn_type=txn_type,
        executed_at=executed_at,
    ).first()
    if exists is None:
        db.session.add(
            PortfolioTransaction(
                portfolio_id=portfolio.id,
                security_id=security.id,
                txn_type=txn_type,
                quantity=quantity,
                price=price,
                fees=fees,
                executed_at=executed_at,
            )
        )
        print(f"  + transaction {txn_type} {security.symbol} x{quantity} @ {price}")


def add_market_price(security, price, as_of, source="seed"):
    exists = MarketPrice.query.filter_by(security_id=security.id, as_of=as_of).first()
    if exists is None:
        db.session.add(
            MarketPrice(security_id=security.id, price=price, as_of=as_of, source=source)
        )
        print(f"  + market_price {security.symbol} @ {as_of.date()} = {price}")


def add_whatif_price(portfolio, scenario_name, security, hypothetical_price):
    exists = WhatifPrice.query.filter_by(
        portfolio_id=portfolio.id, scenario_name=scenario_name, security_id=security.id
    ).first()
    if exists is None:
        db.session.add(
            WhatifPrice(
                portfolio_id=portfolio.id,
                scenario_name=scenario_name,
                security_id=security.id,
                hypothetical_price=hypothetical_price,
            )
        )
        print(f"  + whatif_price [{scenario_name}] {security.symbol} -> {hypothetical_price}")


def seed():
    now = datetime.now(timezone.utc)

    print("Portfolios:")
    alice = get_or_create_portfolio("Alice", "Retirement", "USD")
    bob = get_or_create_portfolio("Bob", "Trading", "USD")
    carol = get_or_create_portfolio("Carol", "College Fund", "USD")

    print("Securities:")
    aapl = get_or_create_security(
        "AAPL", name="Apple Inc.", type="STOCK", exchange="NASDAQ",
        currency="USD", sector="Technology",
    )
    msft = get_or_create_security(
        "MSFT", name="Microsoft Corporation", type="STOCK", exchange="NASDAQ",
        currency="USD", sector="Technology",
    )
    tsla = get_or_create_security(
        "TSLA", name="Tesla, Inc.", type="STOCK", exchange="NASDAQ",
        currency="USD", sector="Consumer Cyclical",
    )
    bond = get_or_create_security(
        "US10Y-2030", name="US Treasury 10Y Note 2030", type="BOND", exchange="OTC",
        currency="USD", coupon_rate=0.0425, maturity_date=date(2030, 5, 15), face_value=1000,
    )
    cash = get_or_create_security(
        "USD-CASH", name="US Dollar Cash", type="CASH", currency="USD", interest_rate=0.045,
    )

    print("Security holdings:")
    get_or_create_holding(alice, aapl, quantity=15, avg_cost=165.25)
    get_or_create_holding(alice, msft, quantity=8, avg_cost=310.00)
    get_or_create_holding(alice, bond, quantity=5000, avg_cost=0.98)
    get_or_create_holding(alice, cash, quantity=2500, avg_cost=1.00)
    get_or_create_holding(bob, tsla, quantity=20, avg_cost=210.50)
    get_or_create_holding(bob, aapl, quantity=5, avg_cost=172.00)
    get_or_create_holding(carol, msft, quantity=12, avg_cost=295.75)
    get_or_create_holding(carol, cash, quantity=1000, avg_cost=1.00)

    print("Portfolio transactions:")
    add_transaction(alice, aapl, "BUY", 15, 165.25, now - timedelta(days=90))
    add_transaction(alice, msft, "BUY", 8, 310.00, now - timedelta(days=60))
    add_transaction(alice, cash, "DEPOSIT", 2500, 1.00, now - timedelta(days=100))
    add_transaction(bob, tsla, "BUY", 25, 205.00, now - timedelta(days=45))
    add_transaction(bob, tsla, "SELL", 5, 230.00, now - timedelta(days=10))
    add_transaction(bob, aapl, "BUY", 5, 172.00, now - timedelta(days=20))
    add_transaction(carol, msft, "BUY", 12, 295.75, now - timedelta(days=30))
    add_transaction(carol, cash, "DEPOSIT", 1000, 1.00, now - timedelta(days=30))
    add_transaction(carol, cash, "WITHDRAW", 200, 1.00, now - timedelta(days=5))

    print("Market price history:")
    for i, price in enumerate([160.0, 172.5, 185.0]):
        add_market_price(aapl, price, now - timedelta(days=(2 - i) * 30))
    for i, price in enumerate([300.0, 315.0, 320.0]):
        add_market_price(msft, price, now - timedelta(days=(2 - i) * 30))
    for i, price in enumerate([200.0, 225.0, 240.0]):
        add_market_price(tsla, price, now - timedelta(days=(2 - i) * 30))
    add_market_price(bond, 0.97, now - timedelta(days=30))
    add_market_price(bond, 0.99, now)
    add_market_price(cash, 1.00, now)

    print("Whatif scenarios:")
    add_whatif_price(alice, "Tech crash", aapl, 110.0)
    add_whatif_price(alice, "Tech crash", msft, 220.0)
    add_whatif_price(alice, "Rate cut", bond, 1.03)
    add_whatif_price(bob, "Tech crash", tsla, 140.0)

    db.session.commit()
    print("\nDone.")


if __name__ == "__main__":
    with app.app_context():
        seed()
