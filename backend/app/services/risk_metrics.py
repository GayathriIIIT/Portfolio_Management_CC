"""Pure portfolio risk & performance indicator math.

All functions here are deterministic and network-free: they consume a daily
portfolio NAV series (and optionally a benchmark return series) and return
computed statistics. Keeping the math isolated from the yfinance/NAV
reconstruction plumbing makes it unit-testable with synthetic inputs.

Conventions:
- ``nav_values``  : ordered (ascending date) daily portfolio values, floats.
- ``bench_returns``: ordered daily benchmark returns (decimal fractions, e.g.
  0.01 = 1%) aligned one-for-one with the daily returns derived from
  ``nav_values``. ``None`` means "not available" and skips benchmark-based
  indicators.
- returns are reported as percentages (e.g. 12.5 = 12.5%); volatility/Sharpe
  annualize with the standard 252-trading-day convention.
"""

import math

ANNUALIZATION_FACTOR = 252


def _daily_returns(nav_values, external_flows=None):
    """Consecutive daily portfolio returns.

    ``external_flows`` (optional) is a sequence aligned to ``nav_values`` where
    ``external_flows[i]`` is the *net external* cash flow (deposit > 0,
    withdrawal < 0, in base currency) that hit the portfolio on the day of
    ``nav_values[i]``. Deposits and withdrawals are not investment returns, so
    they are subtracted from the day's change before dividing by the prior
    value. This is what makes a Time-Weighted Return honest: a +$1000 deposit
    no longer reads as a +108% "best day". Funded BUY/SELL legs are *internal*
    (cash moves between positions) and are left in place — their net effect on
    NAV is ~fees only. An *unfunded/oversized* BUY, however, is capital that
    the reconstruction invents (cash is clamped at 0), so its amount is also
    reported here as a same-day inflow; subtraction keeps the buy's size from
    masquerading as market profit.

    A buy funded by cash the ledger doesn't model leaves the opening day's net
    value ~0; dividing by that near-zero base produces astronomically large
    returns. Any non-positive or negligible base is a degenerate observation
    (opening day / unfunded cash), so it can't support a percentage return.
    """
    max_val = max((abs(v) for v in nav_values if v is not None), default=0.0)
    trivial = max_val * 1e-9 if max_val else 0.0
    returns = []
    n = len(nav_values)
    for i in range(1, n):
        prev = nav_values[i - 1]
        cur = nav_values[i]
        if prev is None or cur is None:
            continue
        if prev <= 0 or abs(prev) < trivial:
            continue
        cf = 0.0
        if external_flows and i < len(external_flows):
            cf = external_flows[i] or 0.0
        returns.append((cur - prev - cf) / prev)
    return returns


def _geometric_link(returns):
    """Time-Weighted Return = product(1 + r_i) - 1 over consecutive returns."""
    cumulative = 1.0
    for r in returns:
        cumulative *= 1.0 + r
    return (cumulative - 1.0) * 100.0


def _mean(values):
    if not values:
        return 0.0
    return sum(values) / len(values)


def _stdev(values):
    """Sample standard deviation; 0.0 when there are too few observations."""
    n = len(values)
    if n < 2:
        return 0.0
    m = _mean(values)
    variance = sum((v - m) ** 2 for v in values) / (n - 1)
    return math.sqrt(variance)


def _annualized_return(total_return_decimal, period_days):
    """CAGR consistent with the total return (itself a TWR when external flows
    are present), or None when the window is degenerate."""
    if total_return_decimal is None:
        return None
    if period_days <= 0:
        return None
    if total_return_decimal <= -1.0:
        return None
    years = period_days / ANNUALIZATION_FACTOR
    if years <= 0:
        return None
    return ((1.0 + total_return_decimal) ** (1.0 / years) - 1.0) * 100.0


def _max_drawdown(nav_values):
    """Largest peak-to-trough decline as a positive percentage of the peak."""
    if not nav_values:
        return None
    peak = None
    max_dd = 0.0
    for value in nav_values:
        if value is None:
            continue
        if peak is None or value > peak:
            peak = value
        if peak and peak > 0:
            drawdown = (peak - value) / peak * 100.0
            if drawdown > max_dd:
                max_dd = drawdown
    return round(max_dd, 4)


