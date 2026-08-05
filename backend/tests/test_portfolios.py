from datetime import datetime, timedelta, timezone

from app.api import portfolios as portfolios_module
from app.extensions import db
from app.models import MarketPrice, PortfolioTransaction, Security, SecurityHolding, WhatifPrice
from app.services import market_price_service as mps_module


def _create_portfolio(client, owner="Alice", name="Retirement"):
    return client.post("/api/portfolios", json={"owner": owner, "name": name})


def test_create_portfolio(client):
    resp = _create_portfolio(client)
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["owner"] == "Alice"
    assert body["name"] == "Retirement"
    assert body["base_currency"] == "USD"
    assert body["holdings"] == []
    assert body["total_value"] == 0


def test_create_portfolio_defaults_owner(client):
    resp = client.post("/api/portfolios", json={"name": "Retirement"})
    assert resp.status_code == 201
    assert resp.get_json()["owner"] == "Default User"


def test_list_portfolios(client):
    _create_portfolio(client, owner="Alice")
    _create_portfolio(client, owner="Bob")

    resp = client.get("/api/portfolios")
    assert resp.status_code == 200
    body = resp.get_json()
    assert len(body) == 2
    assert {p["owner"] for p in body} == {"Alice", "Bob"}


def test_get_portfolio(client):
    created = _create_portfolio(client).get_json()
    resp = client.get(f"/api/portfolios/{created['id']}")
    assert resp.status_code == 200
    assert resp.get_json()["id"] == created["id"]


def test_get_missing_portfolio_404(client):
    resp = client.get("/api/portfolios/999")
    assert resp.status_code == 404


def test_update_portfolio(client):
    created = _create_portfolio(client).get_json()
    resp = client.put(f"/api/portfolios/{created['id']}", json={"owner": "Alicia"})
    assert resp.status_code == 200
    assert resp.get_json()["owner"] == "Alicia"


def test_delete_portfolio(client):
    created = _create_portfolio(client).get_json()
    resp = client.delete(f"/api/portfolios/{created['id']}")
    assert resp.status_code == 204

    resp = client.get(f"/api/portfolios/{created['id']}")
    assert resp.status_code == 404


def test_get_portfolio_analytics(client):
    created = _create_portfolio(client).get_json()
    client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})
    resp = client.post(
        f"/api/portfolios/{created['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 100.0},
    )
    assert resp.status_code == 201

    analytics_resp = client.get(f"/api/portfolios/{created['id']}/analytics")
    assert analytics_resp.status_code == 200
    body = analytics_resp.get_json()
    # The $1,000 wallet deposit exactly funds the $1,000 AAPL purchase, and the
    # portfolio holds no cash component, so the values are unchanged from the
    # pre-funding days.
    assert body["invested_value"] == 1000.0
    assert body["current_value"] == 1900.0
    assert body["profit_loss"] == 900.0
    assert body["profit_loss_percentage"] == 90.0


def test_analytics_xirr_annualizes_when_held_over_a_year(client):
    """Portfolios holding positions without ledger rows (legacy data) get a
    money-weighted annualized return once the position has been held for at
    least a year (extrapolating a sub-year window is meaningless)."""
    created = _create_portfolio(client).get_json()
    client.post("/api/wallet/deposit", json={"amount": 2000.0, "currency": "USD"})
    client.post(
        f"/api/portfolios/{created['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 150.0},
    )
    # add_holding writes a BUY row; simulate pre-fix data by removing the whole
    # ledger and back-dating the holding two years so annualization is meaningful.
    db.session.query(PortfolioTransaction).delete()
    holding = SecurityHolding.query.filter_by(portfolio_id=created["id"]).first()
    holding.first_purchased_at = datetime.now(timezone.utc) - timedelta(days=730)
    db.session.commit()

    body = client.get(f"/api/portfolios/{created['id']}/analytics").get_json()
    # 1500 invested 2y ago is worth 1900 now -> sqrt(1900/1500) - 1 per year.
    assert body["xirr"] == 12.5463
    # Alpha stays null when it can't be measured: TESTING mode skips the live
    # benchmark fetch, and the frontend renders null as "N/A" rather than
    # misreporting a forced 0.0 as a real alpha.
    assert body["alpha"] is None


