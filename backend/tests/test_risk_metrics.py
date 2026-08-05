import pytest

from app.services.risk_metrics import compute_risk_metrics
from app.api import portfolios as portfolios_module
from app.extensions import db
from app.models import Portfolio, PortfolioTransaction


def nav_from_returns(returns, start=100.0):
    nav = [start]
    for r in returns:
        nav.append(nav[-1] * (1.0 + r))
    return nav


def _create_portfolio(client, owner="Risk", name="Test"):
    return client.post("/api/portfolios", json={"owner": owner, "name": name})


def test_short_window_only_reports_stable_metrics():
    nav = nav_from_returns([0.01] * 40)
    m = compute_risk_metrics(nav, rf_pct=4.0)
    assert m["sufficient_history"] is False
    assert m["period_days"] == 40
    assert m["total_return"] is not None  # always available
    assert m["max_drawdown"] == 0.0
    assert m["best_day"] == 1.0
    assert m["worst_day"] == 1.0
    assert m["period_volatility"] == 0.0
    # The entire annualized family is gated below one year
    assert m["annualized_return"] is None
    assert m["annualized_volatility"] is None
    assert m["sharpe_ratio"] is None
    assert m["sortino_ratio"] is None
    assert m["jensen_alpha"] is None


def test_short_window_does_not_extrapolate_huge_returns():
    # A 2-day 21% bounce must NOT surface as a +207% annualized number.
    nav = [100.0, 110.0, 121.0]
    m = compute_risk_metrics(nav, rf_pct=4.0)
    assert m["sufficient_history"] is False
    assert m["total_return"] == pytest.approx(21.0)
    assert m["annualized_return"] is None
    assert m["annualized_volatility"] is None


def test_annualized_family_active_after_one_year():
    pattern = [0.01, -0.005, 0.008, -0.003, 0.0]
    nav = nav_from_returns(pattern * 100)  # 500 days
    m = compute_risk_metrics(nav, rf_pct=4.0)
    assert m["sufficient_history"] is True
    assert m["annualized_return"] is not None
    assert m["annualized_volatility"] is not None and m["annualized_volatility"] > 0
    assert m["sharpe_ratio"] is not None
    assert m["sortino_ratio"] is not None


def test_year_window_zero_variance_has_no_sharpe():
    nav = nav_from_returns([0.01] * 400)
    m = compute_risk_metrics(nav, rf_pct=4.0)
    assert m["sufficient_history"] is True
    assert m["annualized_return"] is not None
    assert m["annualized_volatility"] == 0.0
    assert m["sharpe_ratio"] is None
    assert m["sortino_ratio"] is None


def test_max_drawdown_peak_to_trough():
    nav = [100.0, 120.0, 100.0, 120.0]
    m = compute_risk_metrics(nav)
    assert m["max_drawdown"] == pytest.approx(16.6667, abs=0.0001)
    assert m["best_day"] == 20.0
    assert m["worst_day"] == pytest.approx(-16.6667, abs=0.01)


def test_benchmark_stats_need_observations():
    nav = nav_from_returns([0.01] * 10)
    bench = [0.01] * 10
    m = compute_risk_metrics(nav, bench_returns=bench)
    # fewer than the 30-observation minimum -> hidden, not absurd
    assert m["beta"] is None
    assert m["correlation"] is None
    assert m["up_capture"] is None
    assert m["down_capture"] is None


def test_beta_correlation_with_matching_benchmark():
    pattern = [0.01, -0.005, 0.008, 0.0]
    nav = nav_from_returns(pattern * 100)
    m = compute_risk_metrics(nav, bench_returns=(pattern * 100), rf_pct=4.0)
    assert m["beta"] == pytest.approx(1.0, abs=1e-3)
    assert m["correlation"] == pytest.approx(1.0, abs=1e-3)
    assert m["up_capture"] == pytest.approx(100.0, abs=1e-3)
    assert m["down_capture"] == pytest.approx(100.0, abs=1e-3)
    assert m["jensen_alpha"] is not None


