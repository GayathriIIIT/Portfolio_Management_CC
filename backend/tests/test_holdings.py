def _create_portfolio(client):
    return client.post("/api/portfolios", json={"owner": "Alice", "name": "Retirement"}).get_json()


def _create_funded_portfolio(client, amount=100000.0):
    """Fund the user's GLOBAL wallet — buys draw from it, not from the portfolio."""
    portfolio = _create_portfolio(client)
    resp = client.post(
        "/api/wallet/deposit",
        json={"amount": amount, "currency": "USD"},
    )
    assert resp.status_code == 200
    return portfolio


def test_add_holding(client):
    portfolio = _create_funded_portfolio(client)
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
    portfolio = _create_funded_portfolio(client)
    resp = client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "NOPE", "quantity": 1, "purchase_price": 10.0},
    )
    assert resp.status_code == 400


def test_add_holding_negative_quantity_400(client):
    portfolio = _create_funded_portfolio(client)
    resp = client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "AAPL", "quantity": -1, "purchase_price": 10.0},
    )
    assert resp.status_code == 400


def test_add_holding_without_funding_rejected(client):
    """A user with no wallet funds has a zero balance — adding a position must
    fail with 'Insufficient wallet balance', not succeed and create money from
    nothing."""
    portfolio = _create_portfolio(client)
    resp = client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 100.0},
    )
    assert resp.status_code == 400
    assert "Insufficient wallet balance" in resp.get_json()["error"]


def test_adding_same_symbol_twice_merges_holding(client):
    portfolio = _create_funded_portfolio(client)
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
    securities = [h for h in holdings if h["symbol"] != "USD-CASH"]
    assert len(securities) == 1


def test_list_and_get_holding(client):
    portfolio = _create_funded_portfolio(client)
    created = client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "MSFT", "quantity": 5, "purchase_price": 300.0},
    ).get_json()

    resp = client.get(f"/api/portfolios/{portfolio['id']}/holdings/{created['id']}")
    assert resp.status_code == 200
    assert resp.get_json()["symbol"] == "MSFT"


def test_update_holding_not_allowed(client):
    """Free-form quantity/price edits were removed — correcting a position must
    go through the ledger (sell and re-buy) so cash and history stay consistent,
    not a silent overwrite that manufactures or erases P/L."""
    portfolio = _create_funded_portfolio(client)
    created = client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "MSFT", "quantity": 5, "purchase_price": 300.0},
    ).get_json()

    resp = client.put(
        f"/api/portfolios/{portfolio['id']}/holdings/{created['id']}",
        json={"quantity": 8},
    )
    assert resp.status_code == 405

    resp = client.get(f"/api/portfolios/{portfolio['id']}/holdings/{created['id']}")
    assert resp.get_json()["quantity"] == 5.0


def test_delete_holding(client):
    portfolio = _create_funded_portfolio(client, amount=5000.0)
    created = client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "MSFT", "quantity": 5, "purchase_price": 300.0},
    ).get_json()

    resp = client.delete(f"/api/portfolios/{portfolio['id']}/holdings/{created['id']}")
    assert resp.status_code == 204

    resp = client.get(f"/api/portfolios/{portfolio['id']}/holdings/{created['id']}")
    assert resp.status_code == 404

    # Deleting liquidates the position: a SELL ledger row is written and the
    # proceeds are credited to cash instead of silently destroying value.
    txns = client.get(f"/api/portfolios/{portfolio['id']}/transactions").get_json()
    sells = [t for t in txns if t["type"] == "SELL" and t["symbol"] == "MSFT"]
    assert len(sells) == 1
    assert sells[0]["quantity"] == 5.0
    assert sells[0]["price"] == 420.0  # fake quote for MSFT

    holdings = client.get(f"/api/portfolios/{portfolio['id']}/holdings").get_json()
    assert not any(h["symbol"] == "USD-CASH" for h in holdings)

    wallet = client.get("/api/wallet").get_json()
    usd = next(w for w in wallet if w["currency"] == "USD")
    # 5000 deposited - 1500 purchase cost + 5 * 420 liquidation proceeds
    assert usd["balance"] == 5600.0


def test_delete_cash_holding_rejected(client):
    # The portfolio's own cash component (a {CCY}-CASH holding) is integral to
    # the portfolio; fund it through the per-portfolio deposit endpoint.
    portfolio = _create_portfolio(client)
    client.post(
        f"/api/portfolios/{portfolio['id']}/deposit",
        json={"amount": 1000.0, "currency": "USD"},
    )
    holdings = client.get(f"/api/portfolios/{portfolio['id']}/holdings").get_json()
    cash_holding = next(h for h in holdings if h["symbol"] == "USD-CASH")

    resp = client.delete(f"/api/portfolios/{portfolio['id']}/holdings/{cash_holding['id']}")
    assert resp.status_code == 400

    holdings = client.get(f"/api/portfolios/{portfolio['id']}/holdings").get_json()
    assert any(h["symbol"] == "USD-CASH" for h in holdings)


def test_portfolio_total_value_reflects_holdings(client):
    portfolio = _create_portfolio(client)
    # Wallet funds the buy; the portfolio deposit parks a cash component that
    # counts toward the portfolio's total value.
    client.post("/api/wallet/deposit", json={"amount": 5000.0, "currency": "USD"})
    client.post(
        f"/api/portfolios/{portfolio['id']}/deposit",
        json={"amount": 3500.0, "currency": "USD"},
    )
    client.post(
        f"/api/portfolios/{portfolio['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 150.0},
    )
    resp = client.get(f"/api/portfolios/{portfolio['id']}")
    # 3500 portfolio cash + 10 AAPL @ 190 = 1900.
    assert resp.get_json()["total_value"] == 5400.0