def compute_risk_metrics(nav_values, bench_returns=None, rf_pct=4.0,
                         min_annualize_days=365, min_bench_observations=30,
                         external_flows=None):
    """Compute the full set of risk & performance indicators.

    Credibility gating (mirrors the XIRR rule): a sub-year window cannot support
    annualized extrapolations, so the annualized family (annualized return /
    volatility, Sharpe, Sortino, Jensen's alpha) is only computed once the window
    spans ``min_annualize_days``. Benchmark-relative stats (beta, correlation,
    up/down capture) need at least ``min_bench_observations`` aligned return
    pairs to be statistically meaningful. Stable, non-extrapolated metrics —
    total return, max drawdown, best/worst day, daily volatility — are always
    reported when any data exists.

    ``external_flows`` (optional, list aligned to ``nav_values``) turns the daily
    returns and the total return into a Time-Weighted Return: deposits and
    withdrawals are treated as capital flows, not gains, so a window that
    received new money is measured purely on price change. When omitted (or all
    zero), behaviour is unchanged — a plain price return.

    Returns a dict with percentage-based values (or ``None`` when gated or too
    sparse), plus a ``sufficient_history`` flag the UI can use to explain why
    some metrics are hidden.
    """
    returns = _daily_returns(nav_values, external_flows=external_flows)
    period_days = len(nav_values) - 1

    flows_present = bool(external_flows and any(
        (f or 0) != 0 for f in external_flows[:len(nav_values)]))

    # Max drawdown must be flow-clean too: a DEPOSIT creates a fake peak and a
    # WITHDRAWAL a fake trough on the raw NAV, so when external flows are
    # present we rebuild a flow-adjusted curve (geometric link of the daily
    # returns) and measure drawdown against that instead of the ledger-jumpy
    # values. Best/worst day and volatility already use the flow-adjusted
    # returns, so they are unaffected by buy/sell/deposit size.
    if flows_present and returns:
        drawdown_nav = [nav_values[0]]
        for r in returns:
            drawdown_nav.append(drawdown_nav[-1] * (1.0 + r))
    else:
        drawdown_nav = nav_values

    metrics = {
        "total_return": None,
        "max_drawdown": _max_drawdown(drawdown_nav),
        "period_volatility": None,
        "best_day": None,
        "worst_day": None,
        "annualized_return": None,
        "annualized_volatility": None,
        "sharpe_ratio": None,
        "sortino_ratio": None,
        "jensen_alpha": None,
        "beta": None,
        "correlation": None,
        "up_capture": None,
        "down_capture": None,
        "data_points": len(nav_values),
        "period_days": period_days,
        "sufficient_history": period_days >= min_annualize_days,
    }

    if not nav_values:
        return metrics

    first = next((v for v in nav_values if v), None)
    last = next((v for v in reversed(nav_values) if v), None)
    if first and last and first > 0 and last > 0:
        if flows_present and returns:
            # Time-Weighted Return: geometric link of flow-adjusted daily returns
            # so deposits/withdrawals are invisible to the return number.
            total_ret = round(_geometric_link(returns), 4)
            metrics["total_return"] = total_ret
            total_ret_decimal = total_ret / 100.0
        else:
            total_ret = round((last / first - 1.0) * 100.0, 4)
            metrics["total_return"] = total_ret
            total_ret_decimal = total_ret / 100.0
    else:
        total_ret_decimal = None

    if not returns:
        return metrics

    metrics["best_day"] = round(max(returns) * 100.0, 4)
    metrics["worst_day"] = round(min(returns) * 100.0, 4)
    metrics["period_volatility"] = round(_stdev(returns) * 100.0, 4)

    annualized = period_days >= min_annualize_days
    if annualized:
        ann_vol = _stdev(returns) * math.sqrt(ANNUALIZATION_FACTOR) * 100.0
        ann_ret = _annualized_return(total_ret_decimal, period_days)
        if ann_ret is not None:
            metrics["annualized_return"] = round(ann_ret, 4)
            metrics["annualized_volatility"] = round(ann_vol, 4)

            if ann_vol > 0.001:
                metrics["sharpe_ratio"] = round((ann_ret - rf_pct) / ann_vol, 4)

                downside = [r for r in returns if r < 0]
                if len(downside) >= 2:
                    downside_dev = _stdev(downside) * math.sqrt(ANNUALIZATION_FACTOR) * 100.0
                    if downside_dev > 0.001:
                        metrics["sortino_ratio"] = round((ann_ret - rf_pct) / downside_dev, 4)

    if bench_returns is not None:
        pairs = [(p, b) for p, b in zip(returns, bench_returns) if b is not None]
        if len(pairs) >= max(2, min_bench_observations):
            port = [p for p, _ in pairs]
            bench = [b for _, b in pairs]

            var_bench = _stdev(bench) ** 2 * (len(bench) - 1) / len(bench) if len(bench) > 1 else 0.0
            mean_p = _mean(port)
            mean_b = _mean(bench)
            covariance = sum((p - mean_p) * (b - mean_b) for p, b in pairs) / len(pairs)

            if var_bench > 0:
                beta = covariance / var_bench
                metrics["beta"] = round(beta, 4)

                # Correlation must use population variances to stay consistent with
                # the population covariance (dividing by sample stdevs would
                # understate rho by a factor of (n-1)/n).
                var_port = sum((p - mean_p) ** 2 for p in port) / len(port)
                if var_port > 0:
                    corr = covariance / math.sqrt(var_port * var_bench)
                    metrics["correlation"] = round(corr, 4)

                if annualized:
                    rf_daily = rf_pct / 100.0 / ANNUALIZATION_FACTOR
                    jensen_alpha = (mean_p - rf_daily - beta * (mean_b - rf_daily)) * ANNUALIZATION_FACTOR * 100.0
                    metrics["jensen_alpha"] = round(jensen_alpha, 4)

            up_ret = sum(b for _, b in pairs if b > 0)
            down_ret = sum(b for _, b in pairs if b < 0)
            if up_ret > 0:
                up_capture = sum(p for p, b in pairs if b > 0) / up_ret * 100.0
                metrics["up_capture"] = round(up_capture, 4)
            if down_ret < 0:
                down_capture = sum(p for p, b in pairs if b < 0) / down_ret * 100.0
                metrics["down_capture"] = round(down_capture, 4)

    return metrics
