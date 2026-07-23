import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getPortfolio, getPortfolioAnalytics, getPortfolioChartData, getPortfolioTransactions, portfolioWhatIf, getPortfolioWhatIfEntries, deletePortfolioWhatIfEntry, deletePortfolio, updatePortfolio, refreshPortfolioPrices } from '../api/portfolios'
import { buyHolding, sellHolding, updateHolding } from '../api/holdings'
import HoldingsTable from './HoldingsTable'
import BuyModal from './BuyModal'
import SellModal from './SellModal'
import EditHoldingModal from './EditHoldingModal'
import WhatIfModal from './WhatIfModal'
import PortfolioFormModal from './PortfolioFormModal'
import ConfirmDialog from './ConfirmDialog'
import ErrorBanner from './ErrorBanner'
import Spinner from './Spinner'

function PortfolioChart({ series, loading, range, portfolio }) {
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const svgRef = useRef(null)

  const chartRangeSubtitles = {
    '1d': '5-minute interval',
    '7d': '30-minute interval',
    '1m': 'Hourly interval',
    '3m': 'Daily trend',
    '6m': 'Daily trend',
    '1y': 'Daily trend',
  }

  const getCurrencySymbol = (currency) => {
    const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: '₣', CAD: 'C$', AUD: 'A$', INR: '₹' }
    return symbols[currency] || currency
  }

  if (loading) {
    return <div className="empty-state">Loading chart data…</div>
  }

  if (!series || series.length === 0) {
    return <div className="empty-state">Chart data will appear here once price history is available.</div>
  }

  const width = 600
  const height = 320
  const leftPadding = 60
  const rightPadding = 20
  const topPadding = 30
  const bottomPadding = 40
  const colors = ['#7e53c0', '#3a7f65', '#b8506b', '#2e7dd1', '#d97706', '#06b6d4']

  return (
    <div className="chart-stack">
      {series.map((entry, index) => {
        const points = entry.points || []
        if (points.length === 0) return null

        const holding = portfolio?.holdings?.find(h => h.symbol === entry.symbol)
        const currency = holding?.currency || 'USD'
        const exchange = holding?.exchange || 'N/A'

        const values = points.map((point) => Number(point.price)).filter((value) => Number.isFinite(value))
        const minValue = Math.min(...values)
        const maxValue = Math.max(...values)
        const span = maxValue - minValue || 1
        const paddedMin = minValue - span * 0.15
        const paddedMax = maxValue + span * 0.15
        const paddedSpan = paddedMax - paddedMin

        const chartWidth = width - leftPadding - rightPadding
        const chartHeight = height - topPadding - bottomPadding

        const linePoints = points.map((point, pointIndex) => {
          const x = leftPadding + (pointIndex / Math.max(points.length - 1, 1)) * chartWidth
          const y = topPadding + chartHeight - ((Number(point.price) - paddedMin) / paddedSpan) * chartHeight
          return `${x},${y}`
        }).join(' ')

        const latestValue = points[points.length - 1]?.price
        const firstValue = points[0]?.price
        const delta = latestValue != null && firstValue != null ? latestValue - firstValue : 0

        const handleMouseMove = (e) => {
          if (!svgRef.current) return
          const svg = svgRef.current
          const rect = svg.getBoundingClientRect()
          const x = e.clientX - rect.left
          const relativeX = (x - leftPadding) / chartWidth
          const pointIndex = Math.round(relativeX * (points.length - 1))
          if (pointIndex >= 0 && pointIndex < points.length) {
            setHoveredPoint({ ...points[pointIndex], index: pointIndex, symbol: entry.symbol, exchange, currency })
          }
        }

        const handleMouseLeave = () => {
          setHoveredPoint(null)
        }

        const yAxisLabels = []
        for (let i = 0; i <= 4; i++) {
          const value = paddedMin + (i / 4) * paddedSpan
          yAxisLabels.push(value)
        }

        return (
          <div key={entry.symbol} className="card chart-card-pro">
            <div className="chart-card-head-pro">
              <div className="chart-title-section">
                <div className="chart-title">{entry.symbol}</div>
                <div className="chart-meta">
                  <span className="exchange-badge">{exchange}</span>
                  <span className="currency-badge">{currency}</span>
                </div>
                <div className="chart-subtitle">{chartRangeSubtitles[range] || 'Price history'}</div>
              </div>
              <div className={`chart-delta-pro ${delta >= 0 ? 'pl-gain' : 'pl-loss'}`}>
                <div className="delta-value">{delta >= 0 ? '+' : ''}{getCurrencySymbol(currency)}{Math.abs(delta).toFixed(2)}</div>
                <div className="delta-pct">
                  {delta >= 0 ? '+' : ''}{((delta / firstValue) * 100).toFixed(2)}%
                </div>
              </div>
            </div>
            
            <div className="chart-container-pro" ref={svgRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
              <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg-pro" role="img" aria-label={`${entry.symbol} price chart`}>
                {/* Grid lines */}
                {yAxisLabels.map((_, i) => {
                  const y = topPadding + (i / 4) * chartHeight
                  return <line key={`grid-${i}`} x1={leftPadding} y1={y} x2={width - rightPadding} y2={y} className="chart-grid-line" />
                })}
                
                {/* Axes */}
                <line x1={leftPadding} y1={topPadding} x2={leftPadding} y2={topPadding + chartHeight} className="chart-axis-pro" />
                <line x1={leftPadding} y1={topPadding + chartHeight} x2={width - rightPadding} y2={topPadding + chartHeight} className="chart-axis-pro" />
                
                {/* Y-axis labels */}
                {yAxisLabels.map((value, i) => {
                  const y = topPadding + (i / 4) * chartHeight
                  return (
                    <g key={`y-label-${i}`}>
                      <line x1={leftPadding - 5} y1={y} x2={leftPadding} y2={y} className="chart-tick" />
                      <text x={leftPadding - 10} y={y + 4} className="chart-axis-label" textAnchor="end">
                        {getCurrencySymbol(currency)}{value.toFixed(0)}
                      </text>
                    </g>
                  )
                })}
                
                {/* Chart line */}
                <polyline points={linePoints} fill="none" stroke={colors[index % colors.length]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="chart-line-pro" />
                
                {/* Hover indicator */}
                {hoveredPoint && hoveredPoint.symbol === entry.symbol && (
                  <>
                    <circle cx={leftPadding + (hoveredPoint.index / Math.max(points.length - 1, 1)) * chartWidth} cy={topPadding + chartHeight - ((Number(hoveredPoint.price) - paddedMin) / paddedSpan) * chartHeight} r="5" className="hover-dot" />
                  </>
                )}
              </svg>
              
              {/* Hover tooltip */}
              {hoveredPoint && hoveredPoint.symbol === entry.symbol && (
                <div className="chart-tooltip">
                  <div className="tooltip-content">
                    <div className="tooltip-row">
                      <span className="tooltip-label">Price:</span>
                      <span className="tooltip-value">{getCurrencySymbol(currency)}{Number(hoveredPoint.price).toFixed(2)}</span>
                    </div>
                    <div className="tooltip-row">
                      <span className="tooltip-label">Time:</span>
                      <span className="tooltip-value">{new Date(hoveredPoint.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="tooltip-row">
                      <span className="tooltip-label">Symbol:</span>
                      <span className="tooltip-value font-bold">{entry.symbol}</span>
                    </div>
                    <div className="tooltip-row">
                      <span className="tooltip-label">Exchange:</span>
                      <span className="tooltip-value">{exchange}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="chart-footer-pro">Price shown in {getCurrencySymbol(currency)}{currency}</div>
          </div>
        )
      })}
    </div>
  )
}

export default function PortfolioDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [portfolio, setPortfolio] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [whatIfResult, setWhatIfResult] = useState(null)
  const [whatIfEntries, setWhatIfEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshingPrices, setRefreshingPrices] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [chartSeries, setChartSeries] = useState([])
  const [chartLoading, setChartLoading] = useState(false)
  const [chartRange, setChartRange] = useState('1d')
  const chartRanges = [
    { key: '1d', label: '1D' },
    { key: '7d', label: '1W' },
    { key: '1m', label: '1M' },
    { key: '3m', label: '3M' },
    { key: '6m', label: '6M' },
    { key: '1y', label: '1Y' },
  ]
  const chartRangeSubtitles = {
    '1d': '5-minute interval',
    '7d': '30-minute interval',
    '1m': 'Hourly interval',
    '3m': 'Daily trend',
    '6m': 'Daily trend',
    '1y': 'Daily trend',
  }
  const [menuOpen, setMenuOpen] = useState(false)
  const [lastRefreshAt, setLastRefreshAt] = useState(null)

  const [showBuy, setShowBuy] = useState(false)
  const [showWhatIf, setShowWhatIf] = useState(false)
  const [sellTarget, setSellTarget] = useState(null)
  const [editHoldingTarget, setEditHoldingTarget] = useState(null)
  const [editPortfolio, setEditPortfolio] = useState(false)
  const [confirmDeletePortfolio, setConfirmDeletePortfolio] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'holdings', label: 'Holdings' },
    { key: 'whatif', label: 'What-If' },
    { key: 'activity', label: 'Activity' },
  ]

  async function loadChartData(range = '1d') {
    if (!id) return
    setChartLoading(true)
    try {
      const data = await getPortfolioChartData(id, range)
      setChartSeries(data.series || [])
      setChartRange(range)
    } catch (err) {
      setError(err.message)
    } finally {
      setChartLoading(false)
    }
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [data, analyticsData, transactionsData, whatIfData] = await Promise.all([
        getPortfolio(id),
        getPortfolioAnalytics(id),
        getPortfolioTransactions(id),
        getPortfolioWhatIfEntries(id),
      ])
      setPortfolio(data)
      setAnalytics(analyticsData)
      setTransactions(transactionsData)
      setWhatIfEntries(whatIfData)
      setWhatIfResult(null)
      await loadChartData('1d')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  useEffect(() => {
    if (!id) return
    const intervalId = window.setInterval(() => {
      handleRefreshPrices()
    }, 2 * 60 * 1000)
    return () => window.clearInterval(intervalId)
  }, [id])

  async function handleBuy(payload) {
    await buyHolding(id, payload)
    setShowBuy(false)
    load()
  }

  async function handleRefreshPrices(symbols) {
    const normalizedSymbols = Array.isArray(symbols)
      ? symbols.filter(Boolean)
      : symbols ? [symbols] : []

    setRefreshingPrices(true)
    setError('')
    try {
      const result = await refreshPortfolioPrices(id, normalizedSymbols.length > 0 ? { symbols: normalizedSymbols } : {})
      setPortfolio(result.portfolio)
      setAnalytics(result.analytics)
      setLastRefreshAt(new Date())

      if (sellTarget && normalizedSymbols.length === 1) {
        const refreshedHolding = result.portfolio.holdings.find((holding) => holding.symbol === normalizedSymbols[0])
        if (refreshedHolding) {
          setSellTarget((prev) => (prev && prev.symbol === refreshedHolding.symbol ? { ...prev, ...refreshedHolding } : prev))
        }
      }

      if (result.errors && Object.keys(result.errors).length > 0) {
        setError(`Unable to refresh ${Object.keys(result.errors).join(', ')}.`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshingPrices(false)
    }
  }

  async function handleSellPartial(quantity) {
    await sellHolding(id, { symbol: sellTarget.symbol, quantity, price: sellTarget.current_price })
    setSellTarget(null)
    load()
  }

  async function handleSellAll() {
    await sellHolding(id, { symbol: sellTarget.symbol, quantity: sellTarget.quantity, price: sellTarget.current_price })
    setSellTarget(null)
    load()
  }

  async function handleEditHolding(payload) {
    await updateHolding(id, editHoldingTarget.id, payload)
    setEditHoldingTarget(null)
    load()
  }

  async function handleWhatIf(payload) {
    const result = await portfolioWhatIf(id, payload)
    setWhatIfResult(result)
    setShowWhatIf(false)

    try {
      const entries = await getPortfolioWhatIfEntries(id)
      setWhatIfEntries(entries)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteWhatIfEntry(entryId) {
    setError('')
    try {
      await deletePortfolioWhatIfEntry(id, entryId)
      setWhatIfEntries((prev) => prev.filter((entry) => entry.id !== entryId))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleEditPortfolio(payload) {
    await updatePortfolio(id, payload)
    setEditPortfolio(false)
    load()
  }

  async function handleDeletePortfolio() {
    setDeleting(true)
    try {
      await deletePortfolio(id)
      navigate('/')
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  if (loading) return <Spinner />

  if (!portfolio) {
    return (
      <>
        <button className="back-link" onClick={() => navigate('/')}>
          ← Back to portfolios
        </button>
        <ErrorBanner message={error || 'Portfolio not found.'} />
      </>
    )
  }

  return (
    <>
      <button className="back-link" onClick={() => navigate('/')}>
        ← Back to portfolios
      </button>

      <div className="page-head page-head-detail">
        <div>
          <div className="page-overline">CC · Portfolio Intelligence</div>
          <h1>{portfolio.name}</h1>
          <p className="page-intro">A focused workspace for live pricing, portfolio posture, and scenario planning.</p>
        </div>

        <div className="detail-actions detail-actions-top">
          <button className="btn btn-secondary" onClick={() => setShowWhatIf(true)}>
            What-If
          </button>
          <button className="btn btn-secondary" onClick={() => handleRefreshPrices()} disabled={refreshingPrices}>
            {refreshingPrices ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowBuy(true)}>
            + Buy
          </button>
          <button className="btn btn-secondary" onClick={() => setEditPortfolio(true)}>
            Edit
          </button>
          <button className="btn btn-danger" onClick={() => setConfirmDeletePortfolio(true)}>
            Delete
          </button>
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="detail-summary-grid">
        <div className="metric-card">
          <span>Invested value</span>
          <strong>${analytics?.invested_value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </div>
        <div className="metric-card">
          <span>Current value</span>
          <strong>${analytics?.current_value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </div>
        <div className="metric-card">
          <span>Profit / Loss</span>
          <strong className={analytics?.profit_loss >= 0 ? 'pl-gain' : 'pl-loss'}>
            ${analytics?.profit_loss?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </strong>
          <small>{analytics?.profit_loss_percentage?.toFixed(2)}%</small>
        </div>
      </div>

      <div className="card detail-tab-shell">
        <div className="detail-tab-header">
          <button type="button" className="detail-hamburger" onClick={() => setMenuOpen((prev) => !prev)} aria-label="Open feature tabs">
            ☰
          </button>
          <div className={`detail-tab-list ${menuOpen ? 'open' : ''}`}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`detail-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => { setActiveTab(tab.key); setMenuOpen(false) }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="tab-status">
            <span>{lastRefreshAt ? `Updated ${lastRefreshAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Auto-refresh every 2 min'}</span>
          </div>
        </div>

        <div className="tab-panel">
          {activeTab === 'overview' && (
            <div className="tab-grid">
              <div className="card insight-card">
                <div className="insight-title">Portfolio pulse</div>
                <div className="insight-metrics">
                  <div className="insight-metric">
                    <span>Current value</span>
                    <strong>${analytics?.current_value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </div>
                  <div className="insight-metric">
                    <span>Invested</span>
                    <strong>${analytics?.invested_value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </div>
                  <div className="insight-metric">
                    <span>Profit / Loss</span>
                    <strong className={analytics?.profit_loss >= 0 ? 'gain' : 'loss'}>${analytics?.profit_loss?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </div>
                </div>
              </div>
              <div className="card insight-card">
                <div className="insight-title">Recent activity</div>
                <div className="transaction-list">
                  {transactions.slice(0, 4).map((txn) => (
                    <div key={txn.id} className="transaction-row">
                      <div>
                        <strong>{txn.symbol}</strong>
                        <div className="transaction-meta">{txn.type} · {new Date(txn.executed_at).toLocaleDateString()}</div>
                      </div>
                      <div className="transaction-amount">${txn.price.toFixed(2)} · {txn.quantity}</div>
                    </div>
                  ))}
                  {transactions.length === 0 && <div className="empty-state">No recent transactions yet.</div>}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="tab-grid analytics-grid">
              <div className="card insight-card">
                <div className="insight-title">Performance</div>
                <div className="insight-metrics">
                  <div className="insight-metric">
                    <span>Current value</span>
                    <strong>${analytics?.current_value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </div>
                  <div className="insight-metric">
                    <span>Return</span>
                    <strong>{analytics?.profit_loss_percentage?.toFixed(2)}%</strong>
                  </div>
                </div>
              </div>
              <div className="card insight-card">
                <div className="insight-title">Portfolio details</div>
                <div className="detail-meta-grid">
                  <div>
                    <div className="label">Owner</div>
                    <strong>{portfolio.owner}</strong>
                  </div>
                  <div>
                    <div className="label">Base currency</div>
                    <strong>{portfolio.base_currency}</strong>
                  </div>
                  <div>
                    <div className="label">Holdings</div>
                    <strong>{portfolio.holdings.length}</strong>
                  </div>
                  <div>
                    <div className="label">Last refresh</div>
                    <strong>{lastRefreshAt ? lastRefreshAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Pending'}</strong>
                  </div>
                </div>
              </div>
              <div className="card insight-card chart-section">
                <div className="chart-toolbar">
                  <div className="insight-title">Price history</div>
                  <div className="chart-toggle-group">
                    {chartRanges.map((rangeOption) => (
                      <button
                        key={rangeOption.key}
                        type="button"
                        className={`btn btn-secondary btn-small ${chartRange === rangeOption.key ? 'active' : ''}`}
                        onClick={() => loadChartData(rangeOption.key)}
                      >
                        {rangeOption.label}
                      </button>
                    ))}
                  </div>
                </div>
                <PortfolioChart series={chartSeries} loading={chartLoading} range={chartRange} portfolio={portfolio} />
              </div>
            </div>
          )}

          {activeTab === 'holdings' && (
            <div className="tab-stack">
              <div className="tab-actions">
                <button className="btn btn-primary" onClick={() => setShowBuy(true)}>+ Buy security</button>
                <button className="btn btn-secondary" onClick={() => handleRefreshPrices()} disabled={refreshingPrices}>↻ Refresh prices</button>
              </div>
              <HoldingsTable holdings={portfolio.holdings} onSell={setSellTarget} onEdit={setEditHoldingTarget} onRefresh={handleRefreshPrices} />
            </div>
          )}

          {activeTab === 'whatif' && (
            <div className="tab-stack">
              <div className="tab-actions">
                <button className="btn btn-primary" onClick={() => setShowWhatIf(true)}>Run what-if</button>
              </div>

              {whatIfResult && (
                <div className="card whatif-result-card">
                  <div className="whatif-result-header">
                    <div>
                      <div className="whatif-result-title">Scenario preview</div>
                      <div className="whatif-result-name">{whatIfResult.scenario_name || 'Projected change'}</div>
                    </div>
                    <div className="whatif-result-summary">
                      <div>
                        <div className="label">Projected value</div>
                        <strong>${whatIfResult.current_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </div>
                      <div>
                        <div className="label">Projected P/L</div>
                        <strong className={whatIfResult.profit_loss >= 0 ? 'pl-gain' : 'pl-loss'}>${whatIfResult.profit_loss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="card whatif-history-card">
                {whatIfEntries.length === 0 ? (
                  <div className="empty-state">No saved what-if entries yet.</div>
                ) : (
                  <div className="whatif-table">
                    <div className="whatif-table-head">
                      <div>Scenario</div>
                      <div>Symbol</div>
                      <div>Price</div>
                      <div>Price type</div>
                      <div>Date</div>
                      <div></div>
                    </div>
                    {whatIfEntries.map((entry) => (
                      <div key={entry.id} className="whatif-table-row">
                        <div>{entry.scenario_name}</div>
                        <div>{entry.symbol}</div>
                        <div>${entry.hypothetical_price.toFixed(2)}</div>
                        <div>{entry.price_source === 'historical' ? `${entry.price_type || 'close'}` : 'manual'}</div>
                        <div>{entry.trade_date || '-'}</div>
                        <div>
                          <button type="button" className="btn btn-danger btn-small" onClick={() => handleDeleteWhatIfEntry(entry.id)}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="tab-stack">
              <div className="card insight-card">
                <div className="insight-title">Transaction history</div>
                <div className="transaction-list">
                  {transactions.map((txn) => (
                    <div key={txn.id} className="transaction-row">
                      <div>
                        <strong>{txn.symbol}</strong>
                        <div className="transaction-meta">{txn.type} · {new Date(txn.executed_at).toLocaleString()}</div>
                      </div>
                      <div className="transaction-amount">${txn.price.toFixed(2)} · {txn.quantity}</div>
                    </div>
                  ))}
                  {transactions.length === 0 && <div className="empty-state">No recent transactions yet.</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showBuy && <BuyModal onSubmit={handleBuy} onClose={() => setShowBuy(false)} />}

      {sellTarget && (
        <SellModal
          holding={sellTarget}
          onSellPartial={handleSellPartial}
          onSellAll={handleSellAll}
          onRefreshPrice={handleRefreshPrices}
          onClose={() => setSellTarget(null)}
        />
      )}

      {editHoldingTarget && (
        <EditHoldingModal
          holding={editHoldingTarget}
          onSubmit={handleEditHolding}
          onClose={() => setEditHoldingTarget(null)}
        />
      )}

      {editPortfolio && (
        <PortfolioFormModal initial={portfolio} onSubmit={handleEditPortfolio} onClose={() => setEditPortfolio(false)} />
      )}

      {showWhatIf && <WhatIfModal holdings={portfolio.holdings} onSubmit={handleWhatIf} onClose={() => setShowWhatIf(false)} />}
      {confirmDeletePortfolio && (
        <ConfirmDialog
          title="Delete portfolio"
          message={`Delete "${portfolio.name}" and all of its holdings? This cannot be undone.`}
          confirmLabel="Delete"
          busy={deleting}
          onCancel={() => setConfirmDeletePortfolio(false)}
          onConfirm={handleDeletePortfolio}
        />
      )}
    </>
  )
}
