---
name: add-api-endpoint
description: Add a new Flask REST endpoint to the backend, following this repo's blueprint/error/serialization conventions. Use when asked to add, change, or extend an API route under backend/app/api.
---

# Adding a backend API endpoint

All routes currently live on the single `portfolios` blueprint in `backend\app\api\portfolios.py` (`bp = Blueprint("portfolios", __name__, url_prefix="/api/portfolios")`), registered in `backend\app\__init__.py` via `app.register_blueprint(portfolios_bp)`. If a genuinely new resource family is needed, create a new module in `backend\app\api\`, define its own `Blueprint`, and register it in `create_app()` the same way — don't cram unrelated resources onto the existing blueprint.

Conventions to follow:
- **Errors**: raise `ApiError(message, status_code=...)` or `NotFoundError(message)` from `app.api.errors` — never `abort()` or a bare `jsonify(...), 4xx`. These are caught centrally by `register_error_handlers` in `backend\app\__init__.py`.
- **Serialization**: write a `_serialize_<thing>(...)` helper near the route (see `_serialize_holding` in `portfolios.py`) rather than calling `.to_dict()` ad hoc or leaking SQLAlchemy model instances into `jsonify`.
- **DB access**: use the models in `backend\app\models\` and `app.extensions.db`; commit/rollback explicitly and narrowly (see the `try/except: db.session.rollback()` pattern around price-cache writes).
- **Config values** (thresholds, TTLs, feature flags) belong in `backend\app\config.py` and are read via `current_app.config.get(...)`, never hardcoded — e.g. `MIN_XIRR_HOLDING_DAYS`. See the financial-metrics skill if the endpoint touches returns/XIRR.

After adding or changing a route:
1. Add or update a test in `backend\tests\` (see `test_portfolios.py` / `test_holdings.py` for fixtures via `conftest.py`).
2. Run `.github\scripts\run-tests.ps1` (or the full-check skill) before considering the change done.
3. If the route is consumed by the UI, update `frontend\src\services\api.js`.
