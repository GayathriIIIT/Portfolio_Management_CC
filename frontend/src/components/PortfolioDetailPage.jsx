import { useEffect, useState } from 'react'
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

function PortfolioChart({ series, loading, range }) {
  if (loading) {
    return <div className="empty-state">Loading chart data…</div>
  }

  if (!series || series.length === 0) {
    return <div className="empty-state">Chart data will appear here once price history is available.</div>
  }

  const width = 560
  const height = 240
  const padding = 24
  const colors = ['#7e53c0', '#3a7f65', '#b8506b', '#2e7dd1']

  return (
    <div className="chart-stack">
      {series.map((entry, index) => {
        const points = entry.points || []
        if (points.length === 0) return null

        const values = points.map((point) => Number(point.price)).filter((value) => Number.isFinite(value))
        const minValue = Math.min(...values)
        const maxValue = Math.max(...values)
        const span = maxValue - minValue || 1

        const linePoints = points.map((point, pointIndex) => {
          const x = padding + (pointIndex / Math.max(points.length - 1, 1)) * (width - padding * 2)
          const y = height - padding - ((Number(point.price) - minValue) / span) * (height - padding * 2)
          return `${x},${y}`
        }).join(' ')

        const latestValue = points[points.length - 1]?.price
        const firstValue = points[0]?.price
        const delta = latestValue != null && firstValue != null ? latestValue - firstValue : 0

        return (
          <div key={entry.symbol} className="card chart-card">
            <div className="chart-card-head">
              <div>
                <div className="insight-title">{entry.symbol}</div>
                <div className="chart-card-subtitle">{range === '1d' ? '5-minute interval' : range === '7d' ? 'Daily trend' : 'Monthly trend'}</div>
              </div>
              <div className={`chart-delta ${delta >= 0 ? 'pl-gain' : 'pl-loss'}`}>
                {delta >= 0 ? '+' : ''}{delta.toFixed(2)}
              </div>
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label={`${entry.symbol} price chart`}>
              <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="chart-axis" />
              <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="chart-axis" />
              <polyline points={linePoints} fill="none" stroke={colors[index % colors.length]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
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
                    {['1d', '7d', '1m'].map((rangeOption) => (
                      <button
                        key={rangeOption}
                        type="button"
                        className={`btn btn-secondary btn-small ${chartRange === rangeOption ? 'active' : ''}`}
                        onClick={() => loadChartData(rangeOption)}
                      >
                        {rangeOption === '1d' ? '1 day' : rangeOption === '7d' ? '1 week' : '1 month'}
                      </button>
                    ))}
                  </div>
                </div>
                <PortfolioChart series={chartSeries} loading={chartLoading} range={chartRange} />
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
