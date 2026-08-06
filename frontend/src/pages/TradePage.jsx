import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowLeftRight, CheckCircle, AlertCircle, TrendingUp, Activity, Wallet } from 'lucide-react';
import { api } from '../services/api';
import { TickerAutocomplete } from '../components/TickerAutocomplete';
import { rememberTicker } from '../services/tickerCache';
import { HoldingAnalyticsPanel } from '../components/HoldingAnalyticsPanel';
import { useTheme } from '../context/ThemeContext';
import { useBrainrotToast } from '../context/BrainrotToastContext';

export function TradePage({ portfolio, walletBalance = 0, currency = 'USD', onTradeSuccess }) {
  const { isBrainrot } = useTheme();
  const { showToast } = useBrainrotToast();
  const [symbol, setSymbol] = useState('');
  const [txnType, setTxnType] = useState('BUY');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState(0);

  const [quoteInfo, setQuoteInfo] = useState(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [fxRate, setFxRate] = useState(1.0);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [analyticsSymbol, setAnalyticsSymbol] = useState(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    // Clear portfolio-specific state so nothing from the previously selected
    // portfolio lingers (recent trades, quote, FX rate, messages) while the new
    // portfolio's data is loading.
    setRecentTransactions([]);
    setQuoteInfo(null);
    setFxRate(1.0);
    setSuccessMsg(null);
    setError(null);
    if (portfolio?.id) {
      // Pre-populate the ticker autocomplete cache with the portfolio's own
      // holdings so they appear as suggestions when the trader opens the screen.
      if (Array.isArray(portfolio.holdings)) {
        for (const h of portfolio.holdings) {
          if (h && h.symbol && !String(h.symbol).toUpperCase().endsWith('-CASH')) {
            rememberTicker(h.symbol.toUpperCase(), h.name || '');
          }
        }
      }
      loadRecentTransactions();
    }
  }, [portfolio?.id]);

  const loadRecentTransactions = async () => {
    if (!portfolio?.id) return;
    const requestId = ++requestIdRef.current;
    try {
      const data = await api.getTransactions(portfolio.id);
      if (requestId !== requestIdRef.current) return; // stale response
      setRecentTransactions(data.slice(0, 8)); // Top 8 recent trades
    } catch (err) {
      // Handle silently
    }
  };

  const handleLookupQuote = async () => {
    if (!symbol || !symbol.trim()) return;
    setIsFetchingQuote(true);
    setError(null);
    setFxRate(1.0);
    try {
      const res = await api.getRealtimeQuote(symbol.trim());
      setQuoteInfo(res);
      rememberTicker(symbol.trim().toUpperCase(), res.name || '');
      if (res.price) {
        setPrice(res.price);
      }
      // Fetch FX rate if stock currency differs from portfolio base currency
      const stockCurrency = (res.currency || 'USD').toUpperCase();
      const baseCurrency = (portfolio?.base_currency || 'USD').toUpperCase();
      if (stockCurrency !== baseCurrency) {
        try {
          const fxRes = await api.getRealtimeQuote(`${stockCurrency}${baseCurrency}=X`);
          if (fxRes?.price && fxRes.price > 0) {
            setFxRate(parseFloat(fxRes.price));
          }
        } catch {
          // Leave fxRate as 1.0 if lookup fails
        }
      }
    } catch (err) {
      setError(`Ticker error: ${err.message}`);
      setQuoteInfo(null);
    } finally {
      setIsFetchingQuote(false);
    }
  };

  const handleExecuteTrade = async (e) => {
    e.preventDefault();
    if (!portfolio?.id) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const sym = symbol.trim().toUpperCase();
      const qty = Number(quantity);
      const feeVal = Number(fees || 0);

      if (!sym) {
        throw new Error('Please select or enter a valid ticker symbol');
      }
      if (isNaN(qty) || qty <= 0) {
        throw new Error('Share quantity must be a positive number');
      }
      if (isNaN(feeVal) || feeVal < 0) {
        throw new Error('Brokerage fee must be a non-negative number');
      }

      if (txnType === 'SELL' && portfolio.holdings) {
        const owned = portfolio.holdings.find(h => h.symbol.toUpperCase() === sym);
        if (!owned) {
          throw new Error(`Symbol ${sym} is not held in this portfolio.`);
        }
        if (qty > Number(owned.quantity)) {
          throw new Error(`Cannot sell ${qty} shares. Only ${owned.quantity} shares available.`);
        }
      }
      if (txnType === 'BUY' && price) {
        const priceVal = Number(price);
        if (isNaN(priceVal) || priceVal <= 0) {
          throw new Error('Execution price must be a positive number');
        }
        // Native order total converted into the base-currency wallet so a
        // foreign-currency order is checked against the wallet in the same
        // currency it settles in (matches the backend's settlement math).
        const buyTotal = (priceVal * qty + feeVal) * fxRate;
        if (buyTotal > walletBalance) {
          throw new Error(
            `Insufficient wallet balance. Order total: ${currency} ${buyTotal.toFixed(2)}, Available: ${currency} ${walletBalance.toFixed(2)}`
          );
        }
      }

      const payload = {
        symbol: sym,
        quantity: qty,
        fees: feeVal,
      };
      if (price) {
        const priceVal = Number(price);
        if (isNaN(priceVal) || priceVal <= 0) {
          throw new Error('Execution price must be a positive number');
        }
        payload.price = priceVal;
      }

      if (txnType === 'BUY') {
        await api.buyHolding(portfolio.id, payload);
      } else {
        await api.sellHolding(portfolio.id, payload);
      }

      setSuccessMsg(`${txnType} trade executed successfully!`);
      rememberTicker(sym, quoteInfo?.name || '');
      if (isBrainrot) {
        showToast(
          txnType === 'BUY' ? 'buy-dance.gif' : 'sell-dance.gif',
          txnType === 'BUY' ? `${sym} BOUGHT! LETS GOOO!` : `${sym} SOLD! MONEY IN POCKET!`
        );
      }
      setSymbol('');
      setQuantity(1);
      setPrice('');
      setFees(0);
      setQuoteInfo(null);

      loadRecentTransactions();
      if (onTradeSuccess) onTradeSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGetAnalytics = () => {
    const sym = (symbol || '').trim().toUpperCase();
    if (!sym) {
      setError('Enter a ticker symbol first, then click Get Analytics.');
      return;
    }
    setError(null);
    setAnalyticsSymbol(sym);
  };

  if (!portfolio) {
    return <div className="empty-state">No portfolio selected.</div>;
  }

  const tradeTotal = (Number(price) || 0) * (Number(quantity) || 0);
  const feeValue = Number(fees || 0);
  // For a SELL the brokerage fee reduces the proceeds you actually receive; for
  // a BUY it adds to the cost. Both show the net order value to the user.
  const nativeTotalValue = txnType === 'SELL' ? tradeTotal - feeValue : tradeTotal + feeValue;
  const stockCurrency = (quoteInfo?.currency || portfolio?.base_currency || 'USD').toUpperCase();
  const baseCurrency = (portfolio?.base_currency || 'USD').toUpperCase();
  const isCrossCurrency = quoteInfo && stockCurrency !== baseCurrency;
  const convertedTotal = nativeTotalValue * fxRate;

  return (
    <div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Trade Execution Center</h1>
          <p className="page-subtitle">
            Place BUY and SELL orders with real-time Yahoo Finance price verification
          </p>
        </div>
      </div>

      <div className="grid-2">
        {/* Order Entry Form */}
        <div className="card">
          <div style={{ fontWeight: '700', fontSize: '1.15rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowLeftRight size={20} style={{ color: 'var(--accent-primary)' }} />
            <span>Place Trade Order</span>
          </div>

          {/* Wallet — the tradeable cash pool every BUY draws from and every SELL pays into */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              marginBottom: '16px',
              backgroundColor: 'var(--accent-light)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(37, 99, 235, 0.2)',
            }}
          >
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '700' }}>
              <Wallet size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent-primary)' }} />
              Wallet (available buying power):
            </span>
            <span style={{ fontWeight: '800', fontSize: '1.05rem', color: 'var(--accent-primary)' }}>
              ${walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {error && (
            <div className="badge badge-danger" style={{ width: '100%', marginBottom: '16px', padding: '10px' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="badge badge-success" style={{ width: '100%', marginBottom: '16px', padding: '10px' }}>
              <CheckCircle size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Enter must never submit the order — trades only execute from the
              explicit button so a stray Enter in the symbol/quantity fields
              can't fire an order the user didn't mean to place. */}
          <form
            onSubmit={handleExecuteTrade}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault();
            }}
          >
            {/* BUY / SELL Switcher */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button
                type="button"
                className={`btn ${txnType === 'BUY' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => {
                  setTxnType('BUY');
                  setAnalyticsSymbol(null);
                }}
              >
                BUY Order
              </button>
              <button
                type="button"
                className={`btn ${txnType === 'SELL' ? 'btn-danger' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => {
                  setTxnType('SELL');
                  setAnalyticsSymbol(null);
                }}
              >
                SELL Order
              </button>
            </div>

            {/* Symbol input with Quote button */}
            <div className="form-group">
              <label className="form-label">Ticker Symbol</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <TickerAutocomplete
                  value={symbol}
                  onChange={(val) => {
                    setSymbol(val);
                    // Reset quote info, FX rate and any fetched analytics when
                    // the symbol changes so stale data is never shown.
                    setQuoteInfo(null);
                    setFxRate(1.0);
                    setAnalyticsSymbol(null);
                  }}
                  placeholder="e.g. AAPL, TSLA, MSFT"
                  required={true}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleLookupQuote}
                  disabled={isFetchingQuote}
                >
                  <Search size={14} />
                  <span>{isFetchingQuote ? 'Checking...' : 'Get Quote'}</span>
                </button>
                {txnType === 'BUY' && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleGetAnalytics}
                    disabled={isFetchingQuote}
                  >
                    <Activity size={14} />
                    <span>Get Analytics</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quote details box */}
            {quoteInfo && (
              <div
                style={{
                  backgroundColor: 'var(--accent-light)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '16px',
                  border: isCrossCurrency ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid rgba(37, 99, 235, 0.2)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--accent-primary)' }}>
                    {quoteInfo.name} ({quoteInfo.symbol})
                  </div>
                  {quoteInfo.currency && (
                    <span
                      className={`badge ${isCrossCurrency ? 'badge-warning' : 'badge-secondary'}`}
                      style={{ fontSize: '0.75rem', fontWeight: '800' }}
                    >
                      {quoteInfo.currency}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', display: 'flex', gap: '12px', marginTop: '6px' }}>
                  <span>Exchange: <strong>{quoteInfo.exchange}</strong></span>
                  <span>Price: <strong>{quoteInfo.currency === 'USD' ? '$' : ''}{quoteInfo.price} {quoteInfo.currency !== 'USD' ? quoteInfo.currency : ''}</strong></span>
                </div>
                {isCrossCurrency && (
                  <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>💱</span>
                    <span>FX: 1 {stockCurrency} = <strong>{fxRate.toFixed(4)} {baseCurrency}</strong> (auto-fetched)</span>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Shares / Quantity</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="form-input"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Order Price
                  {txnType === 'BUY' && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '500', marginLeft: '6px' }}>
                      (read-only — set via live quote)
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input"
                  placeholder="Market Price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  readOnly={txnType === 'BUY'}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Brokerage Fee ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
              />
            </div>

            <div
              style={{
                backgroundColor: 'var(--bg-app)',
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                marginBottom: '20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isCrossCurrency ? '8px' : '0' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Order Value ({stockCurrency}):
                </span>
                <span style={{ fontWeight: '700', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                  {stockCurrency === 'USD' ? '$' : ''}{nativeTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {stockCurrency !== 'USD' ? stockCurrency : ''}
                </span>
              </div>
              {isCrossCurrency && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
                      FX Rate ({stockCurrency} → {baseCurrency}):
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      1 {stockCurrency} = {fxRate.toFixed(4)} {baseCurrency}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '700' }}>
                      Total Order Value ({baseCurrency}):
                    </span>
                    <span style={{ fontWeight: '800', fontSize: '1.2rem', color: 'var(--accent-primary)' }}>
                      ${convertedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </>
              )}
              {!isCrossCurrency && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Total Order Value ({baseCurrency}):
                  </span>
                  <span style={{ fontWeight: '700', fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                    ${nativeTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            <button
              type="submit"
              className={`btn ${txnType === 'BUY' ? 'btn-primary' : 'btn-danger'}`}
              style={{ width: '100%', padding: '12px' }}
              disabled={loading}
            >
              {loading ? 'Processing Order...' : `Execute ${txnType} Order`}
            </button>
          </form>
        </div>

        {/* Recent Executed Orders Feed */}
        <div className="card">
          <div style={{ fontWeight: '700', fontSize: '1.15rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={20} style={{ color: 'var(--accent-primary)' }} />
            <span>Recent Executed Trades</span>
          </div>

          {!recentTransactions.length ? (
            <div className="empty-state">No recent trades recorded for this portfolio.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recentTransactions.map((t) => {
                const isBuy = t.type === 'BUY' || t.type === 'DEPOSIT';
                return (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      backgroundColor: 'var(--bg-app)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`badge ${isBuy ? 'badge-success' : 'badge-danger'}`}>
                          {t.type}
                        </span>
                        <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>{t.symbol}</span>
                      </div>
                      <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {t.quantity} shares @ ${(Number(t.price_base ?? t.price) || 0).toFixed(2)} (Fee: ${(Number(t.fees_base ?? t.fees) || 0).toFixed(2)})
                        {t.currency && t.currency !== 'USD' && ` (${t.currency} ${Number(t.price || 0).toFixed(2)} native)`}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(t.executed_at).toLocaleDateString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pre-purchase analytics (BUY only): opens as a pop-up so the user can
          study the security's price history, risk metrics and recommendation
          without scrolling away from the trade form. */}
      {txnType === 'BUY' && analyticsSymbol && (
        <div className="modal-overlay" onClick={() => setAnalyticsSymbol(null)}>
          <div className="modal-content modal-content--analytics" onClick={(e) => e.stopPropagation()}>
            <HoldingAnalyticsPanel
              symbol={analyticsSymbol}
              currency={stockCurrency}
              onClose={() => setAnalyticsSymbol(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
