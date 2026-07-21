# Portfolio Management — Backend (Flask)

REST API for Portfolio CRUD + security holdings, backed by MySQL. Current prices
are served by an in-memory market-price service (`app/services/market_price_service.py`)
backed by [`yfinance`](https://pypi.org/project/yfinance/) — they are **not** read
from the database on each request.

## Setup

1. **Create the database** (MySQL Workbench or CLI) using the schema already
   committed at [`../database/schema.sql`](../database/schema.sql):

   ```
   mysql -u root -p < ../database/schema.sql
   ```

2. **Create a virtualenv and install dependencies**:

   ```
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Configure environment** — copy `.env.example` to `.env` and fill in your
   MySQL connection string:

   ```
   copy .env.example .env
   ```

4. **Run the server**:

   ```
   python run.py
   ```

   Server starts on `http://127.0.0.1:5000`. `GET /health` is a basic liveness check.

## Running tests

Tests use an in-memory SQLite database and mock all `yfinance` calls, so they
run without a live MySQL instance or network access:

```
pytest
```

## API

All endpoints are under `/api/portfolios`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/portfolios` | Create portfolio `{owner, name, base_currency?}` |
| GET | `/api/portfolios` | List portfolios |
| GET | `/api/portfolios/<id>` | Get one portfolio with holdings + computed performance |
| PUT | `/api/portfolios/<id>` | Update owner/name/base_currency |
| DELETE | `/api/portfolios/<id>` | Delete portfolio (cascades holdings) |
| POST | `/api/portfolios/<id>/holdings` | Add holding `{symbol, quantity, purchase_price}` (merges into existing holding of the same symbol) |
| GET | `/api/portfolios/<id>/holdings` | List holdings with current price/P&L |
| GET | `/api/portfolios/<id>/holdings/<holding_id>` | Get one holding |
| PUT | `/api/portfolios/<id>/holdings/<holding_id>` | Update quantity/purchase_price |
| DELETE | `/api/portfolios/<id>/holdings/<holding_id>` | Remove holding |

### Example

```
curl -X POST http://127.0.0.1:5000/api/portfolios \
  -H "Content-Type: application/json" \
  -d '{"owner": "Alice", "name": "Retirement"}'

curl -X POST http://127.0.0.1:5000/api/portfolios/1/holdings \
  -H "Content-Type: application/json" \
  -d '{"symbol": "AAPL", "quantity": 10, "purchase_price": 150.0}'

curl http://127.0.0.1:5000/api/portfolios/1
```

## Scope notes

`schema.sql`'s `portfolio_transaction` (BUY/SELL ledger), persisted `market_price`
history, and `whatif_price` scenario tables are created in the database but have
no API endpoints yet — they're left for a later enhancement phase per the
project README. Only `STOCK`-type securities are exercised through the API
today; `BOND`/`CASH` fields exist on the `security` table but aren't populated.