def test_inverse_benchmark_gives_negative_beta():
    pattern = [0.01, -0.005, 0.008, 0.0]
    nav = nav_from_returns(pattern * 40)
    bench = [-x for x in pattern] * 40
    m = compute_risk_metrics(nav, bench_returns=bench, rf_pct=4.0)
    assert m["beta"] == pytest.approx(-1.0, abs=1e-3)
    assert m["correlation"] == pytest.approx(-1.0, abs=1e-3)
    assert m["up_capture"] == pytest.approx(-100.0, abs=1e-3)
    assert m["down_capture"] == pytest.approx(-100.0, abs=1e-3)


def test_sparse_input_returns_none_metrics():
    m = compute_risk_metrics([100.0])
    assert m["data_points"] == 1
    assert m["period_days"] == 0
    assert m["annualized_return"] is None
    assert m["annualized_volatility"] is None
    assert m["beta"] is None
    assert m["best_day"] is None
    assert m["worst_day"] is None


def test_reconstructed_nav_healthy_for_unfunded_buy(client, monkeypatch):
    """A BUY with no DEPOSIT row must not produce ~0 NAV (which would make the
    next day's return +10000%). The opening cash is seeded from the purchase
    cost, so the series stays at a real valuation."""
    from datetime import date as _date, datetime as _dt, timedelta as _td, timezone as _tz

    created = client.post("/api/portfolios", json={"owner": "Risk", "name": "Nav"}).get_json()
    pid = created["id"]
    # Buying draws from the global wallet, which writes no portfolio ledger row —
    # so the BUY is naturally a legacy "BUY with no DEPOSIT" for the portfolio.
    client.post("/api/wallet/deposit", json={"amount": 1000.0, "currency": "USD"})
    client.post(
        f"/api/portfolios/{pid}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 100.0},
    )

    txn = PortfolioTransaction.query.filter_by(portfolio_id=pid).first()
    txn.executed_at = _dt.now(_tz.utc).replace(tzinfo=None) - _td(days=10)
    db.session.commit()

    today = _date.today()
    closes = {(today - _td(days=i)): 100.0 + i * 0.5 for i in range(21)}
    monkeypatch.setattr(
        portfolios_module.market_price_service, "collect_daily_closes", lambda *a, **k: dict(closes)
    )

    portfolio = Portfolio.query.get(pid)
    nav, d0, _flows = portfolios_module._reconstruct_nav_series(portfolio)
    assert nav and len(nav) >= 2
    values = [p["value"] for p in nav]
    assert all(v > 0 for v in values)

    returns = []
    for prev, cur in zip(values, values[1:]):
        if prev and prev > 0:
            returns.append((cur - prev) / prev * 100.0)
    assert max(abs(r) for r in returns) < 10.0


def test_risk_endpoint_smoke_testing_guard(client):
    created = _create_portfolio(client).get_json()
    resp = client.get(f"/api/portfolios/{created['id']}/analytics/risk")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["portfolio_id"] == created["id"]
    assert body["metrics"] is None
    assert body["nav"] == []
    assert body["benchmark"] == "SPY"


def _make_portfolio_with_buy(client, name, days_back=10, wallet=1000.0, symbol="AAPL"):
    """Create a portfolio, fund the wallet, buy a security, and backdate the
    ledger BUY so NAV reconstruction spans a real window."""
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz

    created = client.post("/api/portfolios", json={"owner": "Risk", "name": name}).get_json()
    pid = created["id"]
    if wallet:
        client.post("/api/wallet/deposit", json={"amount": wallet, "currency": "USD"})
    client.post(
        f"/api/portfolios/{pid}/holdings",
        json={"symbol": symbol, "quantity": 10, "purchase_price": 100.0},
    )
    if days_back is not None:
        txn = PortfolioTransaction.query.filter_by(portfolio_id=pid).first()
        txn.executed_at = _dt.now(_tz.utc).replace(tzinfo=None) - _td(days=days_back)
        db.session.commit()
    return pid