def test_analytics_xirr_hidden_when_under_a_year(client):
    """A portfolio whose money has been invested for under a year must not show
    an annualized XIRR: the extrapolation is meaningless (a 2-week loss would
    read as ~-94% "annualized"). The metric is suppressed instead, along with
    per-holding CAGR for the still-young position."""
    created = _create_portfolio(client).get_json()
    client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})
    client.post(
        f"/api/portfolios/{created['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 1, "purchase_price": 200.0},
    )
    body = client.get(f"/api/portfolios/{created['id']}/analytics").get_json()
    assert body["xirr"] is None
    assert body["profit_loss_percentage"] < 0
    aapl = next(h for h in body["holdings"] if h["symbol"] == "AAPL")
    assert aapl["cagr"] is None


def test_refresh_portfolio_prices_returns_live_quotes_without_persisting(client):
    created = _create_portfolio(client).get_json()
    client.post("/api/wallet/deposit", json={"amount": 100000.0, "currency": "USD"})
    client.post(
        f"/api/portfolios/{created['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 100.0},
    )
    client.post(
        f"/api/portfolios/{created['id']}/holdings",
        json={"symbol": "MSFT", "quantity": 2, "purchase_price": 300.0},
    )

    resp = client.post(f"/api/portfolios/{created['id']}/refresh-prices")

    assert resp.status_code == 200
    body = resp.get_json()
    assert set(body["updated_symbols"]) == {"AAPL", "MSFT"}
    prices = {h["symbol"]: h["current_price"] for h in body["portfolio"]["holdings"]}
    assert prices["AAPL"] == 190.0
    assert prices["MSFT"] == 420.0
    assert "USD-CASH" not in prices

    persisted_prices = MarketPrice.query.order_by(MarketPrice.id).all()
    assert len(persisted_prices) == 0


def test_portfolio_chart_endpoint_returns_points_without_persisting(client, monkeypatch):
    created = _create_portfolio(client).get_json()
    client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})
    client.post(
        f"/api/portfolios/{created['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 100.0},
    )

    def fake_collect(symbol, security_id, range_key, db_session=None):
        return [
            {"timestamp": "2024-01-01T09:00:00Z", "price": 100.0},
            {"timestamp": "2024-01-01T09:05:00Z", "price": 101.0},
        ]

    monkeypatch.setattr(portfolios_module.market_price_service, "collect_and_store_price_series", fake_collect)

    resp = client.get(f"/api/portfolios/{created['id']}/analytics/chart", query_string={"range": "1d"})

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["range"] == "1d"
    assert body["points"][0]["price"] == 100.0
    assert len(MarketPrice.query.all()) == 0


