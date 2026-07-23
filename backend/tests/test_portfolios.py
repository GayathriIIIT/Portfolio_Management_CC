from datetime import datetime, timezone

from app.api import portfolios as portfolios_module
from app.extensions import db
from app.models import MarketPrice, Security, WhatifPrice
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


def test_create_portfolio_requires_owner(client):
    resp = client.post("/api/portfolios", json={"name": "Retirement"})
    assert resp.status_code == 400


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
    resp = client.post(
        f"/api/portfolios/{created['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 100.0},
    )
    assert resp.status_code == 201

    analytics_resp = client.get(f"/api/portfolios/{created['id']}/analytics")
    assert analytics_resp.status_code == 200
    body = analytics_resp.get_json()
    assert body["invested_value"] == 1000.0
    assert body["current_value"] == 1900.0
    assert body["profit_loss"] == 900.0
    assert body["profit_loss_percentage"] == 90.0


def test_refresh_portfolio_prices_returns_live_quotes_without_persisting(client):
    created = _create_portfolio(client).get_json()
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
    assert body["updated_symbols"] == ["AAPL", "MSFT"]
    assert body["portfolio"]["holdings"][0]["current_price"] == 190.0
    assert body["portfolio"]["holdings"][1]["current_price"] == 420.0

    persisted_prices = MarketPrice.query.order_by(MarketPrice.id).all()
    assert len(persisted_prices) == 0


def test_portfolio_chart_endpoint_returns_points_without_persisting(client, monkeypatch):
    created = _create_portfolio(client).get_json()
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
    assert body["current_value"] == 2500.0
    assert body["profit_loss"] == 1500.0


def test_portfolio_what_if_accepts_historical_date_payload(client, monkeypatch):
    created = _create_portfolio(client).get_json()
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
    assert body["current_value"] == 1500.0
    assert body["profit_loss"] == 500.0


def test_portfolio_what_if_historical_lookup_failure_returns_error(client, monkeypatch):
    created = _create_portfolio(client).get_json()
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
    assert body["current_value"] == 310.0
    assert body["profit_loss"] == 210.0
    assert body["holdings"][0]["symbol"] == "MSFT"


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
    assert body["current_value"] == 180.0
    assert body["profit_loss"] == 30.0
    assert body["holdings"][0]["symbol"] == "MSFT"


def test_buy_and_sell_endpoints(client):
    created = _create_portfolio(client).get_json()

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
    assert len(holdings) == 1
    assert holdings[0]["quantity"] == 1.0
