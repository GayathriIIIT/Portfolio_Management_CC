from app.models import WhatifPrice


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