def test_risk_endpoint_include_cash_returns_include_cash(client, monkeypatch):
    """The endpoint echoes the include_cash flag and reports metrics. The
    recommendation reads the CAPM alpha (Jensen's) rather than a raw excess
    return field that _compute_portfolio_metrics no longer computes."""
    from datetime import date as _date, timedelta as _td

    pid = _make_portfolio_with_buy(client, "IncCash", days_back=10)
    today = _date.today()
    closes = {(today - _td(days=i)): 150.0 - i * 0.5 for i in range(31)}
    monkeypatch.setattr(
        portfolios_module.market_price_service, "collect_daily_closes", lambda *a, **k: dict(closes)
    )
    monkeypatch.setattr(portfolios_module, "get_risk_free_rate_pct", lambda: 4.0)
    client.application.config["TESTING"] = False  # exercise the real reconstruction path

    resp = client.get(f"/api/portfolios/{pid}/analytics/risk?include_cash=true&range=all")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["include_cash"] is True
    assert body["metrics"] is not None
    assert body["nav"] and len(body["nav"]) >= 2


def test_risk_endpoint_include_cash_false_excludes_cash_component(client, monkeypatch):
    """include_cash=false must drop the portfolio's cash holding from the NAV —
    the securities-only value rides below the all-in value, and the difference
    is exactly the parked cash component."""
    from datetime import date as _date, timedelta as _td

    # Deposit to the wallet (to fund it) then park cash in the portfolio.
    pid = _make_portfolio_with_buy(client, "CashExcl", days_back=10)
    client.post("/api/wallet/deposit", json={"amount": 5000.0, "currency": "USD"})
    client.post(f"/api/portfolios/{pid}/deposit", json={"amount": 3000.0, "currency": "USD"})

    today = _date.today()
    closes = {(today - _td(days=i)): 190.0 - i * 0.5 for i in range(31)}
    monkeypatch.setattr(
        portfolios_module.market_price_service, "collect_daily_closes", lambda *a, **k: dict(closes)
    )
    monkeypatch.setattr(portfolios_module, "get_risk_free_rate_pct", lambda: 4.0)
    client.application.config["TESTING"] = False

    all_in = client.get(f"/api/portfolios/{pid}/analytics/risk?include_cash=true").get_json()
    sec_only = client.get(f"/api/portfolios/{pid}/analytics/risk?include_cash=false").get_json()
    assert all_in["include_cash"] is True
    assert sec_only["include_cash"] is False

    all_last = all_in["nav"][-1]["value"]
    sec_last = sec_only["nav"][-1]["value"]
    # The parked $3000 cash component separates the two series.
    assert all_last - sec_last == pytest.approx(3000.0, abs=0.01)


def test_twr_removes_deposit_inflation_from_total_return():
    """A mid-window deposit must NOT surface as a gain in the total return.

    NAV grows 1000 -> 1100 (10%), then a $1000 deposit arrives (jump to 2100),
    then the tree grows 5% to 2205. The naive last/first return reads +120.5%
    (the deposit masquerading as profit); the Time-Weighted Return must be the
    honest 10% * 5% = +15.5%.
    """
    nav_values = [1000.0, 1100.0, 2100.0, 2205.0]
    flows = [0.0, 0.0, 1000.0, 0.0]

    naive = compute_risk_metrics(nav_values)
    twr = compute_risk_metrics(nav_values, external_flows=flows)

    assert naive["total_return"] == pytest.approx(120.5, abs=1e-3)
    assert twr["total_return"] == pytest.approx(15.5, abs=1e-3)
    # The deposit day must not be counted as a "best day".
    assert naive["best_day"] == pytest.approx(90.9091, abs=1e-3)
    assert twr["best_day"] == pytest.approx(10.0, abs=1e-3)


