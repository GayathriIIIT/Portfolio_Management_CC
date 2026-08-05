Frontend Technical Audit — Portfolio Management App
Scope covered: main.jsx, App.jsx, App.css, index.css, vite.config.js, all 6 pages, all 12 components, both context providers, both services files, package.json, and the three docs/UI_REVAMP* design docs (cross-checked against actual code). Backend source (backend/app/api/portfolios.py) was spot-checked wherever a frontend behavior depended on backend semantics (cash routing, trade validation, serialization).

A) Inventory of pages/routes (current UI capability map)
No router is used (no react-router-dom in package.json) — App.jsx is a single-page shell with client-side tab state (activeTab) driving conditional rendering. There are no URL routes; refreshing the browser always lands on Dashboard for the first available portfolio.

Tab (Sidebar)	Component	Capability
Dashboard	pages/DashboardPage.jsx	KPI cards, Risk/Performance card, Performance chart, Asset Allocation pie, Holdings table (no Buy button variant)
Holdings	pages/HoldingsPage.jsx	Full Holdings table (search, per-row Buy/Sell/Delete/Analytics-expand, cash balance strip)
Trade (Buy/Sell)	pages/TradePage.jsx	Full-page order entry (BUY/SELL), live quote lookup, FX conversion display, pre-buy analytics popup, recent trades feed
Transaction Ledger	pages/TransactionsPage.jsx	Full transaction history with type filter (ALL/BUY/SELL/DEPOSIT/WITHDRAW)
What-If Simulator	pages/WhatIfPage.jsx	Sandbox basket or portfolio-holdings scenario simulation, manual price or historical-date pricing, saved scenario ledger
Manage Portfolios	pages/PortfoliosPage.jsx	List/rename/change-currency/delete portfolios, select active portfolio
Modals (global, mounted in App.jsx): TradeModal (BUY/SELL, launched from Holdings table row actions and header), AddHoldingModal (direct position add, bypasses quote lookup), NewPortfolioModal, ManageCashModal (deposit/withdraw).

Two theme dimensions, independently toggled: professional/brainrot (meme skin) and light/dark, giving 4 combined data-theme values (context/ThemeContext.jsx).

B) Concrete bugs / correctness issues
1. HIGH — Trade success doesn't refresh Performance Chart or Risk/Performance card (stale analytics).
pages/DashboardPage.jsx:38,42 renders <RiskPerformanceCard portfolioId={portfolio.id} /> and <PerformanceChart portfolioId={portfolio.id} /> with no refresh signal. Both components fetch internally via useEffect keyed only on [portfolioId, ...] (components/RiskPerformanceCard.jsx:59-84, components/PerformanceChart.jsx:78-112). When a trade completes, App.jsx's refreshPortfolioData (line 116) updates activePortfolio/analytics, which correctly re-renders KPICards and HoldingsTable — but portfolioId itself never changes, so these two components' effects never re-fire. Scenario: user buys a stock from the Holdings table (or Trade page), KPI cards update immediately, but the NAV chart, Sharpe/Sortino/drawdown metrics, and the asset performance chart keep showing pre-trade data until the user manually toggles the period/benchmark selector or reloads the page. This can make a user think the trade "didn't register."

2. HIGH — Trade page lets users "buy"/"sell" USD-CASH through the stock order flow, with a preview total that doesn't match what actually happens. POPULAR_SUGGESTIONS in components/TickerAutocomplete.jsx:27 includes USD-CASH, and this autocomplete is shared by TradePage, TradeModal, AddHoldingModal, and WhatIfPage. Backend (backend/app/api/portfolios.py buy_holding/sell_holding, ~lines 1682-1690, 1784-1790) special-cases any {CCY}-CASH symbol as a pure deposit/withdrawal of quantity units, ignoring price/fees entirely. But pages/TradePage.jsx:176-184 and components/TradeModal.jsx:129-132 compute the displayed "Order Value" as price * quantity ± fees. Scenario: user selects "USD-CASH" from the ticker autocomplete on the Trade page, enters quantity 1000, leaves price blank (quote lookup for "USD-CASH" will error since Yahoo has no such ticker) → the on-screen "Total Order Value" shows $0.00, but clicking "Execute BUY Order" actually deposits $1000 into cash. The preview is materially wrong for this reachable path. (ManageCashModal is the correct, unambiguous way to move cash — this duplicate path should probably be removed from the tradable-ticker list.)

3. HIGH — Depositing cash in a non-base currency creates a stranded, unspendable cash pool. components/ManageCashModal.jsx:121-133 lets the user pick USD/EUR/GBP/JPY for a deposit/withdrawal regardless of the portfolio's actual base_currency. Backend _adjust_cash (portfolios.py ~1936-1976) creates/credits a {selected_currency}-CASH holding. But buy_holding/add_holding only ever check/debit {portfolio.base_currency}-CASH (portfolios.py lines 1616-1629, 1710-1723). Scenario: a USD-base portfolio's owner opens "Manage Cash," selects EUR, deposits €1000. The Holdings table's "Cash Balance" strip (components/HoldingsTable.jsx:97-125, which aggregates all *-CASH symbols) and the portfolio's total value will show the FX-converted amount as if it were spendable — but any subsequent BUY will still say "Insufficient cash balance" because the USD-CASH pool was never touched. Nothing in the UI indicates the currency picker is anything other than a display preference; it silently produces unusable money.

