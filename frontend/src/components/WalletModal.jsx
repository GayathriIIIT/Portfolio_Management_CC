import React, { useState, useEffect } from 'react';
import { X, Wallet, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'INR', 'CNY', 'SGD'];

export function WalletModal({ isOpen, onClose, currency = 'USD', wallet = {}, onSuccess }) {
  const [actionType, setActionType] = useState('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [fromCurrency, setFromCurrency] = useState(currency);
  const [toCurrency, setToCurrency] = useState(currency === 'USD' ? 'EUR' : 'USD');
  const [rate, setRate] = useState(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  // Fetch a preview FX rate for the convert tab whenever the pair or amount changes.
  useEffect(() => {
    if (!isOpen || actionType !== 'CONVERT' || fromCurrency === toCurrency) {
      setRate(null);
      return;
    }
    let cancelled = false;
    setRateLoading(true);
    api.getFxRate(fromCurrency, toCurrency)
      .then((data) => {
        if (!cancelled) setRate(data.rate);
      })
      .catch(() => {
        if (!cancelled) setRate(null);
      })
      .finally(() => {
        if (!cancelled) setRateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, actionType, fromCurrency, toCurrency]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const amtVal = Number(amount);
      if (isNaN(amtVal) || amtVal <= 0) {
        throw new Error('Amount must be a positive number');
      }

      if (actionType === 'CONVERT') {
        if (fromCurrency === toCurrency) {
          throw new Error('Choose two different currencies to convert');
        }
        const result = await api.exchangeWallet({
          from: fromCurrency,
          to: toCurrency,
          amount: amtVal,
        });
        setSuccessMsg(
          `Converted ${fromCurrency} ${amtVal.toFixed(2)} → ${toCurrency} ${result.received.toFixed(2)}`
        );
      } else {
        const payload = { amount: amtVal, currency };
        if (actionType === 'DEPOSIT') {
          await api.depositWallet(payload);
          setSuccessMsg(`Successfully added ${currency} ${amtVal.toFixed(2)} to your wallet!`);
        } else {
          await api.withdrawWallet(payload);
          setSuccessMsg(`Successfully withdrew ${currency} ${amtVal.toFixed(2)} from your wallet!`);
        }
      }

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} className="modal-title">
            <Wallet size={20} style={{ color: 'var(--accent-primary)' }} />
            <span>Manage Wallet</span>
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

        <form onSubmit={handleSubmit}>
          <p className="kpi-subtext" style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Your wallet is shared across all of your portfolios and funds every buy.
            It is separate from any cash you hold inside a portfolio.
          </p>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button
              type="button"
              className={`btn ${actionType === 'DEPOSIT' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setActionType('DEPOSIT')}
            >
              Deposit
            </button>
            <button
              type="button"
              className={`btn ${actionType === 'WITHDRAW' ? 'btn-danger' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setActionType('WITHDRAW')}
            >
              Withdraw
            </button>
            <button
              type="button"
              className={`btn ${actionType === 'CONVERT' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setActionType('CONVERT')}
            >
              Convert
            </button>
          </div>

          {actionType === 'CONVERT' ? (
            <>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">From</label>
                  <select
                    className="form-input"
                    value={fromCurrency}
                    onChange={(e) => setFromCurrency(e.target.value)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c} {wallet[c] !== undefined ? `(${Number(wallet[c]).toFixed(2)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">To</label>
                  <select
                    className="form-input"
                    value={toCurrency}
                    onChange={(e) => setToCurrency(e.target.value)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Amount ({fromCurrency})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input"
                  placeholder="e.g. 100.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>

              {fromCurrency === toCurrency && (
                <p className="kpi-subtext" style={{ color: 'var(--danger-text)' }}>
                  Choose two different currencies to convert.
                </p>
              )}

              {fromCurrency !== toCurrency && amount && (
                <div
                  className="badge"
                  style={{ width: '100%', marginBottom: '4px', padding: '10px', marginTop: '4px' }}
                >
                  {rateLoading ? (
                    <span>Loading exchange rate...</span>
                  ) : rate != null ? (
                    <span>
                      1 {fromCurrency} = {Number(rate).toFixed(4)} {toCurrency} &nbsp;→&nbsp;{' '}
                      {(Number(amount) * rate).toFixed(2)} {toCurrency} (approx)
                    </span>
                  ) : (
                    <span>Exchange rate unavailable. Conversion may fail.</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="form-group">
              <label className="form-label">Amount ({currency})</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="form-input"
                placeholder="e.g. 1000.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={`btn ${actionType === 'WITHDRAW' ? 'btn-danger' : 'btn-primary'}`}
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}