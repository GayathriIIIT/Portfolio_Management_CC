# MoneyMaxxing — Presentation Speech & Q&A Prep

Speaker script for the deck, slide by slide, followed by a list of the questions this project is most likely to draw and how to answer them.

---

## Opening (Title Slide)

"Good [morning/afternoon] everyone. We're Team MoneyMaxxing — the Code Cookers — and today we're presenting **MoneyMaxxing**, a full-stack portfolio manager we built from scratch this month. By the end of this presentation, you'll see not just a working app, but a genuine financial engine underneath it — with real risk analytics, real return math, and real engineering trade-offs we had to make along the way."

---

## Slide 1 — The Project

"Let's start with what we were actually asked to build. The brief was simple on paper: a REST API and a web front end to manage a financial portfolio — stocks, bonds, and cash. Core functions were browsing holdings, viewing performance, and adding or removing positions. Two constraints shaped everything: it's single-user, no authentication required, and it needed to run on MySQL with demonstrably working end-to-end behavior — not just endpoints that return 200.

What we personally took away from this: RESTful API design, working with Flask as a backend framework, building a real React front end, modeling relational data in SQL, and — just as importantly — actually collaborating with Git branches and pull requests as a team, and learning to use agent-assisted tooling and scripts to move faster.

The philosophy from day one was: start small, get something working end-to-end, and grow features on top of that — not design the perfect system up front and never ship."

---

## Slide 2 — Our Approach

"We worked as one team without a hard backend/frontend split — everyone touched both sides depending on what a feature needed. We paired on the harder pieces, like the financial math, and used pull requests for code review on everything else so nothing landed on main unreviewed.

Our workflow was feature branches, regular check-ins, and group brainstorming before we committed to an approach — especially for the analytics engine, where the wrong design choice could quietly produce wrong numbers.

On the stack: Flask 3 with Flask-SQLAlchemy on the backend, PyMySQL as the driver, yfinance for live market data, and pytest for our test suite. On the front end, React 19 with Vite, Recharts for all our charting, and lucide-react for icons — kept as a responsive single-page app. And underneath all of it, MySQL with 8 normalized tables, an immutable transaction ledger, and a rule we held to strictly: nothing is stored that can be computed on read."

---

## Slide 3 — Data Model & Architecture

"Architecturally, it's a clean three-tier system. React talks to Flask over HTTP/JSON, Flask talks to MySQL through SQLAlchemy, and Flask also talks out to Yahoo Finance for live prices — the frontend never touches Yahoo directly, which means rate limiting and API quirks are handled in exactly one place.

Eight tables carry the whole domain: `portfolio`, `security` — which covers stocks, bonds, and cash through a type discriminator — `security_holding`, `portfolio_transaction`, `market_price` as our historical price cache, `whatif_price` for saved scenarios, `wallet` for shared cash, and `price_alert`.

Two decisions matter more than they look: first, the transaction ledger is immutable — once a trade is recorded, it's never edited, only appended to. Second, profit-and-loss and market value are never persisted — they're calculated fresh every time you load the page, straight from live prices. That means there's never a stale number sitting in the database contradicting what the market is actually doing."

---

## Slide 4 — The Financial Engine

"This is the part we're proudest of, because it's not just CRUD — it's real financial engineering.

We calculate Time-Weighted Return, which strips out the distortion caused by deposits and withdrawals, so adding cash to your account never looks like a gain. We also calculate Money-Weighted Return — XIRR — which captures the actual timing impact of when you bought and sold. On top of that: annualized volatility from the rolling standard deviation of daily returns, Sharpe Ratio for risk-adjusted performance against a real risk-free rate — we pull the 13-week T-bill rate for that — and max drawdown, the worst peak-to-trough decline your portfolio experienced.

All of this rides on NAV reconstruction: we replay your entire transaction history day by day and rebuild what your portfolio was worth on every single day in the past, not just today. That reconstruction accounts for trading fees; dividend and stock-split handling is schema-ready but not yet exposed, so that's an honest gap rather than a finished feature.

On top of the risk numbers, we built a rule-based recommendation engine — it flags sector concentration, suggests rebalancing against a target allocation, and factors in what-if scenario results."

