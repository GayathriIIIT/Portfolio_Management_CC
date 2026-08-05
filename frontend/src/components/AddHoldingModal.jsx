import React, { useState } from 'react';
import { X, PlusCircle, AlertCircle, CheckCircle } from 'lucide-react';
import { api } from '../services/api';
import { TickerAutocomplete } from './TickerAutocomplete';
import { rememberTicker } from '../services/tickerCache';

export function AddHoldingModal({ isOpen, onClose, portfolioId, onSuccess }) {
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const sym = symbol.trim().toUpperCase();
      const qty = Number(quantity);
      const priceVal = Number(purchasePrice);

      if (!sym) {
        throw new Error('Please enter a valid ticker symbol');
      }
      if (isNaN(qty) || qty <= 0) {
        throw new Error('Quantity must be a positive number');
      }
      if (isNaN(priceVal) || priceVal <= 0) {
        throw new Error('Purchase price must be a positive number');
      }

      await api.addHolding(portfolioId, {
        symbol: sym,
        quantity: qty,
        purchase_price: priceVal,
      });

      setSuccessMsg('Position added to portfolio successfully!');
      rememberTicker(sym);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
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
            <PlusCircle size={20} style={{ color: 'var(--accent-primary)' }} />
            <span>Add Security Position</span>
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
          <div className="form-group">
            <label className="form-label">Ticker Symbol</label>
            <TickerAutocomplete
              value={symbol}
              onChange={setSymbol}
              placeholder="e.g. AAPL, TLT, BND, USD-CASH"
              required={true}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Quantity</label>
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
              <label className="form-label">Purchase Price (native)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="form-input"
                placeholder="150.00"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Adding...' : 'Add Holding'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
