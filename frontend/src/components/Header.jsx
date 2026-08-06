import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { Briefcase, Sparkles, RefreshCw, Plus, Wallet } from 'lucide-react';

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
}) {
  const { theme, toggleTheme } = useTheme();

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
          data-tour="new-portfolio"
          className="btn btn-secondary btn-sm"
          onClick={onOpenNewPortfolioModal}
          title="Create New Portfolio"
        >
          <Plus size={14} />
          <span>New</span>
        </button>
      </div>

      <div className="header-actions">
        {/* Global wallet — belongs to the user, shared across every portfolio.
            Shown in the top bar so it is checkable from anywhere, and kept out
            of the portfolio pages themselves. */}
        <button
          data-tour="wallet"
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
          data-tour="brainrot"
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