---

## Slide 5 — Live Demo & Standout Features

"Let's walk through what this actually looks like in use. [Live demo: browse holdings → view the KPI dashboard and charts → execute a buy or sell → filter the transaction ledger by a date range → run a what-if scenario and load its price-path graph.]

A few things we'd call out as standout, beyond the baseline ask:

Real risk analytics — CAGR, XIRR, Jensen's Alpha against SPY, Sharpe, Sortino, Calmar, correlation, volatility — the kind of numbers you'd expect from an actual brokerage, not a class project.

A multi-currency wallet — cash is shared across all your portfolios and converted at live FX rates, so you're not stuck pretending everything is in one currency.

Price alerts with historical backfill, so alerts aren't just forward-looking — you can backfill price history to test them against the past.

The what-if simulator — model a hypothetical price on your holdings, and now, newly, click "Load Price Graph" to actually see the price path of those symbols from your scenario date up to today, with the hypothetical and live price both marked on the chart.

A similar-stocks panel for diversification ideas.

And two smaller but very practical additions we shipped most recently: the ticker search now remembers tickers you've used before and pre-fills suggestions from your existing holdings when you're placing a trade, and the transaction ledger can now be filtered to a specific date range, not just by transaction type."

---

## Slide 6 — Challenges, Next Steps & Thank You

"Honestly, the biggest challenge wasn't writing code — it was deciding what to build. Ideating which components actually belonged in scope took real discussion. We hit our share of merge conflicts working in parallel. We also learned that chasing perfection can break working code — a few times we over-engineered a feature and had to roll back to something simpler that actually worked. And prioritizing what to build next, with a fixed timeline, was a constant negotiation.

Looking ahead, with more time we'd add authentication and authorization — right now this is deliberately single-user with none. We'd add Swagger/OpenAPI documentation, set up an actual CI/CD pipeline since we don't have one yet, support more asset types like options and ETFs, build a portfolio allocation optimizer, and finish exposing dividend transactions through the API and UI, since the schema already supports it.

Thank you — happy to take questions."

---

## Likely Questions You'll Get Asked

### Product / scope

1. **Why no authentication if it's a "portfolio manager"?** — It was an explicit constraint of the assignment: single shared user, no auth, to keep scope focused on portfolio logic and analytics rather than identity/session management.
2. **What happens if two people use it at once?** — There's no user isolation; it's genuinely single-user by design. Multi-user would need auth, per-user portfolios, and session handling — called out directly as future work.
3. **Why MySQL instead of Postgres or SQLite?** — The brief asked us to use the DB technology we were learning; SQLite is used in-memory for tests so the suite runs without a live DB or network.

### Financial engine

4. **How do you compute XIRR, and what if it doesn't converge?** — It's solved numerically (bisection) over the account's actual cash flows, with the solver domain guarded to avoid complex-number results at extreme returns; gated to a minimum holding period so short windows don't get annualized into nonsense.
5. **Why gate annualized return to a minimum time period?** — A 3-day gain projected out to a year produces an absurd, meaningless number. We'd rather hide the metric than show a misleading one.
6. **Do you actually handle dividends?** — Not yet — that's the one honest gap: the schema has a `DIVIDEND` transaction type, but nothing populates or reads it yet. Same for stock splits.
7. **What's your risk-free rate source, and how fresh is it?** — The 13-week T-bill (`^IRX`) via Yahoo Finance, cached for a few hours so we're not hammering the API on every request.
8. **Why is "what-if" P&L reversed — a bull scenario shows as a loss?** — By design: what-if evaluates "what would today's holdings be worth if priced at this hypothetical," compared against their real value today. Framing it as hypothetical-minus-live rather than live-minus-hypothetical is what makes "if the price were higher" read intuitively.

### Architecture / data integrity

