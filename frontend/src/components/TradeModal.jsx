import React, { useState, useEffect } from 'react';
import { X, ArrowLeftRight, Search, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { TickerAutocomplete } from './TickerAutocomplete';
import { rememberTicker } from '../services/tickerCache';
import { useTheme } from '../context/ThemeContext';
import { useBrainrotToast } from '../context/BrainrotToastContext';

export function TradeModal({
  isOpen,
  onClose,
  portfolioId,
  holdings = [],
  walletBalance = 0,
  currency = 'USD',
  initialType = 'BUY',
  initialSymbol = '',
  onTradeSuccess,
}) {
  const formatMoney = (val) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);

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
  // FX for converting the symbol's native quote into the base-currency wallet.
  // 1.0 when the symbol trades in the base currency or the rate is unavailable.
  const [fxRate, setFxRate] = useState(1);
  const [quoteCurrency, setQuoteCurrency] = useState(currency);

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
      setFxRate(1);
      setQuoteCurrency(currency);
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
      const base = (currency || 'USD').toUpperCase();
      const qc = (res.currency || base).toUpperCase();
      setQuoteCurrency(qc);
      if (qc === base) {
        setFxRate(1);
      } else {
        try {
          const fx = await api.getFxRate(qc, base);
          setFxRate(fx && fx.rate ? Number(fx.rate) : 1);
        } catch (_) {
          setFxRate(1);
        }
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
        // Native order total converted into the base-currency wallet, matching
        // the backend's settlement math.
        const buyTotal = (priceVal * qty + feeVal) * fxRate;
        if (buyTotal > walletBalance) {
          throw new Error(
            `Insufficient wallet balance. Order total: ${formatMoney(buyTotal)}, Available: ${formatMoney(walletBalance)}`
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

  const tradeTotalNative = (Number(price) || 0) * (Number(quantity) || 0);
  const feeValue = Number(fees || 0);
  // SELL fees reduce the proceeds received; BUY fees add to the cost. The price
  // is the security's native quote, so the total is FX-converted into the
  // base-currency wallet (same math as the backend's buy/sell settlement).
  const totalInNative = txnType === 'SELL' ? tradeTotalNative - feeValue : tradeTotalNative + feeValue;
  const totalCost = totalInNative * fxRate;
  const isForeignQuote = quoteCurrency.toUpperCase() !== (currency || 'USD').toUpperCase() && fxRate !== 1;
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
                ✓ Live Market Quote: {quoteInfo.name} ({quoteInfo.exchange}) - {quoteInfo.currency ? `${quoteInfo.currency} ` : ''}{Number(quoteInfo.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              <label className="form-label">Execution Price ({quoteCurrency || currency})</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="form-input"
                placeholder={txnType === 'BUY' ? 'Auto-filled from live quote' : 'Market Price'}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                readOnly={txnType === 'BUY'}
                style={{ backgroundColor: txnType === 'BUY' ? 'var(--bg-app)' : 'transparent' }}
              />
              {txnType === 'BUY' && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: '500' }}>
                  Price is locked for buys and auto-populated from the latest market quote.
                </div>
              )}
              {isForeignQuote && Number(price) > 0 && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: '500' }}>
                  ≈ {formatMoney(Number(price) * fxRate)} / share in {currency}
                </div>
              )}
            </div>
          </div>

          {/* Fees */}
          <div className="form-group">
            <label className="form-label">Brokerage Fees ({currency})</label>
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
                {formatMoney(walletBalance + (txnType === 'SELL' ? totalCost : 0))}
              </span>
            </div>
                        {isForeignQuote && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span>FX rate ({quoteCurrency} → {currency}):</span>
                <span style={{ fontWeight: '600' }}>1 {quoteCurrency} = {fxRate.toFixed(4)} {currency}</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total Estimated {txnType}:</span>
              <span style={{ fontWeight: '700', fontSize: '1.1rem', color: insufficientWallet ? 'var(--danger-text)' : 'var(--text-primary)' }}>
                {formatMoney(totalCost)}
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
