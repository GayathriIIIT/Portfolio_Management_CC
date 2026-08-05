"""Portfolio-level recommendation engine.

Consumes the computed risk metrics (plus portfolio-level analytics) and produces
an ADD / HOLD / SELL signal with a list of human-readable reasons. The rules are
deliberately conservative: a sub-year window can't support annualized metrics,
so when no credible signal exists the engine returns INSUFFICIENT_DATA instead
of forcing a buy/sell call on noise. This is educational, not financial advice.
"""


def generate_recommendation(risk, alpha=None, xirr=None, profit_loss_percentage=None,
                            fundamentals=None):
    """Build an {action, label, tone, confidence, reasons, score, period_days} dict.

    ``fundamentals`` is an optional dict (see _portfolio_fundamentals) with
    value-weighted portfolio valuation stats — weighted_pe, dividend_yield,
    market_cap, top_sector/top_sector_pct — used for valuation & concentration
    signals that risk metrics can't capture. When omitted, only the
    risk/performance signals are evaluated.
    """
    if not risk:
        return _result("INSUFFICIENT_DATA", "Not enough data", "neutral",
                       ["No risk metrics are available yet, so no recommendation can be made."], "low", 0, 0)

    period_days = risk.get("period_days") or 0
    sufficient = bool(risk.get("sufficient_history", False))
    score = 0
    reasons = []

    sharpe = risk.get("sharpe_ratio")
    if sharpe is not None:
        if sharpe >= 1.5:
            score += 2
            reasons.append(f"Sharpe ratio {sharpe:.2f} (>=1.5) indicates strong risk-adjusted returns")
        elif sharpe < 0.0:
            score -= 2
            reasons.append(f"Negative Sharpe ratio ({sharpe:.2f}) means returns trail the risk-free rate")

    drawdown = risk.get("max_drawdown")
    if drawdown is not None and drawdown >= 25.0:
        score -= 2
        reasons.append(f"Max drawdown of {drawdown:.1f}% shows deep historical loss exposure")

    beta = risk.get("beta")
    if beta is not None:
        if beta > 1.3:
            score -= 1
            reasons.append(f"Beta {beta:.2f} (>1.3) swings harder than the market")
        elif beta < 0.8:
            reasons.append(f"Beta {beta:.2f} (<0.8) is calmer than the market")

    up = risk.get("up_capture")
    down = risk.get("down_capture")
    if up is not None and down is not None:
        if up >= 120 and down <= 80:
            score += 1
            reasons.append(f"Up/down capture {up:.0f}%/{down:.0f}% keeps upside while softening downside")
        elif down >= 120 and up <= 80:
            score -= 1
            reasons.append(f"Down capture {down:.0f}% is high while up capture is only {up:.0f}%")

    if alpha is not None:
        if alpha >= 2.0:
            score += 1
            reasons.append(f"Outperformed the S&P 500 by {alpha:+.2f} points over the window")
        elif alpha <= -2.0:
            score -= 1
            reasons.append(f"Underperformed the S&P 500 by {alpha:.2f} points over the window")

    if xirr is not None:
        if xirr >= 20.0:
            score += 1
            reasons.append(f"Strong annualized return (XIRR) of {xirr:.1f}%")
        elif xirr <= 0.0:
            score -= 1
            reasons.append(f"Flat or negative annualized return (XIRR) of {xirr:.1f}%")

    if profit_loss_percentage is not None and profit_loss_percentage <= -20.0:
        score -= 1
        reasons.append(f"Portfolio is down {profit_loss_percentage:.1f}% overall")

    if fundamentals:
        pe = fundamentals.get("weighted_pe")
        if pe is not None and pe > 0:
            if pe >= 28:
                score -= 1
                reasons.append(f"Valuation is stretched (weighted P/E {pe:.1f}) — growth may be priced in")
            elif pe <= 14:
                score += 1
                reasons.append(f"Valuation is attractive (weighted P/E {pe:.1f}) — cheap relative to earnings")

        dy = fundamentals.get("dividend_yield")
        if dy is not None and dy > 0:
            dy_pct = dy * 100.0
            if dy_pct >= 3.0:
                score += 1
                reasons.append(f"Healthy dividend income (~{dy_pct:.1f}% yield) cushions drawdowns")
            elif dy_pct < 0.5:
                reasons.append(f"Low dividend yield ({dy_pct:.1f}%) — little income support in a downturn")

        conc = fundamentals.get("top_sector_pct")
        if conc is not None and conc >= 40.0:
            score -= 1
            reasons.append(f"Concentrated in {fundamentals.get('top_sector') or 'one sector'} "
                           f"({conc:.0f}% of holdings) — concentration risk")

    if not reasons:
        if period_days < 30:
            return _result("INSUFFICIENT_DATA", "Not enough history", "neutral",
                           [f"Only {period_days} days of data - not enough for a credible buy/hold/sell "
                            "call. Revisit in a few months."], "low", score, period_days)
        return _result("HOLD", "Hold", "neutral",
                       [f"No strong risk signals over {period_days} days; the data supports keeping the "
                        "current position."], "medium", score, period_days)

    if score >= 3:
        action, label, tone = "ADD", "Consider Adding", "positive"
    elif score <= -3:
        action, label, tone = "SELL", "Consider Reducing", "negative"
    else:
        action, label, tone = "HOLD", "Hold", "neutral"

    confidence = "high" if sufficient and len(reasons) >= 3 else ("medium" if len(reasons) >= 1 else "low")
    return _result(action, label, tone, reasons, confidence, score, period_days)


def _result(action, label, tone, reasons, confidence, score, period_days):
    return {
        "action": action,
        "label": label,
        "tone": tone,
        "confidence": confidence,
        "reasons": reasons,
        "score": score,
        "period_days": period_days,
    }
