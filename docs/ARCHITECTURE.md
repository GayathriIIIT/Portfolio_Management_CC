# Portfolio Manager — Technical Overview

This is the technical picture of the whole project: how the pieces fit together, where price data comes from, and how "performance" actually gets calculated. Backend/frontend languages aren't chosen yet — everything here is written so it holds regardless of that choice.

## 1. System overview

```
 ┌────────────┐      REST/JSON       ┌───────────────┐      SQL       ┌───────────┐
 │  Frontend  │  ──────────────────► │  REST API     │ ─────────────► │   MySQL   │
 │  (TBD)     │ ◄──────────────────  │  (TBD lang)   │ ◄───────────── │           │
 └────────────┘                      └───────┬───────┘                └───────────┘
                                              │  HTTPS
                                              ▼
                                     ┌──────────────────┐
                                     │  External price   │
                                     │  source (Yahoo /  │
                                     │  sample API)       │
                                     └──────────────────┘
```

- The frontend never talks to Yahoo/the sample API directly — it always goes through your REST API. That keeps API keys/rate-limit handling in one place and means the DB, not a flaky external call, is the source of truth for what's *in* the portfolio.
- Live prices are fetched on demand or on a schedule, then written into `price_snapshot` / `portfolio_snapshot` (see [database/schema.sql](../database/schema.sql) STAGE 2) so performance charts don't depend on the external API being up.

## 2. Where to get price data

In order of what's easiest to start with:

1. **Provided sample API** (no setup, no key):
   `https://c4rm9elh30.execute-api.us-east-1.amazonaws.com/default/cachedPriceData?ticker=TSLA`
   Only supports 5 tickers: `C`, `AMZN`, `TSLA`, `FB`, `AAPL`. It's already caching Yahoo data in the background, so it's safe to poll fairly often. Good enough to get "performance" working end-to-end before touching a real Yahoo integration.

2. **`yfinance` (Python)** or **`yahoofinance-api` (Java)** — once you outgrow the 5-ticker limit. Same idea, direct to Yahoo, any ticker.

3. **Raw Yahoo CSV endpoint** (see README Appendix D) if you want to write your own fetch/parsing layer instead of a library:
   `https://query1.finance.yahoo.com/v7/finance/download/{ticker}?period1=...&period2=...&interval=1d&events=history`

Don't wire up live pricing until STAGE 1 of the DB is done and holdings can be added/browsed — the README's "start small" warning applies here too.

## 3. How performance is calculated

Per-holding:
- **Unrealized P/L** = `(current_price - cost_basis) * quantity`
- **% return** = `(current_price - cost_basis) / cost_basis * 100`
- `CASH` and (typically) `BOND` rows: treat as flat value, zero P/L, unless/until the team decides to model bond pricing.

Portfolio-level (for the "graphical performance" UI goal):
- Each time prices are refreshed (manual "refresh" button/endpoint at first, a scheduled job later), compute total portfolio value and insert one row into `portfolio_snapshot`.
- The frontend charts `portfolio_snapshot.total_value` over `snapshot_at` — a simple line chart is enough to satisfy the requirement.
- `price_snapshot` is kept separately (per-ticker) in case you later want per-holding performance charts, not just whole-portfolio.

## 4. Suggested REST endpoints

Language-agnostic — useful regardless of backend choice:

| Method | Path                          | Purpose                              |
|--------|-------------------------------|---------------------------------------|
| GET    | `/holdings`                   | Browse the portfolio                  |
| POST   | `/holdings`                   | Add an item                           |
| DELETE | `/holdings/{id}`               | Remove an item                        |
| GET    | `/holdings/{id}/performance`   | Per-holding P/L (STAGE 1+)             |
| GET    | `/portfolio/performance`       | Whole-portfolio value over time (STAGE 2) |
| POST   | `/portfolio/refresh`           | Trigger a price refresh → new snapshot |

## 5. Project layout

```
backend/    — placeholder, empty until the team picks a language/framework
frontend/   — placeholder, empty until the team picks a UI approach
database/   — schema.sql (staged DDL) + seed_data.sql, MySQL
docs/       — this file
```