4. MEDIUM — Inconsistent client-side SELL validation between the two trade entry points. pages/TradePage.jsx:110-118 validates qty > owned.quantity against portfolio.holdings before submitting a SELL. components/TradeModal.jsx (used from Holdings table's per-row "Sell" button and the header) has no equivalent check — it only validates quantity is a positive number (lines 84-89) and relies entirely on the backend's 400 response. Not a security hole (backend enforces it), but it's an inconsistent UX: one entry point gives instant inline feedback, the other round-trips to the server and surfaces a generic error badge.

5. MEDIUM — Unformatted raw numbers in the Trade page's "Recent Executed Trades" feed. pages/TradePage.jsx:465: {t.quantity} shares @ ${t.price} (Fee: ${t.fees}) renders t.price/t.fees with no .toFixed(2), unlike the otherwise-consistent formatting used everywhere else (e.g. TransactionsPage.jsx:144-147 uses .toFixed(2) for the same fields). Any float-precision artifact from stored trade prices (e.g. FX-derived prices) will render as a long, ugly decimal here specifically.

6. MEDIUM — Currency mismatch in Performance Chart tooltip. components/PerformanceChart.jsx:36-40 hardcodes currency: 'USD' in the Intl.NumberFormat call inside CustomTooltip, regardless of the security's or portfolio's actual currency. For a non-USD portfolio/security this renders the wrong currency symbol/formatting in the hover tooltip while the rest of the app (KPI cards, Holdings table) correctly uses the portfolio's base_currency.

7. LOW — Auto-refresh and manual "Refresh Prices" can race. App.jsx:156-166's 2-minute interval only guards against overlapping automatic ticks via refreshInFlight (line 159); it does not coordinate with a manual click on the Header's "Refresh Prices" button (handleRefreshPrices, line 133). If both fire within the same window, two concurrent refreshPortfolioPrices calls run; the stale-portfolio guard (selectedPortfolioIdRef) prevents wrong-portfolio data corruption, but isRefreshing can flip in a confusing order and an extra API call is wasted. Low severity, cosmetic at worst — the recent stale-closure/race-condition fixes elsewhere in App.jsx (lines 36-42, 80-106, 124, 139, 148) are otherwise solid.

8. LOW — PortfoliosPage.jsx inline-edit has no validation. saveEdit (lines 28-39) sends whatever is in editName straight to api.updatePortfolio, including an empty string (no required/trim check like the "New Portfolio" modal has). An empty name would only be rejected if the backend validates it; there's no client-side guard here to match NewPortfolioModal.jsx's required input.

9. LOW — Docs are stale relative to code (not a runtime bug, but will actively mislead anyone using them). docs/UI_REVAMP.md, UI_REVAMP_SUMMARY.md, and UI_QUICK_REFERENCE.md describe: a PortfolioDetailPage.jsx/PortfolioChart component that doesn't exist (current code has PerformanceChart.jsx + tab-based pages), "React Router DOM v6.28" (not a dependency at all), a login flow ("Log in to portfolio") that doesn't exist anywhere in the app, a purple/teal "Lavender" color palette (actual current palette in index.css is indigo/emerald, #4f46e5/#0d9488), a theme.css file (doesn't exist — styling lives in App.css/index.css), and a dev port of 5174 (actual vite.config.js sets port 3000). These docs should be treated as historical/obsolete, not as a spec.

No merge-conflict debris found. A repo-wide grep for <<<<<<</=======/>>>>>>>, TODO/FIXME/XXX, and stray console.log across frontend/src turned up nothing beyond legitimate console.error calls used for silent-failure logging (e.g. TradePage.jsx:51, WhatIfPage.jsx:82) — the "resolve stash-pop conflicts" commit appears clean on the frontend side. Likewise no dangerouslySetInnerHTML/eval/innerHTML usage (no XSS injection vectors found), and all referenced /brainrot/*.gif assets exist in frontend/public/brainrot/.

C) Missing features / UX gaps
No edit-holding UI. You can add a position (AddHoldingModal) or delete one, but there's no way to correct a mis-entered avg cost/quantity short of delete-and-readd (which also re-writes the transaction ledger).
No pagination or virtualization on Holdings table or Transaction Ledger — both render every row unconditionally (HoldingsTable.jsx:144, TransactionsPage.jsx:123). Fine for a training-scale portfolio, but would degrade with hundreds of holdings/transactions.
No column sorting on any table (Holdings, Transactions, Portfolios) — only the Holdings table has a text search box; nothing is sortable by value, P&L, date, etc.
No live/server-side ticker search — TickerAutocomplete.jsx only matches against a hardcoded POPULAR_SUGGESTIONS list plus a client-side "recently used" cache (localStorage); an obscure ticker not in that list gets zero autocomplete help even though the backend can resolve any Yahoo-valid symbol via "Get Quote."
No confirmation on destructive What-If deletes vs. inconsistent confirmation UX elsewhere — deleting a holding, portfolio, or what-if entry each uses a blocking window.confirm() (App.jsx:174, PortfoliosPage.jsx:42, WhatIfPage.jsx:198), which is functional but browser-native/unstyled and inconsistent with the rest of the polished UI.
No dark-mode-aware charts asset issue, but there is dark mode (light/dark + brainrot/professional, 4 combinations) — this is actually well covered, contradicting the stale docs' "Phase 3: dark mode support" backlog item.
No mobile/responsive layout — index.css's .sidebar is position: fixed; width: 260px with .main-wrapper { margin-left: 260px } and no media queries anywhere in App.css/index.css collapse it for small viewports; the app is desktop-only.
No global toast/notification system for API errors — error handling is inconsistent by page: some flows show a styled inline badge (TradePage, TradeModal, AddHoldingModal, ManageCashModal, NewPortfolioModal), some use a blocking alert() (App.jss:179, PortfoliosPage.jsx:37,47, WhatIfPage.jsx:203), and some fail silently to console only (TradePage.jsx:51 recent-trades load, WhatIfPage.jsx:82 saved what-ifs load). A user whose "load recent trades" call 500s gets no feedback at all.
No accessibility affordances on modals — none of the four modals (TradeModal, AddHoldingModal, NewPortfolioModal, ManageCashModal) set role="dialog"/aria-modal, trap focus, auto-focus the first field, or close on Escape. Closing is click-outside or the X button only.
No automated frontend tests — no *.test.*/*.spec.* files anywhere under frontend/, and no testing library (vitest, @testing-library/react, etc.) in package.json's devDependencies. npm run lint (oxlint) is the only automated frontend gate.
What-If sandbox pre-fills a hardcoded $100 "target price" for any newly added symbol (WhatIfPage.jsx:108-110) with no visual cue that it's a placeholder rather than a fetched value — easy to run a simulation on an unintentional $100 assumption.
Currency support is narrower than the (stale) docs advertise — only USD/EUR/GBP/JPY are selectable anywhere in the UI (NewPortfolioModal.jsx:73-76, ManageCashModal.jsx:128-131, PortfoliosPage.jsx:117-120), not the 8+ currencies the docs describe.
D) What's well done
Genuinely careful state-management hardening in App.jsx. The stale-response guards (selectedPortfolioIdRef, request-id patterns in TradePage/TransactionsPage/WhatIfPage), the interval cleanup on the 2-minute auto-refresh (clearInterval in the useEffect return), and the refreshInFlight overlap guard show real attention to the classic React race-condition/stale-closure/memory-leak pitfalls — and the inline comments explicitly document why (e.g., "this was how a loss-making portfolio kept rendering a profit portfolio's KPIs"), which reads as a team that hit these bugs for real and fixed them deliberately.
Recharts usage is solid: benchmark alignment in PerformanceChart.jsx uses proper binary search on sorted timestamps (lines 146-164) rather than naive index-zipping, explicitly noted as a fix for a previous "tooltip loops through dates" bug. Tooltips, legends, and empty/loading/error states are present on every chart.
Form-level validation is thoughtful and consistent across trade/holding/cash modals (positive-number checks, NaN checks, explicit error messages) and the Enter-key-submits-trade footgun was deliberately closed (onKeyDown guard in both TradePage.jsx:224-226 and TradeModal.jsx:163-165, matching the recent commit's intent).
Cash-as-a-first-class-concept is a nice UX touch: cash positions are consistently filtered out of the Holdings table's securities list and the Asset Allocation pie chart and shown as a distinct aggregated balance, with a shared isCashHolding predicate reused across components.
Loading/empty/error states exist almost everywhere (Dashboard, Holdings, Transactions, charts, risk card, analytics panel) with sensible copy rather than blank screens.
Two orthogonal, well-implemented theme axes (professional/brainrot × light/dark) persisted to localStorage with backward-compatible migration logic in ThemeContext.jsx.
Grep "interest_rate|coupon_rate" (in c:\Users\Administrator\Desktop\TAP_trainings\Portfolio_Group_proj\Portfolio_Management_CC\backend\app)
3 lines of output
Backend Technical Audit — Portfolio Management App
A) REST Endpoint Inventory (current, verified against code)
All under blueprint prefix /api/portfolios (defined in backend/app/api/portfolios.py), plus one app-level route.

Method	Path	Purpose
GET	/health	Liveness check (app/init.py:54)
POST	/api/portfolios	Create portfolio {owner?, name, base_currency?}
GET	/api/portfolios	List portfolios (no holdings)
GET	/api/portfolios/<id>	Get one portfolio + holdings
PUT	/api/portfolios/<id>	Update owner/name/base_currency
DELETE	/api/portfolios/<id>	Delete portfolio (cascades holdings via ORM; txns/whatif via DB FK)
GET	/api/portfolios/<id>/transactions	List immutable BUY/SELL/DEPOSIT/WITHDRAW ledger
GET	/api/portfolios/<id>/analytics	Invested/current value, P/L, XIRR, alpha, per-holding CAGR
GET	/api/portfolios/<id>/analytics/chart	Per-holding live price series + benchmark series
GET	/api/portfolios/<id>/analytics/risk	Sharpe/Sortino/beta/alpha/drawdown, NAV series, recommendation
GET	/api/portfolios/market_price/analytics?symbol=	Single-stock risk metrics + recommendation
GET	/api/portfolios/market_price/realtime?symbol=	Fresh Yahoo quote (bypasses cache)
POST	/api/portfolios/<id>/refresh-prices	Parallel-refresh live quotes for symbols (not persisted)
POST	/api/portfolios/<id>/holdings	Add holding (also writes a BUY ledger row)
GET	/api/portfolios/<id>/holdings	List holdings w/ live P/L
GET	/api/portfolios/<id>/holdings/<hid>	Get one holding
PUT	/api/portfolios/<id>/holdings/<hid>	Update quantity/purchase_price directly
DELETE	/api/portfolios/<id>/holdings/<hid>	Remove holding
POST	/api/portfolios/<id>/buy	Buy a symbol (or deposit if symbol is {CCY}-CASH)
POST	/api/portfolios/<id>/sell	Sell a symbol (or withdraw if {CCY}-CASH)
POST	/api/portfolios/<id>/deposit	Deposit cash {amount, currency?}
POST	/api/portfolios/<id>/withdraw	Withdraw cash {amount, currency?}
POST	/api/portfolios/<id>/what-if	Run a what-if price scenario (manual/historical/custom symbols)
GET	/api/portfolios/<id>/what-if	List saved what-if entries
DELETE	/api/portfolios/<id>/what-if/<wid>	Delete a what-if entry
Note: backend/README.md and backend/API_TEST_CURLS.md are both stale — they document ~9–17 of these; deposit/withdraw/analytics/analytics-chart/analytics-risk/market_price-analytics/refresh-prices/what-if(list+delete)/transactions are all implemented but undocumented there.

B) Bugs / Correctness Issues
HIGH — Buying with no cash account is free money. add_holding (portfolios.py:1616-1629) and buy_holding (:1710-1723) only enforce the insufficient-cash check if cash_sec is not None and cash_holding is not None. If a portfolio has never received a deposit, there is no USD-CASH security/holding, so the check is skipped entirely and the buy succeeds unconditionally with no money debited anywhere. Confirmed by the app's own test test_buy_and_sell_endpoints (test_portfolios.py:366-379), which buys MSFT with zero prior deposits and gets 201.

