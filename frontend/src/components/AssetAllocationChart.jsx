import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PieChart as PieIcon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export function AssetAllocationChart({ holdings = [], currency = 'USD' }) {
  const { isBrainrot } = useTheme();
  if (!holdings || holdings.length === 0) {
    return (
      <div className="card">
        <div style={{ fontWeight: '700', fontSize: '1.1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <PieIcon size={20} style={{ color: 'var(--accent-primary)' }} />
          <span>Asset Allocation</span>
        </div>
        <div className="empty-state">No active holdings to display allocation.</div>
      </div>
    );
  }

  // A portfolio's cash holding (a {CCY}-CASH position) is part of the portfolio,
  // so it is included here like any other holding. The user-level WALLET is
  // separate and never reaches this chart.
  const investHoldings = holdings;

  // Aggregate market value by Symbol (securities only)
  const dataMap = {};
  investHoldings.forEach((h) => {
    const symbol = h.symbol || 'Other';
    const val = Number(h.market_value || 0);
    dataMap[symbol] = (dataMap[symbol] || 0) + val;
  });

  const chartData = Object.keys(dataMap).map((symbol) => ({
    name: symbol,
    value: dataMap[symbol],
  }));

  const totalValue = chartData.reduce((acc, curr) => acc + curr.value, 0);

  const CustomPieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const pct = totalValue ? ((data.value / totalValue) * 100).toFixed(1) : 0;
      return (
        <div className="custom-chart-tooltip">
          <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{data.name}</div>
          <div style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>
            {currency} {data.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{pct}% of Portfolio</div>
        </div>
      );
    };
    return null;
  };

  return (
    <div className="card">
      <div style={{ fontWeight: '700', fontSize: '1.1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <PieIcon size={20} style={{ color: 'var(--accent-primary)' }} />
        <span>Asset Allocation</span>
      </div>
      {chartData.length > 0 ? (
        <div style={{ width: '100%', height: 280, position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={4}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="var(--bg-card)" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip content={<CustomPieTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value) => <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
          {isBrainrot && (
            <img
              src="/brainrot/asset_allocation.gif"
              alt="Asset allocation"
              style={{
                position: 'absolute',
                top: '42%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 108,
                height: 108,
                objectFit: 'cover',
                borderRadius: '50%',
                border: '3px solid #ffffff',
                boxShadow: 'var(--shadow-md)',
                zIndex: 5,
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      ) : (
        <div className="empty-state">No investable securities to display allocation.</div>
      )}
    </div>
  );
}
