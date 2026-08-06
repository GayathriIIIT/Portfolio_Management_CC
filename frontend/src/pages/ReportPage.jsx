import React, { useState, useEffect, useCallback } from 'react';
import { Printer, FileText } from 'lucide-react';
import { api } from '../services/api';

function formatMoney(val, currency = 'USD') {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

export function ReportPage({ portfolio, analytics }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!portfolio?.id) return;
    setLoading(true);
    try {
      const data = await api.getTransactions(portfolio.id);
      setTransactions(data || []);
    } catch (err) {
      console.error('Failed to load transactions for report:', err);
    } finally {
      setLoading(false);
    }
  }, [portfolio?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!portfolio) return <div className="empty-state">Select a portfolio to generate a report.</div>;

  const currency = portfolio.base_currency || 'USD';
  const holdings = analytics?.holdings || [];
  const currentValue = analytics?.current_value || 0;
  const invested = analytics?.invested_value || 0;
  const pl = analytics?.profit_loss || 0;

  const now = new Date().toLocaleString([], { dateStyle: 'long', timeStyle: 'short' });

  return (
    <div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Portfolio Report</h1>
          <p className="page-subtitle">Printable snapshot — use “Print / Save as PDF” to export</p>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()} style={{ gap: '8px' }}>
          <Printer size={16} />
          <span>Print / Save as PDF</span>
        </button>
      </div>

      <div className="report-sheet">
        <div className="report-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={22} style={{ color: 'var(--accent-primary)' }} />
            <div>
              <div style={{ fontWeight: '800', fontSize: '1.4rem' }}>{portfolio.name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Generated {now} · Base currency {currency}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '24px', marginTop: '4px' }}>
            <div>
              <div className="kpi-subtext" style={{ fontSize: '0.72rem' }}>Portfolio Value</div>
              <div style={{ fontWeight: '700', fontSize: '1.25rem' }}>{formatMoney(currentValue, currency)}</div>
            </div>
            <div>
              <div className="kpi-subtext" style={{ fontSize: '0.72rem' }}>Total Invested</div>
              <div style={{ fontWeight: '600', fontSize: '1.05rem' }}>{formatMoney(invested, currency)}</div>
            </div>
            <div>
              <div className="kpi-subtext" style={{ fontSize: '0.72rem' }}>Unrealized P&amp;L</div>
              <div style={{ fontWeight: '700', fontSize: '1.05rem', color: pl >= 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>
                {pl >= 0 ? '+' : ''}{formatMoney(pl, currency)}
              </div>
            </div>
          </div>
        </div>

        <h3 className="report-section">Holdings</h3>
        {holdings.length === 0 ? (
          <div className="empty-state">No active holdings.</div>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="r">Qty</th>
                <th className="r">Avg Price</th>
                <th className="r">Current</th>
                <th className="r">Market Value</th>
                <th className="r">Unrealized</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.id}>
                  <td>
                    <div style={{ fontWeight: '600' }}>{h.symbol}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{h.name}</div>
                  </td>
                  <td className="r">{Number(h.quantity).toLocaleString()}</td>
                  <td className="r">{formatMoney(h.purchase_price, currency)}</td>
                  <td className="r">{formatMoney(h.current_price, currency)}</td>
                  <td className="r">{formatMoney(h.market_value, currency)}</td>
                  <td className="r" style={{ color: (h.unrealized_pl || 0) >= 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>
                    {(h.unrealized_pl || 0) >= 0 ? '+' : ''}{formatMoney(h.unrealized_pl, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 className="report-section">Recent Transactions ({transactions.length})</h3>
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="empty-state">No transactions yet.</div>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Symbol</th>
                <th className="r">Qty</th>
                <th className="r">Price</th>
                <th className="r">Total</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 50).map((t) => {
                const priceBase = Number(t.price_base ?? t.price) || 0;
                const feesBase = Number(t.fees_base ?? t.fees) || 0;
                const total = (Number(t.quantity) || 0) * priceBase - feesBase;
                return (
                  <tr key={t.id}>
                    <td>{t.executed_at ? new Date(t.executed_at).toLocaleDateString() : '—'}</td>
                    <td><span className="badge badge-secondary">{t.type}</span></td>
                    <td>{t.symbol || '—'}</td>
                    <td className="r">{Number(t.quantity).toLocaleString()}</td>
                    <td className="r">{formatMoney(priceBase, currency)}</td>
                    <td className="r">{formatMoney(total, currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}