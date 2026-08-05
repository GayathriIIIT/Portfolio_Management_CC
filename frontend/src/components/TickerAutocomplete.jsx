import React, { useState } from 'react';
import { getRecentTickers, rememberTicker } from '../services/tickerCache';

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
  { symbol: 'BND', name: 'Vanguard Total Bond ETF' },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury ETF' },
  { symbol: 'IEF', name: 'iShares 7-10 Year Treasury ETF' },
  { symbol: 'SHY', name: 'iShares 1-3 Year Treasury ETF' },
  { symbol: 'AGG', name: 'Vanguard Total Bond Market ETF' },
  { symbol: 'LQD', name: 'iShares iBoxx $ Investment Grade Corporate Bond ETF' },
  { symbol: 'HYG', name: 'iShares iBoxx $ High Yield Corporate Bond ETF' },
  { symbol: 'MUB', name: 'iShares National Muni Bond ETF' },
  { symbol: 'TIP', name: 'iShares TIPS Bond ETF' },
  { symbol: 'VGLT', name: 'Vanguard Long-Term Treasury ETF' },
  { symbol: 'BNDX', name: 'Vanguard Total International Bond ETF' },
  { symbol: 'SCHO', name: 'Schwab Short-Term U.S. Treasury ETF' },
  { symbol: 'US10Y-2030', name: 'US 10Y Note 2030' },
  { symbol: 'USD-CASH', name: 'US Dollar Cash' },
];

export function TickerAutocomplete({ value, onChange, placeholder, style, className, required = false }) {
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Remembered tickers (from earlier successful trades/holdings) take
  // precedence, then the built-in popular list. This way a symbol like "AA"
  // that a user has used before keeps showing up as a suggestion.
  const knownTickers = [];
  const seen = new Set();
  for (const t of getRecentTickers()) {
    const sym = String(t.symbol).toUpperCase();
    if (seen.has(sym)) continue;
    seen.add(sym);
    knownTickers.push({ symbol: sym, name: t.name || '' });
  }
  for (const t of POPULAR_SUGGESTIONS) {
    if (seen.has(t.symbol)) continue;
    seen.add(t.symbol);
    knownTickers.push(t);
  }

  const query = value.toUpperCase().trim();
  const filtered = knownTickers
    .filter(
      (item) =>
        item.symbol.startsWith(query) ||
        (item.name && item.name.toLowerCase().includes(value.toLowerCase()))
    )
    .slice(0, 5);

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
                // Remember the symbol the user actually typed (e.g. "AA"), not
                // just the resolved suggestion (e.g. "AAPL"), so re-entering
                // "AA" surfaces "AA" in the recent-ticker cache too.
                if (value && value.toUpperCase().trim() !== item.symbol.toUpperCase()) {
                  rememberTicker(value.toUpperCase().trim());
                }
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
