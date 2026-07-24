import React from 'react';
import { HoldingsTable } from '../components/HoldingsTable';

export function HoldingsPage({
  portfolio,
  analytics,
  onOpenTradeModal,
  onDeleteHolding,
  onOpenAddModal,
  onOpenCashModal,
}) {
  if (!portfolio) {
    return <div className="empty-state">No portfolio selected.</div>;
  }

  return (
    <div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Securities & Holdings</h1>
          <p className="page-subtitle">
            Manage position quantities, weighted average cost basis, and live market prices
          </p>
        </div>
      </div>

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
