import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getPortfolio, getPortfolioAnalytics, getPortfolioTransactions, portfolioWhatIf, deletePortfolio, updatePortfolio } from '../api/portfolios'
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

export default function PortfolioDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [portfolio, setPortfolio] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [whatIfResult, setWhatIfResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showBuy, setShowBuy] = useState(false)
  const [showWhatIf, setShowWhatIf] = useState(false)
  const [sellTarget, setSellTarget] = useState(null)
  const [editHoldingTarget, setEditHoldingTarget] = useState(null)
  const [editPortfolio, setEditPortfolio] = useState(false)
  const [confirmDeletePortfolio, setConfirmDeletePortfolio] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [data, analyticsData, transactionsData] = await Promise.all([
        getPortfolio(id),
        getPortfolioAnalytics(id),
        getPortfolioTransactions(id),
      ])
      setPortfolio(data)
      setAnalytics(analyticsData)
      setTransactions(transactionsData)
      setWhatIfResult(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  async function handleBuy(payload) {
    await buyHolding(id, payload)
    setShowBuy(false)
    load()
  }

  async function handleSellPartial(quantity) {
    await sellHolding(id, { symbol: sellTarget.symbol, quantity })
    setSellTarget(null)
    load()
  }

  async function handleSellAll() {
    await sellHolding(id, { symbol: sellTarget.symbol, quantity: sellTarget.quantity })
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
          <div className="page-overline">CC · Portfolio Management Dashboard</div>
          <h1>{portfolio.name}</h1>
          <div className="portfolio-insights-grid">
            <div className="insight-card">
              <div className="insight-title">Live portfolio analytics</div>
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
                <div className="insight-metric">
                  <span>Return</span>
                  <strong>{analytics?.profit_loss_percentage?.toFixed(2)}%</strong>
                </div>
              </div>
            </div>
            <div className="insight-card transactions-card">
              <div className="insight-title">Recent activity</div>
              <div className="transaction-list">
                {transactions.slice(0, 4).map((txn) => (
                  <div key={txn.id} className="transaction-row">
                    <div>
                      <strong>{txn.symbol}</strong>
                      <div className="transaction-meta">{txn.type} · {new Date(txn.executed_at).toLocaleDateString()}</div>
                    </div>
                    <div className="transaction-amount">
                      ${txn.price.toFixed(2)} · {txn.quantity}
                    </div>
                  </div>
                ))}
                {transactions.length === 0 && <div className="empty-state">No recent transactions yet.</div>}
              </div>
            </div>
          </div>
          <p className="page-intro">A detailed portfolio view for fast decisions, deep holdings context, and live value tracking.</p>
        </div>

        <div className="detail-actions detail-actions-top">
          <button className="btn btn-secondary" onClick={() => setShowWhatIf(true)}>
            What-If Analysis
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

      {whatIfResult && (
        <div className="card whatif-result-card">
          <div className="whatif-result-title">What-If Scenario</div>
          <div className="whatif-result-grid">
            <div>
              <div className="label">Scenario</div>
              <strong>{whatIfResult.scenario_name || 'Projected change'}</strong>
            </div>
            <div>
              <div className="label">Projected value</div>
              <strong>${whatIfResult.current_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </div>
            <div>
              <div className="label">Projected P/L</div>
              <strong className={whatIfResult.profit_loss >= 0 ? 'pl-gain' : 'pl-loss'}>
                ${whatIfResult.profit_loss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
          </div>
        </div>
      )}

      <div className="card detail-header">
        <div>
          <div className="owner">
            Owner: {portfolio.owner} · {portfolio.base_currency}
          </div>
        </div>

        <div className="detail-stats">
          <div className="stat">
            <div className="label">Total Value</div>
            <div className="value">
              ${Number(portfolio.total_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      <HoldingsTable holdings={portfolio.holdings} onSell={setSellTarget} onEdit={setEditHoldingTarget} />

      {showBuy && <BuyModal onSubmit={handleBuy} onClose={() => setShowBuy(false)} />}

      {sellTarget && (
        <SellModal
          holding={sellTarget}
          onSellPartial={handleSellPartial}
          onSellAll={handleSellAll}
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
