import React, { useState } from 'react';
import { Search, ArrowUpRight, ArrowDownRight, Plus, Trash2, ShoppingCart, DollarSign } from 'lucide-react';

export function HoldingsTable({
  holdings = [],
  currency = 'USD',
  onOpenTradeModal,
  onDeleteHolding,
  onOpenAddModal,
  onOpenCashModal,
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredHoldings = holdings.filter(
    (h) =>
      (h.symbol && h.symbol.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (h.name && h.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontWeight: '700', fontSize: '1.15rem', color: 'var(--text-primary)' }}>
            Portfolio Holdings
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Active securities and asset positions
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Search bar */}
          <div style={{ position: 'relative', width: '220px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)',
              }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '36px', height: '38px', fontSize: '0.85rem' }}
              placeholder="Search symbol or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button className="btn btn-secondary btn-sm" onClick={onOpenCashModal} style={{ gap: '6px' }}>
            <DollarSign size={14} />
            <span>Manage Cash</span>
          </button>

          <button className="btn btn-primary btn-sm" onClick={onOpenAddModal}>
            <Plus size={14} />
            <span>Add Position</span>
          </button>
        </div>
      </div>

      {!filteredHoldings.length ? (
        <div className="empty-state">
          <DollarSign className="empty-state-icon" />
          <div>No holdings found in this portfolio. Click "Add Position" or "Trade" to get started.</div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Security</th>
                <th>Type / Exch</th>
                <th style={{ textAlign: 'right' }}>Shares / Qty</th>
                <th style={{ textAlign: 'right' }}>Avg Price</th>
                <th style={{ textAlign: 'right' }}>Live Price</th>
                <th style={{ textAlign: 'right' }}>Market Value</th>
                <th style={{ textAlign: 'right' }}>Unrealized P&L</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredHoldings.map((h) => {
                const isGain = (h.unrealized_pl || 0) >= 0;
                return (
                  <tr key={h.id}>
                    <td>
                      <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>{h.symbol}</div>
                      <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>{h.name || 'N/A'}</div>
                    </td>
                    <td>
                      <span className="badge badge-secondary">{h.exchange || 'MARKET'}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '600' }}>
                      {Number(h.quantity).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(h.purchase_price)}</td>
                    <td style={{ textAlign: 'right', fontWeight: '600' }}>{formatCurrency(h.current_price)}</td>
                    <td style={{ textAlign: 'right', fontWeight: '700' }}>{formatCurrency(h.market_value)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className={isGain ? 'text-positive' : 'text-negative'} style={{ fontWeight: '700' }}>
                        {isGain ? '+' : ''}{formatCurrency(h.unrealized_pl)}
                      </div>
                      <div style={{ fontSize: '0.775rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }} className={isGain ? 'text-positive' : 'text-negative'}>
                        {isGain ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        <span>{(h.unrealized_pl_pct || 0).toFixed(2)}%</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px' }}
                          onClick={() => onOpenTradeModal('BUY', h.symbol)}
                          title="Buy more"
                        >
                          <Plus size={12} />
                          <span>Buy</span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px' }}
                          onClick={() => onOpenTradeModal('SELL', h.symbol)}
                          title="Sell shares"
                        >
                          <ShoppingCart size={12} />
                          <span>Sell</span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm text-negative"
                          style={{ padding: '4px 6px' }}
                          onClick={() => onDeleteHolding(h.id)}
                          title="Delete holding"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
