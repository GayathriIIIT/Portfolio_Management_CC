# The Math Behind MoneyMaxxing — Explained Simply

This is a plain-English walkthrough of every financial formula the app computes, based on the actual implementation in `backend/app/services/risk_metrics.py` and `backend/app/api/portfolios.py`. Each section has: what it means, the formula, and why we built it that way.

---

## 1. Daily Return (the building block for everything else)

**Plain English:** How much did the portfolio move, in percent, from yesterday to today?

**Formula:**
```
daily_return = (today's value − yesterday's value − external_cash_flow) / yesterday's value
```

**Why the `external_cash_flow` term?** If you deposit $1,000 into your account, your portfolio value jumps by $1,000 overnight — but that's not a *gain*, it's just your own money moving in. Subtracting deposits/withdrawals before dividing means a big deposit never shows up as a fake "+108% best day." Buying and selling stock *inside* the portfolio doesn't count as external — that money was always yours, just parked differently.

---

## 2. Time-Weighted Return (TWR) — "Total Return"

**Plain English:** How well did your *investment strategy* perform, ignoring the timing and size of your deposits/withdrawals? This is the fair way to judge "did I pick good investments," independent of when you happened to add or remove cash.

**Formula:** multiply together each day's growth factor, then subtract 1:
```
TWR = (1 + r₁) × (1 + r₂) × ... × (1 + rₙ) − 1
```
where each `rᵢ` is the daily return from step 1 above.

**Why geometric, not just averaging?** A portfolio that goes +10% then −10% is *not* back to even (it's actually down ~1%) — averaging the two returns would wrongly say 0%. Multiplying the growth factors together captures the real compounding effect.

---

## 3. Money-Weighted Return (XIRR) — "Annualized Return / CAGR"

**Plain English:** What single, constant annual growth rate would explain all your actual cash going in and out, and what you're left holding today? Unlike TWR, this *does* care about timing — putting in a big chunk of money right before a rally boosts your XIRR, because your timing was good.

**How it's actually solved:** Every BUY/DEPOSIT is a cash outflow (negative), every SELL/WITHDRAW is a cash inflow (positive), and today's market value is treated as one final "sale." XIRR is the interest rate `r` that makes the net present value of every cash flow equal zero:
```
0 = Σ  cash_flow_i / (1 + r) ^ (years_since_first_flow_i)
```

We solve for `r` numerically using **bisection** — repeatedly narrowing a range between −99.9999% and a very high upper bound until the equation balances — rather than a closed-form formula, because there isn't one for an arbitrary number of irregular cash flows.

**Guardrail:** `r` is never allowed to go ≤ −100%, because `(1 + r)` would become zero or negative, and raising a negative number to a fractional power produces a complex (imaginary) number — which would crash the solver. We clamp the search domain so that can never happen.

**Minimum holding period:** if a position (or the whole portfolio) has been held less than a set number of days (30 days per position, 365 days for the whole-portfolio annualized figure), we don't annualize it at all. A 3-day, +2% gain annualizes to a nonsense number like +hundreds of percent — so we hide the metric instead of showing something misleading.

---

## 4. Annualized Volatility — "How bumpy is the ride?"

**Plain English:** How much does your portfolio's daily return typically swing above or below its average, scaled up to a yearly figure?

**Formula (in two steps):**
```
daily_volatility = standard_deviation(daily_returns)
annualized_volatility = daily_volatility × √252
```

**Why √252?** There are about 252 trading days in a year. Standard deviation doesn't scale linearly with time — it scales with the *square root* of the number of periods, because random daily wiggles partially cancel each other out over time. This is a universal convention in finance ("square-root-of-time rule").

---

## 5. Sharpe Ratio — "Return per unit of total risk"

**Plain English:** Are you being paid enough extra return for the bumpiness you're taking on, compared to a "safe" investment like a T-bill?

**Formula:**
```
Sharpe = (annualized_return − risk_free_rate) / annualized_volatility
```

**Risk-free rate:** we use the real 13-week U.S. Treasury Bill yield (`^IRX` on Yahoo Finance), refreshed every few hours — not a hardcoded guess.

**Reading it:** higher is better. Above ~1.0 is generally considered good; it means you're earning more than 1% of extra return for every 1% of extra volatility.

---

## 6. Sortino Ratio — "Return per unit of *bad* risk"

**Plain English:** Same idea as Sharpe, but it only counts the downside. Sharpe penalizes you for volatility even when the swings are *upward* (which nobody actually minds) — Sortino fixes that by only measuring how bumpy the *losing* days were.

**Formula:**
```
downside_deviation = standard_deviation(only the negative daily returns) × √252
Sortino = (annualized_return − risk_free_rate) / downside_deviation
```

We require at least 2 negative-return days in the window before computing this — one bad day isn't enough data to call it "downside risk."

---

## 7. Max Drawdown — "Worst-case pain"

**Plain English:** From the highest point your portfolio ever reached, how far did it fall before recovering? This is the number that answers "how bad could it have gotten if I'd needed my money at the worst possible moment?"

**Formula:** track the running peak value, and at every point measure the drop from that peak:
```
drawdown(t) = (peak_so_far − value(t)) / peak_so_far
max_drawdown = the largest drawdown(t) seen across the whole period
```

**A subtlety we had to handle:** a $10,000 deposit makes your NAV jump instantly — that fake "spike" would create a fake peak, and then normal market noise afterward would look like a giant, fake drawdown. So when deposits/withdrawals are present, we first rebuild a "flow-adjusted" value curve (by re-compounding the daily returns from step 1, which already strips out deposits/withdrawals) and measure drawdown against *that* clean curve instead of the raw, cash-flow-jumpy one.

---

## 8. Calmar Ratio — "Return per unit of worst-case pain"

**Plain English:** How much annual return are you getting for the worst drawdown you had to sit through? It's Sharpe's cousin, but instead of comparing return to *volatility*, it compares return to the single worst peak-to-trough loss — which some investors find more intuitive than volatility ("I care less about day-to-day wobble and more about how bad my worst moment was").

**Formula:**
```
Calmar = annualized_return / max_drawdown
```
Read as: a Calmar of 1.0 means your yearly return roughly equals your worst drawdown; above 1.0 means your returns are outrunning your worst-case pain.

---

## 9. Beta — "How much do you move when the market moves?"

**Plain English:** If SPY (the S&P 500) moves 1%, how much does your portfolio typically move? A beta of 1.5 means you tend to move 1.5× as much as the market — more aggressive; a beta of 0.5 means you move about half as much — more defensive.

**Formula:**
```
Beta = Covariance(your_daily_returns, benchmark_daily_returns) / Variance(benchmark_daily_returns)
```
Covariance measures how two things move together; variance measures how much the benchmark moves on its own. Dividing one by the other isolates "how much of the benchmark's movement do you inherit."

We only compute this once we have enough overlapping days of data (a configured minimum, e.g. ~30) — a beta computed from a handful of days is just noise.

---

## 10. Correlation — "Do you move *with* the market, or independently?"

**Plain English:** Beta tells you *how much* you move when the market moves; correlation tells you *how reliably* you move together at all. A correlation near 1.0 means you almost always move the same direction as the market; near 0 means your moves are essentially unrelated to it; negative means you tend to move opposite.

**Formula:**
```
Correlation = Covariance(your_returns, benchmark_returns) / (StdDev(your_returns) × StdDev(benchmark_returns))
```

We deliberately use *population* variance (dividing by `n`, not `n−1`) here to stay mathematically consistent with how covariance is computed above — mixing sample and population conventions would subtly and silently understate the result.

---

## 11. Jensen's Alpha — "Are you beating what the market/risk model predicts?"

**Plain English:** Given how much market risk you took (your beta), CAPM (the Capital Asset Pricing Model) predicts a "fair" return you *should* have earned. Jensen's Alpha is the extra return you earned *above* that prediction — the part that isn't explained by simply being exposed to the market. Positive alpha = genuine outperformance; negative = underperformance relative to the risk you took.

**Formula (CAPM excess return, annualized):**
```
Jensen's Alpha = [ (mean_daily_return − risk_free_daily) − Beta × (mean_benchmark_return − risk_free_daily) ] × 252
```

This only gets computed once we're past the minimum annualization window — a sub-year alpha is just noise dressed up as a number.

---

## 12. Up-Capture / Down-Capture — "How do you behave in good months vs. bad months?"

**Plain English:** Split all the days into "market went up" days and "market went down" days. Up-capture asks: on the market's good days, what percentage of that upside did you actually capture? Down-capture asks the same for bad days — ideally you want high up-capture (you participate in rallies) and low down-capture (you're shielded in selloffs).

