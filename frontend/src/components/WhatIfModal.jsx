import { useState } from 'react'
import ErrorBanner from './ErrorBanner'

export default function WhatIfModal({ holdings, onSubmit, onClose }) {
  const [scenarioName, setScenarioName] = useState('Market scenario')
  const [priceFields, setPriceFields] = useState(
    Object.fromEntries(
      holdings.map((holding) => [holding.symbol, Number(holding.current_price).toFixed(2)])
    )
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function updatePrice(symbol, value) {
    setPriceFields((prev) => ({ ...prev, [symbol]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const prices = {}
    for (const [symbol, value] of Object.entries(priceFields)) {
      const parsed = parseFloat(value)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError(`Enter a valid positive price for ${symbol}.`)
        return
      }
      prices[symbol] = parsed
    }

    setSaving(true)
    try {
      await onSubmit({ scenario_name: scenarioName.trim() || 'Scenario', prices })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3>What-If Analysis</h3>
        <p className="hint">Simulate alternate market prices without changing your portfolio data.</p>
        <ErrorBanner message={error} />
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="scenarioName">Scenario name</label>
            <input
              id="scenarioName"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="e.g. Market rally, downturn"
              autoFocus
            />
          </div>

          <div className="whatif-grid">
            {holdings.map((holding) => (
              <div key={holding.id} className="whatif-row">
                <div>
                  <div className="whatif-symbol">{holding.symbol}</div>
                  <div className="whatif-detail">Current ${Number(holding.current_price).toFixed(2)}</div>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceFields[holding.symbol]}
                  onChange={(e) => updatePrice(holding.symbol, e.target.value)}
                  aria-label={`Hypothetical price for ${holding.symbol}`}
                />
              </div>
            ))}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Simulating…' : 'Run simulation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
