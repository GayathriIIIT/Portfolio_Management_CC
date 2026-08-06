import React, { useState, useEffect } from 'react';
import { X, DollarSign, CheckCircle, AlertCircle, Plus } from 'lucide-react';
import { api } from '../services/api';

const AMOUNT_SUGGESTIONS = [100, 200, 500, 1000, 2000, 5000, 10000];

export function ManageCashModal({ isOpen, onClose, portfolioId, baseCurrency = 'USD', onSuccess, initialAction = 'DEPOSIT' }) {
  const [actionType, setActionType] = useState(initialAction);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(baseCurrency);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setError(null);
      setSuccessMsg(null);
      setCurrency(baseCurrency);
      setActionType(initialAction);
    }
  }, [isOpen, baseCurrency, initialAction]);

  const handleSuggestionClick = (suggestedAmount) => {
    setAmount(String(suggestedAmount));
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const amtVal = Number(amount);
      if (isNaN(amtVal) || amtVal <= 0) {
        throw new Error('Cash amount must be a positive number');
      }

      const payload = {
        amount: amtVal,
        currency: currency,
      };

      if (actionType === 'DEPOSIT') {
        await api.depositCash(portfolioId, payload);
        setSuccessMsg(`Added ${currency} ${amtVal.toFixed(2)} of cash to this portfolio!`);
      } else {
        await api.withdrawCash(portfolioId, payload);
        setSuccessMsg(`Removed ${currency} ${amtVal.toFixed(2)} of cash from this portfolio!`);
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
            <DollarSign size={20} style={{ color: 'var(--accent-primary)' }} />
            <span>Manage Cash</span>
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
          {/* Action Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button
              type="button"
              className={`btn ${actionType === 'DEPOSIT' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setActionType('DEPOSIT')}
            >
              Add Cash
            </button>
            <button
              type="button"
              className={`btn ${actionType === 'WITHDRAW' ? 'btn-danger' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setActionType('WITHDRAW')}
            >
              Remove Cash
            </button>
          </div>

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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {AMOUNT_SUGGESTIONS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                  onClick={() => handleSuggestionClick(amt)}
                >
                  {amt >= 1000 ? `${amt/1000}k` : amt}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Quick amounts or enter custom value
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Currency</label>
            <input
              type="text"
              className="form-input"
              value={currency}
              readOnly
              title="Cash is held inside the portfolio in its base currency"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={`btn ${actionType === 'DEPOSIT' ? 'btn-primary' : 'btn-danger'}`}
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