HIGH — Sell proceeds vanish when no cash holding exists. sell_holding (:1831-1839): "Credit proceeds to cash balance if cash position exists" — if there's no cash security/holding, proceeds are computed but never stored anywhere. Combined with the bug above, a never-funded portfolio can buy and sell stock indefinitely with money materializing and disappearing silently.

HIGH — delete_holding destroys a position with no ledger entry or cash credit. portfolios.py:1894-1900 deletes the SecurityHolding row directly. No SELL transaction is written and no cash is credited back. This violates the schema's own stated invariant (database/schema.sql:53: "Derived from portfolio_transaction... can be rebuilt from this table") and silently destroys value. test_delete_holding (test_holdings.py:84-95) only checks the 404 afterward, never that money/ledger stayed consistent.

HIGH — update_holding bypasses cash and ledger entirely. portfolios.py:1879-1891: PUT .../holdings/<id> lets a caller set quantity/purchase_price to any positive value with zero effect on cash, no transaction record, and no update to first_purchased_at — so CAGR/XIRR keep using a stale purchase date after the position's economics have been rewritten. This is effectively an unaudited "cheat" endpoint for manufacturing or erasing P/L.

MEDIUM — Race condition on cash balance under concurrent requests. _adjust_cash (:1936-1995) and the inline cash-check-then-write blocks in add_holding/buy_holding/sell_holding read cash_holding.quantity, compute in Python, then write back — no SELECT … FOR UPDATE or optimistic locking. Two simultaneous buy requests against the same portfolio can both read the same starting balance and both pass the insufficient-funds check (lost-update). Flagged as a real concern but low-likelihood given curriculum/single-user scope.

