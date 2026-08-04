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
import { TrendingUp, Calendar, Layers } from 'lucide-react';

const RANGES = [
  { id: '1d', label: '1D' },
  { id: '7d', label: '1W' },
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
];

const BENCHMARKS = [
  { id: 'SPY', label: 'S&P 500 (SPY)' },
  { id: 'QQQ', label: 'Nasdaq 100 (QQQ)' },
  { id: 'DIA', label: 'Dow Jones (DIA)' },
  { id: 'VT', label: 'World Stock (VT)' },
  { id: 'NONE', label: 'None' },
];

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const assetPoint = payload.find((p) => p.dataKey === 'price');
    const benchPoint = payload.find((p) => p.dataKey === 'benchmarkReturn');

    const formattedVal = assetPoint
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(assetPoint.value)
      : null;

    // Use raw timestamp if available for accurate date display
    const rawTimestamp = assetPoint?.payload?.rawTimestamp || label;

    return (
      <div className="custom-chart-tooltip" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '10px 14px', borderRadius: '8px', boxShadow: 'var(--shadow-md)' }}>
        <div className="tooltip-date" style={{ fontWeight: '700', fontSize: '0.825rem', marginBottom: '6px', color: 'var(--text-secondary)' }}>
          {new Date(rawTimestamp).toLocaleString([], { dateStyle: 'short', timeStyle: rawTimestamp.includes('T') ? 'short' : undefined })}
        </div>
        {assetPoint && (
          <div style={{ color: 'var(--accent-primary)', fontWeight: '700', fontSize: '0.95rem' }}>
            {assetPoint.payload.symbol}: {formattedVal}
          </div>
        )}
        {benchPoint && benchPoint.value !== undefined && (
          <div style={{ color: '#f59e0b', fontWeight: '600', fontSize: '0.825rem', marginTop: '4px' }}>
            Benchmark ({assetPoint?.payload?.benchmarkName || 'Market'}): {benchPoint.value >= 0 ? '+' : ''}{benchPoint.value.toFixed(2)}%
          </div>
        )}
      </div>
    );
  }
  return null;
}

export function PerformanceChart({ portfolioId }) {
  const [range, setRange] = useState('1m');
  const [benchmark, setBenchmark] = useState('SPY');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [seriesList, setSeriesList] = useState([]);
  const [symbolsList, setSymbolsList] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [benchmarkData, setBenchmarkData] = useState(null);

  useEffect(() => {
    if (!portfolioId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .getPortfolioChartData(portfolioId, range, benchmark)
      .then((res) => {
        if (!isMounted) return;
        const allSeries = res.series || [];
        const symbols = allSeries.map((s) => s.symbol);
        
        setSeriesList(allSeries);
        setSymbolsList(symbols);
        setBenchmarkData(res.benchmark || null);

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
  }, [portfolioId, range, benchmark]);

  // Derive active series data and merge benchmark data
  const activeSeries = seriesList.find((s) => s.symbol === selectedSymbol);
  const benchPoints = benchmarkData?.points || [];

  // Build a timestamp-keyed map for O(1) benchmark lookup
  const benchByTimestamp = {};
  benchPoints.forEach((b) => {
    if (b.timestamp) benchByTimestamp[b.timestamp] = b;
  });

  // Determine if the range has sub-daily intervals (1d = 5m, 7d = 30m, 1m = 1h)
  const isIntraday = ['1d', '7d', '1m'].includes(range);

  const formatXLabel = (isoTimestamp) => {
    if (!isoTimestamp || !isoTimestamp.includes('T')) return isoTimestamp || 'N/A';
    const [datePart, timePart] = isoTimestamp.split('T');
    if (isIntraday) {
      // Show HH:MM in local time
      try {
        const d = new Date(isoTimestamp);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (_) {
        return timePart ? timePart.substring(0, 5) : datePart;
      }
    }
    // Multi-day: show MMM DD
    try {
      const d = new Date(datePart + 'T00:00:00');
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (_) {
      return datePart;
    }
  };

  const chartData = activeSeries
    ? (activeSeries.points || []).map((pt, idx) => {
        const rawTimestamp = pt.timestamp || pt.as_of || '';
        const label = formatXLabel(rawTimestamp);

        // Look up benchmark by exact timestamp first, then by array index
        const benchPt = benchByTimestamp[rawTimestamp] || benchPoints[idx] || null;

        return {
          date: label,
          rawTimestamp,
          price: Number(pt.price || 0),
          symbol: selectedSymbol,
          benchmarkReturn: benchPt != null ? Number(benchPt.pct_return) : undefined,
          benchmarkName: benchmarkData?.name || benchmark,
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
            <span>Asset Performance & Benchmark Analytics</span>
          </div>
          <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            Historical security valuation tracking relative to market benchmark indexes
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Ticker Selector */}
          {symbolsList.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', fontWeight: '700' }}>Asset:</span>
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

          {/* Benchmark Index Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', fontWeight: '700' }}>Benchmark:</span>
            <select
              className="form-select"
              style={{ height: '32px', fontSize: '0.8rem', padding: '0 8px', width: '150px' }}
              value={benchmark}
              onChange={(e) => setBenchmark(e.target.value)}
            >
              {BENCHMARKS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

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
                dataKey="rawTimestamp"
                stroke="var(--text-secondary)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(ts) => formatXLabel(ts)}
              />
              <YAxis
                yAxisId="left"
                stroke="var(--text-secondary)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `$${val}`}
                domain={['auto', 'auto']}
              />
              {benchmark !== 'NONE' && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#f59e0b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${val >= 0 ? '+' : ''}${val}%`}
                  domain={['auto', 'auto']}
                />
              )}
              <Tooltip content={<CustomTooltip />} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="price"
                stroke="var(--accent-primary)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, stroke: 'var(--bg-card)', strokeWidth: 2 }}
              />
              {benchmark !== 'NONE' && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="benchmarkReturn"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 5, fill: '#f59e0b', stroke: 'var(--bg-card)', strokeWidth: 2 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
