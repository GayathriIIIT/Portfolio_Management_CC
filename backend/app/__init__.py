import threading

from flask import Flask

from app.api.errors import register_error_handlers
from app.api.portfolios import bp as portfolios_bp
from app.config import Config
from app.extensions import db
from app.models import Security
from app.services.market_price_service import UnknownTickerError, get_market_price_service


def _start_realtime_price_updater(app):
    if not app.config.get("ENABLE_REALTIME_PRICE_UPDATES", True):
        return

    if getattr(app, "_realtime_price_thread", None) and app._realtime_price_thread.is_alive():
        return

    stop_event = threading.Event()

    def worker():
        while not stop_event.is_set():
            try:
                with app.app_context():
                    service = get_market_price_service(
                        ttl_seconds=app.config.get("MARKET_PRICE_CACHE_TTL_SECONDS")
                    )
                    symbols = [security.symbol for security in Security.query.order_by(Security.id).all()]
                    for symbol in symbols:
                        try:
                            service.get_current_price(symbol)
                        except UnknownTickerError:
                            continue
            except Exception:
                app.logger.exception("Realtime price update failed")
            stop_event.wait(1)

    thread = threading.Thread(target=worker, daemon=True, name="realtime-price-updater")
    thread.start()
    app._realtime_price_thread = thread
    app._realtime_price_stop_event = stop_event


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    register_error_handlers(app)
    app.register_blueprint(portfolios_bp)
    _start_realtime_price_updater(app)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app
