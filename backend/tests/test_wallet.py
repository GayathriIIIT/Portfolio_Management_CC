def _create_portfolio(client, name="WalletPortfolio"):
    return client.post("/api/portfolios", json={"owner": "Alice", "name": name}).get_json()


def _wallet_usd(client):
    wallet = client.get("/api/wallet").get_json()
    return next((w for w in wallet if w["currency"] == "USD"), None)


def test_get_wallet_is_empty_on_fresh_start(client):
    resp = client.get("/api/wallet")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_deposit_creates_and_credits_wallet(client):
    resp = client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})
    assert resp.status_code == 200
    assert resp.get_json()["balance"] == 1000.0

    usd = _wallet_usd(client)
    assert usd is not None
    assert usd["balance"] == 1000.0


def test_deposit_defaults_to_usd(client):
    resp = client.post("/api/wallet/deposit", json={"amount": 500.0})
    assert resp.status_code == 200
    assert resp.get_json()["currency"] == "USD"
    assert resp.get_json()["balance"] == 500.0


def test_deposit_rejects_non_positive_amount(client):
    for bad in (0, -5, "abc", None, True):
        resp = client.post("/api/wallet/deposit", json={"amount": bad, "currency": "USD"})
        assert resp.status_code == 400
        assert "positive number" in resp.get_json()["error"]


def test_withdraw_debits_wallet(client):
    client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})
    resp = client.post("/api/wallet/withdraw", json={"amount": 250.0, "currency": "USD"})
    assert resp.status_code == 200
    assert resp.get_json()["balance"] == 750.0


def test_withdraw_insufficient_balance_rejected(client):
    client.post("/api/wallet/deposit", json={"amount": 100.0, "currency": "USD"})
    resp = client.post("/api/wallet/withdraw", json={"amount": 500.0, "currency": "USD"})
    assert resp.status_code == 400
    assert "Insufficient wallet balance" in resp.get_json()["error"]

    usd = _wallet_usd(client)
    assert usd["balance"] == 100.0


def test_withdraw_with_no_wallet_rejected(client):
    resp = client.post("/api/wallet/withdraw", json={"amount": 10.0, "currency": "USD"})
    assert resp.status_code == 400
    assert "Insufficient wallet balance" in resp.get_json()["error"]


def test_wallet_currencies_are_independent(client):
    client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})
    client.post("/api/wallet/deposit", json={"amount": 2000.0, "currency": "EUR"})

    wallet = {w["currency"]: w["balance"] for w in client.get("/api/wallet").get_json()}
    assert wallet["USD"] == 1000.0
    assert wallet["EUR"] == 2000.0


def test_wallet_is_shared_across_portfolios(client):
    """One wallet funds buys in any portfolio — the wallet belongs to the user,
    not to a single portfolio."""
    p1 = _create_portfolio(client, "First")
    p2 = _create_portfolio(client, "Second")
    client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})

    client.post(f"/api/portfolios/{p1['id']}/buy", json={"symbol": "AAPL", "quantity": 2, "price": 200.0})
    assert _wallet_usd(client)["balance"] == 600.0

    client.post(f"/api/portfolios/{p2['id']}/buy", json={"symbol": "MSFT", "quantity": 1, "price": 400.0})
    assert _wallet_usd(client)["balance"] == 200.0


def test_wallet_does_not_appear_in_portfolio(client):
    """The wallet is never part of a portfolio's holdings or analytics."""
    portfolio = _create_portfolio(client)
    client.post("/api/wallet/deposit", json={"amount": 5000.0, "currency": "USD"})

    holdings = client.get(f"/api/portfolios/{portfolio['id']}/holdings").get_json()
    assert holdings == []

    analytics = client.get(f"/api/portfolios/{portfolio['id']}/analytics").get_json()
    assert analytics["current_value"] == 0.0
    assert analytics["cash_balance"] == 0.0


def test_sell_credits_wallet(client):
    portfolio = _create_portfolio(client)
    client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})
    client.post(f"/api/portfolios/{portfolio['id']}/buy", json={"symbol": "AAPL", "quantity": 2, "price": 200.0})
    assert _wallet_usd(client)["balance"] == 600.0

    client.post(f"/api/portfolios/{portfolio['id']}/sell", json={"symbol": "AAPL", "quantity": 1, "price": 250.0})
    assert _wallet_usd(client)["balance"] == 850.0
