import React, { useState, useEffect } from 'react';
import { FlaskConical, Play, Trash2, TrendingUp, AlertCircle, Layers, Calendar, Plus, X } from 'lucide-react';
import { api } from '../services/api';
import { TickerAutocomplete } from '../components/TickerAutocomplete';

export function WhatIfPage({ portfolio }) {
  const [scenarioName, setScenarioName] = useState('Tech crash');
  
  // Tabs: 'portfolio' (current holdings) or 'sandbox' (custom basket) - default to standalone sandbox
  const [simScope, setSimScope] = useState('sandbox'); 
  
  // Tabs: 'manual' (specify prices) or 'historical' (specify date & type)
  const [priceSource, setPriceSource] = useState('manual');
  
  // Date selection fields
  const [targetDate, setTargetDate] = useState('');
  const [priceType, setPriceType] = useState('close');

  // Manual price overrides dictionary (e.g. { AAPL: '150', TSLA: '220' })
  const [manualPrices, setManualPrices] = useState(() => {
    try {
      const saved = localStorage.getItem('pm_manual_prices');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Standalone Sandbox basket of symbols & quantities
  const [sandboxBasket, setSandboxBasket] = useState(() => {
    try {
      const saved = localStorage.getItem('pm_sandbox_basket');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [newSandboxSym, setNewSandboxSym] = useState('');
  const [newSandboxQty, setNewSandboxQty] = useState(10);

  const [simulationResult, setSimulationResult] = useState(null);
  const [savedEntries, setSavedEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sync sandbox basket to localStorage
  useEffect(() => {
    localStorage.setItem('pm_sandbox_basket', JSON.stringify(sandboxBasket));
  }, [sandboxBasket]);

  // Sync manual prices to localStorage
  useEffect(() => {
    localStorage.setItem('pm_manual_prices', JSON.stringify(manualPrices));
  }, [manualPrices]);

  useEffect(() => {
    if (portfolio?.id) {
      loadSavedWhatIfs();
    }
  }, [portfolio?.id]);

  const loadSavedWhatIfs = async () => {
    if (!portfolio?.id) return;
    try {
      const data = await api.getWhatIfList(portfolio.id);
      setSavedEntries(data);
    } catch (err) {
      console.error('Failed to load saved what-ifs', err);
    }
  };

  const handleAddSandboxPosition = (e) => {
    e.preventDefault();
    if (!newSandboxSym) return;
    const sym = newSandboxSym.trim().toUpperCase();
    
    setSandboxBasket((prev) => {
      const existingIdx = prev.findIndex((item) => item.symbol === sym);
      if (existingIdx > -1) {
        const copy = [...prev];
        copy[existingIdx].quantity += Number(newSandboxQty);
        return copy;
      }
      return [...prev, { symbol: sym, quantity: Number(newSandboxQty) }];
    });

    // Populate a default override price for this symbol if not present
    if (!manualPrices[sym]) {
      setManualPrices((prev) => ({ ...prev, [sym]: '100' }));
    }

    setNewSandboxSym('');
    setNewSandboxQty(10);
  };

  const handleRemoveSandboxPosition = (sym) => {
    setSandboxBasket((prev) => prev.filter((item) => item.symbol !== sym));
  };

  const handleRunSimulation = async (e) => {
    e.preventDefault();
    if (!portfolio?.id) return;
    setLoading(true);
    setError(null);

    try {
      const payload = {
        scenario_name: scenarioName.trim() || 'Custom Scenario',
      };

      const activeSymbols = simScope === 'sandbox'
        ? sandboxBasket.map(item => item.symbol)
        : (portfolio.holdings ? portfolio.holdings.map(h => h.symbol) : []);

      if (simScope === 'sandbox') {
        if (sandboxBasket.length === 0) {
          throw new Error('Please add at least one position to the Sandbox Basket first');
        }
        const symbols = sandboxBasket.map((item) => item.symbol);
        const quantities = {};
        sandboxBasket.forEach((item) => {
          quantities[item.symbol] = item.quantity;
        });

        payload.symbols = symbols;
        payload.quantities = quantities;
      }

      if (priceSource === 'manual') {
        // Collect manual prices only for active symbols in this scope
        const prices = {};
        let missingPrice = false;
        
        activeSymbols.forEach((sym) => {
          const val = Number(manualPrices[sym]);
          if (val && val > 0) {
            prices[sym] = val;
          } else {
            missingPrice = true;
          }
        });

        if (missingPrice) {
          throw new Error('Please fill in a valid hypothetical price for all active tickers');
        }

        payload.prices = prices;
      } else {
        if (!targetDate) {
          throw new Error('Please select a valid historical date');
        }
        payload.date = targetDate;
        payload.price_type = priceType;
      }

      const res = await api.runWhatIf(portfolio.id, payload);
      setSimulationResult(res);
      loadSavedWhatIfs();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEntry = async (whatifId) => {
    if (!portfolio?.id) return;
    try {
      await api.deleteWhatIfEntry(portfolio.id, whatifId);
      loadSavedWhatIfs();
    } catch (err) {
      alert(`Error deleting entry: ${err.message}`);
    }
  };

  // List of active symbols depending on portfolio vs sandbox scope
  const activeSymbols = simScope === 'sandbox'
    ? sandboxBasket.map((item) => item.symbol)
    : (portfolio.holdings ? portfolio.holdings.map((h) => h.symbol) : []);

  return (
    <div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">What-If Scenario Simulator</h1>
          <p className="page-subtitle">
            Simulate hypothetical market conditions and stress-test portfolio performance for {portfolio.name}
          </p>
        </div>
      </div>

      <div className="grid-2">
        {/* Scenario Builder Form */}
        <div className="card">
          <div style={{ fontWeight: '700', fontSize: '1.15rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FlaskConical size={20} style={{ color: 'var(--accent-primary)' }} />
            <span>Create & Run Scenario</span>
          </div>

          {error && (
            <div className="badge badge-danger" style={{ width: '100%', marginBottom: '16px', padding: '10px' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleRunSimulation}>
            <div className="form-group">
              <label className="form-label">Scenario Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Tech Crash 2026, Fed Rate Cut, Recession"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                required
              />
            </div>

            {/* Scope Selector: Portfolio vs Standalone Sandbox */}
            <div className="form-group">
              <label className="form-label">Simulation Target Scope</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${simScope === 'sandbox' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setSimScope('sandbox')}
                >
                  Standalone Sandbox Cart (Default)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${simScope === 'portfolio' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setSimScope('portfolio')}
                >
                  Current Portfolio Holdings
                </button>
              </div>
            </div>

            {/* Sandbox Basket Manager */}
            {simScope === 'sandbox' && (
              <div style={{ backgroundColor: 'var(--bg-app)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', marginBottom: '8px' }}>Sandbox Basket Configuration (Persistent)</div>
                
                {/* List Sandbox items */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                  {sandboxBasket.map((item) => (
                    <span key={item.symbol} className="badge badge-secondary" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                      <strong>{item.symbol}</strong> ({item.quantity} units)
                      <X
                        size={14}
                        style={{ cursor: 'pointer', color: 'var(--danger-text)' }}
                        onClick={() => handleRemoveSandboxPosition(item.symbol)}
                      />
                    </span>
                  ))}
                  {sandboxBasket.length === 0 && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Sandbox is empty. Add ticker positions below.</div>
                  )}
                </div>

                {/* Add sandbox position form */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <TickerAutocomplete
                    value={newSandboxSym}
                    onChange={setNewSandboxSym}
                    placeholder="Ticker e.g. NVDA"
                    style={{ height: '34px', fontSize: '0.85rem' }}
                    required={false}
                  />
                  <input
                    type="number"
                    className="form-input"
                    style={{ height: '34px', fontSize: '0.85rem', width: '80px', flex: 'none' }}
                    placeholder="Qty"
                    min="1"
                    value={newSandboxQty}
                    onChange={(e) => setNewSandboxQty(e.target.value)}
                  />
                  <button type="button" className="btn btn-secondary btn-sm" style={{ height: '34px' }} onClick={handleAddSandboxPosition}>
                    <Plus size={14} />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            )}

            {/* Pricing Mode Selector */}
            <div className="form-group">
              <label className="form-label">Hypothetical Pricing Source</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${priceSource === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setPriceSource('manual')}
                >
                  Manual Price Override
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${priceSource === 'historical' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setPriceSource('historical')}
                >
                  Historical Date Price Lookup
                </button>
              </div>
            </div>

            {/* Price configuration form based on active price source */}
            {priceSource === 'manual' ? (
              <div style={{ backgroundColor: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', marginBottom: '12px' }}>
                  Configure Simulation Target Prices ({simScope === 'sandbox' ? 'Sandbox Cart' : 'Portfolio Holdings'})
                </div>
                
                {/* Dynamically render target price input fields for active symbols */}
                {activeSymbols.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {simScope === 'sandbox' 
                      ? 'Sandbox Cart is empty. Add ticker positions above first.' 
                      : 'No active holdings in this portfolio.'}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {activeSymbols.map((sym) => (
                      <div key={sym} className="form-group" style={{ marginBottom: '10px' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '700' }}>
                          {sym} Target Price ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          className="form-input"
                          style={{ height: '36px' }}
                          placeholder="e.g. 150.00"
                          value={manualPrices[sym] || ''}
                          onChange={(e) => {
                            setManualPrices((prev) => ({
                              ...prev,
                              [sym]: e.target.value
                            }));
                          }}
                          required
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ backgroundColor: 'var(--bg-app)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', marginBottom: '12px' }}>Historical Yahoo Finance Settings</div>
                
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Target Trading Date</label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ height: '36px' }}
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Price Point Type</label>
                  <select
                    className="form-select"
                    style={{ height: '36px' }}
                    value={priceType}
                    onChange={(e) => setPriceType(e.target.value)}
                  >
                    <option value="close">Close Price (Recommended)</option>
                    <option value="open">Open Price</option>
                    <option value="high">High Price</option>
                    <option value="low">Low Price</option>
                  </select>
                </div>
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', marginTop: '10px' }} disabled={loading}>
              <Play size={16} />
              <span>{loading ? 'Simulating...' : 'Run Simulation'}</span>
            </button>
          </form>
        </div>

        {/* Simulation Output Card */}
        <div className="card">
          <div style={{ fontWeight: '700', fontSize: '1.15rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={20} style={{ color: 'var(--accent-primary)' }} />
            <span>Simulation Results</span>
          </div>

          {!simulationResult ? (
            <div className="empty-state">
              Configure parameters on the left and run simulation to view stress-tested portfolio valuation.
            </div>
          ) : (
            <div>
              <div
                style={{
                  backgroundColor: 'var(--accent-light)',
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(79, 70, 229, 0.2)',
                  marginBottom: '20px',
                }}
              >
                <div style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', textTransform: 'uppercase', fontWeight: '800' }}>
                  Scenario: {simulationResult.scenario_name}
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>
                  ${simulationResult.current_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Hypothetical Portfolio Market Value
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div style={{ backgroundColor: 'var(--bg-app)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>Simulated Cost Basis</div>
                  <div style={{ fontWeight: '800', fontSize: '1.1rem' }}>
                    ${simulationResult.invested_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-app)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>Simulated P&L</div>
                  <div className={`font-bold text-lg ${simulationResult.profit_loss >= 0 ? 'text-positive' : 'text-negative'}`} style={{ fontWeight: '800', fontSize: '1.1rem' }}>
                    {simulationResult.profit_loss >= 0 ? '+' : ''}
                    ${simulationResult.profit_loss.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({simulationResult.profit_loss_percentage.toFixed(2)}%)
                  </div>
                </div>
              </div>

              <div style={{ fontWeight: '700', fontSize: '0.875rem', marginBottom: '8px' }}>
                Simulated Basket Position Details:
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th style={{ textAlign: 'right' }}>Simulated Price</th>
                      <th style={{ textAlign: 'right' }}>Simulated Value</th>
                      <th style={{ textAlign: 'right' }}>P&L %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulationResult.holdings.map((h, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: '800' }}>{h.symbol}</td>
                        <td style={{ textAlign: 'right' }}>${(h.current_price || h.purchase_price || 0).toFixed(2)}</td>
                        <td style={{ textAlign: 'right', fontWeight: '700' }}>
                          ${(h.market_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right' }} className={(h.unrealized_pl || 0) >= 0 ? 'text-positive' : 'text-negative'}>
                          {(h.unrealized_pl_pct || 0).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Saved What-If Scenario Ledger */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div style={{ fontWeight: '700', fontSize: '1.15rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={20} style={{ color: 'var(--accent-primary)' }} />
          <span>Saved What-If Assumptions Ledger</span>
        </div>

        {!savedEntries.length ? (
          <div className="empty-state">No saved scenario price assumptions found.</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Scenario Name</th>
                  <th>Security Symbol</th>
                  <th style={{ textAlign: 'right' }}>Hypothetical Price</th>
                  <th>Source</th>
                  <th>Price Point</th>
                  <th>Target Date</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {savedEntries.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="badge badge-secondary" style={{ fontWeight: '700' }}>
                        {row.scenario_name}
                      </span>
                    </td>
                    <td style={{ fontWeight: '800' }}>{row.symbol || 'N/A'}</td>
                    <td style={{ textAlign: 'right', fontWeight: '700' }}>${row.hypothetical_price.toFixed(2)}</td>
                    <td><span className="badge badge-secondary">{row.price_source}</span></td>
                    <td>{row.price_type || 'manual'}</td>
                    <td>{row.trade_date ? new Date(row.trade_date).toLocaleDateString() : 'N/A'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-secondary btn-sm text-negative"
                        onClick={() => handleDeleteEntry(row.id)}
                        title="Delete scenario row"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
