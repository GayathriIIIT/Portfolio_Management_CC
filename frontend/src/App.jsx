import { Routes, Route, NavLink } from 'react-router-dom'
import PortfolioListPage from './components/PortfolioListPage'
import PortfolioDetailPage from './components/PortfolioDetailPage'

export default function App() {
  return (
    <div className="dashboard-frame">
      <aside className="sidebar">
        <div className="brand-panel">
          <div className="brand-mark">CC</div>
          <div>
            <div className="brand-company">Code Cookers</div>
            <div className="brand-tag">Portfolio Management Dashboard</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Overview
          </NavLink>
        </nav>
      </aside>

      <main className="main-content">
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<PortfolioListPage />} />
            <Route path="/portfolios/:id" element={<PortfolioDetailPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
