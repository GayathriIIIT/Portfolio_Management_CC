import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { BrainrotToastProvider } from './context/BrainrotToastContext';
import { api } from './services/api';

import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import UserTour from './components/UserTour';

import { DashboardPage } from './pages/DashboardPage';
import { HoldingsPage } from './pages/HoldingsPage';
import { TradePage } from './pages/TradePage';
import { TransactionsPage } from './pages/TransactionsPage';
import { WhatIfPage } from './pages/WhatIfPage';
import { PortfoliosPage } from './pages/PortfoliosPage';

import { TradeModal } from './components/TradeModal';
import { AddHoldingModal } from './components/AddHoldingModal';
import { NewPortfolioModal } from './components/NewPortfolioModal';
import { ManageCashModal } from './components/ManageCashModal';
import { WalletModal } from './components/WalletModal';

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
  const [isPortfolioLoading, setIsPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState(null);

  // Bumped after every successful in-place data refresh so presentational
  // children that fetch on their own (PerformanceChart, RiskPerformanceCard)
  // re-fetch after a trade — portfolioId alone never changes on a trade, so
  // they would otherwise keep showing pre-trade numbers until a reload.
  const [dataVersion, setDataVersion] = useState(0);

  // Tracks the portfolio the UI is currently meant to show. Async responses
  // whose portfolio no longer matches are discarded, so switching away from a
  // portfolio can never let its late response overwrite the newer selection
  // (this was how a loss-making portfolio kept rendering a profit portfolio's
  // "WE ARE IN PROFIT" KPIs after the switch).
  const selectedPortfolioIdRef = useRef(selectedPortfolioId);
  selectedPortfolioIdRef.current = selectedPortfolioId;

  // Guards the auto-refresh so overlapping live-price fetches never pile up.
  const refreshInFlight = useRef(false);

  // Modals
  const [tradeModal, setTradeModal] = useState({ isOpen: false, type: 'BUY', symbol: '' });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isNewPortfolioModalOpen, setIsNewPortfolioModalOpen] = useState(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [cashModalAction, setCashModalAction] = useState('DEPOSIT');
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Global wallet — user-level, shared across every portfolio. Fetched once and
  // refreshed after any trade or wallet change. Never part of a portfolio.
  const [wallet, setWallet] = useState({});

  const loadWallet = useCallback(async () => {
    try {
      const data = await api.getWallet();
      const byCurrency = {};
      for (const w of data) byCurrency[w.currency] = w.balance;
      setWallet(byCurrency);
    } catch (err) {
      console.error('Failed to load wallet:', err);
    }
  }, []);

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

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  // Fetch active portfolio details & analytics when selected portfolio changes
  const loadPortfolioData = useCallback(async () => {
    const pid = selectedPortfolioId;
    if (!pid) return;

    // Clear any data belonging to the previously selected portfolio immediately.
    // Leaving it in place is what made a portfolio in loss render the previous
    // (profit) portfolio's KPIs / "WE ARE IN PROFIT" message until (or if) the
    // new fetch resolved.
    setActivePortfolio(null);
    setAnalytics(null);
    setPortfolioError(null);
    setIsPortfolioLoading(true);

    try {
      const [portfolioRes, analyticsRes] = await Promise.all([
        api.getPortfolio(pid),
        api.getPortfolioAnalytics(pid),
      ]);
      if (pid !== selectedPortfolioIdRef.current) return; // stale response
      setActivePortfolio(portfolioRes);
      setAnalytics(analyticsRes);
    } catch (err) {
      if (pid !== selectedPortfolioIdRef.current) return; // stale response
      console.error('Failed to fetch portfolio data:', err);
      setPortfolioError(`Failed to load portfolio data: ${err.message}`);
    } finally {
      if (pid === selectedPortfolioIdRef.current) {
        setIsPortfolioLoading(false);
      }
    }
  }, [selectedPortfolioId]);

  useEffect(() => {
    loadPortfolioData();
  }, [loadPortfolioData]);

  // Refetch the current portfolio's data in place (used after mutations such as
  // trades, cash changes or holding deletes). Unlike loadPortfolioData this does
  // not blank the UI to a loading screen, so in-page feedback (e.g. a successful
  // trade message) is preserved while the refreshed data swaps in.
  const refreshPortfolioData = useCallback(async () => {
    const pid = selectedPortfolioId;
    if (!pid) return;
    try {
      const [portfolioRes, analyticsRes] = await Promise.all([
        api.getPortfolio(pid),
        api.getPortfolioAnalytics(pid),
      ]);
      if (pid !== selectedPortfolioIdRef.current) return; // stale response
      setActivePortfolio(portfolioRes);
      setAnalytics(analyticsRes);
      loadWallet();
      // Signal self-fetching children (charts, risk card) that portfolio data
      // changed so they refetch instead of holding stale pre-trade numbers.
      setDataVersion((v) => v + 1);
    } catch (err) {
      console.error('Failed to refresh portfolio data:', err);
    }
  }, [selectedPortfolioId, loadWallet]);

  // Refresh live prices from Yahoo Finance. Self-guards against overlapping
  // calls via refreshInFlight, so a manual click and the 2-minute auto timer
  // can never run two concurrent refreshes (they'd waste an API call and make
  // isRefreshing flip in a confusing order).
  const handleRefreshPrices = useCallback(async () => {
    const pid = selectedPortfolioId;
    if (!pid) return;
    if (refreshInFlight.current) return; // a refresh is already running
    refreshInFlight.current = true;
    setIsRefreshing(true);
    try {
      const res = await api.refreshPortfolioPrices(pid);
      if (pid !== selectedPortfolioIdRef.current) return; // stale response
      if (res.analytics) {
        setAnalytics(res.analytics);
      } else {
        refreshPortfolioData();
      }
    } catch (err) {
      console.error('Failed to refresh prices:', err);
    } finally {
      setIsRefreshing(false);
      refreshInFlight.current = false;
    }
  }, [selectedPortfolioId, refreshPortfolioData]);

  // Auto-refresh live prices every 2 minutes on the main dashboard so the
  // Portfolio Value KPI stays current without needing the manual button. The
  // handler self-guards against overlap, so no extra flag is needed here.
  useEffect(() => {
    if (activeTab !== 'dashboard' || !selectedPortfolioId) return;
    const timer = setInterval(() => {
      handleRefreshPrices();
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
        refreshPortfolioData();
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

  // The wallet is user-level; the balance shown is the currency this portfolio
  // trades in (its base currency), since buys/sells draw from that same pool.
  const walletCurrency = activePortfolio?.base_currency || 'USD';
  const walletBalance = wallet[walletCurrency] ?? 0;

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
          onOpenWalletModal={() => {
            setIsCashModalOpen(false);
            setIsWalletModalOpen(true);
          }}
          walletBalance={walletBalance}
          walletCurrency={walletCurrency}
          isRefreshing={isRefreshing}
        />

        <UserTour />

        <main className="page-content">
          {loading ? (
            <div className="empty-state">Loading portfolio hub...</div>
          ) : (
            <>
              {activeTab === 'portfolios' ? (
                <PortfoliosPage
                  portfolios={portfolios}
                  selectedPortfolioId={selectedPortfolioId}
                  onSelectPortfolio={setSelectedPortfolioId}
                  onOpenNewPortfolioModal={() => setIsNewPortfolioModalOpen(true)}
                  onRefreshList={loadPortfolios}
                />
              ) : isPortfolioLoading ? (
                <div className="empty-state">Loading portfolio data...</div>
              ) : portfolioError ? (
                <div className="empty-state" style={{ color: 'var(--danger-text)' }}>
                  {portfolioError}
                </div>
              ) : (
                <>
                  {activeTab === 'dashboard' && (
                    <DashboardPage
                      portfolio={activePortfolio}
                      analytics={analytics}
                      refreshKey={dataVersion}
                      onOpenTradeModal={handleOpenTradeModal}
                      onDeleteHolding={handleDeleteHolding}
                      onOpenAddModal={() => setIsAddModalOpen(true)}
                      onOpenCashModal={(action) => {
                        setIsWalletModalOpen(false);
                        setCashModalAction(action || 'DEPOSIT');
                        setIsCashModalOpen(true);
                      }}
                    />
                  )}

                  {activeTab === 'holdings' && (
                    <HoldingsPage
                      portfolio={activePortfolio}
                      analytics={analytics}
                      onOpenTradeModal={handleOpenTradeModal}
                      onDeleteHolding={handleDeleteHolding}
                      onOpenAddModal={() => setIsAddModalOpen(true)}
                      onOpenCashModal={(action) => {
                        setIsWalletModalOpen(false);
                        setCashModalAction(action || 'DEPOSIT');
                        setIsCashModalOpen(true);
                      }}
                    />
                  )}

              {activeTab === 'trade' && (
                <TradePage
                  portfolio={activePortfolio}
                  walletBalance={walletBalance}
                  currency={walletCurrency}
                  onTradeSuccess={refreshPortfolioData}
                />
              )}

                  {activeTab === 'transactions' && (
                    <TransactionsPage portfolio={activePortfolio} />
                  )}

                  {activeTab === 'what-if' && (
                    <WhatIfPage portfolio={activePortfolio} />
                  )}
                </>
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
        holdings={activePortfolio?.holdings || []}
        walletBalance={walletBalance}
        currency={walletCurrency}
        initialType={tradeModal.type}
        initialSymbol={tradeModal.symbol}
        onTradeSuccess={refreshPortfolioData}
      />

      <AddHoldingModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        portfolioId={selectedPortfolioId}
        onSuccess={refreshPortfolioData}
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
        baseCurrency={activePortfolio?.base_currency || 'USD'}
        initialAction={cashModalAction}
        onSuccess={refreshPortfolioData}
      />

      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        currency={walletCurrency}
        wallet={wallet}
        onSuccess={() => {
          loadWallet();
          refreshPortfolioData();
        }}
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