def test_portfolio_what_if_analysis(client):
    created = _create_portfolio(client).get_json()
    client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})
    client.post(
        f"/api/portfolios/{created['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 100.0},
    )

    resp = client.post(
        f"/api/portfolios/{created['id']}/what-if",
        json={"scenario_name": "tech crash", "prices": {"AAPL": 200.0}},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    # The $1,000 wallet deposit exactly funds the AAPL purchase, so the portfolio
    # holds no cash component and the scenario value is the revalued 10 AAPL @ 200.
    assert body["current_value"] == 2000.0
    assert body["profit_loss"] == 1000.0
    assert body["profit_loss_percentage"] == 100.0

    persisted = WhatifPrice.query.filter_by(portfolio_id=created["id"], scenario_name="tech crash").all()
    assert len(persisted) == 1
    assert persisted[0].hypothetical_price == 200.0


def test_list_portfolio_what_if_entries(client):
    created = _create_portfolio(client).get_json()
    client.post(
        f"/api/portfolios/{created['id']}/what-if",
        json={"scenario_name": "tech crash", "prices": {"AAPL": 200.0}},
    )
    client.post(
        f"/api/portfolios/{created['id']}/what-if",
        json={"scenario_name": "rate cut", "symbol": "MSFT", "price": 180.0},
    )

    resp = client.get(f"/api/portfolios/{created['id']}/what-if")
    assert resp.status_code == 200
    body = resp.get_json()
    assert len(body) == 2
    assert {entry["symbol"] for entry in body} == {"AAPL", "MSFT"}
    assert {entry["scenario_name"] for entry in body} == {"tech crash", "rate cut"}


def test_delete_portfolio_what_if_entry(client):
    created = _create_portfolio(client).get_json()
    client.post(
        f"/api/portfolios/{created['id']}/what-if",
        json={"scenario_name": "tech crash", "prices": {"AAPL": 200.0}},
    )
    row = WhatifPrice.query.filter_by(portfolio_id=created["id"], scenario_name="tech crash").first()
    assert row is not None

    resp = client.delete(f"/api/portfolios/{created['id']}/what-if/{row.id}")
    assert resp.status_code == 204
    assert WhatifPrice.query.get(row.id) is None

    list_resp = client.get(f"/api/portfolios/{created['id']}/what-if")
    assert list_resp.status_code == 200
    assert list_resp.get_json() == []


def test_portfolio_what_if_accepts_manual_price_payload(client):
    created = _create_portfolio(client).get_json()
    client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})
    client.post(
        f"/api/portfolios/{created['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 100.0},
    )

    resp = client.post(
        f"/api/portfolios/{created['id']}/what-if",
        json={"scenario_name": "manual", "price": 250.0},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    # Deposit exactly funds the AAPL purchase, so cash ends at zero.
    assert body["current_value"] == 2500.0
    assert body["profit_loss"] == 1500.0


def test_portfolio_what_if_accepts_historical_date_payload(client, monkeypatch):
    created = _create_portfolio(client).get_json()
    client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})
    client.post(
        f"/api/portfolios/{created['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 100.0},
    )

    monkeypatch.setattr(mps_module, "get_historical_price", lambda symbol, trade_date, price_type="close": 150.0)

    resp = client.post(
        f"/api/portfolios/{created['id']}/what-if",
        json={"scenario_name": "historical", "date": "2024-01-10", "price_type": "close"},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    # The $1,000 wallet deposit exactly funds the AAPL purchase, so the portfolio
    # holds no cash component.
    assert body["current_value"] == 1500.0
    assert body["profit_loss"] == 500.0


def test_portfolio_what_if_historical_lookup_failure_returns_error(client, monkeypatch):
    created = _create_portfolio(client).get_json()
    client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})
    client.post(
        f"/api/portfolios/{created['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 100.0},
    )

    def raise_historical(symbol, trade_date, price_type="close"):
        raise mps_module.UnknownTickerError(
            f"Unable to resolve historical price for symbol '{symbol}' on {trade_date}"
        )

    monkeypatch.setattr(mps_module, "get_historical_price", raise_historical)

    resp = client.post(
        f"/api/portfolios/{created['id']}/what-if",
        json={"scenario_name": "fail", "date": "2024-01-10", "price_type": "close"},
    )
    assert resp.status_code == 400
    assert "Unable to resolve historical price" in resp.get_json()["error"]


def test_portfolio_what_if_accepts_custom_symbol_payload(client):
    created = _create_portfolio(client).get_json()

    resp = client.post(
        f"/api/portfolios/{created['id']}/what-if",
        json={"scenario_name": "custom ticker", "symbol": "MSFT", "price": 250.0},
    )
    assert resp.status_code == 200

    persisted = WhatifPrice.query.filter_by(portfolio_id=created["id"], scenario_name="custom ticker").all()
    assert len(persisted) == 1
    security = db.session.get(Security, persisted[0].security_id)
    assert security.symbol == "MSFT"
    assert persisted[0].hypothetical_price == 250.0


