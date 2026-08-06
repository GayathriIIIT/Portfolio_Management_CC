import React, { useState, useEffect, useRef } from 'react';
import { getRecentTickers, rememberTicker } from '../services/tickerCache';
import { api } from '../services/api';

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
];

// Cache for real-time quotes to avoid repeated fetches
const quoteCache = new Map();
const QUOTE_TTL = 30000; // 30 seconds

async function fetchQuote(symbol) {
  const cached = quoteCache.get(symbol);
  if (cached && Date.now() - cached.ts < QUOTE_TTL) {
    return cached.data;
  }
  try {
    const data = await api.getRealtimeQuote(symbol);
    quoteCache.set(symbol, { data, ts: Date.now() });
    return data;
  } catch {
    return null;
  }
}

function formatPrice(val, currency = 'USD') {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

function formatChange(change, changePct) {
  if (change == null || changePct == null) return '';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)} (${sign}${changePct.toFixed(2)}%)`;
}

export function TickerAutocomplete({ value, onChange, placeholder, style, className, required = false, onQuote }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [quotes, setQuotes] = useState({});
  const [loadingSymbols, setLoadingSymbols] = useState(new Set());
  const containerRef = useRef(null);
  const fetchedSymbolsRef = useRef(new Set());

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
    .slice(0, 8);

  // Fetch quotes for visible suggestions
  useEffect(() => {
    if (filtered.length === 0) return;
    
    const symbolsToFetch = filtered
      .map(f => f.symbol)
      .filter(s => !quotes[s] && !loadingSymbols.has(s) && !fetchedSymbolsRef.current.has(s));
    
    if (symbolsToFetch.length === 0) return;
    
    setLoadingSymbols(prev => new Set([...prev, ...symbolsToFetch]));
    fetchedSymbolsRef.current.add(...symbolsToFetch);

    Promise.all(
      symbolsToFetch.map(s => fetchQuote(s).then(data => ({ symbol: s, data })))
    ).then(results => {
      const newQuotes = {};
      results.forEach(({ symbol, data }) => {
        if (data) {
          newQuotes[symbol] = data;
          if (onQuote) onQuote(symbol, data);
        }
      });
      if (Object.keys(newQuotes).length > 0) {
        setQuotes(prev => ({ ...prev, ...newQuotes }));
      }
      setLoadingSymbols(prev => {
        const next = new Set(prev);
        symbolsToFetch.forEach(s => next.delete(s));
        return next;
      });
    });
  }, [filtered, quotes, loadingSymbols, onQuote]);

  // Handle click outside to close suggestions
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
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
        autoComplete="off"
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
          maxHeight: '280px',
          overflowY: 'auto'
        }}>
          {filtered.map((item) => {
            const quote = quotes[item.symbol];
            const isLoading = loadingSymbols.has(item.symbol);
            const currency = quote?.currency || 'USD';
            const price = quote?.price;
            const change = quote?.change;
            const changePct = quote?.changePercent;
            return (
              <div
                key={item.symbol}
                onClick={() => {
                  if (value && value.toUpperCase().trim() !== item.symbol.toUpperCase()) {
                    rememberTicker(value.toUpperCase().trim());
                  }
                  onChange(item.symbol);
                  setShowSuggestions(false);
                }}
                onMouseDown={(e) => e.preventDefault()}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-color-light)',
                  transition: 'background-color 0.1s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span style={{ fontWeight: '700', color: 'var(--accent-primary)', fontSize: '0.85rem' }}>
                      {item.symbol}
                    </span>
                    {item.name && (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                        {item.name}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                    {isLoading ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Loading...</span>
                    ) : price != null ? (
                      <>
                        <span style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatPrice(price, currency)}
                        </span>
                        {change != null && changePct != null && (
                          <span style={{ 
                            fontSize: '0.7rem', 
                            fontWeight: '600',
                            color: change >= 0 ? 'var(--success-text)' : 'var(--danger-text)',
                            whiteSpace: 'nowrap'
                          }}>
                            {formatChange(change, changePct)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No quote</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center' }}>
              No matching tickers found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
