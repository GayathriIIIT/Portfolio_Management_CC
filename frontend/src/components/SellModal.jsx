import { useState } from 'react'
import ErrorBanner from './ErrorBanner'

export default function SellModal({ holding, onSellPartial, onSellAll, onClose }) {
  const [mode, setMode] = useState('partial')
  const [sellQty, setSellQty] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (mode === 'all') {
        await onSellAll()
        return
      }

      const qty = parseInt(sellQty, 10)
      if (!Number.isInteger(qty) || qty <= 0) {
        setError('Enter a positive whole number of shares to sell.')
        setSaving(false)
        return
      }
      if (qty > holding.quantity) {
        setError(`You only hold ${holding.quantity} shares. Sell all instead if you want to liquidate.`)
        setSaving(false)
        return
      }

      await onSellPartial(qty)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Sell {holding.symbol}</h3>
        <ErrorBanner message={error} />
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Current market price</label>
            <div className="price-display">
              ${holding.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="hint">The backend will use the latest market quote if the price is omitted.</div>
          </div>
          <div className="radio-row">
            <label>
              <input type="radio" name="mode" checked={mode === 'partial'} onChange={() => setMode('partial')} />
              Sell some
            </label>
            <label>
              <input type="radio" name="mode" checked={mode === 'all'} onChange={() => setMode('all')} />
              Sell all ({holding.quantity})
            </label>
          </div>

          {mode === 'partial' && (
            <div className="field">
              <label htmlFor="sellQty">Shares to sell</label>
              <input
                id="sellQty"
                type="number"
                min="1"
                max={holding.quantity}
                step="1"
                value={sellQty}
                onChange={(e) => setSellQty(e.target.value)}
                placeholder={`1 - ${holding.quantity}`}
                autoFocus
              />
              <div className="hint">Currently holding {holding.quantity} shares.</div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-danger" disabled={saving}>
              {saving ? 'Selling…' : 'Sell'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
