import React, { useState, useEffect } from 'react';
import { Search, ArrowLeftRight, CheckCircle, AlertCircle, TrendingUp, DollarSign } from 'lucide-react';
import { api } from '../services/api';
import { TickerAutocomplete } from '../components/TickerAutocomplete';

export function TradePage({ portfolio, onTradeSuccess }) {
  const [symbol, setSymbol] = useState('');
  const [txnType, setTxnType] = useState('BUY');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState(0);

  const [quoteInfo, setQuoteInfo] = useState(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    if (portfolio?.id) {
      loadRecentTransactions();
    }
  }, [portfolio?.id]);

  const loadRecentTransactions = async () => {
    try {
      const data = await api.getTransactions(portfolio.id);
      setRecentTransactions(data.slice(0, 8)); // Top 8 recent trades
    } catch (err) {
      // Handle silently
    }
  };

  const handleLookupQuote = async () => {
    if (!symbol || !symbol.trim()) return;
    setIsFetchingQuote(true);
    setError(null);
    try {
      const res = await api.getRealtimeQuote(symbol.trim());
      setQuoteInfo(res);
      if (res.price) {
        setPrice(res.price);
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
      const payload = {
        symbol: symbol.trim().toUpperCase(),
        quantity: Number(quantity),
        fees: Number(fees || 0),
      };
      if (price) {
        payload.price = Number(price);
      }

      if (txnType === 'BUY') {
        await api.buyHolding(portfolio.id, payload);
      } else {
        await api.sellHolding(portfolio.id, payload);
      }

      setSuccessMsg(`${txnType} trade executed successfully!`);
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

  if (!portfolio) {
    return <div className="empty-state">No portfolio selected.</div>;
  }

  const totalValue = (Number(price) || 0) * (Number(quantity) || 0) + Number(fees || 0);

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

          <form onSubmit={handleExecuteTrade}>
            {/* BUY / SELL Switcher */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button
                type="button"
                className={`btn ${txnType === 'BUY' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setTxnType('BUY')}
              >
                BUY Order
              </button>
              <button
                type="button"
                className={`btn ${txnType === 'SELL' ? 'btn-danger' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setTxnType('SELL')}
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
                  onChange={setSymbol}
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
                  border: '1px solid rgba(37, 99, 235, 0.2)',
                }}
              >
                <div style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--accent-primary)' }}>
                  {quoteInfo.name} ({quoteInfo.symbol})
                </div>
                <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', display: 'flex', gap: '12px', marginTop: '4px' }}>
                  <span>Exchange: <strong>{quoteInfo.exchange}</strong></span>
                  <span>Price: <strong>${quoteInfo.price}</strong></span>
                  {quoteInfo.currency && <span>Currency: <strong>{quoteInfo.currency}</strong></span>}
                </div>
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
                <label className="form-label">Order Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input"
                  placeholder="Market Price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
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
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Total Order Value ({portfolio.base_currency}):
              </span>
              <span style={{ fontWeight: '700', fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
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
                        {t.quantity} shares @ ${t.price} (Fee: ${t.fees})
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
    </div>
  );
}
