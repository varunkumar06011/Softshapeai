import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Plus, Save, ArrowLeft, Building2, AlertCircle,
  CheckCircle, X, TrendingDown, RefreshCw, Ban,
} from 'lucide-react';
import { apiFetch } from '../services/apiConfig';
import { getKolkataDateString } from '../shared/utils/dateFormat';
import LedgerCategoryPicker from '../shared/components/LedgerCategoryPicker';

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

const STATUS_STYLES = {
  ACTIVE: { bg: 'bg-green-50', text: 'text-green-600', label: 'Active' },
  DISPOSED: { bg: 'bg-gray-100', text: 'text-gray-400', label: 'Disposed' },
  FULLY_DEPRECIATED: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Fully Depreciated' },
};

const SOURCE_LABELS = {
  MANUAL: 'Manual',
  PURCHASE_ORDER: 'Purchase Order',
  OPENING_BALANCE: 'Opening Balance',
};

export default function AssetLedger() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [assets, setAssets] = useState([]);
  const [assetDetail, setAssetDetail] = useState(null);
  const [view, setView] = useState('list'); // 'list' | 'detail' | 'form'
  const [showDisposeModal, setShowDisposeModal] = useState(false);
  const [hasUnconvertedAssets, setHasUnconvertedAssets] = useState(false);
  const [depreciationResult, setDepreciationResult] = useState(null);

  // Form state
  const [form, setForm] = useState({
    name: '',
    ledgerCategoryId: null,
    purchaseDate: getKolkataDateString(),
    purchaseCost: '',
    usefulLifeMonths: '',
    salvageValue: '0',
    depreciationMethod: 'STRAIGHT_LINE',
    serialNumber: '',
  });

  // Dispose form
  const [disposeForm, setDisposeForm] = useState({
    disposedDate: getKolkataDateString(),
    disposalNotes: '',
  });

  // Depreciation run form
  const [depMonth, setDepMonth] = useState(getKolkataDateString().slice(0, 7));

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/fixed-assets');
      setAssets(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, []);

  const checkUnconvertedAssets = useCallback(async () => {
    try {
      const ob = await apiFetch('/api/opening-balance');
      if (ob && ob.isFinalized) {
        const lines = await apiFetch('/api/opening-balance/lines');
        const unconverted = (lines || []).filter(
          (l) => l.lineType === 'FIXED_ASSET' && !l.refId
        );
        setHasUnconvertedAssets(unconverted.length > 0);
      } else {
        setHasUnconvertedAssets(false);
      }
    } catch {
      setHasUnconvertedAssets(false);
    }
  }, []);

  useEffect(() => {
    loadAssets();
    checkUnconvertedAssets();
  }, [loadAssets, checkUnconvertedAssets]);

  const resetForm = () => {
    setForm({
      name: '',
      ledgerCategoryId: null,
      purchaseDate: getKolkataDateString(),
      purchaseCost: '',
      usefulLifeMonths: '',
      salvageValue: '0',
      depreciationMethod: 'STRAIGHT_LINE',
      serialNumber: '',
    });
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.purchaseDate || !form.purchaseCost) {
      setError('Name, purchase date, and purchase cost are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/fixed-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          ledgerCategoryId: form.ledgerCategoryId || undefined,
          purchaseDate: form.purchaseDate,
          purchaseCost: parseFloat(form.purchaseCost),
          usefulLifeMonths: form.usefulLifeMonths ? parseInt(form.usefulLifeMonths) : undefined,
          salvageValue: parseFloat(form.salvageValue) || 0,
          depreciationMethod: form.depreciationMethod,
          serialNumber: form.serialNumber || undefined,
        }),
      });
      setSuccess('Asset created successfully');
      resetForm();
      setView('list');
      loadAssets();
    } catch (err) {
      setError(err.message || 'Failed to create asset');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateAsset = async (id, patch) => {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/fixed-assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      setSuccess('Asset updated successfully');
      // Reload detail
      const detail = await apiFetch(`/api/fixed-assets/${id}`);
      setAssetDetail(detail);
      loadAssets();
    } catch (err) {
      setError(err.message || 'Failed to update asset');
    } finally {
      setSaving(false);
    }
  };

  const handleDispose = async () => {
    if (!assetDetail) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/fixed-assets/${assetDetail.id}/dispose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disposedDate: disposeForm.disposedDate,
          disposalNotes: disposeForm.disposalNotes || undefined,
        }),
      });
      setSuccess('Asset disposed successfully');
      setShowDisposeModal(false);
      const detail = await apiFetch(`/api/fixed-assets/${assetDetail.id}`);
      setAssetDetail(detail);
      loadAssets();
    } catch (err) {
      setError(err.message || 'Failed to dispose asset');
    } finally {
      setSaving(false);
    }
  };

  const handleConvertAssets = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await apiFetch('/api/opening-balance/convert-asset-lines', {
        method: 'POST',
      });
      setSuccess(`Converted ${result.converted} asset(s) from opening balance`);
      setHasUnconvertedAssets(false);
      loadAssets();
    } catch (err) {
      setError(err.message || 'Failed to convert asset lines');
    } finally {
      setSaving(false);
    }
  };

  const handleRunDepreciation = async () => {
    setSaving(true);
    setError('');
    setDepreciationResult(null);
    try {
      const result = await apiFetch(
        `/api/fixed-assets/run-depreciation?periodMonth=${depMonth}`,
        { method: 'POST' }
      );
      setDepreciationResult(result);
      setSuccess(`Depreciation run: ${result.entriesWritten} entries written, ${result.assetsSkipped} skipped`);
      loadAssets();
      if (assetDetail) {
        const detail = await apiFetch(`/api/fixed-assets/${assetDetail.id}`);
        setAssetDetail(detail);
      }
    } catch (err) {
      setError(err.message || 'Failed to run depreciation');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (id) => {
    setLoading(true);
    try {
      const detail = await apiFetch(`/api/fixed-assets/${id}`);
      setAssetDetail(detail);
      setView('detail');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Render: List View ──────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div>
        {error && <div className="mb-3 text-xs font-bold text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}
        {success && <div className="mb-3 text-xs font-bold text-green-600 bg-green-50 rounded px-3 py-2">{success}</div>}

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-gray-800">Fixed Asset Register</h2>
          <div className="flex gap-2">
            {hasUnconvertedAssets && (
              <button
                onClick={handleConvertAssets}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-blue-500 rounded hover:bg-blue-600 disabled:opacity-50"
              >
                <RefreshCw size={12} className={saving ? 'animate-spin' : ''} />
                Convert Opening Balance Assets
              </button>
            )}
            <button
              onClick={() => { resetForm(); setView('form'); }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-[#E53935] rounded hover:bg-[#D32F2F]"
            >
              <Plus size={12} />
              Add Asset
            </button>
          </div>
        </div>

        {/* Depreciation run bar */}
        <div className="flex items-center gap-2 mb-3 bg-gray-50 rounded p-2">
          <TrendingDown size={14} className="text-gray-500" />
          <span className="text-xs font-bold text-gray-600">Run Depreciation:</span>
          <input
            type="month"
            value={depMonth}
            onChange={(e) => setDepMonth(e.target.value)}
            className="text-xs font-bold border border-gray-200 rounded px-2 py-1 bg-white"
          />
          <button
            onClick={handleRunDepreciation}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-gray-700 rounded hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Run
          </button>
          {depreciationResult && (
            <span className="text-[10px] font-bold text-gray-500">
              ({depreciationResult.entriesWritten} written, {depreciationResult.assetsSkipped} skipped)
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
        ) : assets.length === 0 ? (
          <div className="text-center py-8 text-xs font-bold text-gray-400">
            <Building2 size={32} className="mx-auto mb-2 text-gray-300" />
            No fixed assets yet. Create one or mark a purchase order item with an asset category.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-left py-2 px-2 font-bold">Name</th>
                  <th className="text-left py-2 px-2 font-bold">Category</th>
                  <th className="text-left py-2 px-2 font-bold">Purchase Date</th>
                  <th className="text-right py-2 px-2 font-bold">Cost</th>
                  <th className="text-right py-2 px-2 font-bold">Book Value</th>
                  <th className="text-left py-2 px-2 font-bold">Status</th>
                  <th className="text-left py-2 px-2 font-bold">Source</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const style = STATUS_STYLES[asset.status] || STATUS_STYLES.ACTIVE;
                  return (
                    <tr
                      key={asset.id}
                      onClick={() => openDetail(asset.id)}
                      className="border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                    >
                      <td className="py-2 px-2 font-bold text-gray-800">
                        {asset.name}
                        {asset.needsSetup && (
                          <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 rounded px-1 py-0.5">
                            <AlertCircle size={8} />
                            Needs Setup
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-gray-600">{asset.ledgerCategory?.name || '—'}</td>
                      <td className="py-2 px-2 text-gray-600">{asset.purchaseDate}</td>
                      <td className="py-2 px-2 text-right font-bold text-gray-800">{round2(asset.purchaseCost).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-bold text-gray-800">{round2(asset.currentBookValue).toFixed(2)}</td>
                      <td className="py-2 px-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${style.bg} ${style.text}`}>
                          {style.label}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-gray-500 text-[10px]">{SOURCE_LABELS[asset.sourceType] || asset.sourceType}</td>
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

  // ── Render: Detail View ────────────────────────────────────────────────────
  if (view === 'detail' && assetDetail) {
    const style = STATUS_STYLES[assetDetail.status] || STATUS_STYLES.ACTIVE;
    return (
      <div>
        {error && <div className="mb-3 text-xs font-bold text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}
        {success && <div className="mb-3 text-xs font-bold text-green-600 bg-green-50 rounded px-3 py-2">{success}</div>}

        <button
          onClick={() => { setView('list'); setAssetDetail(null); }}
          className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-700 mb-3"
        >
          <ArrowLeft size={14} />
          Back to list
        </button>

        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-sm font-black text-gray-800">{assetDetail.name}</h2>
              {assetDetail.needsSetup && (
                <div className="mt-1 text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-2 py-1 inline-flex items-center gap-1">
                  <AlertCircle size={10} />
                  Needs Setup — fill in useful life to enable depreciation
                </div>
              )}
            </div>
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${style.bg} ${style.text}`}>
              {style.label}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-gray-400 font-bold mb-0.5">Purchase Date</div>
              <div className="font-bold text-gray-700">{assetDetail.purchaseDate}</div>
            </div>
            <div>
              <div className="text-gray-400 font-bold mb-0.5">Purchase Cost</div>
              <div className="font-bold text-gray-700">{round2(assetDetail.purchaseCost).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-400 font-bold mb-0.5">Current Book Value</div>
              <div className="font-bold text-gray-700">{round2(assetDetail.currentBookValue).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-400 font-bold mb-0.5">Salvage Value</div>
              <div className="font-bold text-gray-700">{round2(assetDetail.salvageValue).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-400 font-bold mb-0.5">Useful Life (months)</div>
              <div className="font-bold text-gray-700">{assetDetail.usefulLifeMonths ?? '—'}</div>
            </div>
            <div>
              <div className="text-gray-400 font-bold mb-0.5">Method</div>
              <div className="font-bold text-gray-700">{assetDetail.depreciationMethod}</div>
            </div>
            <div>
              <div className="text-gray-400 font-bold mb-0.5">Serial Number</div>
              <div className="font-bold text-gray-700">{assetDetail.serialNumber || '—'}</div>
            </div>
            <div>
              <div className="text-gray-400 font-bold mb-0.5">Source</div>
              <div className="font-bold text-gray-700">{SOURCE_LABELS[assetDetail.sourceType] || assetDetail.sourceType}</div>
            </div>
          </div>

          {/* Inline edit for needsSetup assets */}
          {assetDetail.needsSetup && assetDetail.status === 'ACTIVE' && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-xs font-bold text-gray-600 mb-2">Complete Setup</div>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Useful Life (months)</label>
                  <input
                    type="number"
                    placeholder="e.g. 60"
                    value={form.usefulLifeMonths}
                    onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })}
                    className="w-24 bg-white border border-gray-200 rounded px-2 py-1 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Salvage Value</label>
                  <input
                    type="number"
                    value={form.salvageValue}
                    onChange={(e) => setForm({ ...form, salvageValue: e.target.value })}
                    className="w-24 bg-white border border-gray-200 rounded px-2 py-1 text-xs font-bold"
                  />
                </div>
                <button
                  onClick={() => handleUpdateAsset(assetDetail.id, {
                    usefulLifeMonths: parseInt(form.usefulLifeMonths) || undefined,
                    salvageValue: parseFloat(form.salvageValue) || 0,
                  })}
                  disabled={saving || !form.usefulLifeMonths}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-[#E53935] rounded hover:bg-[#D32F2F] disabled:opacity-50"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Dispose button */}
          {assetDetail.status === 'ACTIVE' && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <button
                onClick={() => setShowDisposeModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
              >
                <Ban size={12} />
                Dispose Asset
              </button>
            </div>
          )}
        </div>

        {/* Depreciation history */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-xs font-black text-gray-800 mb-2">Depreciation History</h3>
          {(!assetDetail.depreciationEntries || assetDetail.depreciationEntries.length === 0) ? (
            <div className="text-xs font-bold text-gray-400 py-4 text-center">
              No depreciation entries yet. Run depreciation for a period month to begin.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-left py-2 px-2 font-bold">Period</th>
                  <th className="text-right py-2 px-2 font-bold">Depreciation</th>
                  <th className="text-right py-2 px-2 font-bold">Book Value After</th>
                </tr>
              </thead>
              <tbody>
                {assetDetail.depreciationEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-100">
                    <td className="py-2 px-2 font-bold text-gray-700">{entry.periodMonth}</td>
                    <td className="py-2 px-2 text-right font-bold text-red-600">
                      −{round2(Number(entry.depreciationAmount)).toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-gray-700">
                      {round2(Number(entry.bookValueAfter)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Dispose modal */}
        {showDisposeModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-5 max-w-md w-full">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black text-gray-800">Dispose Asset</h3>
                <button onClick={() => setShowDisposeModal(false)}>
                  <X size={16} className="text-gray-400" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Disposal Date</label>
                  <input
                    type="date"
                    value={disposeForm.disposedDate}
                    onChange={(e) => setDisposeForm({ ...disposeForm, disposedDate: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Disposal Notes</label>
                  <textarea
                    value={disposeForm.disposalNotes}
                    onChange={(e) => setDisposeForm({ ...disposeForm, disposalNotes: e.target.value })}
                    rows={3}
                    placeholder="Optional notes about the disposal..."
                    className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowDisposeModal(false)}
                    className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDispose}
                    disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-red-500 rounded hover:bg-red-600 disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                    Confirm Disposal
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Form View ──────────────────────────────────────────────────────
  if (view === 'form') {
    return (
      <div>
        {error && <div className="mb-3 text-xs font-bold text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}
        {success && <div className="mb-3 text-xs font-bold text-green-600 bg-green-50 rounded px-3 py-2">{success}</div>}

        <button
          onClick={() => { setView('list'); resetForm(); }}
          className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-700 mb-3"
        >
          <ArrowLeft size={14} />
          Back to list
        </button>

        <div className="bg-white border border-gray-200 rounded-lg p-5 max-w-lg">
          <h2 className="text-sm font-black text-gray-800 mb-4">Add Fixed Asset</h2>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Commercial Oven"
                className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Category</label>
              <LedgerCategoryPicker
                entryType="ASSET"
                value={form.ledgerCategoryId ? { id: form.ledgerCategoryId } : null}
                onChange={(cat) => setForm({ ...form, ledgerCategoryId: cat?.id || null })}
                placeholder="Tag with asset category (optional)"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Purchase Date *</label>
                <input
                  type="date"
                  value={form.purchaseDate}
                  onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                  className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Purchase Cost *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.purchaseCost}
                  onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Useful Life (months)</label>
                <input
                  type="number"
                  value={form.usefulLifeMonths}
                  onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })}
                  placeholder="e.g. 60"
                  className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Salvage Value</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.salvageValue}
                  onChange={(e) => setForm({ ...form, salvageValue: e.target.value })}
                  className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Serial Number</label>
              <input
                type="text"
                value={form.serialNumber}
                onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                placeholder="Optional"
                className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => { setView('list'); resetForm(); }}
                className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-[#E53935] rounded hover:bg-[#D32F2F] disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Create Asset
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
