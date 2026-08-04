import os


class Config:
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "mysql+pymysql://root:password@localhost:3306/portfoliomanager"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MARKET_PRICE_CACHE_TTL_SECONDS = int(os.environ.get("MARKET_PRICE_CACHE_TTL_SECONDS", "60"))
    ENABLE_REALTIME_PRICE_UPDATES = True
    # Only annualize returns once a position/portfolio has been invested for at
    # least this many days; extrapolating a sub-year gain is meaningless.
    MIN_XIRR_HOLDING_DAYS = int(os.environ.get("MIN_XIRR_HOLDING_DAYS", "365"))


class TestConfig(Config):
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    TESTING = True
    ENABLE_REALTIME_PRICE_UPDATES = False
