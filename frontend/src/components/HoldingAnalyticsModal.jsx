import React, { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Activity, X, ExternalLink, TrendingUp, AlertTriangle, CheckCircle, Info, TrendingDown, BarChart2 } from 'lucide-react';
import { api } from '../services/api';

const RANGES = [
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
];

const RANGE_EXPECTED_DAYS = { '1m': 31, '3m': 92, '6m': 184, '1y': 366 };

const METRIC_TILES = [
  { key: 'total_return', label: 'Total Return (TWR)', format: 'percent', hint: 'Time-weighted return over the window', icon: TrendingUp },
  { key: 'max_drawdown', label: 'Max Drawdown', format: 'drawdown', hint: 'Largest peak-to-trough decline', icon: TrendingDown },
  { key: 'period_volatility', label: 'Daily Volatility', format: 'percent', hint: 'Stdev of daily returns (not annualized)', icon: BarChart2 },
  { key: 'best_day', label: 'Best Day', format: 'percent', hint: 'Largest single-day gain', icon: TrendingUp },
  { key: 'worst_day', label: 'Worst Day', format: 'percent', hint: 'Largest single-day loss', icon: TrendingDown },
  { key: 'annualized_return', label: 'Annualized Return', format: 'percent', hint: 'Annualized return; needs 1+ year', icon: TrendingUp },
  { key: 'annualized_volatility', label: 'Volatility (Ann.)', format: 'percent', hint: 'Annualized stdev of daily returns', icon: BarChart2 },
  { key: 'sharpe_ratio', label: 'Sharpe Ratio', format: 'ratio', hint: 'Excess return / volatility', icon: TrendingUp },
  { key: 'sortino_ratio', label: 'Sortino Ratio', format: 'ratio', hint: 'Excess return / downside deviation', icon: TrendingUp },
  { key: 'jensen_alpha', label: "Jensen's Alpha", format: 'percent', hint: 'Risk-adjusted excess return vs SPY', icon: TrendingUp },
  { key: 'beta', label: 'Beta vs SPY', format: 'ratio', hint: 'Systematic risk vs S&P 500', icon: BarChart2 },
  { key: 'correlation', label: 'Correlation (SPY)', format: 'ratio', hint: 'Correlation of daily returns with SPY', icon: BarChart2 },
  { key: 'up_capture', label: 'Up Capture', format: 'percent', hint: '% of benchmark upside captured', icon: TrendingUp },
  { key: 'down_capture', label: 'Down Capture', format: 'percent', hint: '% of benchmark downside captured', icon: TrendingDown },
];

const REC_TONE = {
  positive: { color: 'var(--success)', bg: 'rgba(13, 148, 136, 0.15)', border: 'var(--success)', label: 'Favorable' },
  negative: { color: 'var(--danger-text)', bg: 'rgba(225, 29, 72, 0.15)', border: 'var(--danger-text)', label: 'Unfavorable' },
  neutral: { color: 'var(--warning)', bg: 'rgba(217, 119, 6, 0.15)', border: 'var(--warning)', label: 'Neutral' },
};

function formatMetric(key, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const tile = METRIC_TILES.find((t) => t.key === key);
  const num = Number(value);
  if (tile?.format === 'drawdown') return `-${num.toFixed(2)}%`;
  if (tile?.format === 'percent') return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
  return num.toFixed(2);
}

function isNegativeMetric(key, value) {
  if (value === null || value === undefined) return false;
  if (key === 'max_drawdown' || key === 'worst_day') return true;
  return Number(value) < 0;
}

function formatCurrency(val, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0);
}

