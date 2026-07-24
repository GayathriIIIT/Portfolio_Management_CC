import React from 'react';
import { KPICards } from '../components/KPICards';
import { PerformanceChart } from '../components/PerformanceChart';
import { AssetAllocationChart } from '../components/AssetAllocationChart';
import { HoldingsTable } from '../components/HoldingsTable';

export function DashboardPage({
  portfolio,
  analytics,
  onOpenTradeModal,
  onDeleteHolding,
  onOpenAddModal,
  onOpenCashModal,
}) {
  if (!portfolio) {
    return (
      <div className="empty-state">
        Select or create a portfolio to view dashboard analytics.
      </div>
    );
  }

  return (
    <div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">{portfolio.name} Dashboard</h1>
          <p className="page-subtitle">
            Overview and performance metrics in {portfolio.base_currency}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <KPICards analytics={analytics} currency={portfolio.base_currency} />

      {/* Charts Grid */}
      <div className="grid-2">
        <PerformanceChart portfolioId={portfolio.id} />
        <AssetAllocationChart holdings={analytics?.holdings || []} />
      </div>

      {/* Holdings Table */}
      <HoldingsTable
        holdings={analytics?.holdings || []}
        currency={portfolio.base_currency}
        onOpenTradeModal={onOpenTradeModal}
        onDeleteHolding={onDeleteHolding}
        onOpenAddModal={onOpenAddModal}
        onOpenCashModal={onOpenCashModal}
      />
    </div>
  );
}
