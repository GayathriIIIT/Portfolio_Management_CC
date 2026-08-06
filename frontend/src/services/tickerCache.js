const STORAGE_KEY = 'pm_recent_tickers';
const MAX = 15;

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
  list.unshift({ 
    symbol: sym, 
    name: name || '',
    lastUsed: Date.now(),
    useCount: 1
  });

  // Merge with existing if same symbol was found
  const existingIdx = list.findIndex(t => t.symbol === sym);
  if (existingIdx > 0) {
    list[0].useCount = (list[existingIdx].useCount || 0) + 1;
    list.splice(existingIdx, 1);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // storage unavailable (private mode, quota, etc.) - fail silently
  }
}

export function clearTickerCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