MEDIUM — Only what-if rolls back on error; buy/sell/add_holding don't. The what-if handler (:1497-1534) explicitly wraps its writes in try/except: db.session.rollback(); raise. buy_holding/sell_holding/add_holding mutate cash_holding/holding in-session and commit once at the end with no equivalent guard — an exception between mutation and commit (e.g. a transient error inside _get_or_create_security) leaves the session holding uncommitted, unrolled-back changes. Inconsistent pattern within the same file.

MEDIUM — FX rate silently falls back to 1.0 on lookup failure. market_price_service.py:493-504 (get_fx_rate): if both the direct and inverse Yahoo FX pair fetch fail, the function returns rate = 1.0 with no error surfaced. For any non-USD-base multi-currency portfolio, a transient network hiccup silently misprices market value/P&L (e.g. treats GBP as if it were USD) with nothing telling the user this happened.

MEDIUM — Two incompatible "alpha" definitions in the same API surface. get_stock_analytics (:1309-1320) computes alpha as naive excess return (stock_ret - spy_ret), while _compute_jensen_alpha/compute_risk_metrics (used by /analytics and /analytics/risk) compute a proper beta-adjusted CAPM Jensen's alpha. A user comparing a single stock's "alpha" to their portfolio's "alpha" is comparing two different statistics under the same field name.