function RecommendationBanner({ recommendation }) {
  const [showReasons, setShowReasons] = useState(false);
  if (!recommendation) return null;

  const tone = REC_TONE[recommendation.tone] || REC_TONE.neutral;
  const iconMap = {
    positive: CheckCircle,
    negative: AlertTriangle,
    neutral: Info,
  };
  const Icon = iconMap[recommendation.tone] || Info;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '14px',
        padding: '18px 20px',
        borderRadius: 'var(--radius-lg)',
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        marginBottom: '20px',
        flexWrap: 'wrap',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        bottom: 0, 
        width: '4px', 
        background: tone.color 
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 280 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: tone.color,
          color: '#fff',
          boxShadow: `0 4px 12px ${tone.color}40`,
        }}>
          <Icon size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ 
            fontWeight: '800', 
            fontSize: '1.05rem', 
            color: tone.color,
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap'
          }}>
            <span style={{ 
              fontSize: '0.75rem',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: tone.color,
              color: '#fff',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {tone.label}
            </span>
            <span>{recommendation.label}</span>
          </div>
          <div style={{ 
            fontSize: '0.85rem', 
            color: 'var(--text-secondary)',
            lineHeight: 1.5
          }}>
            {recommendation.reasons?.[0] || 'Based on risk metrics and market conditions.'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowReasons((v) => !v)}
          title="Why this suggestion?"
          aria-label="Why this suggestion?"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: tone.color,
            borderRadius: 'var(--radius-sm)',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: '600',
            transition: 'all 0.15s ease',
          }}
          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        >
          <Info size={14} />
          Why?
        </button>
      </div>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '16px',
        fontSize: '0.75rem', 
        color: 'var(--text-secondary)',
        flexWrap: 'wrap'
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <BarChart2 size={12} />
          {recommendation.confidence} confidence
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <TrendingUp size={12} />
          {recommendation.period_days} days
        </span>
      </div>
      {showReasons && (
        <div style={{ width: '100%', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.8 }}>
            {recommendation.reasons?.map((reason, i) => (
              <li key={i} style={{ marginBottom: '6px', position: 'relative', paddingLeft: '8px' }}>
                <span style={{ 
                  position: 'absolute', 
                  left: '-18px', 
                  color: tone.color,
                  fontSize: '0.7rem'
                }}>▸</span>
                {reason}
              </li>
            ))}
            <li style={{ marginTop: '10px', color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.75rem' }}>
              Informational only — not financial advice.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

function MetricCard({ tile, value, negative, onClick }) {
  return (
    <div 
      className="card kpi-card" 
      key={tile.key} 
      title={tile.hint}
      onClick={onClick}
      style={{ 
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        border: onClick ? '1px solid var(--accent-border)' : '1px solid var(--border-color)',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.boxShadow = 'var(--shadow-md)')}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.boxShadow = 'var(--shadow-sm)')}
    >
      {onClick && (
        <div style={{ 
          position: 'absolute', 
          top: '8px', 
          right: '8px', 
          opacity: 0.4,
          transition: 'opacity 0.2s ease'
        }}>
          <ExternalLink size={12} style={{ color: 'var(--accent-primary)' }} />
        </div>
      )}
      <div className="kpi-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <tile.icon size={14} style={{ color: negative ? 'var(--danger-text)' : 'var(--accent-primary)', opacity: 0.8 }} />
          <span style={{ fontWeight: '600' }}>{tile.label}</span>
        </div>
      </div>
      <div className={`kpi-value ${negative ? 'text-negative' : 'text-positive'}`} style={{ fontSize: '1.5rem' }}>
        {formatMetric(tile.key, value)}
      </div>
      <div className="kpi-subtext" style={{ color: 'var(--text-secondary)', fontSize: '0.68rem', lineHeight: 1.4 }}>
        {tile.hint}
      </div>
    </div>
  );
}

function MetricGrid({ metrics, onTileClick }) {
  if (!metrics) return null;

  const populatedTiles = METRIC_TILES.filter(
    (tile) => metrics[tile.key] !== null && metrics[tile.key] !== undefined
  );

  if (populatedTiles.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '32px' }}>
        <BarChart2 className="empty-state-icon" style={{ color: 'var(--text-muted)' }} />
        <div>This window has too little data for any risk metric yet. Try a longer period.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
        gap: '14px',
        marginBottom: '16px'
      }}>
        {populatedTiles.map((tile) => {
          const value = metrics[tile.key];
          const negative = isNegativeMetric(tile.key, value);
          return (
            <MetricCard 
              key={tile.key} 
              tile={tile} 
              value={value} 
              negative={negative}
              onClick={() => onTileClick?.(tile.key, value)}
            />
          );
        })}
      </div>
    </div>
  );
}

