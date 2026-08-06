from datetime import date, timedelta

from app.extensions import db
from app.models import MarketPrice
from app.services import market_price_service as mps_module


def test_cached_daily_closes_persists_and_serves_from_db(app, monkeypatch):
    start = date(2025, 1, 6)  # Monday
    fake = {start + timedelta(days=i): 100.0 + i for i in range(10)}
    calls = []

    def fake_raw(symbol, s, e):
        calls.append((symbol, s, e))
        return {d: px for d, px in fake.items() if s <= d <= e}

    monkeypatch.setattr(mps_module, "_raw_daily_closes", fake_raw)

    with app.app_context():
        first = mps_module.collect_daily_closes(
            "AAPL", start, start + timedelta(days=9), security_id=7, db_session=db.session
        )
        second = mps_module.collect_daily_closes(
            "AAPL", start, start + timedelta(days=9), security_id=7, db_session=db.session
        )

        rows = MarketPrice.query.filter_by(security_id=7).all()

    assert first == fake
    assert second == fake
    # The second read is served from the DB cache — Yahoo is only hit once.
    assert len(calls) == 1
    assert len(rows) == 10


def test_backfill_daily_closes_is_idempotent(app, monkeypatch):
    start = date(2025, 3, 3)
    fake = {start + timedelta(days=i): 50.0 + i for i in range(6)}
    monkeypatch.setattr(mps_module, "_raw_daily_closes", lambda s, a, b: dict(fake))

    with app.app_context():
        first = mps_module.backfill_daily_closes(
            "MSFT", 8, start, start + timedelta(days=5), db_session=db.session
        )
        second = mps_module.backfill_daily_closes(
            "MSFT", 8, start, start + timedelta(days=5), db_session=db.session
        )

    assert first == {"fetched": 6, "stored": 6}
    assert second["fetched"] == 6
    assert second["stored"] == 0


def _create_funded_portfolio(client, amount=100000.0):
    pf = client.post("/api/portfolios", json={"owner": "Cache", "name": "T"}).get_json()
    client.post("/api/wallet/deposit", json={"amount": amount, "currency": "USD"})
    return pf


def test_backfill_endpoint_backfills_holdings(client, monkeypatch):
    pf = _create_funded_portfolio(client)
    client.post(
        f"/api/portfolios/{pf['id']}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 150.0},
    )

    monkeypatch.setattr(
        mps_module, "backfill_daily_closes", lambda *a, **k: {"fetched": 5, "stored": 5}
    )

    resp = client.post(f"/api/portfolios/{pf['id']}/backfill-prices")

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["holdings"][0]["symbol"] == "AAPL"
    assert body["holdings"][0]["stored"] == 5


def test_backfill_endpoint_skips_cash(client, monkeypatch):
    pf = _create_funded_portfolio(client)
    client.post(
        f"/api/portfolios/{pf['id']}/holdings",
        json={"currency": "USD-CASH", "quantity": 5000.0, "purchase_price": 1.0},
    )
    # Only a cash holding — backfill must still succeed with no stock rows.
    monkeypatch.setattr(mps_module, "backfill_daily_closes", lambda *a, **k: {"fetched": 0, "stored": 0})

    resp = client.post(f"/api/portfolios/{pf['id']}/backfill-prices")

    assert resp.status_code == 200
    assert resp.get_json()["holdings"] == []