MEDIUM — CAGR blends across closed-and-reopened positions. _compute_holding_cagr (:174-180) filters transactions only by (portfolio_id, security_id). Since delete_holding (see above) doesn't remove past transactions, a user who fully exits a stock and later rebuys it gets an XIRR computed across both unrelated holding periods as one blended series.

MEDIUM — Bond holdings never show real P/L. BOND_SUGGESTION_SYMBOLS and seed data use a symbol like US10Y-2030 that Yahoo Finance cannot resolve. _serialize_holding (:72-75) catches UnknownTickerError and falls back to raw_current_price = raw_purchase_price — meaning every BOND holding permanently reports 0% unrealized P/L regardless of real value; there's no bond pricing model at all (see also C).

LOW-MEDIUM — GET requests mutate the database as a side effect. _serialize_holding's "self-healing first_purchased_at" block (:87-100) commits inside what should be a pure read path (hit by every GET /holdings, GET /<id>, etc.), and swallows any failure via bare except Exception: db.session.rollback() with no logging — a silent failure mode with no trace for debugging.

LOW-MEDIUM — Inconsistent validation between two "buy" paths. add_holding requires quantity to be a positive int (_require_positive_int, :1611) while buy_holding accepts any positive number/fractional shares (_require_positive_number, :1678) — same logical action, different input contracts depending on which endpoint is used.

LOW — Duplicated buy logic. add_holding (:1605-1669) and buy_holding (:1672-1771) reimplement the same cash-check → get-or-create-security → merge-holding → record-BUY sequence independently. This duplication is the direct cause of the "free buying" bug above being present in both paths identically — a shared helper would have made the fix apply once.

LOW — Dead code / misleading naming in the price service. market_price_service.collect_and_store_price_series (:374-388) does not call _persist_points (:225) despite its name; _persist_points/_get_series_from_db (:225-279) are defined but never invoked anywhere in the codebase (confirmed via search). The market_price table exists in the schema and is described as enabling "historical charts," but nothing in the running app ever writes to it — every chart/analytics call re-fetches live from Yahoo. This is a deliberate simplification (a test explicitly asserts zero persistence, test_portfolios.py:150-171), but the naming will mislead a future maintainer, and it means there's no historical price cache at all, a real perf/rate-limit exposure under load.

LOW — Numerical-methods caveat in _solve_xirr. portfolios.py:218-281 uses pure bisection assuming a single sign change in the NPV curve. Cash-flow series with many interleaved BUY/SELL/DEPOSIT/WITHDRAW rows aren't guaranteed monotonic and can have multiple IRR roots; bisection will converge to some root, not provably the economically correct one. Not demonstrated as wrong in current tests/data shapes, but worth flagging given this file's history of real return-calc bugs.

LOW — Unused schema fields imply unimplemented features. Security.interest_rate (security.py:25) is written once (portfolios.py:1953, cash security creation) and never read anywhere; Security.coupon_rate/face_value/maturity_date are set only in seed_data.py and never read by any endpoint. No interest accrual, no bond coupon/maturity valuation exists despite the columns.

Security/production notes (explicitly not production concerns per curriculum scope, but worth listing):

