Slide 1 — Title & Executive Summary (Product + Managerial)
Project: MoneyMaxxing — Personal Portfolio Laboratory
- One-paragraph pitch: "MoneyMaxxing" is a full-stack, single-user investment workbench that lets an investor model, trade, and analyze a multi-asset portfolio (stocks, bonds, cash) in real time against live Yahoo Finance prices — with a professional React UI, a Flask/SQLAlchemy REST API, and a from-scratch financial-engineering core (TWR, XIRR, Sharpe, Jensen's alpha). The app treats the process of investing as a learnable science: every number is explained, every return is auditable, and every assumption can be stress-tested.
- Problem solved: Self-directed investors lack a single place to (a) see what they own, (b) understand why it's up/down, and (c) safely experiment with "what if" scenarios without risking real money.
- Two products in one: (1) a live portfolio tracker/dashboard, (2) a "wealth laboratory" for scenario simulation, risk diagnostics, and rule-based recommendations.
- Status: Backend committed to main as feat: enhance portfolio trading and what-if analysis workflows (PR #17); working tree clean. Stack is production-complete for a single-user training deliverable.
Slide 2 — Product: Features & User Journeys (Product)
Who it's for: a retail/self-directed investor (and their instructor). No auth — single shared user.
Core user journeys (8):
1. Manage portfolios → create, rename, re-currency, delete portfolios; pick which is "active" (sidebar footer tracks the active portfolio + its base currency).
2. Buy & Sell → TradePage: pick BUY/SELL, autocomplete a ticker (recent + suggested), "Get Quote" → live Yahoo price + FX auto-fetched, enter quantity + fees, Execute. SELL is validated against owned quantity; BUY is gated by wallet balance.
3. Fund the account → Deposit/Withdraw cash into the global wallet (with quick-amount buttons: 100/200/500/1000/2000/5000) or exchange currencies at live FX rates; wallet balance shown live in the trade box.
4. Browse holdings → HoldingsPage table: symbol + name, exchange/currency badges, live market value, P&L, CAGR; click "Analytics" to open a per-security risk modal.
5. Review the ledger → TransactionsPage: immutable history, filterable by Txn Type (BUY/SELL/DEPOSIT/WITHDRAW) and by Security Type (STOCK/BOND/CASH — new), with company names.
6. Analyze performance → Dashboard: 6 KPI cards (Portfolio Value, Invested, Unrealized P&L, Return on Cost, Annualized XIRR, Jensen's Alpha vs SPY) + Risk & Performance card (NAV chart + 14 risk tiles) + Asset Allocation pie + Performance chart.
7. Simulate scenarios → What-If Simulator: revalue all holdings (or a custom basket of symbols) at a manual hypothetical price, or at a historical date's Open/Close/High/Low; save scenarios to the whatif_price table and re-run each row with "Results" (snapshot) and "Recheck" (refreshed live price) popups.
8. Export & alert → Report/PDF page (printable snapshot); Price Alerts (ABOVE/BELOW targets) auto-checked in the background every price-refresh and on demand.
Delight layer: an optional "brainrot" meme theme (dark/light toggle + brainrot mode) with animated GIFs for profit/loss, portfolio-management, and trade-dance moments — and a reusable "UserTour" first-run guide.
Slide 3 — Architecture Overview (Technical)
Three-tier + external data plane, single shared-nothing deployment.
┌───────────────┐  HTTPS/JSON   ┌──────────────────────┐  SQL    ┌──────────────┐
│   Frontend     │ ◄──────────►  │  Backend (Flask)      │ ◄─────► │  MySQL DB     │
│  React 19/Vite  │               │  + Flask-SQLAlchemy   │         │  8 tables     │
│  Recharts UI    │               │  3 Blueprints         │         │  (schema.sql) │
└──────┬─────────┘               └─────────┬──────────────┘         └──────────────┘
       │                                     │ HTTPS
       │  Live prices are NEVER returned by  │  (Yahoo Finance via `yfinance`)
       │  directly — the frontend always goes │  ─ background refresh thread
       │  through the REST API (keys/rate-   │  ─ live quote cache (60s TTL)
       │  limit handled in one place)        │  ─ historical backfill → market_price
       └─────────────────────────────────────┘
Runtime flow of a single request: Frontend fetch('/api/...') → API blueprint route → _get_portfolio_or_404 → business logic (services) → SQLAlchemy → MySQL (inputs only) → results assembled by _serialize_* helpers → JSON → React renders Recharts/areas/pies.
Key architectural invariants:
- Source of truth = the database for what's owned; Yahoo via the API for current prices.
- Store inputs only. security_holding keeps quantity + avg_cost + optional price_override — P/L and market value are never persisted, always computed on read (so overrides, FX, and scenarios stay consistent).
- The wallet is global & shared across all portfolios (BUY debits it, SELL credits it) and is never part of a portfolio's value/charts. Portfolio cash ({CCY}-CASH) is a separate in-portfolio holding priced at face value 1.0.
- Immutable ledger: portfolio_transaction is append-only; security_holding can be rebuilt from it; holdings can't be edited directly (PUT → 405; corrections = sell + re-buy).
- Background worker thread (_start_realtime_price_updater): polls live quotes for every security, refreshes the in-process price cache, then evaluates crossed price-alerts — so the UI needs no polling for alerts.
External data sources: Yahoo Finance (yfinance) for live quotes + historical daily closes + fundamentals + FX pairs ({FROM}{TO}=X); risk-free rate from 13-week T-bill ^IRX (cached 6h).
Slide 4 — Data Model & API Surface (Technical)
Database: 8 tables (MySQL), single-table-inheritance on security.type ∈ {STOCK, BOND, CASH}.
Table	Role	Key design note
portfolio	Container	owner (free-text, no auth), base_currency, created_at
security	Master data, 1 row/symbol	Auto-created on first BUY via yfinance; type discriminator (BOND/CASH cols nullable)
security_holding	Aggregate position	weighted-avg avg_cost; optional price_override (bonds w/ stale quotes); unique (portfolio,security)
portfolio_transaction	Immutable ledger	BUY/SELL/DEPOSIT/WITHDRAW; rebuilds holdings + drives XIRR
market_price	Historical quote cache	append-only daily closes, deduped; written by backfill, read by charts
whatif_price	Saved scenarios	keyed by (portfolio, scenario_name, security); manual or historical
wallet	Global user cash	1 row/currency; shared wallet
price_alert	User price targets	ABOVE/BELOW; auto-fired/deactivated
API: 3 Flask blueprints, ~47 routes, all under /api.
- /api/portfolios — Portfolio CRUD, holdings, buy/sell (live-price-resolving trades), deposit/withdraw, transactions ledger, analytics (/analytics, /analytics/chart, /analytics/risk), refresh-prices, backfill-prices, what-if (run + list + delete), market_price/realtime + similar + analytics, plus per-holding price-override & liquidate.  (Portfolio value, risk metrics, alpha, and what-if P&L are computed server-side and returned as JSON.)
- /api/wallet — list/deposit/withdraw/exchange + FX rate preview (strict: missing FX pair = 502, never silent 1.0).
- /api/alerts — create/list/delete/price-check (background + on-demand).
- GET /health liveness; POST /api/portfolios + /buy examples in backend/API_TEST_CURLS.md.
- Validation: positive-number/positive-int helpers, symbol uppercasing, cash routing, insufficient-funds & insufficient-shares guards.
Slide 5 — The Financial Engine (Technical — the intellectual core)
Returns philosophy: returns must be honest. Deposits/withdrawals are capital flows, not gains, so a +$1000 deposit never reads as "+108% best day."
- Per-holding: Unrealized P/L = (live_price − cost_basis) × qty; CAGR via money-weighted XIRR of the security's own BUY/SELL cash flows + today's market value (so later purchases at different prices are correctly weighted), gated to ≥30 days, falling back to simple return.
- Portfolio: XIRR = money-weighted annualized return from the portfolio-level ledger cash flows (DEP/WITHDRAW are external flows; BUY/SELL are internal). Gated to ≥365 days — a sub-year gain is never annualized (avoids absurd extrapolations); the UI hides the "Annualized Return" card instead. Jensen's alpha = CAPM excess return vs SPY (annualized, rf = 13wk T-bill ^IRX), computed from a reconstructed daily NAV.
- NAV reconstruction (_reconstruct_nav_series): replays the entire BUY/SELL/DEPOSIT/WITHDRAW ledger day-by-day, pricing each position at its historical daily close (Yahoo, forward-filled from the market_price cache), FX-converting to the base currency, and adding running cash. Unfunded BUYs are funded with synthetic opening capital offset so trade size can't masquerade as return; external flows are reported separately so compute_risk_metrics can build a Time-Weighted Return.
- Risk stats (risk_metrics.py, pure & unit-tested): Total Return (TWR), max drawdown, daily + annualized volatility (252-day convention), Sharpe, Sortino, Calmar, Jensen's alpha, beta, correlation, up-capture & down-capture, best/worst day, with a sufficient_history flag so the UI gates annualized/benchmark-relative stats (≥6 weeks for beta/correlation/capture).
- Recommendation engine (recommendation.py): rule-based ADD/HOLD/SELL/INSUFFICIENT_DATA with explicit, human-readable reasons (Sharpe, Sortino, Calmar, drawdown, beta, correlation, capture, alpha, XIRR, total return, P/E, dividend yield, sector concentration). Conservative by design — sub-year windows return INSUFFICIENT_DATA rather than a noisy call.
- What-if "reverse P&L": portfolio scenarios value the basket at a hypothetical price and display (today's live value − scenario value) — so a bull scenario (hypothetical price above today) reads as a loss, and a bear scenario below today reads as a profit.
Slide 6 — Frontend Experience (Product + Technical)
Stack: React 19 (hooks) + Vite dev/build, Recharts for all charts (area/line/pie), lucide-react icons, oxlint for linting, CSS-variables design system (dark/light + "brainrot" meme theme) via ThemeContext. State kept minimal & co-located; parent App owns portfolios/wallet/active-tab/modals and passes a dataVersion bump so charts/risk-card refetch after a trade.
Layout: fixed Sidebar (7 nav targets + active-portfolio footer + color-scheme toggle) ↔ Header (portfolio picker, wallet balance, Refresh Prices, Backfill History) ↔ page-content + floating modals (Trade, Add Holding, New Portfolio, Manage Cash, Wallet, pre-trade Analytics).
Page-by-page:
- Dashboard — 6 KPI cards (incl. brainrot profit/loss GIFs), Risk card (NAV area + 14 metric tiles + recommendation banner w/ "Why?" reasons), Performance chart (per-asset series, range + benchmark selectors SPY/QQQ/DIA/VT/Custom/None, custom tooltip) + Asset Allocation pie + Holdings table.
- Holdings — HoldingsTable: symbol/name, exchange & currency badges, live value, P&L, CAGR, per-row Buy/Sell/Price-Override/Delete, per-holding Analytics → modal (period selector, NAV, metrics, similar stocks carousel).
- Trade — two-column: order form (wallet badge, BUY/SELL switcher, ticker autocomplete, Get Quote + Get Analytics buttons, read-only BUY price set via live quote, FX-aware totals, fee input, validation, recent-executed-trades feed) ↔ analytics modal.
- Transactions — full ledger table with dual filter (Type + Security Type STOCK/BOND/CASH), company names, color badges.
- What-If — sandbox basket (custom symbols + quantities) or portfolio revaluation; manual-price vs historical-date (price_type), saved-scenario table with Results and Recheck re-run popups, inline live-result card.
- Report — printable PDF-ready sheet (holdings + recent 50 transactions) with a Print/Save-as-PDF button.
- Portfolios — CRUD grid (brainrot side-eye GIF) with inline rename + currency edit.
UX quality bars: stale-response guarding (portfolio switch can't repaint the wrong KPIs), self-guarded refresh so manual + 2-min auto-timer never overlap, Enter-key never submits an order, cross-currency order totals auto-converted, and a data-version signal so post-trade dashboards refetch.
Slide 7 — Engineering & Delivery (Managerial + Technical)
Team/org: TAP Program Month-1 training project — a single team owning full stack end-to-end (no backend/frontend split; roles fluid). Git workflow: feature branches → Pull Requests → merged to main (the latest work arrived via PR #17 from RamaKrishnaSastry).
Tech choices & rationale:
- Flask + Flask-SQLAlchemy = deliberately small surface, easy to reason about for a training deliverable; db.Model models mirror the schema 1:1.
- MySQL (PyMySQL) per the README's "use the DB tech you're learning"; SQLite in-memory + mocked yfinance for the full pytest suite (pytest.ini, conftest.py) so tests run anywhere with no network/DB.
- React + Vite + Recharts = modern, fast HMR, zero-config builds, charting already available.
- yfinance chosen over the 5-ticker sample API once tickers grew beyond AAPL/AMZN/TSLA/FB/C/C.
Quality mechanisms:
- 9 test modules (test_portfolios, test_holdings, test_wallet, test_risk_metrics, test_recommendation, test_price_cache, test_market_price_service, test_alerts) — the pure math (risk_metrics, recommendation, XIRR) is unit-tested with synthetic inputs, isolated from network.
- Error handling: central ApiError/NotFoundError → JSON {error}; 404/405/500 handlers; every DB write wrapped in try/except + rollback.
- Config via env: DATABASE_URL, MARKET_PRICE_CACHE_TTL_SECONDS, MIN_XIRR_HOLDING_DAYS, RISK_FREE_RATE, ENABLE_REALTIME_PRICE_UPDATES (TestConfig disables the worker thread).
- Defensive math: XIRR solver guards the (−100%, +∞) domain to avoid complex-number crashes; cash can't be price-overridden; FX is strict (no silent 1.0).
Delivery: server python run.py on :5000; frontend npm run dev on :5173/5174 (proxied). GET /health liveness; docs/ARCHITECTURE*.md, BUY_FLOW_GUIDE.md, API_TEST_CURLS.md, feature summaries kept in-repo.
Slide 8 — Key Decisions, Challenges & Roadmap (Managerial + Technical)
Hard-won decisions (each prevented a real bug):
- Annualized returns require ≥1 year. Sub-year gains extrapolate to nonsense; the UI hides the card rather than relabeling total return as XIRR.
- Cash is never a ticker. {CCY}-CASH is synthetic at price 1.0 — sent to Yahoo it would break; overrides blocked on cash.
- What-if is "reverse P&L" so scenario framing is intuitive (bull above today = loss vs live).
- Holdings edits are forbidden (405). Rewriting cost/quantity with no cash effect silently manufactures P/L; fixes must go through a real sell+rebuy trade.
- Unfunded BUYs are capital-neutralized in NAV reconstruction so trade size can't inflate returns.
- FX is strict — a missing pair returns 502 instead of a fake 1.0 that would zero out a real conversion.
Engineering challenges overcome: stale-response races on portfolio switch; overlapping live-price refreshes; cross-currency order-total math; benchmark alignment (forward-fill, not index) for beta/correlation; keeping the live Price KPI consistent with the reconstructed NAV (uniform scale to current_value).
What's in the latest commit (main, PR #17, "enhance portfolio trading & what-if workflows"): security name + security_type added to transaction & holdings serialization; transaction ledger filter by txn type AND security type; read-only BUY execution price (set via live quote); wallet quick-amount deposit buttons; What-If Results/Recheck re-run popups (snapshot vs refreshed live/historical); Holding Analytics moved to a modal; what-if P&L% now correctly baseline against live value.
Future roadmap (from in-repo planning):
- Short: dark-mode polish, more currencies, dark-mode-aware charts, candlesticks + moving averages, chart PNG/PDF export, custom date ranges.
- Medium: multi-series portfolio charts, volume indicators, dividend/reinvestment handling (the DIVIDEND txn type exists in the schema but isn't exposed yet), per-holding performance charts from market_price.
- Long: live alerting/notification surface, ML personalization of recommendations, portfolio-level benchmark comparison, exportable audit trail.