def test_portfolio_what_if_uses_manual_price_for_single_symbol(client, monkeypatch):
    created = _create_portfolio(client).get_json()

    monkeypatch.setattr(
        portfolios_module,
        "_price_service",
        lambda: type(
            "S",
            (),
            {
                "get_current_price": staticmethod(lambda symbol: 310.0),
                "get_security_info": staticmethod(lambda symbol: {"name": "Microsoft", "exchange": "NASDAQ", "currency": "USD", "sector": "Technology"}),
            },
        )(),
    )

    resp = client.post(
        f"/api/portfolios/{created['id']}/what-if",
        json={"scenario_name": "live lookup", "symbol": "MSFT", "price": 100.0},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    # The target price revalues the basket; the live price is the cost to build
    # it today. So the hypothetical market value is $100 and the P&L against
    # today's $310 quote is -$210.
    assert body["current_value"] == 100.0
    assert body["invested_value"] == 310.0
    assert body["profit_loss"] == -210.0
    assert body["holdings"][0]["symbol"] == "MSFT"
    assert body["holdings"][0]["market_value"] == 100.0
    assert body["holdings"][0]["cost_basis"] == 310.0


def test_portfolio_what_if_accepts_historical_high_price_for_symbol(client, monkeypatch):
    created = _create_portfolio(client).get_json()

    monkeypatch.setattr(
        portfolios_module,
        "_price_service",
        lambda: type(
            "S",
            (),
            {
                "get_current_price": staticmethod(lambda symbol: 180.0),
                "get_security_info": staticmethod(lambda symbol: {"name": "Microsoft", "exchange": "NASDAQ", "currency": "USD", "sector": "Technology"}),
            },
        )(),
    )
    monkeypatch.setattr(
        mps_module,
        "get_historical_price",
        lambda symbol, trade_date, price_type="close": 150.0,
    )

    resp = client.post(
        f"/api/portfolios/{created['id']}/what-if",
        json={"scenario_name": "historical symbol", "symbol": "MSFT", "date": "2024-01-10", "price_type": "high"},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    # Historical price revalues the basket (current_value); live price is the
    # cost basis. 150 vs today's 180 => -$30.
    assert body["current_value"] == 150.0
    assert body["invested_value"] == 180.0
    assert body["profit_loss"] == -30.0
    assert body["holdings"][0]["symbol"] == "MSFT"


def test_portfolio_what_if_sandbox_basket_sums_by_quantity(client, monkeypatch):
    """Sandbox basket semantics: market value uses the entered target price,
    cost basis uses today's live quote, and P&L = (target - live) x qty."""
    created = _create_portfolio(client).get_json()

    monkeypatch.setattr(
        portfolios_module,
        "_price_service",
        lambda: type(
            "S",
            (),
            {
                "get_current_price": staticmethod(lambda symbol: {"AAPL": 190.0, "MSFT": 310.0}[symbol]),
                "get_security_info": staticmethod(
                    lambda symbol: {"name": symbol, "exchange": "NASDAQ", "currency": "USD", "sector": "Technology"}
                ),
            },
        )(),
    )

    resp = client.post(
        f"/api/portfolios/{created['id']}/what-if",
        json={
            "scenario_name": "sandbox basket",
            "symbols": ["AAPL", "MSFT"],
            "quantities": {"AAPL": 10, "MSFT": 5},
            "prices": {"AAPL": 150.0, "MSFT": 220.0},
        },
    )
    assert resp.status_code == 200
    body = resp.get_json()
    aapl, msft = body["holdings"]
    # AAPL: 10 x 150 target = 1500 market value; 10 x 190 live = 1900 cost.
    assert aapl["market_value"] == 1500.0
    assert aapl["cost_basis"] == 1900.0
    assert aapl["profit_loss"] == -400.0
    # MSFT: 5 x 220 = 1100; 5 x 310 = 1550.
    assert msft["market_value"] == 1100.0
    assert msft["cost_basis"] == 1550.0
    assert msft["profit_loss"] == -450.0
    assert body["current_value"] == 2600.0
    assert body["invested_value"] == 3450.0
    assert body["profit_loss"] == -850.0


def test_portfolio_what_if_manual_override_never_revalues_cash(client, monkeypatch):
    """A price override must never revalue the portfolio's cash component — cash
    stays at face value regardless of the hypothetical price entered."""
    created = _create_portfolio(client).get_json()
    # Park $1,000 in portfolio cash, plus 10 AAPL @ 100.
    client.post("/api/wallet/deposit", json={"amount": 3000.0, "currency": "USD"})
    client.post(f"/api/portfolios/{created['id']}/deposit", json={"amount": 1000.0, "currency": "USD"})
    client.post(
        f"/api/portfolios/{created['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 100.0},
    )

    resp = client.post(
        f"/api/portfolios/{created['id']}/what-if",
        json={"scenario_name": "crash", "price": 250.0},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    cash = next(h for h in body["holdings"] if h["symbol"] == "USD-CASH")
    # Cash stays at face value (1,000), not $1.25M.
    assert cash["market_value"] == 1000.0
    assert cash["cost_basis"] == 1000.0
    # AAPL is revalued to 250 each.
    aapl = next(h for h in body["holdings"] if h["symbol"] == "AAPL")
    assert aapl["market_value"] == 2500.0


def test_portfolio_what_if_sandbox_rejects_cash_symbol(client, monkeypatch):
    """A cash symbol in the sandbox basket must fail cleanly (and persist
    nothing) rather than crash on a missing live quote."""
    created = _create_portfolio(client).get_json()

    monkeypatch.setattr(
        portfolios_module,
        "_price_service",
        lambda: type(
            "S",
            (),
            {
                "get_current_price": staticmethod(lambda symbol: 310.0),
                "get_security_info": staticmethod(lambda symbol: {"name": "Microsoft", "exchange": "NASDAQ", "currency": "USD", "sector": "Technology"}),
            },
        )(),
    )

    resp = client.post(
        f"/api/portfolios/{created['id']}/what-if",
        json={"scenario_name": "cash sandbox", "symbol": "USD-CASH", "price": 100.0},
    )
    assert resp.status_code == 400
    assert "cash" in resp.get_json()["error"].lower()
    assert WhatifPrice.query.filter_by(portfolio_id=created["id"], scenario_name="cash sandbox").first() is None


def test_buy_and_sell_endpoints(client):
    created = _create_portfolio(client).get_json()
    # A buy draws from the global wallet: fund enough for 2 MSFT @ 420.
    client.post("/api/wallet/deposit", json={"amount": 2000.0, "currency": "USD"})

    buy_resp = client.post(
        f"/api/portfolios/{created['id']}/buy",
        json={"symbol": "MSFT", "quantity": 2},
    )
    assert buy_resp.status_code == 201

    sell_resp = client.post(
        f"/api/portfolios/{created['id']}/sell",
        json={"symbol": "MSFT", "quantity": 1},
    )
    assert sell_resp.status_code == 201

    holdings_resp = client.get(f"/api/portfolios/{created['id']}/holdings")
    assert holdings_resp.status_code == 200
    holdings = holdings_resp.get_json()
    msft = next(h for h in holdings if h["symbol"] == "MSFT")
    assert msft["quantity"] == 1.0
    assert not any(h["symbol"] == "USD-CASH" for h in holdings)

    wallet = client.get("/api/wallet").get_json()
    usd = next(w for w in wallet if w["currency"] == "USD")
    # 2000 - 2*420 buy + 1*420 sell = 1580
    assert usd["balance"] == 1580.0


def test_buy_without_funding_rejected(client):
    """The core 'free money' bug: a user with no wallet funds has a zero balance,
    so the order is rejected instead of succeeding unchecked."""
    created = _create_portfolio(client).get_json()

    resp = client.post(
        f"/api/portfolios/{created['id']}/buy",
        json={"symbol": "MSFT", "quantity": 2},
    )
    assert resp.status_code == 400
    assert "Insufficient wallet balance" in resp.get_json()["error"]

    holdings_resp = client.get(f"/api/portfolios/{created['id']}/holdings")
    assert holdings_resp.get_json() == []


def test_sell_without_funding_credits_proceeds_to_new_wallet_balance(client):
    """Sale proceeds must never vanish. If the wallet is at zero (the user
    already spent their funds on holdings), a SELL still credits the wallet."""
    created = _create_portfolio(client).get_json()
    client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})
    client.post(
        f"/api/portfolios/{created['id']}/buy",
        json={"symbol": "AAPL", "quantity": 2, "price": 200.0},
    )

    # Zero out the wallet to reproduce a user with a holding but no funds left.
    from app.models import Wallet as _Wallet
    wallet_row = _Wallet.query.filter_by(currency="USD").first()
    wallet_row.balance = 0.0
    db.session.commit()

    sell_resp = client.post(
        f"/api/portfolios/{created['id']}/sell",
        json={"symbol": "AAPL", "quantity": 1, "price": 250.0},
    )
    assert sell_resp.status_code == 201

    wallet = client.get("/api/wallet").get_json()
    usd = next(w for w in wallet if w["currency"] == "USD")
    assert usd["balance"] == 250.0


def test_whatif_future_date_rejected(client):
    created = _create_portfolio(client).get_json()
    client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})
    client.post(
        f"/api/portfolios/{created['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 100.0},
    )
    resp = client.post(
        f"/api/portfolios/{created['id']}/what-if",
        json={"scenario_name": "future", "date": "2099-01-01"},
    )
    assert resp.status_code == 400
    assert "cannot be in the future" in resp.get_json()["error"]


