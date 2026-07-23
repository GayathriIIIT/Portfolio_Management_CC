import { get, post, put, del } from './client'

const BASE = '/api/portfolios'

export const listPortfolios = () => get(BASE)
export const getPortfolio = (id) => get(`${BASE}/${id}`)
export const getPortfolioAnalytics = (id) => get(`${BASE}/${id}/analytics`)
export const getPortfolioChartData = (id, range = '1d') => get(`${BASE}/${id}/analytics/chart?range=${encodeURIComponent(range)}`)
export const getPortfolioTransactions = (id) => get(`${BASE}/${id}/transactions`)
export const portfolioWhatIf = (id, data) => post(`${BASE}/${id}/what-if`, data)
export const getPortfolioWhatIfEntries = (id) => get(`${BASE}/${id}/what-if`)
export const deletePortfolioWhatIfEntry = (portfolioId, entryId) => del(`${BASE}/${portfolioId}/what-if/${entryId}`)
export const getRealtimeMarketPrice = (symbol) => get(`${BASE}/market_price/realtime?symbol=${encodeURIComponent(symbol)}`)
export const refreshPortfolioPrices = (id, data = {}) => post(`${BASE}/${id}/refresh-prices`, data)
export const createPortfolio = (data) => post(BASE, data)
export const updatePortfolio = (id, data) => put(`${BASE}/${id}`, data)
export const deletePortfolio = (id) => del(`${BASE}/${id}`)
