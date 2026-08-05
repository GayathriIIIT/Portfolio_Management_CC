import React, { useState } from 'react';
import { Info, TrendingDown } from 'lucide-react';

export const METRIC_TILES = [
  { key: 'total_return', label: 'Total Return (TWR)', format: 'percent', hint: 'Time-weighted return over the window — deposits/withdrawals are not counted as gains' },
  { key: 'max_drawdown', label: 'Max Drawdown', format: 'drawdown', hint: 'Largest peak-to-trough decline in the window' },
  { key: 'period_volatility', label: 'Daily Volatility', format: 'percent', hint: 'Stdev of daily returns over the window (not annualized)' },
  { key: 'best_day', label: 'Best Day', format: 'percent', hint: 'Largest single-day gain in the window' },
  { key: 'worst_day', label: 'Worst Day', format: 'percent', hint: 'Largest single-day loss in the window' },
  { key: 'annualized_return', label: 'Annualized Return', format: 'percent', hint: 'Annualized return; needs 1+ year of history' },
  { key: 'annualized_volatility', label: 'Volatility (Ann.)', format: 'percent', hint: 'Annualized stdev of daily returns; needs 1+ year' },
  { key: 'sharpe_ratio', label: 'Sharpe Ratio', format: 'ratio', hint: 'Excess return / volatility; needs 1+ year' },
  { key: 'sortino_ratio', label: 'Sortino Ratio', format: 'ratio', hint: 'Excess return / downside deviation; needs 1+ year' },
  { key: 'jensen_alpha', label: "Jensen's Alpha", format: 'percent', hint: 'Risk-adjusted excess return vs SPY (CAPM); needs 1+ year' },
  { key: 'beta', label: 'Beta vs SPY', format: 'ratio', hint: 'Systematic risk vs S&P 500; needs ~6 weeks of returns' },
  { key: 'correlation', label: 'Correlation (SPY)', format: 'ratio', hint: 'Correlation of daily returns with SPY; needs ~6 weeks' },
  { key: 'up_capture', label: 'Up Capture', format: 'percent', hint: '% of benchmark upside captured (100 = match); needs ~6 weeks' },
  { key: 'down_capture', label: 'Down Capture', format: 'percent', hint: '% of benchmark downside captured (lower = better); needs ~6 weeks' },
];

export const REC_TONE = {
  positive: { color: 'var(--accent-primary)', bg: 'rgba(34,197,94,0.12)', label: 'Positive' },
  negative: { color: 'var(--danger-text)', bg: 'rgba(239,68,68,0.12)', label: 'Negative' },
  neutral: { color: 'var(--text-secondary)', bg: 'rgba(234,179,8,0.12)', label: 'Neutral' },
};

export function formatMetric(key, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const tile = METRIC_TILES.find((t) => t.key === key);
  const num = Number(value);
  if (tile?.format === 'drawdown') return `-${num.toFixed(2)}%`;
  if (tile?.format === 'percent') return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
  return num.toFixed(2);
}

export function isNegativeMetric(key, value) {
  if (value === null || value === undefined) return false;
  if (key === 'max_drawdown' || key === 'worst_day') return true;
  return Number(value) < 0;
}

export function RecommendationBanner({ recommendation }) {
  const [showReasons, setShowReasons] = useState(false);
  if (!recommendation) return null;

  const tone = REC_TONE[recommendation.tone] || REC_TONE.neutral;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '14px 16px',
        borderRadius: 'var(--radius-md)',
        background: tone.bg,
        border: `1px solid ${tone.color}`,
        marginBottom: '16px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          style={{
            fontWeight: '800',
            fontSize: '1rem',
            color: tone.color,
            background: 'var(--bg-card)',
            border: `1px solid ${tone.color}`,
            padding: '4px 12px',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {recommendation.label}
        </span>
        <button
          type="button"
          onClick={() => setShowReasons((v) => !v)}
          title="Why this suggestion?"
          aria-label="Why this suggestion?"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'transparent',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: '600',
          }}
        >
          <Info size={15} />
          Why?
        </button>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', alignSelf: 'center' }}>
        Confidence: {recommendation.confidence} · {recommendation.period_days} days of history
      </div>
      {showReasons && (
        <ul style={{ width: '100%', margin: '4px 0 0 0', paddingLeft: '18px', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
          {recommendation.reasons.map((reason, i) => (
            <li key={i} style={{ marginBottom: '4px' }}>{reason}</li>
          ))}
          <li style={{ marginTop: '6px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            Informational only — not financial advice.
          </li>
        </ul>
      )}
    </div>
  );
}

export function MetricGrid({ metrics }) {
  if (!metrics) return null;

  const populatedTiles = METRIC_TILES.filter(
    (tile) => metrics[tile.key] !== null && metrics[tile.key] !== undefined
  );
  const hiddenTiles = METRIC_TILES.length - populatedTiles.length;

  if (populatedTiles.length === 0) {
    return (
      <div className="empty-state">
        This window has too little data for any risk metric yet. Try a longer period.
      </div>
    );
  }

  return (
    <>
      <div className="grid-4">
        {populatedTiles.map((tile) => {
          const value = metrics[tile.key];
          const negative = isNegativeMetric(tile.key, value);
          return (
            <div className="card kpi-card" key={tile.key} title={tile.hint}>
              <div className="kpi-header">
                <span>{tile.label}</span>
                <TrendingDown size={16} style={{ color: negative ? 'var(--danger-text)' : 'var(--accent-primary)', opacity: 0.7 }} />
              </div>
              <div className={`kpi-value ${negative ? 'text-negative' : ''}`}>
                {formatMetric(tile.key, value)}
              </div>
              <div className="kpi-subtext" style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                {tile.hint}
              </div>
            </div>
          );
        })}
      </div>

      {hiddenTiles > 0 && (
        <div
          style={{
            marginTop: '12px',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
          }}
        >
          {hiddenTiles} metric{hiddenTiles > 1 ? 's' : ''} hidden — annualized and benchmark-relative
          stats (Sharpe, Sortino, annualized vol/return, Jensen's alpha, beta, correlation, up/down
          capture) only appear once the window has enough history to be statistically meaningful.
        </div>
      )}
    </>
  );
}
