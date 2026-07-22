import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listPortfolios, createPortfolio, updatePortfolio, deletePortfolio } from '../api/portfolios'
import PortfolioFormModal from './PortfolioFormModal'
import ConfirmDialog from './ConfirmDialog'
import ErrorBanner from './ErrorBanner'
import Spinner from './Spinner'

export default function PortfolioListPage() {
  const [portfolios, setPortfolios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  const totalPortfolios = portfolios.length
  const totalHoldings = portfolios.reduce((sum, p) => sum + p.holding_count, 0)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await listPortfolios()
      setPortfolios(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(payload) {
    await createPortfolio(payload)
    setShowCreate(false)
    load()
  }

  async function handleEdit(payload) {
    await updatePortfolio(editTarget.id, payload)
    setEditTarget(null)
    load()
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deletePortfolio(deleteTarget.id)
      setDeleteTarget(null)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-overline">CC · Portfolio Management Dashboard</div>
          <h1>Portfolio Overview</h1>
          <p className="page-intro">A centralized executive dashboard for your portfolios, holdings, and live market insights.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + New Portfolio
        </button>
      </div>

      <ErrorBanner message={error} />

      {!loading && portfolios.length > 0 && (
        <div className="metric-row">
          <div className="metric-card">
            <span>Total portfolios</span>
            <strong>{totalPortfolios}</strong>
          </div>
          <div className="metric-card">
            <span>Total holdings</span>
            <strong>{totalHoldings}</strong>
          </div>
          <div className="metric-card">
            <span>Primary currency</span>
            <strong>USD</strong>
          </div>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : portfolios.length === 0 ? (
        <div className="empty-state">No portfolios yet. Create your first one to get started.</div>
      ) : (
        <div className="portfolio-grid">
          {portfolios.map((p) => (
            <div key={p.id} className="card portfolio-card" onClick={() => navigate(`/portfolios/${p.id}`)}>
              <div>
                <h3>{p.name}</h3>
                <div className="owner">Owner: {p.owner}</div>
              </div>
              <div className="meta-row">
                <span>{p.holding_count} holding{p.holding_count === 1 ? '' : 's'}</span>
                <span>{p.base_currency}</span>
              </div>
              <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditTarget(p)}>
                  Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(p)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <PortfolioFormModal onSubmit={handleCreate} onClose={() => setShowCreate(false)} />}

      {editTarget && (
        <PortfolioFormModal initial={editTarget} onSubmit={handleEdit} onClose={() => setEditTarget(null)} />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete portfolio"
          message={`Delete "${deleteTarget.name}" and all of its holdings? This cannot be undone.`}
          confirmLabel="Delete"
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </>
  )
}
