import pytest

from app import create_app
from app.config import TestConfig
from app.extensions import db
from app.services import market_price_service as mps_module

FAKE_QUOTES = {
    "AAPL": {"price": 190.0, "name": "Apple Inc.", "exchange": "NMS", "currency": "USD", "sector": "Technology"},
    "MSFT": {"price": 420.0, "name": "Microsoft Corp.", "exchange": "NMS", "currency": "USD", "sector": "Technology"},
}


def fake_fetch_quote(symbol):
    symbol = symbol.upper()
    if symbol not in FAKE_QUOTES:
        raise mps_module.UnknownTickerError(f"Unable to resolve current price for symbol '{symbol}'")
    return dict(FAKE_QUOTES[symbol])


@pytest.fixture(autouse=True)
def mock_yfinance(monkeypatch):
    monkeypatch.setattr(mps_module, "_fetch_quote", fake_fetch_quote)
    service = mps_module.get_market_price_service()
    service.clear_cache()
    yield
    service.clear_cache()


@pytest.fixture
def app():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()
