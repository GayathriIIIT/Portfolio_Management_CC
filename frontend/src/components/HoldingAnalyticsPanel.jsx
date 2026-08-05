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
import { Activity, X } from 'lucide-react';
import { api } from '../services/api';
import { RecommendationBanner, MetricGrid } from './riskWidgets';

const RANGES = [
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
];

const RANGE_EXPECTED_DAYS = { '1m': 31, '3m': 92, '6m': 184, '1y': 366 };

export function HoldingAnalyticsPanel({ symbol, onClose }) {
  const [range, setRange] = useState('1y');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [nav, setNav] = useState([]);
  const [chart, setChart] = useState([]);

  useEffect(() => {
    if (!symbol) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .getStockAnalytics(symbol, range)
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

    return () => {
      isMounted = false;
    };
  }, [symbol, range]);

  return (
    <div
      style={{
        padding: '16px 18px',
        backgroundColor: 'var(--bg-app)',
        borderTop: '1px solid var(--border-color)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '0.95rem' }}>
          <Activity size={16} style={{ color: 'var(--accent-primary)' }} />
          <span>{symbol} — Risk Analytics</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              gap: '4px',
              background: 'var(--bg-card)',
              padding: '3px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
            }}
          >
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                style={{
                  background: range === r.id ? 'var(--accent-primary)' : 'transparent',
                  color: range === r.id ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '3px 10px',
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
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="btn btn-secondary btn-sm">
            <X size={14} />
          </button>
        </div>
      </div>

      {metrics &&
        metrics.period_days < (RANGE_EXPECTED_DAYS[range] || 0) && (
          <div
            style={{
              marginBottom: '12px',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              background: 'var(--bg-app)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
            }}
          >
            Only {metrics.period_days} days of price history — the selected period exceeds what
            Yahoo provides, so metrics cover the full span of available data.
          </div>
        )}

      {loading ? (
        <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
          Fetching {symbol} risk indicators from Yahoo Finance...
        </div>
      ) : error ? (
        <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger-text)' }}>
          Unable to load analytics ({error})
        </div>
      ) : !metrics ? (
        <div className="empty-state">
          <Activity className="empty-state-icon" />
          <div>Not enough price history for {symbol} to compute risk metrics yet.</div>
        </div>
      ) : (
        <>
          <RecommendationBanner recommendation={recommendation} />

          {nav.length >= 2 && (
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontWeight: '700', fontSize: '0.85rem', marginBottom: '8px' }}>
                {symbol} — Price History ({range})
              </div>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={
                      chart.length >= 2
                        ? chart.map((pt) => ({ date: pt.timestamp, price: Number(pt.price) || 0 }))
                        : nav.map((pt) => ({ date: pt.date, price: Number(pt.value) || 0 }))
                    }
                    margin={{ top: 5, right: 20, left: 10, bottom: 0 }}
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
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => {
                        try {
                          return new Date(v).toLocaleDateString([], { month: 'short', day: 'numeric' });
                        } catch {
                          return v;
                        }
                      }}
                      minTickGap={32}
                    />
                    <YAxis
                      stroke="var(--text-secondary)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                      domain={['auto', 'auto']}
                      width={64}
                    />
                    <Tooltip
                      labelFormatter={(label) =>
                        new Date(label).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
                      }
                      formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Close']}
                      contentStyle={{
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="var(--accent-primary)"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--bg-card)' }}
                      fill="url(#analyticsPriceGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <MetricGrid metrics={metrics} />
        </>
      )}
    </div>
  );
}
