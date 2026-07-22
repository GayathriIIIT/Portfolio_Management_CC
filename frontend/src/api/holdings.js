import { post, put, del } from './client'

const base = (portfolioId) => `/api/portfolios/${portfolioId}`

export const buyHolding = (portfolioId, data) => post(`${base(portfolioId)}/buy`, data)

export const sellHolding = (portfolioId, data) => post(`${base(portfolioId)}/sell`, data)

export const updateHolding = (portfolioId, holdingId, data) =>
  put(`${base(portfolioId)}/holdings/${holdingId}`, data)

export const liquidateHolding = (portfolioId, holdingId) =>
  del(`${base(portfolioId)}/holdings/${holdingId}`)