**Formula:**
```
Up-Capture   = (sum of your returns on days the benchmark was positive) / (sum of benchmark's positive returns)  × 100
Down-Capture = (sum of your returns on days the benchmark was negative) / (sum of benchmark's negative returns) × 100
```

---

## 13. What-If "Reverse P&L"

**Plain English:** This isn't a classic financial formula, more a UX/framing decision — but it trips people up, so it's worth explaining. When you simulate a hypothetical price for your holdings, we show:
```
scenario_impact = hypothetical_value − today's_live_value
```
Read literally, if your hypothetical price is *higher* than today's, the value goes *up* — but we display the change from the market's perspective ("if it had already happened, what would today look like in hindsight"), so a bullish scenario (hypothetical above today) is framed as the gain you're *not yet* holding, and a bearish one as the loss you've *avoided so far*. This is intentional — it's meant to answer "what am I exposed to," not "what's my P&L right now."

---

## Quick Reference Table

| Metric | Answers the question | Needs benchmark? | Minimum data needed |
|---|---|---|---|
| Daily Return | Did today go up or down, ignoring my own deposits? | No | 2 days |
| TWR (Total Return) | How good is my strategy, ignoring cash-flow timing? | No | 2 days |
| XIRR (Annualized Return) | What single yearly rate explains all my cash flows? | No | ≥365 days (portfolio), ≥30 days (per holding) |
| Volatility | How bumpy is the ride? | No | 2 days (daily), ≥365 days (annualized) |
| Sharpe Ratio | Return per unit of total risk | No (uses risk-free rate) | ≥365 days |
| Sortino Ratio | Return per unit of downside-only risk | No (uses risk-free rate) | ≥365 days + ≥2 down days |
| Max Drawdown | Worst peak-to-trough loss | No | 2 days |
| Calmar Ratio | Return per unit of worst-case loss | No | ≥365 days |
| Beta | How much do I move when the market moves? | Yes (e.g. SPY) | ~30 aligned days |
| Correlation | Do I move with the market at all? | Yes | ~30 aligned days |
| Jensen's Alpha | Am I beating what my risk level predicts? | Yes | ≥365 days + benchmark data |
| Up/Down Capture | How do I behave in good vs. bad months? | Yes | ~30 aligned days |
