const API_BASE = '/api/portfolios';

async function request(endpoint, options = {}) {
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(endpoint, config);

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.error || data.message || `HTTP ${response.status} Error`;
    throw new Error(errorMsg);
  }

  return data;
}

export const api = {
  // Portfolios
  getPortfolios: () => request(API_BASE),
  getPortfolio: (id) => request(`${API_BASE}/${id}`),
  createPortfolio: (payload) => request(API_BASE, { method: 'POST', body: payload }),
  updatePortfolio: (id, payload) => request(`${API_BASE}/${id}`, { method: 'PUT', body: payload }),
  deletePortfolio: (id) => request(`${API_BASE}/${id}`, { method: 'DELETE' }),

  // Analytics & Performance Charts
  getPortfolioAnalytics: (id) => request(`${API_BASE}/${id}/analytics`),
  getPortfolioChartData: (id, range = '1m') => request(`${API_BASE}/${id}/analytics/chart?range=${range}`),
  refreshPortfolioPrices: (id, payload = {}) => request(`${API_BASE}/${id}/refresh-prices`, { method: 'POST', body: payload }),

  // Holdings
  getHoldings: (portfolioId) => request(`${API_BASE}/${portfolioId}/holdings`),
  addHolding: (portfolioId, payload) => request(`${API_BASE}/${portfolioId}/holdings`, { method: 'POST', body: payload }),
  updateHolding: (portfolioId, holdingId, payload) => request(`${API_BASE}/${portfolioId}/holdings/${holdingId}`, { method: 'PUT', body: payload }),
  deleteHolding: (portfolioId, holdingId) => request(`${API_BASE}/${portfolioId}/holdings/${holdingId}`, { method: 'DELETE' }),

  // Buy & Sell Trading
  buyHolding: (portfolioId, payload) => request(`${API_BASE}/${portfolioId}/buy`, { method: 'POST', body: payload }),
  sellHolding: (portfolioId, payload) => request(`${API_BASE}/${portfolioId}/sell`, { method: 'POST', body: payload }),
  depositCash: (portfolioId, payload) => request(`${API_BASE}/${portfolioId}/deposit`, { method: 'POST', body: payload }),
  withdrawCash: (portfolioId, payload) => request(`${API_BASE}/${portfolioId}/withdraw`, { method: 'POST', body: payload }),

  // Ledger / Transactions History
  getTransactions: (portfolioId) => request(`${API_BASE}/${portfolioId}/transactions`),

  // What-If Simulation
  runWhatIf: (portfolioId, payload) => request(`${API_BASE}/${portfolioId}/what-if`, { method: 'POST', body: payload }),
  getWhatIfList: (portfolioId) => request(`${API_BASE}/${portfolioId}/what-if`),
  deleteWhatIfEntry: (portfolioId, whatifId) => request(`${API_BASE}/${portfolioId}/what-if/${whatifId}`, { method: 'DELETE' }),

  // Real-time market quote lookup
  getRealtimeQuote: (symbol) => request(`${API_BASE}/market_price/realtime?symbol=${encodeURIComponent(symbol)}`),
};
