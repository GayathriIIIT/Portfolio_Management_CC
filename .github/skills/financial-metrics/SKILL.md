---
name: financial-metrics
description: Rules for computing portfolio returns, CAGR/XIRR, and annualized performance in the backend. Use when touching return, CAGR, XIRR, alpha, or "annualized"/"performance" calculations in backend/app/api/portfolios.py — these have been the source of real bugs and have specific invariants that are easy to accidentally regress.
---

# Financial metrics — invariants

The return/CAGR/XIRR logic in `backend\app\api\portfolios.py` has been fixed for real bugs (see git log: "only annualize returns after a 1-year holding period", "never return N/A metrics and fix short-window XIRR"). Preserve these invariants when touching it:

1. **Never produce an annualized figure below the minimum holding window.** A sub-year gain extrapolated to a full year produces absurd numbers (e.g. a 2-week gain annualized to millions of %). The thresholds are `current_app.config["MIN_XIRR_HOLDING_DAYS"]` (portfolio-level, default 365) and `MIN_CAGR_HOLDING_DAYS` (per-holding, default 30) in `backend\app\config.py` — read them, don't hardcode a day count.
2. **Never leave a return metric as `None`/N/A for a position that has data.** If money-weighted XIRR can't be solved (e.g. no cash-flow ledger rows yet, for holdings created before BUY/SELL entries existed), fall back to the simple return (`profit_loss_percentage` or `simple_return_pct`) instead of blanking the field — see the fallback block after `_solve_xirr` in both `_compute_holding_cagr` and the portfolio summary route.
3. **`_solve_xirr`'s bisection must stay inside `r > -100%`.** The IRR domain for a real (non-levered) portfolio cash-flow series is `(-100%, +inf)`; evaluating `(1+r)**t` for `1+r <= 0` produces complex numbers and used to crash the solver (silently falling back to simple return, which made "Annualized" identical to "Total Return"). Keep the `base <= 0.0` guard inside `f(r)` and the `low = -0.999999` bisection bound.

When adding a new return-style metric, apply the same three rules: respect the minimum holding window, never emit N/A when a simple-return fallback is possible, and keep any numerical solver inside the valid IRR domain.

After changes here, run `.github\scripts\run-tests.ps1` — `backend\tests\test_portfolios.py` covers the short-window and no-ledger cases.
