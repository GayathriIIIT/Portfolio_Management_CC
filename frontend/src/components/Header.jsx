import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Briefcase, Sparkles, RefreshCw, Plus, Wallet, Bell, X, Trash2, PlusCircle, Database } from 'lucide-react';
import { api } from '../services/api';

export function Header({
  portfolios,
  selectedPortfolioId,
  onSelectPortfolio,
  onRefreshPrices,
  onOpenNewPortfolioModal,
  onOpenWalletModal,
  walletBalance = 0,
  walletCurrency = 'USD',
  isRefreshing,
  onBackfillHistory,
  isBackfilling,
}) {
  const { theme, toggleTheme } = useTheme();

  // Price alerts bell — self-managed so it works from any tab.
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [newSymbol, setNewSymbol] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newCondition, setNewCondition] = useState('ABOVE');
  const bellRef = useRef(null);

  const firedCount = alerts.filter((a) => a.fired).length;

  useEffect(() => {
    if (!alertsOpen) return;
    let cancelled = false;
    api
      .checkAlerts()
      .then((data) => {
        if (!cancelled) setAlerts(data || []);
      })
      .catch(() => api.getAlerts().then((data) => !cancelled && setAlerts(data || [])))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [alertsOpen]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setAlertsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCreateAlert = async (e) => {
    e.preventDefault();
    try {
      await api.createAlert({ symbol: newSymbol, target_price: Number(newTarget), condition: newCondition });
      setNewSymbol('');
      setNewTarget('');
      setAlerts(await api.getAlerts());
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteAlert = async (id) => {
    try {
      await api.deleteAlert(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  const formatWallet = (val) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: walletCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);

  return (
    <header className="top-header">
      <div className="header-portfolio-selector">
        <Wallet size={20} style={{ color: 'var(--accent-primary)' }} />
        <select
          className="portfolio-select"
          value={selectedPortfolioId || ''}
          onChange={(e) => onSelectPortfolio(Number(e.target.value))}
        >
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.base_currency})
            </option>
          ))}
        </select>
        <button
          className="btn btn-secondary btn-sm"
          onClick={onOpenNewPortfolioModal}
          title="Create New Portfolio"
        >
          <Plus size={14} />
          <span>New</span>
        </button>
      </div>

      <div className="header-actions">
        {/* Price alerts bell — shows a dot when a target has been crossed. */}
        <div className="alerts-bell-wrap" ref={bellRef}>
          <button
            className={`btn btn-secondary btn-sm ${firedCount > 0 ? 'btn-warning' : ''}`}
            onClick={() => setAlertsOpen((o) => !o)}
            title="Price alerts / targets"
            style={{ position: 'relative', gap: '6px' }}
          >
            <Bell size={16} />
            <span>Alerts</span>
            {firedCount > 0 && (
              <span
                className="alerts-bell-dot"
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  background: 'var(--danger-text)',
                  color: '#fff',
                  borderRadius: '999px',
                  fontSize: '0.62rem',
                  lineHeight: 1,
                  padding: '3px 5px',
                  fontWeight: 700,
                }}
              >
                {firedCount}
              </span>
            )}
          </button>

          {alertsOpen && (
            <div className="alerts-popover" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 340, maxHeight: '70vh', overflowY: 'auto', zIndex: 60 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700 }}>Price Alerts</span>
                <button className="modal-close" onClick={() => setAlertsOpen(false)}><X size={16} /></button>
              </div>

              <form onSubmit={handleCreateAlert} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Symbol (e.g. AAPL)"
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                    required
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-input"
                    placeholder="Target"
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value)}
                    required
                    style={{ width: 90 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select className="form-input" value={newCondition} onChange={(e) => setNewCondition(e.target.value)} style={{ flex: 1 }}>
                    <option value="ABOVE">Price rises to target</option>
                    <option value="BELOW">Price drops to target</option>
                  </select>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ gap: '4px' }}>
                    <PlusCircle size={14} />
                    <span>Add</span>
                  </button>
                </div>
              </form>

              <div style={{ padding: '8px' }}>
                {alerts.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    No alerts yet. Set a price target above.
                  </div>
                ) : (
                  alerts.map((a) => {
                    const crossed =
                      a.fired ||
                      (a.current_price != null &&
                        ((a.condition === 'ABOVE' && a.current_price >= a.target_price) ||
                          (a.condition === 'BELOW' && a.current_price <= a.target_price)));
                    return (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 700 }}>{a.symbol}</span>
                            <span className={`badge ${crossed ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '0.62rem' }}>
                              {crossed ? 'TRIGGERED' : 'ACTIVE'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {a.condition === 'ABOVE' ? '≥' : '≤'} {Number(a.target_price).toFixed(2)} · Now:{' '}
                            {a.current_price != null ? Number(a.current_price).toFixed(2) : '—'}
                          </div>
                        </div>
                        <button className="btn btn-secondary btn-sm text-negative" style={{ padding: '4px' }} onClick={() => handleDeleteAlert(a.id)} title="Delete alert">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Global wallet — belongs to the user, shared across every portfolio.
            Shown in the top bar so it is checkable from anywhere, and kept out
            of the portfolio pages themselves. */}
        <button
          className="wallet-pill"
          onClick={onOpenWalletModal}
          title="Manage your wallet (funds every buy across all portfolios)"
        >
          <Wallet size={16} style={{ color: 'var(--accent-primary)' }} />
          <span className="wallet-pill-label">Wallet</span>
          <span className="wallet-pill-value">{formatWallet(walletBalance)}</span>
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onRefreshPrices}
          disabled={isRefreshing}
          title="Refresh market prices from Yahoo Finance"
        >
          <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh Prices'}</span>
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onBackfillHistory}
          disabled={isBackfilling}
          title="Backfill historical daily closes into the price cache from Yahoo Finance"
        >
          <Database size={14} className={isBackfilling ? 'spin' : ''} />
          <span>{isBackfilling ? 'Backfilling...' : 'Backfill History'}</span>
        </button>

        <button
          className="theme-toggle-btn"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'professional' ? 'Brainrot' : 'Professional'} Mode`}
        >
          {theme === 'professional' ? (
            <>
              <Sparkles size={16} />
              <span>Brainrot Mode</span>
            </>
          ) : (
            <>
              <Briefcase size={16} />
              <span>Professional Mode</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
