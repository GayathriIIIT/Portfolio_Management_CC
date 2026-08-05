import React, { useState, useEffect, useRef } from 'react';
import { Receipt, Filter, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { useTheme } from '../context/ThemeContext';

export function TransactionsPage({ portfolio }) {
  const { isBrainrot } = useTheme();
  const [transactions, setTransactions] = useState([]);
  const [filterType, setFilterType] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    // Clear any ledger belonging to the previously selected portfolio so it can
    // never be shown (or briefly linger) under the new portfolio.
    setTransactions([]);
    setError(null);
    if (portfolio?.id) {
      loadTransactions();
    }
  }, [portfolio?.id]);

  const loadTransactions = async () => {
    if (!portfolio?.id) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getTransactions(portfolio.id);
      if (requestId !== requestIdRef.current) return; // stale response
      setTransactions(data);
    } catch (err) {
      if (requestId !== requestIdRef.current) return; // stale response
      setError(err.message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  if (!portfolio) {
    return <div className="empty-state">No portfolio selected.</div>;
  }

  const filtered = transactions.filter((t) => {
    if (filterType === 'ALL') return true;
    return t.type === filterType;
  });

  return (
    <div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Transaction Ledger</h1>
          <p className="page-subtitle">
            Complete audit trail of trades, deposits, and withdrawals for {portfolio.name}
          </p>
        </div>

        <button className="btn btn-secondary btn-sm" onClick={loadTransactions} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Refresh Ledger</span>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
        <div className="card" style={{ flex: 1, minWidth: 0 }}>
        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={16} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
              Filter Type:
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['ALL', 'BUY', 'SELL', 'DEPOSIT', 'WITHDRAW'].map((type) => (
                <button
                  key={type}
                  className={`btn btn-sm ${filterType === type ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                  onClick={() => setFilterType(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Showing <strong>{filtered.length}</strong> transactions
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Loading transaction history...</div>
        ) : error ? (
          <div className="empty-state" style={{ color: 'var(--danger-text)' }}>
            Error: {error}
          </div>
        ) : !filtered.length ? (
          <div className="empty-state">
            <Receipt className="empty-state-icon" />
            <div>No transaction records found matching filter.</div>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Txn ID</th>
                  <th>Type</th>
                  <th>Security Ticker</th>
                  <th style={{ textAlign: 'right' }}>Quantity</th>
                  <th style={{ textAlign: 'right' }}>Price per Unit</th>
                  <th style={{ textAlign: 'right' }}>Fees</th>
                  <th style={{ textAlign: 'right' }}>Total Amount</th>
                  <th style={{ textAlign: 'right' }}>Executed Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const isBuy = t.type === 'BUY' || t.type === 'DEPOSIT';
                  const gross = (t.quantity || 0) * (t.price || 0);
                  // SELL/WITHDRAW: the fee reduces the amount received.
                  const total = isBuy ? gross + (t.fees || 0) : gross - (t.fees || 0);

                  return (
                    <tr key={t.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: '600', color: 'var(--text-muted)' }}>
                        #{t.id}
                      </td>
                      <td>
                        <span className={`badge ${isBuy ? 'badge-success' : 'badge-danger'}`}>
                          {isBuy ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          {t.type}
                        </span>
                      </td>
                      <td style={{ fontWeight: '700' }}>{t.symbol}</td>
                      <td style={{ textAlign: 'right', fontWeight: '600' }}>
                        {Number(t.quantity).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>${t.price.toFixed(2)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                        ${t.fees ? t.fees.toFixed(2) : '0.00'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '700' }}>
                        ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
                        {new Date(t.executed_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isBrainrot && (
        <div style={{ flex: 'none' }}>
          <img
            src="/brainrot/frog-dance-transaction-ledger.gif"
            alt="Transaction ledger"
            style={{
              width: 300,
              height: 500,
              objectFit: 'cover',
              borderRadius: 'var(--radius-md)',
              border: '3px solid #ffffff',
              boxShadow: 'var(--shadow-md)',
            }}
          />
        </div>
      )}
      </div>
    </div>
  );
}
