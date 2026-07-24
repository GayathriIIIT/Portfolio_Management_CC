import React, { useState } from 'react';
import { FolderCog, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { api } from '../services/api';

export function PortfoliosPage({
  portfolios,
  selectedPortfolioId,
  onSelectPortfolio,
  onOpenNewPortfolioModal,
  onRefreshList,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCurrency, setEditCurrency] = useState('USD');

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditCurrency(p.base_currency || 'USD');
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id) => {
    try {
      await api.updatePortfolio(id, {
        name: editName,
        base_currency: editCurrency,
      });
      setEditingId(null);
      onRefreshList();
    } catch (err) {
      alert(`Error updating portfolio: ${err.message}`);
    }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete portfolio "${name}"? This cannot be undone.`)) {
      try {
        await api.deletePortfolio(id);
        onRefreshList();
      } catch (err) {
        alert(`Error deleting portfolio: ${err.message}`);
      }
    }
  };

  return (
    <div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Manage Portfolios</h1>
          <p className="page-subtitle">
            Create, edit, or remove portfolio containers and accounts
          </p>
        </div>

        <button className="btn btn-primary" onClick={onOpenNewPortfolioModal}>
          <Plus size={16} />
          <span>New Portfolio</span>
        </button>
      </div>

      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Portfolio Name</th>
                <th>Base Currency</th>
                <th style={{ textAlign: 'right' }}>Positions / Holdings</th>
                <th style={{ textAlign: 'right' }}>Created Date</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {portfolios.map((p) => {
                const isEditing = editingId === p.id;
                const isSelected = selectedPortfolioId === p.id;

                return (
                  <tr key={p.id} style={{ backgroundColor: isSelected ? 'var(--accent-light)' : 'transparent' }}>
                    <td style={{ fontFamily: 'monospace', fontWeight: '600', color: 'var(--text-muted)' }}>
                      #{p.id}
                    </td>

                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          className="form-input"
                          style={{ height: '32px', fontSize: '0.85rem' }}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      ) : (
                        <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>
                          {p.name} {isSelected && <span className="badge badge-success" style={{ marginLeft: '6px' }}>Active</span>}
                        </div>
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <select
                          className="form-select"
                          style={{ height: '32px', fontSize: '0.85rem', padding: '2px 8px' }}
                          value={editCurrency}
                          onChange={(e) => setEditCurrency(e.target.value)}
                        >
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="GBP">GBP</option>
                          <option value="JPY">JPY</option>
                        </select>
                      ) : (
                        <span className="badge badge-secondary">{p.base_currency || 'USD'}</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'right', fontWeight: '600' }}>
                      {p.holding_count ?? (p.holdings ? p.holdings.length : 0)}
                    </td>

                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
                      {p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A'}
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        {isEditing ? (
                          <>
                            <button className="btn btn-primary btn-sm" onClick={() => saveEdit(p.id)} title="Save">
                              <Check size={14} />
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={cancelEdit} title="Cancel">
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => onSelectPortfolio(p.id)}
                              title="Select active portfolio"
                            >
                              Select
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => startEdit(p)}
                              title="Edit portfolio"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              className="btn btn-secondary btn-sm text-negative"
                              onClick={() => handleDelete(p.id, p.name)}
                              title="Delete portfolio"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