No authentication/authorization anywhere — every portfolio is readable/writable by anyone who knows/guesses its ID; owner is a free-text string, not a real user binding.
run.py:12 defaults FLASK_DEBUG=1 (Werkzeug interactive debugger on), matching backend/.env's shipped default — fine for local dev only.
No CORS configuration in the Flask app (app/__init__.py); works today only because frontend/vite.config.js proxies /api to 127.0.0.1:5000 in dev. Would break under any non-proxied deployment topology.
backend/.env (real secrets) is correctly gitignored and NOT tracked in git — only backend/.env.example is tracked. However .env.example contains a password-shaped value (n3u3da!) rather than an obvious placeholder — minor hygiene issue, low actual risk (local MySQL root only).
No SQL injection risk found — all queries go through the SQLAlchemy ORM with bound parameters; no raw SQL string interpolation anywhere in app/.
C) Missing Capabilities (vs. what a portfolio app conceptually needs)
No tax-lot / FIFO/LIFO accounting — average-cost-only; can't compute realized gains by specific lot, no long/short-term capital-gains distinction.
No dividend/interest modeling — schema has the columns (interest_rate, coupon_rate), code never uses them (see B).
No real bond pricing — BOND securities are priced through the same Yahoo-quote path as stocks and silently fall back to purchase price forever (see B); no yield-curve/duration model.
No corporate-actions handling — a stock split or ticker rename has no adjustment mechanism; quantities/avg_cost would silently desync from reality.
No authentication/user accounts — owner is decorative; no session, no per-user portfolio scoping, no permissions.
No pagination/sorting/filtering on any list endpoint (list_portfolios, list_holdings, get_portfolio_transactions) — fine at demo scale, a real gap at any scale.
No read endpoint for historical market_price data — the table exists in schema.sql, is described in the backend README as "created... but has no API endpoints yet," and (per B) is never actually populated either.
No transaction correction/void mechanism — the ledger is (rightly) immutable, but there's also no compensating-entry pattern exposed via the API for fixing a fat-fingered trade; the only "fix" available is update_holding/delete_holding, which (per B) corrupt the ledger relationship instead.
No export (CSV/PDF) of holdings or transaction history.
No rate limiting on Yahoo-backed endpoints (market_price/realtime, refresh-prices) — a single caller could exhaust Yahoo's informal rate limit for the whole app (the always-on realtime-price background thread in app/__init__.py:13-42 already polls every security globally every 60s by default, compounding this).
docs/ARCHITECTURE.md is aspirational, not descriptive — it predates language/framework choice, proposes a price_snapshot/portfolio_snapshot schema that doesn't exist, and lists a minimal /holdings, /portfolio/performance, /portfolio/refresh endpoint set. The actual implementation (nested /api/portfolios/<id>/... REST resources, buy/sell/deposit/withdraw semantics, what-if scenarios, full risk-metrics suite) is considerably more capable than this doc suggests — treat it purely as historical planning, not current-state documentation. Same is true of backend/README.md (documents ~9 endpoints; ~24 exist) and API_TEST_CURLS.md.
No FUTURE_IMPROVEMENTS.md was found in the repo (searched; doesn't exist) — the PM-facing "what's next" framing will need to be synthesized fresh rather than sourced from an existing backlog doc.
D) What's Well Done (for PM balance)
The financial-metrics core is unusually mature for a training project. XIRR/CAGR/Sharpe/Sortino/beta/Jensen's alpha/TWR are all implemented with real attention to edge cases: sub-year annualization is explicitly suppressed (not extrapolated to absurd numbers), unfunded-buy NAV reconstruction avoids manufacturing fake daily returns, deposit/withdrawal flows are excluded from performance via Time-Weighted Return, and the bisection XIRR solver has documented domain guards. risk_metrics.py is pure, network-free, and fully unit-tested in isolation.
Test suite specifically encodes past regressions (test_risk_metrics.py's "T1 shape"/"P1 regression" tests, test_portfolios.py's short-window/no-ledger XIRR cases) — evidence of a team that found real bugs and locked in the fix with a named test, not just ad hoc manual verification.
Clean separation of concerns: blueprint (api/) / ORM models (models/) / pure business logic (services/risk_metrics.py, services/recommendation.py) — the recommendation engine and risk math are fully decoupled from Flask and DB, easy to test and reason about.
Centralized, non-leaky error handling (api/errors.py): custom ApiError/NotFoundError map to clean JSON, and the catch-all Exception handler logs server-side but never returns a stack trace to the client.
Consistent input-validation helpers (_require_string, _require_positive_int, _require_positive_number) applied across most endpoints, correctly rejecting negatives, zero, booleans-as-ints, and missing fields.
Insufficient-cash-balance validation exists and is tested for the common case (cash account already funded) — the gap is specifically the "never funded at all" edge case, not the core check.
No SQL injection surface — 100% ORM, no raw SQL string building anywhere.
Secrets hygiene is correct — .env is gitignored and not tracked; only the example file is committed.
Feature-rich analytics surface well beyond minimal CRUD: what-if scenarios (manual price / historical date price / custom symbols), per-holding CAGR, portfolio XIRR, full risk-metrics card, and a rule-based ADD/HOLD/SELL recommendation engine with human-readable reasons — genuinely more than an MVP portfolio tracker typically ships with.
Idempotent seed script (seed_data.py) makes local onboarding/demo setup painless.
Update Todos

Read top-level docs (README, FUTURE_IMPROVEMENTS, ARCHITECTURE, FEATURE_SUMMARY, SCHEMA_UPDATE)

Run backend deep-dive audit agent (bugs, endpoints, gaps)

Run frontend deep-dive audit agent (bugs, features, UX gaps)

Synthesize PM view: current version assessment + missing MVPs

Synthesize End User view: desired new features

Synthesize Developer view: critical bugs + implementation guidance for new features

Write final combined report for the user
I read the full stack — Flask/SQLAlchemy/MySQL backend, React/Vite frontend, docs, tests, and schema — and had two deep-dive audits run in parallel over backend and frontend. Here's the three-perspective report.

