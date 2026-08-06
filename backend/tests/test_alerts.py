def _make_alert(client, symbol="AAPL", target=180.0, condition="ABOVE"):
    return client.post("/api/alerts", json={"symbol": symbol, "target_price": target, "condition": condition})


def test_create_alert(client):
    resp = _make_alert(client)
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["symbol"] == "AAPL"
    assert body["target_price"] == 180.0
    assert body["condition"] == "ABOVE"
    assert body["is_active"] is True
    assert body["fired"] is False
    # AAPL's mocked live quote is 190.0, so the list carries it as current_price.
    assert body["current_price"] == 190.0


def test_create_alert_rejects_bad_input(client):
    resp = client.post("/api/alerts", json={"symbol": "AAPL", "target_price": 0})
    assert resp.status_code == 400

    resp = client.post("/api/alerts", json={"symbol": "AAPL", "target_price": 100, "condition": "SIDEWAYS"})
    assert resp.status_code == 400
    assert "condition" in resp.get_json()["error"]

    resp = client.post("/api/alerts", json={"target_price": 100})
    assert resp.status_code == 400


def test_check_fires_above_alert(client):
    _make_alert(client, target=180.0, condition="ABOVE")
    resp = client.post("/api/alerts/check")
    assert resp.status_code == 200
    body = resp.get_json()[0]
    assert body["fired"] is True
    assert body["is_active"] is False
    assert body["fired_at"] is not None


def test_check_does_not_fire_below_alert(client):
    _make_alert(client, target=300.0, condition="ABOVE")
    body = client.post("/api/alerts/check").get_json()[0]
    assert body["fired"] is False
    assert body["is_active"] is True


def test_below_alert_fires_when_price_drops(client):
    # AAPL mock price is 190; a BELOW alert above the current price fires too.
    _make_alert(client, target=250.0, condition="BELOW")
    body = client.post("/api/alerts/check").get_json()[0]
    assert body["fired"] is True


def test_delete_alert(client):
    created = _make_alert(client).get_json()
    resp = client.delete(f"/api/alerts/{created['id']}")
    assert resp.status_code == 204
    assert client.get("/api/alerts").get_json() == []


def test_delete_missing_alert_404(client):
    assert client.delete("/api/alerts/999").status_code == 404