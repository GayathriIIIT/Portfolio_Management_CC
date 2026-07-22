function formatMoney(value) {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function HoldingsTable({ holdings, onSell, onEdit }) {
  if (holdings.length === 0) {
    return <div className="empty-state">No holdings yet. Use "Buy" to add your first security.</div>
  }

  return (
    <div className="card table-card">
      <table className="holdings-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th className="num">Quantity</th>
            <th className="num">Avg. Cost</th>
            <th className="num">Current Price</th>
            <th className="num">Market Value</th>
            <th className="num">Unrealized P&amp;L</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const gain = h.unrealized_pl >= 0
            return (
              <tr key={h.id}>
                <td>
                  <span className="symbol-badge">{h.symbol}</span>
                </td>
                <td className="num">{h.quantity}</td>
                <td className="num">${formatMoney(h.purchase_price)}</td>
                <td className="num">${formatMoney(h.current_price)}</td>
                <td className="num">${formatMoney(h.market_value)}</td>
                <td className={`num ${gain ? 'pl-gain' : 'pl-loss'}`}>
                  {gain ? '+' : ''}${formatMoney(h.unrealized_pl)} ({gain ? '+' : ''}
                  {Number(h.unrealized_pl_pct).toFixed(2)}%)
                </td>
                <td>
                  <div className="row-actions">
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