def test_nav_start_date_window_tracks_price_movement(client, monkeypatch):
    """A window starting on a given date holds no earlier trades, so the return
    is pure price movement instead of an inflated buy/deposit-driven number."""
    from datetime import date as _date, datetime as _dt, timedelta as _td, timezone as _tz

    created = client.post("/api/portfolios", json={"owner": "Risk", "name": "Window"}).get_json()
    pid = created["id"]
    client.post("/api/wallet/deposit", json={"amount": 1000.0})
    client.post(
        f"/api/portfolios/{pid}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 100.0},
    )

    today = _date.today()
    # Backdate the BUY 10 days so the lookback window has a clean start.
    txn = PortfolioTransaction.query.filter_by(portfolio_id=pid).first()
    txn.executed_at = _dt.now(_tz.utc).replace(tzinfo=None) - _td(days=10)
    db.session.commit()

    closes = {(today - _td(days=i)): 150.0 - i * 0.5 for i in range(31)}  # rising to today
    monkeypatch.setattr(
        portfolios_module.market_price_service, "collect_daily_closes", lambda *a, **k: dict(closes)
    )

    portfolio = Portfolio.query.get(pid)
    last_date = today - _td(days=10)
    nav, _d0, _flows = portfolios_module._reconstruct_nav_series(portfolio, lookback_days=10)
    assert nav and len(nav) >= 2

    window_first = nav[0]["value"]
    window_last = nav[-1]["value"]
    ret = (window_last / window_first - 1.0) * 100.0
    price_ret = (closes[today] / closes[last_date] - 1.0) * 100.0
    assert ret == pytest.approx(price_ret, abs=0.001)


def test_nav_with_cash_equals_kpi_current_value(client, monkeypatch):
    """The NAV series' latest point must equal the live Portfolio Value KPI.
    A BUY draws from the wallet (not the portfolio ledger), so NAV reconstruction
    must fund the buy internally rather than reporting an unexplained gap."""
    from datetime import date as _date, datetime as _dt, timedelta as _td, timezone as _tz

    created = client.post("/api/portfolios", json={"owner": "Risk", "name": "Nav"}).get_json()
    pid = created["id"]
    client.post("/api/wallet/deposit", json={"amount": 1000.0})
    client.post(f"/api/portfolios/{pid}/buy", json={"symbol": "AAPL", "quantity": 10, "price": 100.0})

    today = _date.today()
    # Only the BUY is in the portfolio ledger (wallet deposits live elsewhere);
    # backdate it 10 days so NAV reconstruction spans a real window.
    txn = PortfolioTransaction.query.filter_by(portfolio_id=pid).first()
    txn.executed_at = _dt.now(_tz.utc).replace(tzinfo=None) - _td(days=10)
    db.session.commit()

    # Today's close matches the live AAPL price (190) so the NAV's last point
    # equals what the /analytics KPI reports.
    closes = {(today - _td(days=i)): 190.0 - i * 0.5 for i in range(31)}
    monkeypatch.setattr(
        portfolios_module.market_price_service, "collect_daily_closes", lambda *a, **k: dict(closes)
    )

    kpi_value = client.get(f"/api/portfolios/{pid}/analytics").get_json()["current_value"]
    portfolio = Portfolio.query.get(pid)
    nav, _d0, _flows = portfolios_module._reconstruct_nav_series(portfolio)
    assert nav
    assert nav[-1]["value"] == pytest.approx(kpi_value, abs=0.01)


