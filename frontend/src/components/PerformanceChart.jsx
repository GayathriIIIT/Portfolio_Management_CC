import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../services/api';
import { TrendingUp, Calendar } from 'lucide-react';

const RANGES = [
  { id: '1d', label: '1D' },
  { id: '7d', label: '1W' },
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
];

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const dataPoint = payload[0];
    const value = dataPoint.value;
    const formattedVal = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);

    return (
      <div className="custom-chart-tooltip">
        <div className="tooltip-date">{label}</div>
        <div className="tooltip-value" style={{ color: 'var(--accent-primary)' }}>
          {formattedVal}
        </div>
        {payload[0].payload.symbol && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Asset: {payload[0].payload.symbol}
          </div>
        )}
      </div>
    );
  }
  return null;
}

export function PerformanceChart({ portfolioId }) {
  const [range, setRange] = useState('1m');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [seriesList, setSeriesList] = useState([]);
  const [symbolsList, setSymbolsList] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');

  useEffect(() => {
    if (!portfolioId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .getPortfolioChartData(portfolioId, range)
      .then((res) => {
        if (!isMounted) return;
        const allSeries = res.series || [];
        const symbols = allSeries.map((s) => s.symbol);
        
        setSeriesList(allSeries);
        setSymbolsList(symbols);

        // Set default selected symbol if empty or not in the new symbols list
        setSelectedSymbol((prev) => {
          if (prev && symbols.includes(prev)) return prev;
          return symbols[0] || '';
        });
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
  }, [portfolioId, range]);

  // Derive active series data
  const activeSeries = seriesList.find((s) => s.symbol === selectedSymbol);
  const chartData = activeSeries
    ? (activeSeries.points || []).map((pt) => {
        let dateLabel = pt.timestamp || pt.as_of;
        if (dateLabel && dateLabel.includes('T')) {
          dateLabel = dateLabel.split('T')[0];
        }
        return {
          date: dateLabel || 'N/A',
          price: Number(pt.price || 0),
          symbol: selectedSymbol,
        };
      })
    : [];

  return (
    <div className="card" style={{ marginBottom: '28px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '1.1rem' }}>
            <TrendingUp size={20} style={{ color: 'var(--accent-primary)' }} />
            <span>Asset Performance Analytics</span>
          </div>
          <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            Historical security valuation tracking over selected time horizon
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Ticker / Symbol Selector */}
          {symbolsList.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', fontWeight: '700' }}>Ticker:</span>
              <select
                className="form-select"
                style={{ height: '32px', fontSize: '0.8rem', padding: '0 8px', width: '110px' }}
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
              >
                {symbolsList.map((sym) => (
                  <option key={sym} value={sym}>
                    {sym}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Time Range Selector */}
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-app)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                style={{
                  background: range === r.id ? 'var(--bg-card)' : 'transparent',
                  color: range === r.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: range === r.id ? '600' : '500',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow: range === r.id ? 'var(--shadow-sm)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
          Loading performance data...
        </div>
      ) : error ? (
        <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger-text)' }}>
          Unable to load performance chart ({error})
        </div>
      ) : !chartData.length ? (
        <div className="empty-state">
          <Calendar className="empty-state-icon" />
          <div>No historical chart data available for this selection.</div>
        </div>
      ) : (
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="var(--text-secondary)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="var(--text-secondary)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `$${val}`}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="price"
                stroke="var(--accent-primary)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'var(--accent-primary)' }}
                activeDot={{ r: 6, stroke: 'var(--bg-card)', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
