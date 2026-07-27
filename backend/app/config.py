import os


class Config:
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "mysql+pymysql://root:password@localhost:3306/portfoliomanager"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MARKET_PRICE_CACHE_TTL_SECONDS = int(os.environ.get("MARKET_PRICE_CACHE_TTL_SECONDS", "60"))
    ENABLE_REALTIME_PRICE_UPDATES = True


class TestConfig(Config):
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    TESTING = True
    ENABLE_REALTIME_PRICE_UPDATES = False
