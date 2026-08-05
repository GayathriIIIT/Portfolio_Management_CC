import React, { useState, useEffect } from 'react';
import { X, Wallet, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

export function WalletModal({ isOpen, onClose, currency = 'USD', onSuccess }) {
  const [actionType, setActionType] = useState('DEPOSIT');
  const [amount, setAmount] = useState('');
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

      const payload = { amount: amtVal, currency };
      if (actionType === 'DEPOSIT') {
        await api.depositWallet(payload);
        setSuccessMsg(`Successfully added $${amtVal.toFixed(2)} to your wallet!`);
      } else {
        await api.withdrawWallet(payload);
        setSuccessMsg(`Successfully withdrew $${amtVal.toFixed(2)} from your wallet!`);
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