9. **Why is the transaction ledger immutable — what if I made a mistake entering a trade?** — You correct it with an offsetting sell/buy, not an edit. This keeps the ledger auditable — it's the single source of truth everything else, including holdings, gets rebuilt from.
10. **Why not persist P&L or market value?** — Because prices move continuously; a stored number would be stale the moment the market ticks. Computing on read guarantees what you see always matches the live price feed.
11. **What happens if Yahoo Finance is down or rate-limits you?** — All external calls are isolated to the backend behind a cache layer, so a hiccup degrades gracefully to cached/last-known prices rather than breaking the whole app; FX specifically fails loudly (an explicit error) rather than silently defaulting to a rate of 1.0.
12. **How do you handle multiple currencies in one portfolio?** — Cash is tracked per-currency in a shared wallet, and trades/holdings convert through live FX rates fetched from the same price service.

### Testing / delivery

13. **How is this tested?** — A pytest suite covering the pure financial math (XIRR, risk metrics, recommendations) against synthetic inputs so it runs deterministically without hitting the network or a live database, alongside API-level tests.
14. **Is there a CI/CD pipeline?** — Not yet — called out directly as a next step, along with Swagger/OpenAPI docs.
15. **How would this scale to many users?** — It would need an auth layer, per-user data scoping, and likely rate-limit/caching adjustments on the market-data layer — all flagged as roadmap, not attempted here since it was out of scope.

### Recent features

16. **Why did you remove the "Save as Portfolio" and auto-load behavior on the what-if page?** — Auto-loading on every scenario change was making unnecessary network calls; we made the price graph opt-in ("Load Price Graph") so it only fetches when you actually want to see it.
17. **Where does the price-path graph data come from?** — A new backend endpoint that returns each symbol's daily closes between the scenario's target date and today, reusing the same historical price cache the backfill feature already populates.

### Portfolio / risk analytics

18. **Why does the dashboard have both TWR and XIRR?** — They answer different questions: TWR measures the investment strategy itself, while XIRR measures how your timing of deposits and withdrawals affected your personal result.
19. **Why is the annualized return hidden for short windows?** — Annualizing a tiny window produces misleading numbers, so we prefer to show nothing rather than exaggerate a 2-day or 2-week move.
20. **Why can the chart be switched to exclude cash but the metrics stay the same?** — The toggle is meant to change the visual line only; the risk metrics stay anchored to the true portfolio value so the numbers do not drift when the user is just changing the view.
21. **How do you make sure deposits do not count as profit?** — Deposits and withdrawals are treated as external cash flows and removed from the return math, so moving money into the account never shows up as fake performance.
22. **What is Jensen's Alpha in plain English?** — It measures whether the portfolio beat what would be expected from its market risk alone, after accounting for the benchmark and risk-free rate.

### Recommendation engine

23. **Is the recommendation engine AI?** — No, it is a rule-based scoring system with explicit thresholds, so every verdict can be explained in plain English.
24. **Why did you choose rules instead of machine learning?** — The project needed transparent, auditable decisions, and rules are easier to test and defend than a black-box model.
25. **What makes the recommendation say Add, Hold, or Sell?** — It adds and subtracts points from metrics like Sharpe, drawdown, volatility, alpha, valuation, and concentration, then maps the final score to a verdict.

### UI / product behavior

26. **Why does the what-if tool use a separate price graph?** — It lets the user see how the scenario price compares with the historical path from the chosen date to today, instead of only showing a single simulated value.
27. **Why keep cash as a separate wallet instead of just another holding?** — Cash is shared, tradable, and affects every buy and sell, so keeping it separate avoids mixing settlement logic with normal securities.
28. **Why do you cache market data?** — Live market data is slow and rate-limited, so caching keeps the app responsive and reduces repeated API calls.
29. **What happens when Yahoo Finance does not return a quote?** — The backend falls back to safer defaults or cached values where possible, so one bad symbol does not break the whole dashboard.

### Technical / engineering

30. **What was the hardest part to build correctly?** — The financial math, because it had to stay numerically stable and still match real portfolio behavior under deposits, withdrawals, and cash holdings.
31. **How did you test the tricky math?** — The tests use synthetic transaction histories and fixed price series so the results are deterministic and do not depend on live market data.
32. **Why is the transaction ledger immutable?** — It keeps the system auditable and lets every dashboard metric be reconstructed from a single source of truth.
33. **What would you improve next if you had more time?** — Authentication, OpenAPI docs, CI/CD, more asset types, and a more advanced optimizer for allocation and rebalancing.
