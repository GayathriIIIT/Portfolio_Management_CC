import { useState } from 'react'
import ErrorBanner from './ErrorBanner'

export default function PortfolioFormModal({ initial, onSubmit, onClose }) {
  const isEdit = Boolean(initial)
  const [owner, setOwner] = useState(initial?.owner || '')
  const [name, setName] = useState(initial?.name || '')
  const [baseCurrency, setBaseCurrency] = useState(initial?.base_currency || 'USD')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!owner.trim() || !name.trim()) {
      setError('Owner and name are required.')
      return
    }
    setSaving(true)
    try {
      await onSubmit({ owner: owner.trim(), name: name.trim(), base_currency: baseCurrency.trim() || 'USD' })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3>{isEdit ? 'Edit Portfolio' : 'New Portfolio'}</h3>
        <ErrorBanner message={error} />
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="owner">Owner</label>
            <input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. Alice" autoFocus />
          </div>
          <div className="field">
            <label htmlFor="name">Portfolio name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Retirement" />
          </div>
          <div className="field">
            <label htmlFor="currency">Base currency</label>
            <input id="currency" value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="USD" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create portfolio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
