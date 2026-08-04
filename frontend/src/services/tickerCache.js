const STORAGE_KEY = 'pm_recent_tickers';
const MAX = 12;

export function getRecentTickers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter((t) => t && t.symbol && typeof t.symbol === 'string')
      : [];
  } catch {
    return [];
  }
}

export function rememberTicker(symbol, name = '') {
  if (!symbol) return;
  const sym = String(symbol).toUpperCase().trim();
  if (!sym) return;

  const list = getRecentTickers().filter((t) => t.symbol !== sym);
  list.unshift({ symbol: sym, name: name || '' });

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // storage unavailable (private mode, quota, etc.) - fail silently
  }
}
