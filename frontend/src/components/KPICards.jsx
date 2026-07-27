import React from 'react';
import { DollarSign, TrendingUp, TrendingDown, Layers, PieChart } from 'lucide-react';

export function KPICards({ analytics, currency = 'USD' }) {
  if (!analytics) return null;

  const { invested_value = 0, current_value = 0, profit_loss = 0, profit_loss_percentage = 0, holdings = [] } = analytics;
  const isPositive = profit_loss >= 0;

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="grid-4">
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

      {/* 4. Total Return % */}
      <div className="card kpi-card">
        <div className="kpi-header">
          <span>Total Return</span>
          <PieChart size={18} style={{ color: 'var(--accent-primary)' }} />
        </div>
        <div className={`kpi-value ${isPositive ? 'text-positive' : 'text-negative'}`}>
          {isPositive ? '+' : ''}{profit_loss_percentage.toFixed(2)}%
        </div>
        <div className="kpi-subtext">
          <span className={`badge ${isPositive ? 'badge-success' : 'badge-danger'}`}>
            {isPositive ? '▲' : '▼'} {Math.abs(profit_loss_percentage).toFixed(2)}% Overall
          </span>
        </div>
      </div>
    </div>
  );
}
