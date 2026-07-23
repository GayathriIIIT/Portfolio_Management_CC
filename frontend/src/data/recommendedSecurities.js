/**
 * List of recommended securities for quick selection in the buy flow.
 * Format: { symbol, name, type }
 * Users can select from this list or type a custom symbol to buy any company.
 */

export const recommendedSecurities = [
  // Technology
  { symbol: "AAPL", name: "Apple Inc.", type: "STOCK" },
  { symbol: "MSFT", name: "Microsoft Corporation", type: "STOCK" },
  { symbol: "GOOGL", name: "Alphabet Inc.", type: "STOCK" },
  { symbol: "AMZN", name: "Amazon.com Inc.", type: "STOCK" },
  { symbol: "NVDA", name: "NVIDIA Corporation", type: "STOCK" },
  { symbol: "META", name: "Meta Platforms Inc.", type: "STOCK" },
  { symbol: "TSLA", name: "Tesla Inc.", type: "STOCK" },
  { symbol: "IBM", name: "IBM Corporation", type: "STOCK" },
  { symbol: "INTC", name: "Intel Corporation", type: "STOCK" },
  { symbol: "AMD", name: "Advanced Micro Devices", type: "STOCK" },

  // Finance & Banking
  { symbol: "JPM", name: "JPMorgan Chase & Co.", type: "STOCK" },
  { symbol: "BAC", name: "Bank of America", type: "STOCK" },
  { symbol: "WFC", name: "Wells Fargo & Company", type: "STOCK" },
  { symbol: "GS", name: "The Goldman Sachs Group", type: "STOCK" },
  { symbol: "BLK", name: "BlackRock Inc.", type: "STOCK" },

  // Healthcare & Pharma
  { symbol: "JNJ", name: "Johnson & Johnson", type: "STOCK" },
  { symbol: "UNH", name: "UnitedHealth Group", type: "STOCK" },
  { symbol: "PFE", name: "Pfizer Inc.", type: "STOCK" },
  { symbol: "MRK", name: "Merck & Co.", type: "STOCK" },
  { symbol: "ABBV", name: "AbbVie Inc.", type: "STOCK" },

  // Consumer & Retail
  { symbol: "WMT", name: "Walmart Inc.", type: "STOCK" },
  { symbol: "KO", name: "The Coca-Cola Company", type: "STOCK" },
  { symbol: "MCD", name: "McDonald's Corporation", type: "STOCK" },
  { symbol: "NKE", name: "Nike Inc.", type: "STOCK" },
  { symbol: "COST", name: "Costco Wholesale", type: "STOCK" },

  // Energy & Utilities
  { symbol: "XOM", name: "Exxon Mobil Corporation", type: "STOCK" },
  { symbol: "CVX", name: "Chevron Corporation", type: "STOCK" },
  { symbol: "NEE", name: "NextEra Energy", type: "STOCK" },
  { symbol: "DUK", name: "Duke Energy", type: "STOCK" },

  // Industrials & Manufacturing
  { symbol: "BA", name: "The Boeing Company", type: "STOCK" },
  { symbol: "CAT", name: "Caterpillar Inc.", type: "STOCK" },
  { symbol: "HON", name: "Honeywell International", type: "STOCK" },
  { symbol: "GE", name: "General Electric", type: "STOCK" },

  // Real Estate & Infrastructure
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", type: "STOCK" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", type: "STOCK" },
  { symbol: "IWM", name: "iShares Russell 2000 ETF", type: "STOCK" },
  { symbol: "EFA", name: "iShares MSCI EAFE ETF", type: "STOCK" },
];

/**
 * Filter and search recommended securities by query string.
 * Searches in both symbol and company name.
 */
export function searchSecurities(query) {
  if (!query || query.trim().length === 0) {
    return recommendedSecurities;
  }

  const lowerQuery = query.toLowerCase();
  return recommendedSecurities.filter(
    (sec) =>
      sec.symbol.toLowerCase().includes(lowerQuery) ||
      sec.name.toLowerCase().includes(lowerQuery)
  );
}
