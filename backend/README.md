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

All endpoints are under `/api/`. The backend has three blueprints:

| Blueprint | URL prefix | Purpose |
|---|---|---|
| portfolios | `/api/portfolios` | Portfolio CRUD, holdings, trades, analytics, what-if, price refresh |
| wallet | `/api/wallet` | Global wallet, FX exchange |
| alerts | `/api/alerts` | Price alerts (create/list/delete/check) |

### Portfolios (`/api/portfolios`)

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
| PUT | `/api/portfolios/<id>/holdings/<holding_id>` | **Returns 405** — corrections go through a sell + re-buy instead |
| PUT | `/api/portfolios/<id>/holdings/<holding_id>/price-override` | Set manual price override `{"price": 105.5}` or clear with `{"price": null}` |
| DELETE | `/api/portfolios/<id>/holdings/<holding_id>` | Liquidate holding at market price (writes SELL ledger row, credits wallet) |
| POST | `/api/portfolios/<id>/buy` | Buy a security `{symbol, quantity, price?}` — resolves live price if omitted |
| POST | `/api/portfolios/<id>/sell` | Sell a security `{symbol, quantity, price?}` — resolves live price if omitted |
| POST | `/api/portfolios/<id>/deposit` | Deposit cash `{amount, currency?}` into the `{CCY}-CASH` position |
| POST | `/api/portfolios/<id>/withdraw` | Withdraw cash `{amount, currency?}` from the `{CCY}-CASH` position |
| GET | `/api/portfolios/<id>/transactions` | List all ledger transactions for the portfolio |
| GET | `/api/portfolios/<id>/analytics` | Portfolio-level metrics (XIRR, alpha, P&L, holdings breakdown) |
| GET | `/api/portfolios/<id>/analytics/chart` | Daily NAV series for charting `?range=1d|7d|1m|3m|6m|1y` |
| GET | `/api/portfolios/<id>/analytics/risk` | Risk metrics + recommendation `?range=1m|3m|6m|1y|all` |
| POST | `/api/portfolios/<id>/refresh-prices` | Force-refresh live quotes for all holdings |
| POST | `/api/portfolios/<id>/backfill-prices` | Backfill historical daily closes (trailing 5 years) |
| POST | `/api/portfolios/<id>/what-if` | Run a what-if scenario `{"prices": {...}}` or `{"price": N}` or `{"date": "..."}` |
| GET | `/api/portfolios/<id>/what-if` | List saved what-if scenarios |
| DELETE | `/api/portfolios/<id>/what-if/<whatif_id>` | Delete a what-if scenario |

### Market Price (`/api/portfolios`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/portfolios/market_price/realtime?symbol=TSLA` | Fetch a fresh realtime quote from Yahoo Finance |
| GET | `/api/portfolios/market_price/similar?symbol=AAPL` | Rule-based similar-stock recommendations |
| GET | `/api/portfolios/market_price/analytics?symbol=AAPL&range=1y` | Single-stock analytics (risk metrics, recommendation, NAV, chart) |

### Wallet (`/api/wallet`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/wallet` | List all wallets (one per currency) |
| POST | `/api/wallet/deposit` | Deposit into a wallet `{amount, currency?}` |
| POST | `/api/wallet/withdraw` | Withdraw from a wallet `{amount, currency?}` |
| GET | `/api/wallet/rate?from=USD&to=EUR` | Preview FX rate between two currencies |
| POST | `/api/wallet/exchange` | Convert between currencies `{from, to, amount}` |

### Alerts (`/api/alerts`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/alerts` | List all price alerts |
| POST | `/api/alerts` | Create an alert `{symbol, target_price, condition?}` (ABOVE/BELOW) |
| DELETE | `/api/alerts/<alert_id>` | Delete an alert |
| POST | `/api/alerts/check` | Force-evaluate all active alerts now |

### Health

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |

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
