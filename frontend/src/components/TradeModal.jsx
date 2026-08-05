import React, { useState, useEffect } from 'react';
import { X, ArrowLeftRight, Search, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { TickerAutocomplete } from './TickerAutocomplete';
import { rememberTicker } from '../services/tickerCache';
import { useTheme } from '../context/ThemeContext';
import { useBrainrotToast } from '../context/BrainrotToastContext';

const formatWallet = (val) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);

export function TradeModal({
  isOpen,
  onClose,
  portfolioId,
  holdings = [],
  walletBalance = 0,
  initialType = 'BUY',
  initialSymbol = '',
  onTradeSuccess,
}) {
  const [txnType, setTxnType] = useState(initialType);
  const [symbol, setSymbol] = useState(initialSymbol);
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState(0);

  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [quoteInfo, setQuoteInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const { isBrainrot } = useTheme();
  const { showToast } = useBrainrotToast();

  useEffect(() => {
    if (isOpen) {
      setTxnType(initialType);
      setSymbol(initialSymbol);
      setQuantity(1);
      setFees(0);
      setError(null);
      setSuccessMsg(null);
      setQuoteInfo(null);
      if (initialSymbol) {
        fetchQuote(initialSymbol);
      } else {
        setPrice('');
      }
    }
  }, [isOpen, initialType, initialSymbol]);

  const fetchQuote = async (ticker) => {
    if (!ticker || !ticker.trim()) return;
    setIsFetchingPrice(true);
    setError(null);
    try {
      const res = await api.getRealtimeQuote(ticker.trim());
      setQuoteInfo(res);
      rememberTicker(ticker.trim().toUpperCase(), res.name || '');
      if (res.price) {
        setPrice(res.price);
      }
    } catch (err) {
      // Failed to get quote, fallback to manual price entry
      setQuoteInfo(null);
    } finally {
      setIsFetchingPrice(false);
    }
  };

  if (!isOpen) return null;

  const sym = symbol.trim().toUpperCase();
  const ownedQty = holdings.find(
    (h) =>
      h.symbol === sym &&
      h.type !== 'CASH' &&
      !String(h.symbol || '').toUpperCase().endsWith('-CASH')
  )?.quantity;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const sym = symbol.trim().toUpperCase();
      const qty = Number(quantity);
      const feeVal = Number(fees || 0);

      if (!sym) {
        throw new Error('Please enter or select a valid ticker symbol');
      }
      if (isNaN(qty) || qty <= 0) {
        throw new Error('Share quantity must be a positive number');
      }
      if (isNaN(feeVal) || feeVal < 0) {
        throw new Error('Brokerage fee must be a non-negative number');
      }
      if (txnType === 'SELL' && ownedQty != null && qty > ownedQty) {
        throw new Error(
          `Cannot sell ${qty} shares — you only own ${ownedQty} shares of ${sym}`
        );
      }
      if (txnType === 'BUY' && price) {
        const priceVal = Number(price);
        if (isNaN(priceVal) || priceVal <= 0) {
          throw new Error('Execution price must be a positive number');
        }
        const buyTotal = priceVal * qty + feeVal;
        if (buyTotal > walletBalance) {
          throw new Error(
            `Insufficient wallet balance. Order total: $${buyTotal.toFixed(2)}, Available: $${walletBalance.toFixed(2)}`
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
        await api.buyHolding(portfolioId, payload);
      } else {
        await api.sellHolding(portfolioId, payload);
      }

      setSuccessMsg(`${txnType} order executed successfully!`);
      rememberTicker(sym, quoteInfo?.name || '');
      if (isBrainrot) {
        showToast(
          txnType === 'BUY' ? 'buy-dance.gif' : 'sell-dance.gif',
          txnType === 'BUY' ? `${sym} BOUGHT! LETS GOOO!` : `${sym} SOLD! MONEY IN POCKET!`
        );
      }
      setTimeout(() => {
        onTradeSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const tradeTotal = (Number(price) || 0) * (Number(quantity) || 0);
  const feeValue = Number(fees || 0);
  // SELL fees reduce the proceeds received; BUY fees add to the cost.
  const totalCost = txnType === 'SELL' ? tradeTotal - feeValue : tradeTotal + feeValue;
  const insufficientWallet =
    txnType === 'BUY' && price && totalCost > walletBalance;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} className="modal-title">
            <ArrowLeftRight size={20} style={{ color: 'var(--accent-primary)' }} />
            <span>Execute Trade Order</span>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
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

        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
        >
          {/* Order Type Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button
              type="button"
              className={`btn ${txnType === 'BUY' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setTxnType('BUY')}
            >
              BUY Position
            </button>
            <button
              type="button"
              className={`btn ${txnType === 'SELL' ? 'btn-danger' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setTxnType('SELL')}
            >
              SELL Position
            </button>
          </div>

          {/* Symbol */}
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
                onClick={() => fetchQuote(symbol)}
                disabled={isFetchingPrice}
              >
                <Search size={14} />
                <span>{isFetchingPrice ? 'Fetching...' : 'Quote'}</span>
              </button>
            </div>
            {quoteInfo && (
              <div style={{ fontSize: '0.8rem', color: 'var(--success-text)', marginTop: '4px', fontWeight: '500' }}>
                ✓ Live Market Quote: {quoteInfo.name} ({quoteInfo.exchange}) - ${quoteInfo.price}
              </div>
            )}
          </div>

          {/* Quantity & Price */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">
                Quantity (Shares)
                {txnType === 'SELL' && ownedQty != null && (
                  <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>
                    {' '}
                    · Owned: {ownedQty}
                  </span>
                )}
              </label>
              <input
                type="number"
                min="1"
                max={txnType === 'SELL' && ownedQty != null ? ownedQty : undefined}
                step="1"
                className="form-input"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Execution Price ($)</label>
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

          {/* Fees */}
          <div className="form-group">
            <label className="form-label">Brokerage Fees ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="form-input"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
            />
          </div>

          {/* Order Summary */}
          <div
            style={{
              backgroundColor: 'var(--bg-app)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {txnType === 'SELL' ? 'Wallet after sale (estimated):' : 'Available in Wallet:'}
              </span>
              <span style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {formatWallet(walletBalance + (txnType === 'SELL' ? totalCost : 0))}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total Estimated {txnType}:</span>
              <span style={{ fontWeight: '700', fontSize: '1.1rem', color: insufficientWallet ? 'var(--danger-text)' : 'var(--text-primary)' }}>
                ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {insufficientWallet && (
              <div style={{ fontSize: '0.78rem', color: 'var(--danger-text)', fontWeight: '600' }}>
                This order exceeds your wallet balance — add funds before buying.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={`btn ${txnType === 'BUY' ? 'btn-primary' : 'btn-danger'}`}
              disabled={loading}
            >
              {loading ? 'Executing...' : `Confirm ${txnType} Order`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
