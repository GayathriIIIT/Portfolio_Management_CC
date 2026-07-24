import React, { useState } from 'react';

export const POPULAR_SUGGESTIONS = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corp' },
  { symbol: 'TSLA', name: 'Tesla, Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corp' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'GOOG', name: 'Alphabet Inc.' },
  { symbol: 'META', name: 'Meta Platforms' },
  { symbol: 'NFLX', name: 'Netflix, Inc.' },
  { symbol: 'AMD', name: 'Advanced Micro Devices' },
  { symbol: 'BND', name: 'Vanguard Total Bond' },
  { symbol: 'US10Y-2030', name: 'US 10Y Note 2030' },
  { symbol: 'USD-CASH', name: 'US Dollar Cash' },
];

export function TickerAutocomplete({ value, onChange, placeholder, style, className, required = false }) {
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filtered = POPULAR_SUGGESTIONS.filter(
    (item) =>
      item.symbol.startsWith(value.toUpperCase()) ||
      item.name.toLowerCase().includes(value.toLowerCase())
  ).slice(0, 5);

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        type="text"
        className={className || "form-input"}
        style={style}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        required={required}
      />
      {showSuggestions && value && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 50,
          marginTop: '4px',
          maxHeight: '180px',
          overflowY: 'auto'
        }}>
          {filtered.map((item) => (
            <div
              key={item.symbol}
              onClick={() => {
                onChange(item.symbol);
                setShowSuggestions(false);
              }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.8rem',
                borderBottom: '1px solid var(--border-color-light)',
              }}
              className="suggestion-item"
              onMouseDown={(e) => e.preventDefault()}
            >
              <span style={{ fontWeight: '700', color: 'var(--accent-primary)' }}>{item.symbol}</span>
              <span style={{ color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                {item.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