def test_whatif_empty_portfolio_rejected(client):
    created = _create_portfolio(client).get_json()
    resp = client.post(
        f"/api/portfolios/{created['id']}/what-if",
        json={"scenario_name": "empty"},
    )
    assert resp.status_code == 400
    assert "no active holdings" in resp.get_json()["error"]


def test_buy_order_insufficient_cash_rejected(client):
    created = _create_portfolio(client).get_json()
    # Fund the wallet with $100
    client.post("/api/wallet/deposit", json={"amount": 100.0, "currency": "USD"})

    # Try to buy $500 worth of stock with $100 in the wallet
    resp = client.post(
        f"/api/portfolios/{created['id']}/buy",
        json={"symbol": "AAPL", "quantity": 5, "price": 100.0},
    )
    assert resp.status_code == 400
    assert "Insufficient wallet balance" in resp.get_json()["error"]


def test_buy_and_sell_adjusts_wallet_balance(client):
    created = _create_portfolio(client).get_json()
    # Fund the wallet with $1,000
    client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})

    # Buy 2 shares at $200 each = $400
    buy_resp = client.post(
        f"/api/portfolios/{created['id']}/buy",
        json={"symbol": "AAPL", "quantity": 2, "price": 200.0},
    )
    assert buy_resp.status_code == 201

    # Wallet balance dropped to $600
    wallet = client.get("/api/wallet").get_json()
    usd = next(w for w in wallet if w["currency"] == "USD")
    assert usd["balance"] == 600.0

    # The wallet is NOT part of the portfolio: analytics cash_balance stays 0.
    analytics = client.get(f"/api/portfolios/{created['id']}/analytics").get_json()
    assert analytics["cash_balance"] == 0.0

    # Sell 1 share at $250 = $250 proceeds
    sell_resp = client.post(
        f"/api/portfolios/{created['id']}/sell",
        json={"symbol": "AAPL", "quantity": 1, "price": 250.0},
    )
    assert sell_resp.status_code == 201

    # Wallet balance increased to $850
    wallet = client.get("/api/wallet").get_json()
    usd = next(w for w in wallet if w["currency"] == "USD")
    assert usd["balance"] == 850.0

