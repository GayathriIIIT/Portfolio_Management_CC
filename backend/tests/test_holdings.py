def _create_portfolio(client):
    return client.post("/api/portfolios", json={"owner": "Alice", "name": "Retirement"}).get_json()


def test_add_holding(client):
    portfolio = _create_portfolio(client)
    resp = client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "aapl", "quantity": 10, "purchase_price": 150.0},
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["symbol"] == "AAPL"
    assert body["quantity"] == 10
    assert body["purchase_price"] == 150.0
    assert body["current_price"] == 190.0
    assert body["market_value"] == 1900.0
    assert body["unrealized_pl"] == 400.0


def test_add_holding_unknown_ticker_400(client):
    portfolio = _create_portfolio(client)
    resp = client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "NOPE", "quantity": 1, "purchase_price": 10.0},
    )
    assert resp.status_code == 400


def test_add_holding_negative_quantity_400(client):
    portfolio = _create_portfolio(client)
    resp = client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "AAPL", "quantity": -1, "purchase_price": 10.0},
    )
    assert resp.status_code == 400


def test_adding_same_symbol_twice_merges_holding(client):
    portfolio = _create_portfolio(client)
    client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 100.0},
    )
    resp = client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 200.0},
    )
    body = resp.get_json()
    assert body["quantity"] == 20
    assert body["purchase_price"] == 150.0

    holdings = client.get(f"/api/portfolios/{portfolio['id']}/holdings").get_json()
    assert len(holdings) == 1


def test_list_and_get_holding(client):
    portfolio = _create_portfolio(client)
    created = client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "MSFT", "quantity": 5, "purchase_price": 300.0},
    ).get_json()

    resp = client.get(f"/api/portfolios/{portfolio['id']}/holdings/{created['id']}")
    assert resp.status_code == 200
    assert resp.get_json()["symbol"] == "MSFT"


def test_update_holding(client):
    portfolio = _create_portfolio(client)
    created = client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "MSFT", "quantity": 5, "purchase_price": 300.0},
    ).get_json()

    resp = client.put(
        f"/api/portfolios/{portfolio['id']}/holdings/{created['id']}",
        json={"quantity": 8},
    )
    assert resp.status_code == 200
    assert resp.get_json()["quantity"] == 8


def test_delete_holding(client):
    portfolio = _create_portfolio(client)
    created = client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "MSFT", "quantity": 5, "purchase_price": 300.0},
    ).get_json()

    resp = client.delete(f"/api/portfolios/{portfolio['id']}/holdings/{created['id']}")
    assert resp.status_code == 204

    resp = client.get(f"/api/portfolios/{portfolio['id']}/holdings/{created['id']}")
    assert resp.status_code == 404


def test_portfolio_total_value_reflects_holdings(client):
    portfolio = _create_portfolio(client)
    client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 150.0},
    )
    resp = client.get(f"/api/portfolios/{portfolio['id']}")
    assert resp.get_json()["total_value"] == 1900.0
