import React, { useState, useEffect, useRef } from 'react';
import { Receipt, Filter, ArrowUpRight, ArrowDownRight, RefreshCw, Calendar, X } from 'lucide-react';
import { api } from '../services/api';
import { useTheme } from '../context/ThemeContext';

export function TransactionsPage({ portfolio }) {
  const { isBrainrot } = useTheme();
  const [transactions, setTransactions] = useState([]);
  const [filterType, setFilterType] = useState('ALL');
  const [filterHoldingType, setFilterHoldingType] = useState('ALL');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
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
    if (filterType !== 'ALL' && t.type !== filterType) return false;
    if (filterHoldingType !== 'ALL' && t.security_type !== filterHoldingType) return false;
    if (filterFromDate) {
      const txDate = new Date(t.executed_at);
      const fromDate = new Date(filterFromDate);
      fromDate.setHours(0, 0, 0, 0);
      if (txDate < fromDate) return false;
    }
    if (filterToDate) {
      const txDate = new Date(t.executed_at);
      const toDate = new Date(filterToDate);
      toDate.setHours(23, 59, 59, 999);
      if (txDate > toDate) return false;
    }
    return true;
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={16} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
              Security Type:
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['ALL', 'STOCK', 'BOND', 'CASH'].map((type) => (
                <button
                  key={type}
                  className={`btn btn-sm ${filterHoldingType === type ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                  onClick={() => setFilterHoldingType(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
              Date Range:
            </span>
            <input
              type="date"
              className="form-input"
              style={{ height: '30px', fontSize: '0.8rem', padding: '2px 6px', width: '130px' }}
              value={filterFromDate}
              onChange={(e) => setFilterFromDate(e.target.value)}
              max={filterToDate || new Date().toISOString().split('T')[0]}
              placeholder="From"
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>to</span>
            <input
              type="date"
              className="form-input"
              style={{ height: '30px', fontSize: '0.8rem', padding: '2px 6px', width: '130px' }}
              value={filterToDate}
              onChange={(e) => setFilterToDate(e.target.value)}
              min={filterFromDate}
              max={new Date().toISOString().split('T')[0]}
              placeholder="To"
            />
            {(filterFromDate || filterToDate) && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ padding: '2px 8px', height: '30px' }}
                onClick={() => { setFilterFromDate(''); setFilterToDate(''); }}
                title="Clear date filters"
              >
                <X size={12} />
              </button>
            )}
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
                   <th>Security Type</th>
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
                  const priceBase = Number(t.price_base ?? t.price) || 0;
                  const feesBase = Number(t.fees_base ?? t.fees) || 0;
                  const gross = (t.quantity || 0) * priceBase;
                  // SELL/WITHDRAW: the fee reduces the amount received.
                  const total = isBuy ? gross + feesBase : gross - feesBase;

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
                       <td>
                         <span className="badge badge-secondary" style={{ fontSize: '0.72rem', fontWeight: '700' }}>
                           {t.security_type || 'UNKNOWN'}
                         </span>
                       </td>
                       <td style={{ fontWeight: '700' }}>
                         {t.symbol}
                         {t.name && (
                           <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '500' }}>
                             {t.name}
                           </div>
                         )}
                       </td>
                      <td style={{ textAlign: 'right', fontWeight: '600' }}>
                        {Number(t.quantity).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>${priceBase.toFixed(2)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                        ${feesBase.toFixed(2)}
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