1. Product Manager view — where the app stands, what's missing
Current version, honestly assessed: this is well past a curriculum MVP. The brief (README.md) only asked for browse/view-performance/add/remove. What actually exists: full buy/sell/deposit/withdraw with an immutable transaction ledger, multi-portfolio + multi-currency support, live Yahoo-Finance pricing with a background refresh thread, a real analytics suite (XIRR, CAGR, Sharpe, Sortino, beta, Jensen's alpha, drawdown), a rule-based buy/hold/sell recommendation engine, a What-If simulator, and a genuinely polished themeable UI (light/dark × "professional"/"brainrot" skins). For a training-program project this is ambitious scope, and the financial-metrics core in particular is unusually careful (edge cases like sub-year annualization and deposit/withdrawal exclusion from TWR are explicitly handled, with regression tests named after the bugs they fixed).

But the core loop has integrity holes that matter more than any missing feature: a portfolio that's never been funded can buy stock for free (no cash check fires), sell proceeds vanish into nowhere under the same condition, and deleting or editing a holding doesn't touch cash or the ledger at all. These aren't edge-case gaps — they mean the "add/remove items" priority from the original brief is currently not trustworthy end-to-end. See the Developer section for specifics.

MVPs still missing relative to what a portfolio manager conceptually needs:

Edit a holding safely — today "editing" is delete + re-add, which corrupts the ledger (see bugs below). No safe correction path exists.
Real bond pricing — BOND holdings permanently show 0% P/L because Yahoo can't price a symbol like US10Y-2030; the schema even has coupon_rate/maturity_date columns that are written once by seed data and never read.
A historical price cache — the market_price table exists in the schema and is described in docs as enabling historical charts, but nothing ever writes to it; every chart re-fetches live from Yahoo on every request.
Docs are actively wrong, which will hurt at demo time: docs/ARCHITECTURE.md, backend/README.md, and the three docs/UI_REVAMP*.md files describe a much smaller/different app than what's built (wrong endpoint list, a login flow that doesn't exist, React Router that isn't a dependency, a color palette that was replaced). Worth a documentation pass before presenting, since "what have you built" is literally the first thing instructors ask.
2. End-user view — features worth asking for
Ranked by how much they'd change daily use:

A real "fix a mistake" flow. Right now if you fat-finger a quantity or price, your only options are delete (which silently destroys the position with no record) or the raw edit endpoint (which changes numbers with no cash/ledger effect). Users need a correcting transaction, not a silent overwrite.
Trade success should refresh everything, not just some cards. After a buy/sell, the KPI cards update but the NAV/performance chart and the Sharpe/Sortino/drawdown card keep showing pre-trade numbers until you reload or fiddle with a filter — it looks like the trade didn't register.
Sortable/filterable tables. Holdings, transactions, and the portfolio list can only be searched (holdings) or filtered by type (transactions) — no sorting by value, P/L, or date anywhere.
Clarity on cash currency. "Manage Cash" lets you deposit in USD/EUR/GBP/JPY regardless of the portfolio's actual base currency, and depositing in the "wrong" currency creates money that shows up in your balance but that buying can't actually spend. This needs either a warning or a hard restriction to the portfolio's own currency.
Export. No CSV/PDF export of holdings or transaction history — useful for anyone using this outside a training context.
Mobile/responsive layout. The sidebar is fixed-width with no media queries; the app is desktop-only.
Consistent error feedback. Some failures show a styled inline error, some pop a browser alert(), some fail silently to the console (e.g. the "recent trades" load on the Trade page) — a user has no way to know some of these ever went wrong.
Dividend/interest tracking and tax-lot (FIFO) accounting — natural next asks once someone uses this for more than a demo, though this is a bigger lift (see Developer section).
3. Developer view — critical bugs first, then how to build the above
Critical bugs (fix before adding anything else — these break the core buy/sell/edit loop)
All in backend/app/api/portfolios.py unless noted:

Severity	Bug	Where	Fix direction
High	Buying is free if the portfolio has never received a deposit — the insufficient-cash check is skipped entirely when no {CCY}-CASH holding exists yet, instead of treating "no cash holding" as a zero balance	add_holding (~1616-1629), buy_holding (~1710-1723)	Always resolve/create a zero-balance cash holding before the check, or explicitly treat "no cash holding" as balance 0 and fail the check
High	Sell proceeds vanish silently if no cash holding exists — computed but never persisted	sell_holding (~1831-1839)	Same fix — always resolve/create the cash holding first, then credit it
High	delete_holding removes a position with zero ledger entry and zero cash credit, permanently destroying value with no audit trail	~1894-1900	Should either be blocked (force a sell instead) or internally perform a full SELL-at-current-price before removing the row
High	PUT /holdings/<id> lets quantity/purchase_price be rewritten with no cash effect, no ledger entry, and no update to first_purchased_at — an unaudited way to manufacture or erase P/L, and it desyncs CAGR/XIRR (which key off first_purchased_at)	update_holding (~1879-1891)	Either remove this endpoint's free-form edit power or route corrections through a compensating transaction
Medium	buy_holding/sell_holding/add_holding mutate cash + holding in-session with a single commit at the end and no try/except rollback, unlike the what-if handler which does this correctly	throughout	Wrap each in the same try/except: db.session.rollback(); raise pattern already used at ~1497-1534
Medium	Lost-update race on cash balance: two concurrent buys can both read the same starting balance and both pass the funds check	_adjust_cash (~1936-1995) and inline cash blocks	SELECT ... FOR UPDATE on the cash holding row, or a DB-level check constraint plus retry-on-conflict
Medium	FX lookup failure silently falls back to rate 1.0 with no error surfaced — a network hiccup mis-prices an entire non-USD portfolio without telling anyone	market_price_service.py:493-504	Raise/log on FX failure and surface a "stale FX rate" flag in the response rather than pretending the rate is 1:1
Medium	Two different "alpha" definitions under the same field name — naive excess return for single-stock analytics vs. proper CAPM Jensen's alpha for portfolio risk metrics	get_stock_analytics ~1309-1320 vs _compute_jensen_alpha	Standardize on one definition or rename the fields so they're not confused
Medium	CAGR/XIRR blend across a fully-closed-and-reopened position because transaction filtering only keys on (portfolio_id, security_id), with no notion of "holding period"	_compute_holding_cagr ~174-180	Needs a lot/holding-period concept — ties into the tax-lot feature below anyway
Frontend, in frontend/src/:

Severity	Bug	Where	Fix direction
High	After a trade, PerformanceChart and RiskPerformanceCard don't refetch — their useEffect only depends on portfolioId, which doesn't change on a trade, so charts/risk metrics stay stale until reload or filter change	DashboardPage.jsx, RiskPerformanceCard.jsx:59-84, PerformanceChart.jsx:78-112	Pass a refreshKey/version number (bumped in App.jsx's refreshPortfolioData) into both components' effect dependency arrays
High	TickerAutocomplete includes USD-CASH as a "tradable ticker" on the Trade page/modal, but the backend special-cases any {CCY}-CASH symbol as a pure deposit/withdrawal ignoring price — so the on-screen "Order Value" preview (computed as price × qty) shows $0.00 while the real effect is a full-amount cash deposit	TickerAutocomplete.jsx:27, TradePage.jsx:176-184, TradeModal.jsx:129-132	Remove *-CASH symbols from the tradable autocomplete list entirely — ManageCashModal is already the correct, unambiguous path
High	ManageCashModal lets you pick any of USD/EUR/GBP/JPY regardless of the portfolio's base currency; buy/sell only ever check the base-currency cash pool, so depositing in the "wrong" currency creates a balance that shows in totals but can never fund a purchase	ManageCashModal.jsx:121-133 vs. backend cash checks	Restrict the currency picker to the portfolio's base_currency, or clearly label non-base deposits as "held separately, not spendable on trades"
Everything else the audits flagged (bond pricing being a no-op, market_price table never populated, inconsistent int-vs-float quantity validation between add_holding/buy_holding, unformatted numbers in the Trade page's recent-trades feed, PerformanceChart tooltip hardcoding currency: 'USD') is lower severity — worth fixing but not blocking.

Implementing the missing MVPs / requested features
Safe holding correction → don't extend update_holding. Add a POST /holdings/<id>/adjust that writes a compensating SELL-then-BUY (or a signed correction transaction) so the ledger stays reconstructable, and reuse the existing _adjust_cash helper rather than duplicating cash logic a third time (it's already duplicated between add_holding and buy_holding — consolidate those two into one shared function while you're in there, since that duplication is why the free-money bug exists in both places identically).
Bond pricing → add a simple yield-based valuation path in market_price_service.py keyed off the existing unused coupon_rate/face_value/maturity_date columns, triggered when UnknownTickerError is caught for a BOND security type instead of the current fallback-to-purchase-price.
Historical price cache → _persist_points/_get_series_from_db already exist in market_price_service.py but are dead code (never called) — wiring collect_and_store_price_series to actually call _persist_points gets you most of the way there, then chart endpoints can read from DB first and fall back to Yahoo.
Dashboard refresh-on-trade → the refreshKey prop-drilling fix above generalizes cleanly to any future "trade should update X" requirement.
Sortable tables / export / mobile layout → pure frontend work, no backend dependency; sorting can be client-side given current data volumes (no pagination exists yet anyway).
Dividend/tax-lot accounting → the bigger lift. Needs a new dividend table and a lot-tracking model (replace average-cost SecurityHolding.quantity/purchase_price with a security_lot table referencing individual BUY transactions), which is also the real fix for the CAGR-blending bug above. Scope this as its own milestone rather than bolting onto the current schema.
Given this is explicitly a curriculum project rather than a production system, I'd prioritize the High-severity backend bugs (free buying, vanishing proceeds, silent delete/edit) first since they undermine the core "browse/add/remove" requirement from the original brief — everything else is enhancement on top of a currently-broken core loop.