import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Lock, Unlock, Save, Plus, Trash2, Wallet, Package,
  AlertCircle, CheckCircle, Landmark, TrendingUp,
} from 'lucide-react';
import { apiFetch } from '../services/apiConfig';
import { getKolkataDateString } from '../shared/utils/dateFormat';
import LedgerCategoryPicker from '../shared/components/LedgerCategoryPicker';

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

export default function OpeningBalanceSetup() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Header fields
  const [obId, setObId] = useState(null);
  const [asOfDate, setAsOfDate] = useState(() => getKolkataDateString());
  const [cashInHand, setCashInHand] = useState('');
  const [bankBalance, setBankBalance] = useState('');
  const [openingEquity, setOpeningEquity] = useState('');
  const [isFinalized, setIsFinalized] = useState(false);
  const [finalizedBy, setFinalizedBy] = useState(null);
  const [finalizedAt, setFinalizedAt] = useState(null);

  // Lines
  const [stockLines, setStockLines] = useState([]);
  const [liabilityLines, setLiabilityLines] = useState([]);
  const [assetLines, setAssetLines] = useState([]);

  // Confirm dialogs
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  const [stockWarning, setStockWarning] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Try to load existing opening balance
      let obData = null;
      try {
        obData = await apiFetch('/api/opening-balance');
      } catch (err) {
        // 404 is expected if no opening balance exists yet
        if (!err.message?.includes('No opening balance')) {
          throw err;
        }
      }

      if (obData) {
        setObId(obData.id);
        setAsOfDate(obData.asOfDate || getKolkataDateString());
        setCashInHand(obData.cashInHand != null ? String(obData.cashInHand) : '');
        setBankBalance(obData.bankBalance != null ? String(obData.bankBalance) : '');
        setOpeningEquity(obData.openingEquity != null ? String(obData.openingEquity) : '');
        setIsFinalized(obData.isFinalized || false);
        setFinalizedBy(obData.finalizedBy?.name || null);
        setFinalizedAt(obData.finalizedAt || null);

        const lines = obData.lines || [];
        setStockLines(lines.filter((l) => l.lineType === 'STOCK_ITEM'));
        setLiabilityLines(lines.filter((l) => l.lineType === 'LOAN' || l.lineType === 'VENDOR_PAYABLE'));
        setAssetLines(lines.filter((l) => l.lineType === 'FIXED_ASSET'));
      } else {
        // No existing OB — load suggested stock lines
        try {
          const suggestions = await apiFetch('/api/opening-balance/suggest-stock-lines');
          if (Array.isArray(suggestions)) {
            setStockLines(suggestions.map((s) => ({
              id: null,
              lineType: 'STOCK_ITEM',
              refId: s.refId,
              name: s.name,
              quantity: s.quantity,
              unitCost: s.unitCost,
              amount: s.amount,
              unit: s.unit,
            })));
          }
        } catch (err) {
          console.error('[OpeningBalanceSetup] Suggest stock lines failed:', err);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load opening balance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Computed totals ──────────────────────────────────────────────────────────
  const stockTotal = round2(stockLines.reduce((sum, l) => sum + round2(l.quantity) * round2(l.unitCost), 0));
  const liabilityTotal = round2(liabilityLines.reduce((sum, l) => sum + round2(l.amount), 0));
  const assetTotal = round2(assetLines.reduce((sum, l) => sum + round2(l.amount), 0));

  // ── Header save ──────────────────────────────────────────────────────────────
  const handleSaveHeader = async () => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const body = {
        asOfDate,
        cashInHand: parseFloat(cashInHand) || 0,
        bankBalance: parseFloat(bankBalance) || 0,
        openingEquity: parseFloat(openingEquity) || 0,
      };

      if (obId) {
        const result = await apiFetch('/api/opening-balance', { method: 'PATCH', body: JSON.stringify(body) });
        setSuccess('Header updated');
      } else {
        const result = await apiFetch('/api/opening-balance', { method: 'POST', body: JSON.stringify(body) });
        setObId(result.id);
        setSuccess('Opening balance created');
      }
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message || 'Failed to save header');
    } finally {
      setSaving(false);
    }
  };

  // ── Stock line helpers ───────────────────────────────────────────────────────
  const updateStockLine = (idx, field, value) => {
    setStockLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === 'quantity' || field === 'unitCost') {
        updated.amount = round2(round2(updated.quantity) * round2(updated.unitCost));
      }
      return updated;
    }));
  };

  const saveStockLine = async (idx) => {
    const line = stockLines[idx];
    if (!line.name?.trim()) return;
    setError('');
    setSaving(true);
    try {
      const body = {
        lineType: 'STOCK_ITEM',
        refId: line.refId || undefined,
        name: line.name.trim(),
        quantity: parseFloat(line.quantity) || 0,
        unitCost: parseFloat(line.unitCost) || 0,
      };
      if (line.id) {
        await apiFetch(`/api/opening-balance/lines/${line.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        const result = await apiFetch('/api/opening-balance/lines', { method: 'POST', body: JSON.stringify(body) });
        setStockLines((prev) => prev.map((l, i) => i === idx ? { ...result, unit: line.unit } : l));
      }
      setSuccess('Stock line saved');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message || 'Failed to save stock line');
    } finally {
      setSaving(false);
    }
  };

  const deleteStockLine = async (idx) => {
    const line = stockLines[idx];
    if (!line.id) {
      setStockLines((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/opening-balance/lines/${line.id}`, { method: 'DELETE' });
      setStockLines((prev) => prev.filter((_, i) => i !== idx));
    } catch (err) {
      setError(err.message || 'Failed to delete line');
    } finally {
      setSaving(false);
    }
  };

  // ── Liability line helpers ───────────────────────────────────────────────────
  const updateLiabilityLine = (idx, field, value) => {
    setLiabilityLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const addLiabilityLine = () => {
    setLiabilityLines((prev) => [...prev, {
      id: null,
      lineType: 'LOAN',
      name: '',
      amount: '',
      ledgerCategoryId: null,
      notes: '',
    }]);
  };

  const saveLiabilityLine = async (idx) => {
    const line = liabilityLines[idx];
    if (!line.name?.trim() || !line.amount) return;
    setError('');
    setSaving(true);
    try {
      const body = {
        lineType: line.lineType,
        name: line.name.trim(),
        amount: parseFloat(line.amount) || 0,
        ledgerCategoryId: line.ledgerCategoryId || undefined,
        notes: line.notes || undefined,
      };
      if (line.id) {
        await apiFetch(`/api/opening-balance/lines/${line.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        const result = await apiFetch('/api/opening-balance/lines', { method: 'POST', body: JSON.stringify(body) });
        setLiabilityLines((prev) => prev.map((l, i) => i === idx ? result : l));
      }
      setSuccess('Liability line saved');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message || 'Failed to save liability line');
    } finally {
      setSaving(false);
    }
  };

  const deleteLiabilityLine = async (idx) => {
    const line = liabilityLines[idx];
    if (!line.id) {
      setLiabilityLines((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/opening-balance/lines/${line.id}`, { method: 'DELETE' });
      setLiabilityLines((prev) => prev.filter((_, i) => i !== idx));
    } catch (err) {
      setError(err.message || 'Failed to delete line');
    } finally {
      setSaving(false);
    }
  };

  // ── Asset line helpers ───────────────────────────────────────────────────────
  const updateAssetLine = (idx, field, value) => {
    setAssetLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const addAssetLine = () => {
    setAssetLines((prev) => [...prev, {
      id: null,
      lineType: 'FIXED_ASSET',
      name: '',
      amount: '',
      originalDate: '',
      ledgerCategoryId: null,
      notes: '',
    }]);
  };

  const saveAssetLine = async (idx) => {
    const line = assetLines[idx];
    if (!line.name?.trim() || !line.amount) return;
    setError('');
    setSaving(true);
    try {
      const body = {
        lineType: 'FIXED_ASSET',
        name: line.name.trim(),
        amount: parseFloat(line.amount) || 0,
        originalDate: line.originalDate || undefined,
        ledgerCategoryId: line.ledgerCategoryId || undefined,
        notes: line.notes || undefined,
      };
      if (line.id) {
        await apiFetch(`/api/opening-balance/lines/${line.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        const result = await apiFetch('/api/opening-balance/lines', { method: 'POST', body: JSON.stringify(body) });
        setAssetLines((prev) => prev.map((l, i) => i === idx ? result : l));
      }
      setSuccess('Asset line saved');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message || 'Failed to save asset line');
    } finally {
      setSaving(false);
    }
  };

  const deleteAssetLine = async (idx) => {
    const line = assetLines[idx];
    if (!line.id) {
      setAssetLines((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/opening-balance/lines/${line.id}`, { method: 'DELETE' });
      setAssetLines((prev) => prev.filter((_, i) => i !== idx));
    } catch (err) {
      setError(err.message || 'Failed to delete line');
    } finally {
      setSaving(false);
    }
  };

  // ── Finalize / Unlock ────────────────────────────────────────────────────────
  const handleFinalize = async () => {
    setShowFinalizeConfirm(false);
    setError('');
    setSaving(true);
    try {
      const result = await apiFetch('/api/opening-balance/finalize', { method: 'POST' });
      setIsFinalized(true);
      setFinalizedBy(result.finalizedBy?.name || null);
      setFinalizedAt(result.finalizedAt || null);
      if (result.stockWarning) {
        setStockWarning(result.stockWarning);
      } else {
        setStockWarning(null);
      }
      setSuccess('Opening balance finalized');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to finalize');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async () => {
    setShowUnlockConfirm(false);
    setError('');
    setSaving(true);
    try {
      await apiFetch('/api/opening-balance/unlock', { method: 'POST' });
      setIsFinalized(false);
      setFinalizedBy(null);
      setFinalizedAt(null);
      setStockWarning(null);
      setSuccess('Opening balance unlocked for editing');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to unlock');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[#E53935]" />
      </div>
    );
  }

  const canFinalize = cashInHand !== '' && bankBalance !== '' && openingEquity !== '' && obId;
  const readOnly = isFinalized;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
            <Landmark size={18} className="text-[#E53935]" />
            Opening Balances
          </h3>
          {readOnly ? (
            <span className="flex items-center gap-1.5 text-xs font-black uppercase text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
              <Lock size={14} />
              Finalized
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-black uppercase text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
              <Unlock size={14} />
              Draft
            </span>
          )}
        </div>
        {readOnly && finalizedBy && (
          <p className="text-[10px] text-gray-400 font-bold mt-2">
            Locked by {finalizedBy} on {finalizedAt ? new Date(finalizedAt).toLocaleString() : ''}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
          <CheckCircle size={14} />
          {success}
        </div>
      )}

      {stockWarning && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 px-3 py-2 rounded-lg text-xs font-bold flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{stockWarning}</span>
        </div>
      )}

      {/* Section 1: Cash & Bank */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
          <Wallet size={16} className="text-[#E53935]" />
          Cash & Bank
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Cash in Hand (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={cashInHand}
              onChange={(e) => setCashInHand(e.target.value)}
              disabled={readOnly}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935] disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Bank Balance (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={bankBalance}
              onChange={(e) => setBankBalance(e.target.value)}
              disabled={readOnly}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935] disabled:opacity-60"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">As of Date</label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            disabled={readOnly}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935] disabled:opacity-60"
          />
        </div>
        {!readOnly && (
          <button
            onClick={handleSaveHeader}
            disabled={saving}
            className="w-full bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-xs font-black uppercase hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Header
          </button>
        )}
      </div>

      {/* Section 2: Opening Equity */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
          <TrendingUp size={16} className="text-[#E53935]" />
          Opening Equity
        </h4>
        <p className="text-xs text-gray-500 font-medium">
          What was this business worth before today, after subtracting what it owed?
        </p>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={openingEquity}
          onChange={(e) => setOpeningEquity(e.target.value)}
          disabled={readOnly}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935] disabled:opacity-60"
        />
        {!readOnly && (
          <button
            onClick={handleSaveHeader}
            disabled={saving}
            className="w-full bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-xs font-black uppercase hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Header
          </button>
        )}
      </div>

      {/* Section 3: Stock */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
            <Package size={16} className="text-[#E53935]" />
            Stock Items
          </h4>
          <span className="text-sm font-black text-[#E53935]">₹{stockTotal.toLocaleString()}</span>
        </div>
        {stockLines.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No stock items. Add one below.</p>
        ) : (
          <div className="space-y-2">
            {stockLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-lg p-2">
                <input
                  type="text"
                  placeholder="Item name"
                  value={line.name || ''}
                  onChange={(e) => updateStockLine(idx, 'name', e.target.value)}
                  disabled={readOnly}
                  className="col-span-4 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935] disabled:opacity-60"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Qty"
                  value={line.quantity || ''}
                  onChange={(e) => updateStockLine(idx, 'quantity', e.target.value)}
                  disabled={readOnly}
                  className="col-span-2 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935] disabled:opacity-60"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Unit cost"
                  value={line.unitCost || ''}
                  onChange={(e) => updateStockLine(idx, 'unitCost', e.target.value)}
                  disabled={readOnly}
                  className="col-span-2 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935] disabled:opacity-60"
                />
                <span className="col-span-2 text-xs font-black text-[#E53935] text-right">
                  ₹{round2(round2(line.quantity) * round2(line.unitCost)).toLocaleString()}
                </span>
                <div className="col-span-2 flex justify-end gap-1">
                  {!readOnly && (
                    <>
                      <button
                        onClick={() => saveStockLine(idx)}
                        disabled={saving}
                        className="p-1.5 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                        title="Save line"
                      >
                        <Save size={12} className="text-gray-700" />
                      </button>
                      <button
                        onClick={() => deleteStockLine(idx)}
                        disabled={saving}
                        className="p-1.5 bg-red-100 rounded hover:bg-red-200 disabled:opacity-50"
                        title="Delete line"
                      >
                        <Trash2 size={12} className="text-red-600" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {!readOnly && (
          <button
            onClick={() => setStockLines((prev) => [...prev, { id: null, lineType: 'STOCK_ITEM', name: '', quantity: '', unitCost: '', amount: 0 }])}
            className="w-full border-2 border-dashed border-gray-200 rounded-lg py-2 text-xs font-bold text-gray-500 hover:border-[#E53935] hover:text-[#E53935] flex items-center justify-center gap-1"
          >
            <Plus size={14} />
            Add Stock Item
          </button>
        )}
      </div>

      {/* Section 4: Known Liabilities */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
            <AlertCircle size={16} className="text-[#E53935]" />
            Known Liabilities
          </h4>
          <span className="text-sm font-black text-[#E53935]">₹{liabilityTotal.toLocaleString()}</span>
        </div>
        {liabilityLines.length === 0 && !readOnly && (
          <p className="text-xs text-gray-400 text-center py-2">No liabilities added yet.</p>
        )}
        <div className="space-y-2">
          {liabilityLines.map((line, idx) => (
            <div key={idx} className="space-y-2 bg-gray-50 rounded-lg p-2">
              <div className="grid grid-cols-12 gap-2 items-center">
                <select
                  value={line.lineType}
                  onChange={(e) => updateLiabilityLine(idx, 'lineType', e.target.value)}
                  disabled={readOnly}
                  className="col-span-3 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935] disabled:opacity-60"
                >
                  <option value="LOAN">Loan</option>
                  <option value="VENDOR_PAYABLE">Vendor Payable</option>
                </select>
                <input
                  type="text"
                  placeholder="Name"
                  value={line.name || ''}
                  onChange={(e) => updateLiabilityLine(idx, 'name', e.target.value)}
                  disabled={readOnly}
                  className="col-span-5 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935] disabled:opacity-60"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Amount"
                  value={line.amount || ''}
                  onChange={(e) => updateLiabilityLine(idx, 'amount', e.target.value)}
                  disabled={readOnly}
                  className="col-span-2 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935] disabled:opacity-60"
                />
                <div className="col-span-2 flex justify-end gap-1">
                  {!readOnly && (
                    <>
                      <button
                        onClick={() => saveLiabilityLine(idx)}
                        disabled={saving}
                        className="p-1.5 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                        title="Save"
                      >
                        <Save size={12} className="text-gray-700" />
                      </button>
                      <button
                        onClick={() => deleteLiabilityLine(idx)}
                        disabled={saving}
                        className="p-1.5 bg-red-100 rounded hover:bg-red-200 disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 size={12} className="text-red-600" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="pl-1">
                {readOnly ? (
                  line.ledgerCategory?.name && (
                    <p className="text-[10px] text-gray-400 font-bold">Category: {line.ledgerCategory.name}</p>
                  )
                ) : (
                  <LedgerCategoryPicker
                    entryType="LIABILITY"
                    value={line.ledgerCategory ? { id: line.ledgerCategoryId, name: line.ledgerCategory.name } : (line.ledgerCategoryId ? { id: line.ledgerCategoryId, name: line.ledgerCategoryName } : null)}
                    onChange={(cat) => updateLiabilityLine(idx, 'ledgerCategoryId', cat?.id || null)}
                    placeholder="Tag with category (optional)"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        {!readOnly && (
          <button
            onClick={addLiabilityLine}
            className="w-full border-2 border-dashed border-gray-200 rounded-lg py-2 text-xs font-bold text-gray-500 hover:border-[#E53935] hover:text-[#E53935] flex items-center justify-center gap-1"
          >
            <Plus size={14} />
            Add Liability
          </button>
        )}
      </div>

      {/* Section 5: Existing Fixed Assets */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
            <TrendingUp size={16} className="text-[#E53935]" />
            Existing Fixed Assets
          </h4>
          <span className="text-sm font-black text-[#E53935]">₹{assetTotal.toLocaleString()}</span>
        </div>
        {assetLines.length === 0 && !readOnly && (
          <p className="text-xs text-gray-400 text-center py-2">No fixed assets added yet.</p>
        )}
        <div className="space-y-2">
          {assetLines.map((line, idx) => (
            <div key={idx} className="space-y-2 bg-gray-50 rounded-lg p-2">
              <div className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  placeholder="Asset name"
                  value={line.name || ''}
                  onChange={(e) => updateAssetLine(idx, 'name', e.target.value)}
                  disabled={readOnly}
                  className="col-span-5 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935] disabled:opacity-60"
                />
                <input
                  type="date"
                  value={line.originalDate || ''}
                  onChange={(e) => updateAssetLine(idx, 'originalDate', e.target.value)}
                  disabled={readOnly}
                  className="col-span-3 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935] disabled:opacity-60"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Cost"
                  value={line.amount || ''}
                  onChange={(e) => updateAssetLine(idx, 'amount', e.target.value)}
                  disabled={readOnly}
                  className="col-span-2 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935] disabled:opacity-60"
                />
                <div className="col-span-2 flex justify-end gap-1">
                  {!readOnly && (
                    <>
                      <button
                        onClick={() => saveAssetLine(idx)}
                        disabled={saving}
                        className="p-1.5 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                        title="Save"
                      >
                        <Save size={12} className="text-gray-700" />
                      </button>
                      <button
                        onClick={() => deleteAssetLine(idx)}
                        disabled={saving}
                        className="p-1.5 bg-red-100 rounded hover:bg-red-200 disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 size={12} className="text-red-600" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="pl-1">
                {readOnly ? (
                  line.ledgerCategory?.name && (
                    <p className="text-[10px] text-gray-400 font-bold">Category: {line.ledgerCategory.name}</p>
                  )
                ) : (
                  <LedgerCategoryPicker
                    entryType="ASSET"
                    value={line.ledgerCategory ? { id: line.ledgerCategoryId, name: line.ledgerCategory.name } : (line.ledgerCategoryId ? { id: line.ledgerCategoryId, name: line.ledgerCategoryName } : null)}
                    onChange={(cat) => updateAssetLine(idx, 'ledgerCategoryId', cat?.id || null)}
                    placeholder="Tag with category (optional)"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        {!readOnly && (
          <button
            onClick={addAssetLine}
            className="w-full border-2 border-dashed border-gray-200 rounded-lg py-2 text-xs font-bold text-gray-500 hover:border-[#E53935] hover:text-[#E53935] flex items-center justify-center gap-1"
          >
            <Plus size={14} />
            Add Fixed Asset
          </button>
        )}
      </div>

      {/* Finalize / Unlock buttons */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 -mx-4">
        {!readOnly ? (
          <button
            onClick={() => setShowFinalizeConfirm(true)}
            disabled={!canFinalize || saving}
            className="w-full bg-[#E53935] text-white rounded-xl px-4 py-3 text-sm font-black uppercase hover:bg-[#B71C1C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Lock size={16} />
            Finalize Opening Balances
          </button>
        ) : (
          <button
            onClick={() => setShowUnlockConfirm(true)}
            disabled={saving}
            className="w-full bg-amber-50 text-amber-700 border-2 border-amber-300 rounded-xl px-4 py-3 text-sm font-black uppercase hover:bg-amber-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Unlock size={16} />
            Unlock to Edit
          </button>
        )}
      </div>

      {/* Finalize confirmation dialog */}
      {showFinalizeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Lock size={20} className="text-[#E53935]" />
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-800">Finalize?</h3>
            </div>
            <p className="text-xs text-gray-600 font-medium">
              This locks the opening balance snapshot. You can still edit it later, but only by explicitly unlocking — which is logged and traceable.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowFinalizeConfirm(false)}
                className="flex-1 bg-gray-100 text-gray-700 rounded-lg px-4 py-2.5 text-xs font-black uppercase hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalize}
                className="flex-1 bg-[#E53935] text-white rounded-lg px-4 py-2.5 text-xs font-black uppercase hover:bg-[#B71C1C]"
              >
                Finalize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unlock confirmation dialog */}
      {showUnlockConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Unlock size={20} className="text-amber-600" />
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-800">Unlock?</h3>
            </div>
            <p className="text-xs text-gray-600 font-medium">
              Unlocking a finalized opening balance is sensitive and will be logged. Only do this if you need to correct a mistake.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowUnlockConfirm(false)}
                className="flex-1 bg-gray-100 text-gray-700 rounded-lg px-4 py-2.5 text-xs font-black uppercase hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleUnlock}
                className="flex-1 bg-amber-600 text-white rounded-lg px-4 py-2.5 text-xs font-black uppercase hover:bg-amber-700"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