def test_closed_position_with_unfunded_buys_keeps_returns_sane(client, monkeypatch):
    """Regression for the T1 shape: mid-history unfunded BUYs plus a fully-closed
    position must not manufacture fake days in the NAV.

    The portfolio used to show a -59.9% "worst day" and a +22.9% "best day"
    because a position that was bought then fully sold was never priced while
    held (cash left the account with no market value to show for it) and the
    unfunded buy size leaked into the daily return. Pricing every security in
    the ledger (closed positions included) and funding unfunded buys through a
    non-negative opening cash offset keeps every internal trade value-neutral.
    """
    from datetime import date as _date, datetime as _dt, timedelta as _td, timezone as _tz

    created = client.post("/api/portfolios", json={"owner": "Risk", "name": "Closed"}).get_json()
    pid = created["id"]
    # Buying draws from the global wallet, which writes no portfolio ledger row —
    # so the ledger is naturally a legacy series of "unfunded" BUY/SELL rows.
    client.post("/api/wallet/deposit", json={"amount": 10000.0})
    client.post(f"/api/portfolios/{pid}/buy", json={"symbol": "AAPL", "quantity": 2, "price": 100.0})
    client.post(f"/api/portfolios/{pid}/buy", json={"symbol": "MSFT", "quantity": 5, "price": 100.0})
    client.post(f"/api/portfolios/{pid}/sell", json={"symbol": "MSFT", "quantity": 5, "price": 100.0})
    client.post(f"/api/portfolios/{pid}/buy", json={"symbol": "AAPL", "quantity": 1, "price": 100.0})

    today = _date.today()
    txns = (
        PortfolioTransaction.query.filter_by(portfolio_id=pid)
        .order_by(PortfolioTransaction.executed_at.asc())
        .all()
    )
    for i, txn in enumerate(txns):
        txn.executed_at = _dt.now(_tz.utc).replace(tzinfo=None) - _td(days=[20, 12, 8, 4][i])
    db.session.commit()

    closes = {(today - _td(days=i)): 100.0 + i * 0.5 for i in range(31)}
    monkeypatch.setattr(
        portfolios_module.market_price_service, "collect_daily_closes", lambda *a, **k: dict(closes)
    )

    portfolio = Portfolio.query.get(pid)
    nav, _d0, _flows = portfolios_module._reconstruct_nav_series(portfolio)
    assert nav and len(nav) >= 2
    values = [p["value"] for p in nav]
    assert all(v > 0 for v in values)

    returns = []
    for prev, cur in zip(values, values[1:]):
        if prev and prev > 0:
            returns.append((cur - prev) / prev * 100.0)
    # Neither the closed MSFT buy/sale nor the unfunded AAPL buys may read as a
    # large day; trade sizes are value-neutral, so only price drift remains.
    assert returns
    assert max(abs(r) for r in returns) < 10.0

    # The anchored series ends exactly on the live Portfolio Value KPI.
    kpi_value = client.get(f"/api/portfolios/{pid}/analytics").get_json()["current_value"]
    assert nav[-1]["value"] == pytest.approx(kpi_value, abs=0.01)


def test_add_holding_cash_tracks_kpi_current_value(client, monkeypatch):
    """P1 regression: a BUY funded from the wallet must stay consistent between
    the ledger-replayed NAV and the live KPI current_value. The BUY writes a
    ledger row; the wallet deposit does not, so NAV[-1] must still equal the
    live KPI (it must not treat the buy as an unexplained cash outflow)."""
    from datetime import date as _date, datetime as _dt, timedelta as _td, timezone as _tz

    created = client.post("/api/portfolios", json={"owner": "Risk", "name": "CashAdd"}).get_json()
    pid = created["id"]
    client.post("/api/wallet/deposit", json={"amount": 1000.0})
    client.post(
        f"/api/portfolios/{pid}/holdings",
        json={"symbol": "AAPL", "quantity": 10, "purchase_price": 100.0},
    )

    today = _date.today()
    txn = PortfolioTransaction.query.filter_by(portfolio_id=pid).first()
    txn.executed_at = _dt.now(_tz.utc).replace(tzinfo=None) - _td(days=10)
    db.session.commit()

    # Today's close matches the live AAPL price (190) so NAV[-1] == KPI value.
    closes = {(today - _td(days=i)): 190.0 - i * 0.5 for i in range(31)}
    monkeypatch.setattr(
        portfolios_module.market_price_service, "collect_daily_closes", lambda *a, **k: dict(closes)
    )

    kpi_value = client.get(f"/api/portfolios/{pid}/analytics").get_json()["current_value"]
    portfolio = Portfolio.query.get(pid)
    nav, _d0, _flows = portfolios_module._reconstruct_nav_series(portfolio)
    assert nav
    assert nav[-1]["value"] == pytest.approx(kpi_value, abs=0.01)