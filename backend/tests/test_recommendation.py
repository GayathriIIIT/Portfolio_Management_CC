import pytest

from app.services.recommendation import generate_recommendation


def test_no_risk_metrics_means_insufficient_data():
    rec = generate_recommendation(None)
    assert rec["action"] == "INSUFFICIENT_DATA"
    assert rec["reasons"]


def test_very_short_window_is_insufficient_data():
    risk = {
        "period_days": 12,
        "sufficient_history": False,
        "sharpe_ratio": None,
        "max_drawdown": 3.0,
        "beta": None,
        "up_capture": None,
        "down_capture": None,
    }
    rec = generate_recommendation(risk, alpha=None, xirr=None)
    assert rec["action"] == "INSUFFICIENT_DATA"
    assert "days of data" in rec["reasons"][0]


def test_strong_signals_recommend_add():
    risk = {
        "period_days": 400,
        "sufficient_history": True,
        "sharpe_ratio": 2.1,
        "max_drawdown": 8.0,
        "beta": 0.9,
        "up_capture": 135.0,
        "down_capture": 60.0,
    }
    rec = generate_recommendation(risk, alpha=6.5, xirr=28.0, profit_loss_percentage=45.0)
    assert rec["action"] == "ADD"
    assert rec["confidence"] == "high"
    assert len(rec["reasons"]) >= 4


def test_weak_signals_recommend_sell():
    risk = {
        "period_days": 500,
        "sufficient_history": True,
        "sharpe_ratio": -0.9,
        "max_drawdown": 42.0,
        "beta": 1.6,
        "up_capture": 55.0,
        "down_capture": 140.0,
    }
    rec = generate_recommendation(risk, alpha=-8.0, xirr=-12.0, profit_loss_percentage=-30.0)
    assert rec["action"] == "SELL"


def test_neutral_signals_recommend_hold():
    risk = {
        "period_days": 400,
        "sufficient_history": True,
        "sharpe_ratio": 0.8,
        "max_drawdown": 12.0,
        "beta": 1.05,
        "up_capture": 100.0,
        "down_capture": 100.0,
    }
    rec = generate_recommendation(risk, alpha=1.0, xirr=8.0, profit_loss_percentage=10.0)
    assert rec["action"] == "HOLD"


def test_risk_endpoint_rejects_invalid_range(client):
    created = client.post("/api/portfolios", json={"owner": "Risk", "name": "T"}).get_json()
    resp = client.get(f"/api/portfolios/{created['id']}/analytics/risk?range=9m")
    assert resp.status_code == 400


def test_risk_endpoint_accepts_range(client):
    created = client.post("/api/portfolios", json={"owner": "Risk", "name": "T"}).get_json()
    for r in ("1m", "3m", "6m", "1y", "all"):
        resp = client.get(f"/api/portfolios/{created['id']}/analytics/risk?range={r}")
        assert resp.status_code == 200
        assert resp.get_json()["range"] == r


def test_stock_analytics_requires_symbol(client):
    resp = client.get("/api/portfolios/market_price/analytics")
    assert resp.status_code == 400


def test_stock_analytics_rejects_invalid_range(client):
    resp = client.get("/api/portfolios/market_price/analytics?symbol=AAPL&range=9m")
    assert resp.status_code == 400


def test_stock_analytics_empty_under_testing(client):
    """Under TESTING the endpoint never hits the network and returns an empty payload."""
    resp = client.get("/api/portfolios/market_price/analytics?symbol=AAPL&range=1y")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["symbol"] == "AAPL"
    assert body["metrics"] is None
    assert body["recommendation"] is None
    assert body["nav"] == []
    assert body["benchmark"] == "SPY"
    assert body["range"] == "1y"


def test_stock_analytics_accepts_all_ranges(client):
    for r in ("1m", "3m", "6m", "1y"):
        resp = client.get(f"/api/portfolios/market_price/analytics?symbol=MSFT&range={r}")
        assert resp.status_code == 200
        assert resp.get_json()["range"] == r
