import { useState } from 'react'
import ErrorBanner from './ErrorBanner'

export default function EditHoldingModal({ holding, onSubmit, onClose }) {
  const [quantity, setQuantity] = useState(String(holding.quantity))
  const [purchasePrice, setPurchasePrice] = useState(String(holding.purchase_price))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const qty = parseInt(quantity, 10)
    const price = parseFloat(purchasePrice)

    if (!Number.isInteger(qty) || qty <= 0) {
      setError('Quantity must be a positive whole number.')
      return
    }
    if (!(price > 0)) {
      setError('Purchase price must be a positive number.')
      return
    }

    setSaving(true)
    try {
      await onSubmit({ quantity: qty, purchase_price: price })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Edit {holding.symbol}</h3>
        <ErrorBanner message={error} />
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="edit-quantity">Quantity</label>
            <input id="edit-quantity" type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="edit-price">Purchase price</label>
            <input id="edit-price" type="number" min="0" step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
            <div className="hint">This overwrites the stored average cost directly.</div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
