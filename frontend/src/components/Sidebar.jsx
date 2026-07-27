import {
  LayoutDashboard,
  Briefcase,
  ArrowLeftRight,
  Receipt,
  FlaskConical,
  FolderCog,
  Compass,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'holdings', label: 'Holdings', icon: Briefcase },
  { id: 'trade', label: 'Trade (Buy/Sell)', icon: ArrowLeftRight },
  { id: 'transactions', label: 'Transaction Ledger', icon: Receipt },
  { id: 'what-if', label: 'What-If Simulator', icon: FlaskConical },
  { id: 'portfolios', label: 'Manage Portfolios', icon: FolderCog },
];

export function Sidebar({ activeTab, setActiveTab, activePortfolio }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-logo" style={{ background: 'linear-gradient(135deg, var(--accent-primary), #0d9488)', borderRadius: '10px' }}>
          <Compass size={22} style={{ color: '#ffffff' }} />
        </div>
        <div>
          <div className="brand-title" style={{ letterSpacing: '-0.03em', fontWeight: '800' }}>AlphaInsight</div>
          <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
            Wealth Laboratory
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-link ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {activePortfolio && (
        <div className="sidebar-footer">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Active Portfolio
          </div>
          <div style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            {activePortfolio.name}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Currency: {activePortfolio.base_currency}
          </div>
        </div>
      )}
    </aside>
  );
}
