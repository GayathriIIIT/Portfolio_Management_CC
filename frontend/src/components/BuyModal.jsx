import { useEffect, useState, useRef } from 'react'
import ErrorBanner from './ErrorBanner'
import { getRealtimeMarketPrice } from '../api/portfolios'
import { searchSecurities } from '../data/recommendedSecurities'

export default function BuyModal({ onSubmit, onClose }) {
  const [symbol, setSymbol] = useState('')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [marketPrice, setMarketPrice] = useState(null)
  const [priceError, setPriceError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [fetchingPrice, setFetchingPrice] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    setMarketPrice(null)
    setPrice('')
    setPriceError('')
  }, [symbol])

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSymbolChange(e) {
    const value = e.target.value
    setSymbol(value)
    if (value.trim().length > 0) {
      const filtered = searchSecurities(value)
      setSuggestions(filtered.slice(0, 8))
      setShowSuggestions(true)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }

  function selectSecurity(sec) {
    setSymbol(sec.symbol)
    setSuggestions([])
    setShowSuggestions(false)
  }

  async function fetchLivePrice() {
    const symbolValue = symbol.trim().toUpperCase()
    if (!symbolValue) {
      setPriceError('Enter a ticker symbol first.')
      return null
    }

    setPriceError('')
    setFetchingPrice(true)
    try {
      const result = await getRealtimeMarketPrice(symbolValue)
      const roundedPrice = Number(result.price.toFixed(2))
      setMarketPrice(roundedPrice)
      setPrice(String(roundedPrice))
      return roundedPrice
    } catch (err) {
      setPriceError(err.message)
      return null
    } finally {
      setFetchingPrice(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const qty = parseInt(quantity, 10)
    const trimmedPrice = String(price).trim()

    if (!symbol.trim()) {
      setError('Symbol is required.')
      return
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      setError('Quantity must be a positive whole number.')
      return
    }

    setSaving(true)
    try {
      let unitPrice = null
      if (trimmedPrice) {
        unitPrice = parseFloat(trimmedPrice)
        if (!(unitPrice > 0)) {
          setError('Purchase price must be a positive number.')
          setSaving(false)
          return
        }
      } else {
        unitPrice = marketPrice ?? await fetchLivePrice()
      }

      if (!(unitPrice > 0)) {
        setError('Unable to retrieve a live price for this security.')
        setSaving(false)
        return
      }

      const payload = { symbol: symbol.trim().toUpperCase(), quantity: qty, price: unitPrice }
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
            <h3>Buy security</h3>
            <p className="hint">Capture a trade with a live quote so the transaction stays aligned with the current market price.</p>
          </div>
        </div>
        <ErrorBanner message={error} />
        <form onSubmit={handleSubmit}>
          <div className="field" ref={dropdownRef} style={{ position: 'relative' }}>
            <label htmlFor="symbol">Symbol</label>
            <input
              id="symbol"
              value={symbol}
              onChange={handleSymbolChange}
              onFocus={() => symbol.trim().length > 0 && setShowSuggestions(true)}
              placeholder="e.g. AAPL or search company name"
              autoFocus
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: '#ffffff',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                maxHeight: '250px',
                overflowY: 'auto',
                zIndex: 10,
                marginTop: '4px',
              }}>
                {suggestions.map((sec, index) => (
                  <div
                    key={index}
                    onClick={() => selectSecurity(sec)}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderBottom: index < suggestions.length - 1 ? '1px solid #f0f0f0' : 'none',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                  >
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{sec.symbol}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>{sec.name}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="hint">Search by symbol or company name. Any symbol can be added—not just the suggestions.</div>
          </div>
          {symbol && (
            <div className="hint" style={{ backgroundColor: '#f0f7ff', padding: '8px 12px', borderRadius: '4px', fontSize: '13px', color: '#0066cc', marginBottom: '16px' }}>
              💡 Tip: If you already own {symbol}, the purchase will automatically calculate your weighted-average cost.
            </div>
          )}
          <div className="field">
            <label htmlFor="quantity">Quantity</label>
            <input id="quantity" type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 10" />
          </div>
          <div className="field">
            <div className="field-row">
              <div>
                <label htmlFor="price">Live purchase price</label>
                <input id="price" type="text" value={price} readOnly placeholder="Fetch a live quote" />
                <div className="hint">The price is populated from the latest Yahoo Finance quote and can’t be edited manually.</div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={fetchLivePrice}
                disabled={!symbol.trim() || fetchingPrice}
              >
                {fetchingPrice ? 'Loading…' : 'Fetch live quote'}
              </button>
            </div>
            {marketPrice !== null && (
              <div className="live-price">
                Current market price: <strong>${marketPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
            )}
            {priceError && <div className="error-text">{priceError}</div>}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Buying…' : 'Buy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
