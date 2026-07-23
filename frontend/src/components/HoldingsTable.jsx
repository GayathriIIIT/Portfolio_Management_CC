function formatMoney(value) {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getCurrencySymbol(currency) {
  const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: '₣', CAD: 'C$', AUD: 'A$', INR: '₹' }
  return symbols[currency] || currency
}

export default function HoldingsTable({ holdings, onSell, onEdit, onRefresh }) {
  if (holdings.length === 0) {
    return <div className="empty-state">No holdings yet. Use "Buy" to add your first security.</div>
  }

  return (
    <div className="card table-card">
      <table className="holdings-table-pro">
        <thead>
          <tr>
            <th className="symbol-col">Security</th>
            <th className="num">Quantity</th>
            <th className="num">Avg. Cost</th>
            <th className="num">Current Price</th>
            <th className="num">Market Value</th>
            <th className="num">Unrealized P&amp;L</th>
            <th className="action-col"></th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const gain = h.unrealized_pl >= 0
            const currencySymbol = getCurrencySymbol(h.currency || 'USD')
            return (
              <tr key={h.id} className="holdings-row-pro">
                <td className="symbol-col">
                  <div className="symbol-cell">
                    <div className="symbol-main">
                      <span className="symbol-badge-pro">{h.symbol}</span>
                      <span className="symbol-name">{h.name || 'N/A'}</span>
                    </div>
                    <div className="symbol-meta">
                      <span className="exchange-meta">{h.exchange || 'N/A'}</span>
                      <span className="currency-meta">{h.currency || 'USD'}</span>
                    </div>
                  </div>
                </td>
                <td className="num">{h.quantity}</td>
                <td className="num">
                  <span className="money-value">{currencySymbol}{formatMoney(h.purchase_price)}</span>
                </td>
                <td className="num">
                  <div className="price-cell-pro">
                    <span className="money-value">{currencySymbol}{formatMoney(h.current_price)}</span>
                    <button type="button" className="icon-button-pro" onClick={() => onRefresh?.([h.symbol])} title={`Refresh ${h.symbol} price`}>
                      ↻
                    </button>
                  </div>
                </td>
                <td className="num">
                  <span className="money-value">{currencySymbol}{formatMoney(h.market_value)}</span>
                </td>
                <td className={`num ${gain ? 'pl-gain' : 'pl-loss'}`}>
                  <div className="pl-cell-pro">
                    <span>{gain ? '+' : ''}{currencySymbol}{formatMoney(h.unrealized_pl)}</span>
                    <span className="pl-pct">({gain ? '+' : ''}{Number(h.unrealized_pl_pct).toFixed(2)}%)</span>
                  </div>
                </td>
                <td className="action-col">
                  <div className="row-actions-pro">
                    <button className="btn btn-secondary btn-sm" onClick={() => onEdit(h)}>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => onSell(h)}>
                      Sell
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