export function HoldingAnalyticsModal({ 
  isOpen, 
  onClose, 
  symbol, 
  currency = 'USD',
  holdingData = null 
}) {
  const [viewSymbol, setViewSymbol] = useState(symbol);
  const [range, setRange] = useState('1y');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [nav, setNav] = useState([]);
  const [chart, setChart] = useState([]);
  const [similar, setSimilar] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setViewSymbol(symbol);
    }
  }, [isOpen, symbol]);

  useEffect(() => {
    if (!isOpen || !viewSymbol) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .getStockAnalytics(viewSymbol, range)
      .then((res) => {
        if (!isMounted) return;
        setMetrics(res.metrics || null);
        setRecommendation(res.recommendation || null);
        setNav(res.nav || []);
        setChart(res.chart || []);
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    api
      .getSimilarStocks(viewSymbol)
      .then((res) => {
        if (!isMounted) return;
        setSimilar(res.similar || []);
      })
      .catch(() => {
        if (isMounted) setSimilar([]);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, viewSymbol, range]);

  if (!isOpen) return null;

  const handleSwitchSymbol = (newSymbol) => {
    setViewSymbol(newSymbol);
  };

  const isInsufficientData = metrics && metrics.period_days < (RANGE_EXPECTED_DAYS[range] || 0);

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
      <div 
        className="modal-content modal-content--analytics" 
        onClick={(e) => e.stopPropagation()}
        style={{ 
          maxWidth: '820px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="modal-header" style={{ 
          position: 'sticky', 
          top: 0, 
          zIndex: 10,
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          padding: '16px 24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--accent-primary), #0d9488)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
            }}>
              <Activity size={22} />
            </div>
            <div>
              <div style={{ fontWeight: '800', fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                {viewSymbol} Risk Analytics
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {holdingData && formatCurrency(holdingData.market_value, currency)} · {holdingData && holdingData.quantity ? `${Number(holdingData.quantity).toLocaleString()} shares` : ''}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '3px', background: 'var(--bg-app)', padding: '3px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r.id)}
                  style={{
                    background: range === r.id ? 'var(--accent-primary)' : 'transparent',
                    color: range === r.id ? '#fff' : 'var(--text-secondary)',
                    border: 'none',
                    padding: '5px 14px',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: range === r.id ? '700' : '500',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} title="Close" aria-label="Close" className="btn btn-secondary btn-sm" style={{ width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {isInsufficientData && (
            <div
              style={{
                marginBottom: '20px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                background: 'var(--bg-app)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
              Only {metrics.period_days} days of history — the {RANGES.find(r => r.id === range)?.label} period exceeds available data, so metrics cover the full span.
            </div>
          )}

          {loading ? (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <Activity size={32} style={{ color: 'var(--accent-primary)', animation: 'spin 1s linear infinite' }} />
                <span>Fetching {viewSymbol} risk indicators from Yahoo Finance...</span>
              </div>
            </div>
          ) : error ? (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger-text)' }}>
              <div style={{ textAlign: 'center' }}>
                <AlertTriangle size={32} style={{ marginBottom: '12px' }} />
                <div style={{ fontWeight: '600', marginBottom: '4px' }}>Unable to load analytics</div>
                <div style={{ fontSize: '0.85rem' }}>{error}</div>
              </div>
            </div>
          ) : !metrics ? (
            <div className="empty-state" style={{ padding: '48px 24px' }}>
              <Activity className="empty-state-icon" style={{ color: 'var(--text-muted)' }} />
              <div style={{ fontWeight: '600', marginBottom: '8px' }}>Insufficient Data</div>
              <div style={{ color: 'var(--text-secondary)' }}>Not enough price history for {viewSymbol} to compute risk metrics yet.</div>
            </div>
          ) : (
            <>
              <RecommendationBanner recommendation={recommendation} />

              {nav.length >= 2 && (
                <div
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '20px',
                    marginBottom: '24px',
                  }}
                >
                  <div style={{ fontWeight: '700', fontSize: '0.95rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingUp size={18} style={{ color: 'var(--accent-primary)' }} />
                    <span>{viewSymbol} — Price History ({range})</span>
                  </div>
                  <div style={{ width: '100%', height: 320 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={
                          chart.length >= 2
                            ? chart.map((pt) => ({ date: pt.timestamp, price: Number(pt.price) || 0 }))
                            : nav.map((pt) => ({ date: pt.date, price: Number(pt.value) || 0 }))
                        }
                        margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="analyticsPriceGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          stroke="var(--text-secondary)"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => {
                            try {
                              return new Date(v).toLocaleDateString([], { month: 'short', day: 'numeric' });
                            } catch {
                              return v;
                            }
                          }}
                          minTickGap={40}
                        />
                        <YAxis
                          stroke="var(--text-secondary)"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => formatCurrency(v, currency)}
                          domain={['auto', 'auto']}
                          width={80}
                        />
                        <Tooltip
                          labelFormatter={(label) =>
                            new Date(label).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
                          }
                          formatter={(value) => [formatCurrency(value, currency), 'Close']}
                          contentStyle={{
                            backgroundColor: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '0.85rem',
                            padding: '10px 14px',
                            boxShadow: 'var(--shadow-lg)',
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="price"
                          stroke="var(--accent-primary)"
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--bg-card)' }}
                          fill="url(#analyticsPriceGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <MetricGrid metrics={metrics} />

              {similar.length > 0 && (
                <div style={{ marginTop: '24px' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.95rem', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BarChart2 size={18} style={{ color: 'var(--accent-primary)' }} />
                    <span>Similar Stocks</span>
                    <span className="badge badge-secondary" style={{ fontSize: '0.7rem', fontWeight: '600' }}>
                      {similar.length}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                    {similar.map((s) => (
                      <button
                        key={s.symbol}
                        className="btn btn-secondary"
                        style={{
                          justifyContent: 'space-between',
                          fontSize: '0.85rem',
                          padding: '14px 16px',
                          borderRadius: 'var(--radius-md)',
                          textAlign: 'left',
                          transition: 'all 0.2s ease',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-card)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--accent-primary)';
                          e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border-color)';
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.transform = 'none';
                        }}
                        onClick={() => handleSwitchSymbol(s.symbol)}
                        title={`View ${s.symbol} analytics`}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--accent-primary)' }}>
                              {s.symbol}
                            </span>
                            {s.price != null && (
                              <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(s.price, s.currency || currency)}
                              </span>
                            )}
                          </div>
                          {s.name && (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {s.name}
                            </span>
                          )}
                        </div>
                        <ExternalLink size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '10px' }}>
                    Rule-based picks in the same sector, ranked by market-cap similarity to {viewSymbol}. Click to analyze.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}