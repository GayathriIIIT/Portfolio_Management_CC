from flask import Flask

from app.api.errors import register_error_handlers
from app.api.portfolios import bp as portfolios_bp
from app.config import Config
from app.extensions import db


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    register_error_handlers(app)
    app.register_blueprint(portfolios_bp)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app
