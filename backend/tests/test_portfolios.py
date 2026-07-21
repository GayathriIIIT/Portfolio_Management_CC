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
