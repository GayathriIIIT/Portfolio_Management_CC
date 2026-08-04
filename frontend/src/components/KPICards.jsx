import React from 'react';
import { DollarSign, TrendingUp, TrendingDown, Layers, PieChart, Award, Zap } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export function KPICards({ analytics, currency = 'USD' }) {
  const { isBrainrot } = useTheme();
  if (!analytics) return null;

  const {
    invested_value = 0,
    current_value = 0,
    profit_loss = 0,
    profit_loss_percentage = 0,
    xirr = null,
    alpha = null,
    holdings = []
  } = analytics;
  
  const isPositive = profit_loss >= 0;
  const isXirrPositive = xirr >= 0;
  const isAlphaPositive = alpha >= 0;

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="kpi-wrap">
    <div className="grid-4" style={{ marginBottom: '28px' }}>
      {/* 1. Total Portfolio Value */}
      <div className="card kpi-card">
        <div className="kpi-header">
          <span>Portfolio Value</span>
          <DollarSign size={18} style={{ color: 'var(--accent-primary)' }} />
        </div>
        <div className="kpi-value">{formatCurrency(current_value)}</div>
        <div className="kpi-subtext" style={{ color: 'var(--text-secondary)' }}>
          Current Total Market Value
        </div>
      </div>

      {/* 2. Total Invested */}
      <div className="card kpi-card">
        <div className="kpi-header">
          <span>Total Invested</span>
          <Layers size={18} style={{ color: 'var(--text-secondary)' }} />
        </div>
        <div className="kpi-value">{formatCurrency(invested_value)}</div>
        <div className="kpi-subtext" style={{ color: 'var(--text-secondary)' }}>
          Cost Basis ({holdings.length} Positions)
        </div>
      </div>

      {/* 3. Net Profit / Loss */}
      <div className="card kpi-card">
        <div className="kpi-header">
          <span>Unrealized P&L</span>
          {isPositive ? (
            <TrendingUp size={18} className="text-positive" />
          ) : (
            <TrendingDown size={18} className="text-negative" />
          )}
        </div>
        <div className={`kpi-value ${isPositive ? 'text-positive' : 'text-negative'}`}>
          {isPositive ? '+' : ''}{formatCurrency(profit_loss)}
        </div>
        <div className="kpi-subtext">
          <span className={`badge ${isPositive ? 'badge-success' : 'badge-danger'}`}>
            {isPositive ? 'Gain' : 'Loss'}
          </span>
        </div>
      </div>

      {/* 4. Total Return on Cost % */}
      <div className="card kpi-card">
        <div className="kpi-header">
          <span>Return on Cost</span>
          <PieChart size={18} style={{ color: 'var(--accent-primary)' }} />
        </div>
        <div className={`kpi-value ${isPositive ? 'text-positive' : 'text-negative'}`}>
          {isPositive ? '+' : ''}{profit_loss_percentage.toFixed(2)}%
        </div>
        <div className="kpi-subtext">
          <span className={`badge ${isPositive ? 'badge-success' : 'badge-danger'}`}>
            {isPositive ? '▲' : '▼'}             {Math.abs(profit_loss_percentage).toFixed(2)}% on cost basis
          </span>
        </div>
      </div>

      {/* 5. Annualized Return (XIRR) - hidden until the portfolio has been
          invested for at least a year; annualizing a shorter window is
          meaningless (it can show absurd figures like millions of %). */}
      {xirr != null && (
        <div className="card kpi-card">
          <div className="kpi-header">
            <span>Annualized Return (XIRR)</span>
            <Award size={18} style={{ color: '#8b5cf6' }} />
          </div>
          <div className={`kpi-value ${isXirrPositive ? 'text-positive' : 'text-negative'}`}>
            {`${isXirrPositive ? '+' : ''}${xirr.toFixed(2)}%`}
          </div>
          <div className="kpi-subtext" style={{ color: 'var(--text-secondary)' }}>
            <span className={`badge ${isXirrPositive ? 'badge-success' : 'badge-danger'}`}>
              IRR
            </span>
          </div>
        </div>
      )}

      {/* 6. Jensen's Alpha (CAPM vs SPY) */}
      <div className="card kpi-card">
        <div className="kpi-header">
          <span>Jensen's Alpha (vs SPY)</span>
          <Zap size={18} style={{ color: '#f59e0b' }} />
        </div>
        <div className={`kpi-value ${alpha != null ? (isAlphaPositive ? 'text-positive' : 'text-negative') : ''}`}>
          {alpha != null ? `${isAlphaPositive ? '+' : ''}${alpha.toFixed(2)}%` : 'N/A'}
        </div>
        <div className="kpi-subtext" style={{ color: 'var(--text-secondary)' }}>
          {alpha != null ? (
            <span className={`badge ${isAlphaPositive ? 'badge-success' : 'badge-danger'}`}>
              {isAlphaPositive ? 'Risk-adjusted outperform' : 'Risk-adjusted underperform'}
            </span>
          ) : (
            'Needs 1+ year of history'
          )}
        </div>
      </div>
    </div>
    {isBrainrot && (
      <div className={`brainrot-side-gif ${isPositive ? 'profit' : 'loss'}`}>
        <img
          src={isPositive ? '/brainrot/happy-cat.gif' : '/brainrot/crying-hamster.gif'}
          alt={isPositive ? 'Portfolio in profit' : 'Portfolio in loss'}
        />
        <span>{isPositive ? 'WE ARE IN PROFIT, CHAT!' : 'WE ARE IN LOSS, CHAT!'}</span>
      </div>
    )}
    </div>
  );
}
