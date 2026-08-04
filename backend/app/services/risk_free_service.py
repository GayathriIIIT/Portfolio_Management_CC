"""Risk-free rate lookup.

Yahoo Finance does not expose a 1-year constant-maturity T-bill ticker, so we
use ^IRX (the 13-week Treasury bill) — the standard risk-free proxy used in
Sharpe / Sortino calculations. Values are cached briefly and a sane range is
enforced so a bad quote can never produce a nonsense rate.

Callers should fall back to the configured RISK_FREE_RATE when this returns
None (network failure, empty data, tests).
"""
import time

import yfinance as yf

_SYMBOL = "^IRX"
_CACHE = {"value": None, "at": 0.0}
_TTL_SECONDS = 6 * 3600  # refresh roughly twice a day
_MAX_YIELD_PCT = 30.0


def get_risk_free_rate_pct():
    """Return the current 13-week T-bill yield in percent, or None on failure."""
    now = time.time()
    if _CACHE["value"] is not None and now - _CACHE["at"] < _TTL_SECONDS:
        return _CACHE["value"]

    try:
        history = yf.Ticker(_SYMBOL).history(period="5d")
        if not history.empty:
            last = float(history["Close"].iloc[-1])
            if 0.0 < last < _MAX_YIELD_PCT:
                _CACHE["value"] = last
                _CACHE["at"] = now
                return last
    except Exception:
        pass
    return None
