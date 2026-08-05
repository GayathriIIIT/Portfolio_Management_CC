import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { BrainrotToastProvider } from './context/BrainrotToastContext';
import { api } from './services/api';

import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';

import { DashboardPage } from './pages/DashboardPage';
import { HoldingsPage } from './pages/HoldingsPage';
import { TradePage } from './pages/TradePage';
import { TransactionsPage } from './pages/TransactionsPage';
import { WhatIfPage } from './pages/WhatIfPage';
import { PortfoliosPage } from './pages/PortfoliosPage';

import { TradeModal } from './components/TradeModal';
import { NewPortfolioModal } from './components/NewPortfolioModal';
import { ManageCashModal } from './components/ManageCashModal';

// How often the dashboard auto-refreshes live prices (2 minutes).
const LIVE_REFRESH_MS = 2 * 60 * 1000;

export function AppContent() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(null);
  const [activePortfolio, setActivePortfolio] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Guards the auto-refresh so overlapping live-price fetches never pile up.
  const refreshInFlight = useRef(false);

  // Modals
  const [tradeModal, setTradeModal] = useState({ isOpen: false, type: 'BUY', symbol: '' });
  const [isNewPortfolioModalOpen, setIsNewPortfolioModalOpen] = useState(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);

  // Fetch all portfolios
  const loadPortfolios = useCallback(async () => {
    try {
      const data = await api.getPortfolios();
      setPortfolios(data);
      if (data.length > 0) {
        setSelectedPortfolioId((prevId) => {
          if (prevId && data.some((p) => p.id === prevId)) return prevId;
          return data[0].id;
        });
      }
    } catch (err) {
      console.error('Failed to load portfolios:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPortfolios();
  }, [loadPortfolios]);

  // Fetch active portfolio details & analytics when selected portfolio changes
  const loadPortfolioData = useCallback(async () => {
    if (!selectedPortfolioId) return;

    try {
      const [portfolioRes, analyticsRes] = await Promise.all([
        api.getPortfolio(selectedPortfolioId),
        api.getPortfolioAnalytics(selectedPortfolioId),
      ]);
      setActivePortfolio(portfolioRes);
      setAnalytics(analyticsRes);
    } catch (err) {
      console.error('Failed to fetch portfolio data:', err);
    }
  }, [selectedPortfolioId]);

  useEffect(() => {
    loadPortfolioData();
  }, [loadPortfolioData]);

  // Refresh live prices from Yahoo Finance
  const handleRefreshPrices = useCallback(async () => {
    if (!selectedPortfolioId) return;
    setIsRefreshing(true);
    try {
      const res = await api.refreshPortfolioPrices(selectedPortfolioId);
      if (res.analytics) {
        setAnalytics(res.analytics);
      } else {
        loadPortfolioData();
      }
    } catch (err) {
      console.error('Failed to refresh prices:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedPortfolioId, loadPortfolioData]);

  // Auto-refresh live prices every 2 minutes on the main dashboard so the
  // Portfolio Value KPI stays current without needing the manual button.
  useEffect(() => {
    if (activeTab !== 'dashboard' || !selectedPortfolioId) return;
    const timer = setInterval(() => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      handleRefreshPrices().finally(() => {
        refreshInFlight.current = false;
      });
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [activeTab, selectedPortfolioId, handleRefreshPrices]);

  const handleOpenTradeModal = (type = 'BUY', symbol = '') => {
    setTradeModal({ isOpen: true, type, symbol });
  };

  const handleDeleteHolding = async (holdingId) => {
    if (!selectedPortfolioId) return;
    if (window.confirm('Are you sure you want to remove this security holding?')) {
      try {
        await api.deleteHolding(selectedPortfolioId, holdingId);
        loadPortfolioData();
      } catch (err) {
        alert(`Error deleting holding: ${err.message}`);
      }
    }
  };

  const handleCreatedNewPortfolio = (newId) => {
    loadPortfolios().then(() => {
      setSelectedPortfolioId(newId);
    });
  };

  return (
    <div className="app-container">
      {/* Multi-page Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activePortfolio={activePortfolio}
      />

      {/* Main Wrapper */}
      <div className="main-wrapper">
        <Header
          portfolios={portfolios}
          selectedPortfolioId={selectedPortfolioId}
          onSelectPortfolio={setSelectedPortfolioId}
          onRefreshPrices={handleRefreshPrices}
          onOpenNewPortfolioModal={() => setIsNewPortfolioModalOpen(true)}
          isRefreshing={isRefreshing}
        />

        <main className="page-content">
          {loading ? (
            <div className="empty-state">Loading portfolio hub...</div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardPage
                  portfolio={activePortfolio}
                  analytics={analytics}
                  onOpenTradeModal={handleOpenTradeModal}
                  onDeleteHolding={handleDeleteHolding}
                  onOpenCashModal={() => setIsCashModalOpen(true)}
                />
              )}

              {activeTab === 'holdings' && (
                <HoldingsPage
                  portfolio={activePortfolio}
                  analytics={analytics}
                  onOpenTradeModal={handleOpenTradeModal}
                  onDeleteHolding={handleDeleteHolding}
                  onOpenCashModal={() => setIsCashModalOpen(true)}
                />
              )}

              {activeTab === 'trade' && (
                <TradePage
                  portfolio={activePortfolio}
                  onTradeSuccess={loadPortfolioData}
                />
              )}

              {activeTab === 'transactions' && (
                <TransactionsPage portfolio={activePortfolio} />
              )}

              {activeTab === 'what-if' && (
                <WhatIfPage portfolio={activePortfolio} />
              )}

              {activeTab === 'portfolios' && (
                <PortfoliosPage
                  portfolios={portfolios}
                  selectedPortfolioId={selectedPortfolioId}
                  onSelectPortfolio={setSelectedPortfolioId}
                  onOpenNewPortfolioModal={() => setIsNewPortfolioModalOpen(true)}
                  onRefreshList={loadPortfolios}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      <TradeModal
        isOpen={tradeModal.isOpen}
        onClose={() => setTradeModal({ isOpen: false, type: 'BUY', symbol: '' })}
        portfolioId={selectedPortfolioId}
        initialType={tradeModal.type}
        initialSymbol={tradeModal.symbol}
        onTradeSuccess={loadPortfolioData}
      />

      <NewPortfolioModal
        isOpen={isNewPortfolioModalOpen}
        onClose={() => setIsNewPortfolioModalOpen(false)}
        onSuccess={handleCreatedNewPortfolio}
      />

      <ManageCashModal
        isOpen={isCashModalOpen}
        onClose={() => setIsCashModalOpen(false)}
        portfolioId={selectedPortfolioId}
        onSuccess={loadPortfolioData}
      />
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <BrainrotToastProvider>
        <AppContent />
      </BrainrotToastProvider>
    </ThemeProvider>
  );
}

export default App;
