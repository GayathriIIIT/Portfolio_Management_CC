from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest

from app import create_app
from app.config import TestConfig
from app.extensions import db
from app.models.market_price import MarketPrice
from app.services import market_price_service as mps_module
from app.services.market_price_service import MarketPriceService, UnknownTickerError


def test_get_current_price_uses_fetch(monkeypatch):
    calls = []

    def fake_fetch(symbol):
        calls.append(symbol)
        return {"price": 100.0, "name": "Foo", "exchange": "NMS", "currency": "USD", "sector": "Tech"}

    monkeypatch.setattr(mps_module, "_fetch_quote", fake_fetch)
    service = MarketPriceService(ttl_seconds=60)

    assert service.get_current_price("foo") == 100.0
    assert calls == ["FOO"]


def test_cache_avoids_refetch_within_ttl(monkeypatch):
    calls = []

    def fake_fetch(symbol):
        calls.append(symbol)
        return {"price": 100.0, "name": "Foo", "exchange": "NMS", "currency": "USD", "sector": "Tech"}

    monkeypatch.setattr(mps_module, "_fetch_quote", fake_fetch)
    service = MarketPriceService(ttl_seconds=60)

    service.get_current_price("FOO")
    service.get_current_price("FOO")

    assert calls == ["FOO"]


def test_cache_refetches_after_ttl_expires(monkeypatch):
    calls = []

    def fake_fetch(symbol):
        calls.append(symbol)
        return {"price": 100.0, "name": "Foo", "exchange": "NMS", "currency": "USD", "sector": "Tech"}

    monkeypatch.setattr(mps_module, "_fetch_quote", fake_fetch)
    service = MarketPriceService(ttl_seconds=60)
    service.get_current_price("FOO")

    stale_time = datetime.now(timezone.utc) - timedelta(seconds=61)
    service._cache["FOO"]["fetched_at"] = stale_time

    service.get_current_price("FOO")
    assert calls == ["FOO", "FOO"]


def test_unknown_ticker_raises(monkeypatch):
    def fake_fetch(symbol):
        raise UnknownTickerError(f"Unable to resolve current price for symbol '{symbol}'")

    monkeypatch.setattr(mps_module, "_fetch_quote", fake_fetch)
    service = MarketPriceService(ttl_seconds=60)

    with pytest.raises(UnknownTickerError):
        service.get_current_price("NOPE")


def test_get_historical_price_uses_history_lookup(monkeypatch):
    service = MarketPriceService(ttl_seconds=60)

    def fake_historical_price(symbol, trade_date, price_type="close"):
        assert symbol == "AAPL"
        assert trade_date == "2024-01-10"
        assert price_type == "close"
        return 123.45

    monkeypatch.setattr(mps_module, "get_historical_price", fake_historical_price)

    assert service.get_historical_price("AAPL", "2024-01-10", price_type="close") == 123.45


def test_collect_and_store_price_series_persists_four_intraday_samples(monkeypatch):
    class FakeTicker:
        def __init__(self, symbol):
            self.symbol = symbol

        def history(self, *args, **kwargs):
            timestamps = [
                datetime(2024, 1, 2, 9, 30, tzinfo=timezone.utc),
                datetime(2024, 1, 2, 10, 30, tzinfo=timezone.utc),
                datetime(2024, 1, 2, 11, 30, tzinfo=timezone.utc),
                datetime(2024, 1, 2, 12, 30, tzinfo=timezone.utc),
                datetime(2024, 1, 2, 13, 30, tzinfo=timezone.utc),
                datetime(2024, 1, 2, 14, 30, tzinfo=timezone.utc),
                datetime(2024, 1, 2, 15, 30, tzinfo=timezone.utc),
            ]
            rows = []
            for index, timestamp in enumerate(timestamps):
                rows.append((timestamp, {"Close": float(100 + index)}))
            return pd.DataFrame([row[1] for row in rows], index=[row[0] for row in rows])

    monkeypatch.setattr(mps_module.yf, "Ticker", FakeTicker)

    app = create_app(TestConfig)
    with app.app_context():
        db.drop_all()
        db.create_all()
        points = mps_module.collect_and_store_price_series("AAPL", 42, range_key="1d", db_session=db.session)
        persisted_rows = MarketPrice.query.filter_by(security_id=42).all()

    assert len(points) == 4
    assert len(persisted_rows) == 4
    assert [item["price"] for item in points] == [100.0, 102.0, 104.0, 106.0]
