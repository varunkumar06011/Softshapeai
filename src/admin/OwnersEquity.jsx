import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Plus, Save, ArrowLeft, TrendingUp, TrendingDown,
  X, PiggyBank, Info,
} from 'lucide-react';
import { apiFetch } from '../services/apiConfig';
import { getKolkataDateString } from '../shared/utils/dateFormat';

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

const DIRECTION_LABELS = {
  INVESTMENT: { label: 'Investment', icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
  DRAWING: { label: 'Drawing', icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
};

export default function OwnersEquity() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [summary, setSummary] = useState(null);
  const [adjustments, setAdjustments] = useState([]);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    direction: 'INVESTMENT',
    amount: '',
    date: getKolkataDateString(),
    narration: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, adj] = await Promise.all([
        apiFetch('/api/equity/summary'),
        apiFetch('/api/equity/adjustments'),
      ]);
      setSummary(sum || null);
      setAdjustments(adj || []);
    } catch (err) {
      setError(err.message || 'Failed to load equity data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setForm({
      direction: 'INVESTMENT',
      amount: '',
      date: getKolkataDateString(),
      narration: '',
    });
  };

  const handleSave = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError('Amount must be a positive number');
      return;
    }
    if (!form.narration.trim()) {
      setError('Narration is required — explain why this equity movement happened');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/equity/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: form.direction,
          amount: parseFloat(form.amount),
          date: form.date,
          narration: form.narration.trim(),
        }),
      });
      setSuccess(`${DIRECTION_LABELS[form.direction].label} recorded successfully`);
      resetForm();
      setShowForm(false);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to record adjustment');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  return (
    <div>
      {error && <div className="mb-3 text-xs font-bold text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}
      {success && <div className="mb-3 text-xs font-bold text-green-600 bg-green-50 rounded px-3 py-2">{success}</div>}

      {/* Summary card with formula breakdown */}
      {summary && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <PiggyBank size={16} className="text-[#E53935]" />
            <h2 className="text-sm font-black text-gray-800">Owner's Equity</h2>
          </div>

          {/* Current Equity — big number */}
          <div className="text-center py-3 mb-3 bg-gray-50 rounded">
            <div className="text-[10px] font-bold text-gray-400 mb-1">Current Equity</div>
            <div className="text-2xl font-black text-gray-800">{round2(summary.currentEquity).toFixed(2)}</div>
          </div>

          {/* Formula breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="text-center">
              <div className="text-gray-400 font-bold mb-0.5">Opening Equity</div>
              <div className="font-bold text-gray-700">{round2(summary.openingEquity).toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400 font-bold mb-0.5">+ Investments</div>
              <div className="font-bold text-green-600">{round2(summary.totalInvestments).toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400 font-bold mb-0.5">− Drawings</div>
              <div className="font-bold text-red-600">{round2(summary.totalDrawings).toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400 font-bold mb-0.5">+ Retained Profit</div>
              <div className={`font-bold ${summary.retainedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {round2(summary.retainedProfit).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Retained profit breakdown (collapsible detail) */}
          {summary.breakdown && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-[10px] font-bold text-gray-400 mb-2">Retained Profit Breakdown (since {summary.asOfDate})</div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px]">
                <div className="text-center">
                  <div className="text-gray-400">Revenue</div>
                  <div className="font-bold text-gray-700">{round2(summary.breakdown.revenue).toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400">− COGS</div>
                  <div className="font-bold text-red-600">{round2(summary.breakdown.cogs).toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400">− Expenses</div>
                  <div className="font-bold text-red-600">{round2(summary.breakdown.expenses).toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400">− Payroll</div>
                  <div className="font-bold text-red-600">{round2(summary.breakdown.payroll).toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400">− Depreciation</div>
                  <div className="font-bold text-red-600">{round2(summary.breakdown.depreciation).toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick action buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { resetForm(); setForm({ ...form, direction: 'INVESTMENT' }); setShowForm(true); }}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-green-500 rounded hover:bg-green-600"
        >
          <TrendingUp size={12} />
          Record Investment
        </button>
        <button
          onClick={() => { resetForm(); setForm({ ...form, direction: 'DRAWING' }); setShowForm(true); }}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-red-500 rounded hover:bg-red-600"
        >
          <TrendingDown size={12} />
          Record Drawing
        </button>
      </div>

      {/* Adjustments table */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-xs font-black text-gray-800 mb-2">Equity Adjustment History</h3>
        <div className="mb-2 text-[10px] text-gray-400 flex items-center gap-1">
          <Info size={10} />
          Corrections cannot be edited or deleted. To fix a mistake, create a reversing entry with the opposite direction.
        </div>
        {adjustments.length === 0 ? (
          <div className="text-xs font-bold text-gray-400 py-4 text-center">
            No equity adjustments recorded yet.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="text-left py-2 px-2 font-bold">Date</th>
                <th className="text-left py-2 px-2 font-bold">Type</th>
                <th className="text-right py-2 px-2 font-bold">Amount</th>
                <th className="text-left py-2 px-2 font-bold">Narration</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((adj) => {
                const dir = DIRECTION_LABELS[adj.direction] || DIRECTION_LABELS.INVESTMENT;
                const Icon = dir.icon;
                return (
                  <tr key={adj.id} className="border-b border-gray-100">
                    <td className="py-2 px-2 font-bold text-gray-700">{adj.date}</td>
                    <td className="py-2 px-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${dir.bg} ${dir.color}`}>
                        <Icon size={10} />
                        {dir.label}
                      </span>
                    </td>
                    <td className={`py-2 px-2 text-right font-bold ${dir.color}`}>
                      {adj.direction === 'DRAWING' ? '−' : '+'}{round2(adj.amount).toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-gray-600">{adj.narration}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-5 max-w-md w-full">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-gray-800">
                {form.direction === 'INVESTMENT' ? 'Record Investment' : 'Record Drawing'}
              </h3>
              <button onClick={() => setShowForm(false)}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setForm({ ...form, direction: 'INVESTMENT' })}
                  className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-bold rounded ${
                    form.direction === 'INVESTMENT' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <TrendingUp size={12} />
                  Investment
                </button>
                <button
                  onClick={() => setForm({ ...form, direction: 'DRAWING' })}
                  className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-bold rounded ${
                    form.direction === 'DRAWING' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <TrendingDown size={12} />
                  Drawing
                </button>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Amount *</label>
                <input
                  type="number" step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Narration * (required)</label>
                <textarea
                  value={form.narration}
                  onChange={(e) => setForm({ ...form, narration: e.target.value })}
                  rows={3}
                  placeholder="Explain why this equity movement happened..."
                  className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Cancel</button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-[#E53935] rounded hover:bg-[#D32F2F] disabled:opacity-50"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
