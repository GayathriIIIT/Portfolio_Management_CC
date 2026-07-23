import { useState } from 'react'
import ErrorBanner from './ErrorBanner'

export default function WhatIfModal({ holdings, onSubmit, onClose }) {
  const [scenarioName, setScenarioName] = useState('Market scenario')
  const [mode, setMode] = useState('manual')
  const [historicalDate, setHistoricalDate] = useState('')
  const [priceType, setPriceType] = useState('close')
  const [rows, setRows] = useState([
    { id: `row-${Date.now()}-0`, symbol: '', price: '', quantity: '1' },
  ])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const blankRow = () => ({
    id: `row-${Date.now()}-${Math.random()}`,
    symbol: '',
    price: '',
    quantity: '1',
  })

  function updateRow(id, field, value) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)))
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow()])
  }

  function removeRow(id) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const trimmedName = scenarioName.trim() || 'Scenario'
    const validRows = rows.map((row) => ({
      symbol: row.symbol.trim().toUpperCase(),
      price: row.price.trim(),
      quantity: row.quantity.trim(),
    })).filter((row) => row.symbol)

    if (validRows.length === 0) {
      setError('Add at least one stock symbol to run a scenario.')
      return
    }

    const symbols = validRows.map((row) => row.symbol)
    if (new Set(symbols).size !== symbols.length) {
      setError('Duplicate symbols are not allowed.')
      return
    }

    const quantities = {}
    for (const row of validRows) {
      if (row.quantity) {
        const parsedQuantity = parseFloat(row.quantity)
        if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
          setError('All quantities must be positive numbers.')
          return
        }
        if (parsedQuantity !== 1) {
          quantities[row.symbol] = parsedQuantity
        }
      }
    }

    let payload = { scenario_name: trimmedName }

    if (mode === 'manual') {
      const prices = {}
      for (const row of validRows) {
        const parsed = parseFloat(row.price)
        if (!Number.isFinite(parsed) || parsed <= 0) {
          setError(`Enter a valid positive price for ${row.symbol}.`)
          return
        }
        prices[row.symbol] = parsed
      }
      payload = { ...payload, symbols, prices }
    } else {
      if (!historicalDate) {
        setError('Select a historical date to run a date-based scenario.')
        return
      }
      payload = {
        ...payload,
        symbols,
        date: historicalDate,
        price_type: priceType,
      }
    }

    if (Object.keys(quantities).length > 0) {
      payload.quantities = quantities
    }

    setSaving(true)
    try {
      await onSubmit(payload)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>What-if scenario builder</h3>
            <p className="hint">Model a position change with either a manual price assumption or a historical market date and compare it against your current portfolio view.</p>
          </div>
        </div>

        <ErrorBanner message={error} />

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="scenarioName">Scenario label</label>
            <input
              id="scenarioName"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="e.g. Market rally, value rebound"
              autoFocus
            />
            <div className="hint">A friendly name for this comparison. It appears in the results summary.</div>
          </div>

          <div className="field">
            <label>Mode</label>
            <div className="radio-row">
              <label>
                <input
                  type="radio"
                  name="whatif-mode"
                  checked={mode === 'manual'}
                  onChange={() => setMode('manual')}
                />
                Manual price
              </label>
              <label>
                <input
                  type="radio"
                  name="whatif-mode"
                  checked={mode === 'historical'}
                  onChange={() => setMode('historical')}
                />
                Historical date
              </label>
            </div>
          </div>

          <div className="field-row">
            <div className="field field-grow">
              <label>Stocks</label>
              <div className="whatif-rows">
                {rows.map((row, index) => (
                  <div key={row.id} className="whatif-row whatif-row-input">
                    <div className="whatif-row-left">
                      <div className="field">
                        <label htmlFor={`symbol-${row.id}`}>Symbol</label>
                        <input
                          id={`symbol-${row.id}`}
                          value={row.symbol}
                          onChange={(e) => updateRow(row.id, 'symbol', e.target.value)}
                          placeholder="AAPL"
                          autoComplete="off"
                        />
                      </div>

                      {mode === 'manual' ? (
                        <div className="field">
                          <label htmlFor={`price-${row.id}`}>Base price</label>
                          <input
                            id={`price-${row.id}`}
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.price}
                            onChange={(e) => updateRow(row.id, 'price', e.target.value)}
                            placeholder="125.00"
                          />
                        </div>
                      ) : null}

                      <div className="field">
                        <label htmlFor={`quantity-${row.id}`}>Quantity</label>
                        <input
                          id={`quantity-${row.id}`}
                          type="number"
                          step="1"
                          min="1"
                          value={row.quantity}
                          onChange={(e) => updateRow(row.id, 'quantity', e.target.value)}
                          placeholder="1"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-link remove-row"
                      onClick={() => removeRow(row.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="hint">Add one or more stocks to compare. Use quantity to model a position size.</div>
            </div>
          </div>

          <div className="field-row">
            <button type="button" className="btn btn-secondary btn-small" onClick={addRow}>
              + Add stock
            </button>
          </div>

          {mode === 'historical' && (
            <div className="field-row">
              <div className="field field-grow">
                <label htmlFor="historicalDate">Historical date</label>
                <input
                  id="historicalDate"
                  type="date"
                  value={historicalDate}
                  onChange={(e) => setHistoricalDate(e.target.value)}
                />
              </div>
              <div className="field field-grow">
                <label htmlFor="priceType">Price type</label>
                <select id="priceType" value={priceType} onChange={(e) => setPriceType(e.target.value)}>
                  <option value="close">Close</option>
                  <option value="open">Open</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
          )}

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
