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
import { Gauge, Activity, DollarSign } from 'lucide-react';
import { api } from '../services/api';
import { RecommendationBanner, MetricGrid } from './riskWidgets';

const RANGES = [
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
  { id: 'all', label: 'All' },
];

const RANGE_EXPECTED_DAYS = { '1m': 31, '3m': 92, '6m': 184, '1y': 366 };

function NAVTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0];
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        padding: '8px 12px',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-md)',
        fontSize: '0.8rem',
      }}
    >
      <div style={{ color: 'var(--text-secondary)' }}>{point.payload.date}</div>
      <div style={{ fontWeight: '700', color: 'var(--accent-primary)' }}>
        ${Number(point.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}

export function RiskPerformanceCard({ portfolioId, refreshKey = 0 }) {
  const [range, setRange] = useState('all');
  const [includeCash, setIncludeCash] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [nav, setNav] = useState([]);
  const [emptyMessage, setEmptyMessage] = useState(null);

  useEffect(() => {
    if (!portfolioId) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .getPortfolioRisk(portfolioId, range, includeCash)
      .then((res) => {
        if (!isMounted) return;
        setMetrics(res.metrics || null);
        setRecommendation(res.recommendation || null);
        setNav(res.nav || []);
        setEmptyMessage(res.message || null);
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [portfolioId, range, includeCash, refreshKey]);

  return (
    <div className="card" style={{ marginBottom: '28px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '1.1rem' }}>
          <Gauge size={20} style={{ color: 'var(--accent-primary)' }} />
          <span>Portfolio Risk & Performance</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', fontWeight: '700' }}>Period:</span>
            <div
              style={{
                display: 'flex',
                gap: '4px',
                background: 'var(--bg-app)',
                padding: '4px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
              }}
            >
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRange(r.id)}
                  style={{
                    background: range === r.id ? 'var(--bg-card)' : 'transparent',
                    color: range === r.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: range === r.id ? '600' : '500',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    boxShadow: range === r.id ? 'var(--shadow-sm)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setIncludeCash((v) => !v)}
              title="Include or exclude the portfolio's cash component from the graph"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: includeCash ? 'var(--accent-primary)' : 'var(--bg-app)',
                color: includeCash ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                padding: '5px 10px',
                borderRadius: 'var(--radius-md)',
                fontWeight: '600',
                fontSize: '0.75rem',
                cursor: 'pointer',
                boxShadow: includeCash ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <DollarSign size={13} />
              Include Cash
            </button>
          </div>

          {metrics && (
            <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
              {metrics.data_points} daily points · {metrics.period_days} days
            </div>
          )}
        </div>
      </div>

      {metrics &&
        range !== 'all' &&
        metrics.period_days < (RANGE_EXPECTED_DAYS[range] || 0) && (
          <div
            style={{
              marginBottom: '16px',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              background: 'var(--bg-app)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
            }}
          >
            Only {metrics.period_days} days of history — the{' '}
            {RANGES.find((r) => r.id === range)?.label} period exceeds available data, so metrics
            cover the full span of the portfolio's history.
          </div>
        )}

      {!includeCash && (
        <div
          style={{
            marginBottom: '16px',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            background: 'var(--bg-app)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
          }}
        >
          Cash component is excluded — the graph shows only the market value of your securities.
        </div>
      )}

      {loading ? (
        <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
          Computing risk indicators...
        </div>
      ) : error ? (
        <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger-text)' }}>
          Unable to load risk metrics ({error})
        </div>
      ) : !metrics ? (
        <div className="empty-state">
          <Activity className="empty-state-icon" />
          <div>
            {emptyMessage || (
              <>
                Not enough information yet — add transactions and let the portfolio build up
                some history.
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          <RecommendationBanner recommendation={recommendation} />

          {nav.length > 1 && (
            <div style={{ width: '100%', height: 160, marginBottom: '16px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={nav} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="riskNavGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(d) => d.slice(5)} />
                  <YAxis stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toLocaleString(undefined, { notation: 'compact' })}`} domain={['auto', 'auto']} />
                  <Tooltip content={<NAVTooltip />} />
                  <Area type="monotone" dataKey="value" stroke="var(--accent-primary)" strokeWidth={2} dot={false} fill="url(#riskNavGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {nav.length <= 1 && metrics && (
            <div
              style={{
                marginBottom: '16px',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                background: 'var(--bg-app)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
              }}
            >
              Almost no history in this window yet — value-based metrics below (total return,
              drawdown, best/worst day) reflect what data exists so far.
            </div>
          )}

          <MetricGrid metrics={metrics} />
        </>
      )}
    </div>
  );
}
