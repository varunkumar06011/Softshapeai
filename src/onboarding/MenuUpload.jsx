// ─────────────────────────────────────────────────────────────────────────────
// MenuUpload — Universal menu import with column mapping (4-stage flow)
// ─────────────────────────────────────────────────────────────────────────────
// Stages:
//   1. Upload    — accept any Excel/CSV/PDF/Image, auto-detect file type
//   2. Mapping   — user confirms column→field mapping (Excel/CSV only)
//   3. Preview   — first 20 normalized rows, editable, with validation errors
//   4. Result    — import summary with per-row error report
//
// Backend pipeline: Parser → Normalizer → Validator → Importer
// Every file type feeds into the same UploadResult shape.
//
// Used by StepMenu (onboarding), AdminComponents (menu management), and
// SettingsPage. Same prop contract as the previous version.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Upload, FileSpreadsheet, FileText, AlertCircle, CheckCircle, Loader,
  Leaf, Download, Image as ImageIcon, ArrowLeft, ChevronRight,
} from 'lucide-react';
import { cloudApiUrl, getAuthHeaders } from '../services/apiConfig';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';

// Canonical field options for the mapping dropdown (must match backend enum).
const CANONICAL_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'price', label: 'Price' },
  { value: 'category', label: 'Category' },
  { value: 'isVeg', label: 'Veg / Non-Veg' },
  { value: 'description', label: 'Description' },
  { value: 'gst', label: 'GST %' },
  { value: 'hsn', label: 'HSN Code' },
  { value: 'image', label: 'Image URL' },
  { value: 'sku', label: 'SKU / Code' },
  { value: 'kitchen', label: 'Kitchen Station' },
  { value: 'printer', label: 'Printer' },
  { value: 'preparationTime', label: 'Preparation Time' },
  { value: 'isAvailable', label: 'Available' },
  { value: 'menuType', label: 'Menu Type (FOOD/LIQUOR)' },
  { value: 'unit', label: 'Unit' },
];

// Source badge colors for the mapping screen.
const SOURCE_COLORS = {
  exact: 'bg-green-100 text-green-700',
  synonym: 'bg-green-100 text-green-700',
  saved: 'bg-blue-100 text-blue-700',
  fuzzy: 'bg-yellow-100 text-yellow-700',
  ai: 'bg-purple-100 text-purple-700',
  manual: 'bg-gray-100 text-gray-600',
};

// Severity colors for validation errors.
const SEVERITY_COLORS = {
  ERROR: 'bg-red-50 border-red-200 text-red-700',
  WARNING: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  INFO: 'bg-blue-50 border-blue-200 text-blue-700',
};

const ACCEPTED_EXTENSIONS = '.xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png';

export default function MenuUpload({ onImported, onboardingMode = false, restaurantType, existingCategories = [], sessionId, targetVenueId }) {
  // ── State ──
  const [stage, setStage] = useState(1); // 1=upload, 2=mapping, 3=preview, 4=result
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // UploadResult from the backend (the single ImportJob state object).
  const [uploadResult, setUploadResult] = useState(null);
  // User-confirmed mapping: { [colIndex]: fieldName | null }
  const [userMapping, setUserMapping] = useState({});
  // Edited normalized rows (from the preview table).
  const [editedRows, setEditedRows] = useState(null);
  // Import result summary.
  const [importResult, setImportResult] = useState(null);
  // Replace existing menu option.
  const [replaceExisting, setReplaceExisting] = useState(false);
  // Categories fetched from the API (only used in non-onboarding mode when
  // existingCategories prop is empty). We keep this separate from the prop
  // so we don't trigger a setState-in-effect cascade.
  const [fetchedCategories, setFetchedCategories] = useState([]);
  // Final category suggestions: prefer prop, fall back to fetched.
  const categorySuggestions = useMemo(
    () => existingCategories.length > 0 ? existingCategories : fetchedCategories,
    [existingCategories, fetchedCategories]
  );

  const isPdf = file?.name?.toLowerCase().endsWith('.pdf') || false;
  const isImage = file?.name?.toLowerCase().match(/\.(jpg|jpeg|png)$/) || false;

  // Fetch existing categories in non-onboarding mode if not provided via props.
  // The setState here only runs in the async callback (not synchronously in
  // the effect body), so it doesn't cause cascading renders.
  useEffect(() => {
    if (onboardingMode || existingCategories.length > 0) return;
    const restaurantId = getCurrentRestaurantId();
    let cancelled = false;
    fetch(cloudApiUrl(`/api/menu/categories?restaurantId=${encodeURIComponent(restaurantId)}`), {
      headers: getAuthHeaders(),
    })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (!cancelled && Array.isArray(data)) {
          setFetchedCategories(data.filter(c => c.isActive !== false).map(c => c.name));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [onboardingMode, existingCategories]);

  // ── Stage 1: Upload ──

  const handleFileSelect = (selected) => {
    if (!selected) return;
    setFile(selected);
    setError('');
    setUploadResult(null);
    setImportResult(null);
    setEditedRows(null);
    setUserMapping({});
    // Auto-upload on file select
    uploadFile(selected);
  };

  const onFileInputChange = (e) => {
    handleFileSelect(e.target.files[0]);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  };

  const uploadFile = async (selectedFile) => {
    setLoading(true);
    setError('');
    setUploadResult(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (restaurantType) formData.append('restaurantType', restaurantType);
      if (sessionId) formData.append('sessionId', sessionId);

      const res = await fetch(cloudApiUrl('/api/menu/admin/upload'), {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body: formData,
        signal: AbortSignal.timeout(isPdf || isImage ? 120000 : 30000),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to parse file');
      }

      const data = await res.json();
      setUploadResult(data);

      // Initialize userMapping from suggestedMapping
      const initialMapping = {};
      (data.suggestedMapping || []).forEach((m, i) => {
        initialMapping[i] = m.field;
      });
      setUserMapping(initialMapping);

      // Advance to the appropriate stage
      if (data.requiresMapping) {
        setStage(2);
      } else {
        setEditedRows(data.normalizedRows || []);
        setStage(3);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadSampleExcel = () => {
    // Generate a sample CSV with all canonical fields as headers + 3 sample rows.
    const headers = ['Category', 'Item Name', 'Price', 'Veg', 'Description', 'GST', 'HSN', 'Image URL', 'SKU'];
    const rows = [
      ['Starters', 'Paneer Tikka', '250', 'veg', 'Grilled cottage cheese with spices', '5', '1006', '', 'PT001'],
      ['Main Course', 'Butter Chicken', '380', 'non-veg', 'Chicken in creamy tomato gravy', '5', '1006', '', 'BC001'],
      ['Beverages', 'Fresh Lime Soda', '80', 'veg', '', '5', '2106', '', 'FLS001'],
    ];
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'menu-sample-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Stage 2: Column Mapping ──

  const handleMappingChange = (colIndex, value) => {
    setUserMapping(prev => ({ ...prev, [colIndex]: value === '' ? null : value }));
  };

  const handleApplyMapping = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(cloudApiUrl('/api/menu/admin/apply-mapping'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          columns: uploadResult.columns,
          mapping: userMapping,
          rows: uploadResult.rows,
          restaurantType,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to apply mapping');
      }

      const data = await res.json();
      setUploadResult(data);
      setEditedRows(data.normalizedRows || []);
      setStage(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Stage 3: Preview ──

  const updateRow = (index, field, value) => {
    const target = editedRows || uploadResult.normalizedRows || [];
    const next = target.map((r, i) => i === index ? { ...r, [field]: value } : r);
    setEditedRows(next);
  };

  const handleImport = async () => {
    const rows = editedRows || uploadResult.normalizedRows || [];
    if (rows.length === 0) return;
    setImporting(true);
    setError('');

    try {
      if (onboardingMode) {
        // During onboarding, restaurant doesn't exist yet. Return parsed rows
        // so the parent wizard can include them in the final onboarding payload.
        const result = { created: rows.length, skipped: [] };
        setImportResult(result);
        if (onImported) onImported({
          rows,
          mode: uploadResult.isRateCard ? 'rate-card' : 'standard',
          venueHeaders: uploadResult.venueHeaders || [],
        });
        setStage(4);
        return;
      }

      const restaurantId = getCurrentRestaurantId();
      const res = await fetch(cloudApiUrl('/api/menu/admin/bulk-import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          restaurantId,
          rows,
          mode: uploadResult.isRateCard ? 'rate-card' : 'standard',
          venueMap: uploadResult.venueMap || {},
          replaceExisting,
          ...(targetVenueId && targetVenueId !== 'all' ? { targetVenueId } : {}),
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to import menu');
      }

      const result = await res.json();
      setImportResult(result);
      setStage(4);
      if (onImported) onImported(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  // ── Reset ──

  const handleReset = () => {
    setFile(null);
    setUploadResult(null);
    setImportResult(null);
    setEditedRows(null);
    setUserMapping({});
    setError('');
    setStage(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Render ──

  const previewRows = editedRows || uploadResult?.normalizedRows || [];
  const errorByRow = new Map();
  (uploadResult?.errors || []).forEach(e => {
    if (!errorByRow.has(e.rowIndex)) errorByRow.set(e.rowIndex, []);
    errorByRow.get(e.rowIndex).push(e);
  });

  return (
    <div className="space-y-4">
      {/* ── Stage 1: Upload ── */}
      {stage === 1 && (
        <>
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center bg-gray-50 transition-all ${
              isDragging ? 'border-[#E53935] bg-[#FFF5F5]' : 'border-gray-200'
            }`}
          >
            <Upload size={48} className={`mx-auto mb-4 transition-all ${isDragging ? 'text-[#E53935]' : 'text-gray-400'}`} />
            <p className="text-gray-900 mb-2">{isDragging ? 'Drop your file here' : 'Upload your menu file'}</p>
            <p className="text-sm text-gray-400 mb-4">
              Supports: Excel (.xlsx, .xls), CSV, PDF, Images (.jpg, .png)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={onFileInputChange}
              className="hidden"
              id="menu-file-upload"
            />
            <label
              htmlFor="menu-file-upload"
              className="inline-block px-6 py-3 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl cursor-pointer transition-all"
            >
              Choose File
            </label>
            <button
              onClick={downloadSampleExcel}
              className="inline-flex items-center gap-2 ml-3 px-4 py-3 text-sm text-gray-600 hover:text-[#E53935] transition-all"
            >
              <Download size={16} /> Download Sample
            </button>
            {file && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-600">
                {isPdf ? <FileText size={16} /> : isImage ? <ImageIcon size={16} /> : <FileSpreadsheet size={16} />}
                <span>{file.name}</span>
                <span className="text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-gray-600">
              <Loader size={20} className="animate-spin" />
              <span className="text-sm">{isPdf ? 'AI parsing menu...' : isImage ? 'AI parsing image...' : 'Parsing file...'}</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={18} />
              {error}
            </div>
          )}
        </>
      )}

      {/* ── Stage 2: Column Mapping ── */}
      {stage === 2 && uploadResult && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <button onClick={handleReset} className="flex items-center gap-1 hover:text-gray-900">
              <ArrowLeft size={14} /> Back
            </button>
            <ChevronRight size={14} />
            <span className="font-medium text-gray-900">Confirm Column Mapping</span>
          </div>

          <p className="text-sm text-gray-600">
            We auto-detected your columns. Confirm or change the mapping below, then click Apply.
          </p>

          {/* Saved mapping indicator */}
          {uploadResult.suggestedMapping?.some(m => m.source === 'saved') && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-sm text-blue-700">
              Using your saved mapping from a previous upload.
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-200">
                  <th className="py-2 pr-4">Excel Column</th>
                  <th className="py-2 pr-4">Maps To</th>
                  <th className="py-2 pr-4">Source</th>
                </tr>
              </thead>
              <tbody>
                {uploadResult.columns.map((col, i) => {
                  const suggested = uploadResult.suggestedMapping?.[i];
                  const source = suggested?.source || 'manual';
                  const sourceColor = SOURCE_COLORS[source] || SOURCE_COLORS.manual;
                  return (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2 pr-4 text-gray-900 font-medium">{col}</td>
                      <td className="py-2 pr-4">
                        <select
                          value={userMapping[i] || ''}
                          onChange={(e) => handleMappingChange(i, e.target.value)}
                          className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E53935]"
                        >
                          <option value="">(ignore)</option>
                          {CANONICAL_FIELDS.map(f => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${sourceColor}`}>
                          {source}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyMapping}
              disabled={loading}
              className="flex-1 py-3 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader size={18} className="animate-spin" /> : <CheckCircle size={18} />}
              {loading ? 'Processing...' : 'Apply Mapping'}
            </button>
          </div>
        </div>
      )}

      {/* ── Stage 3: Preview ── */}
      {stage === 3 && uploadResult && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {uploadResult.requiresMapping === false && (
              <button onClick={handleReset} className="flex items-center gap-1 hover:text-gray-900">
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {uploadResult.requiresMapping !== false && (
              <button onClick={() => setStage(2)} className="flex items-center gap-1 hover:text-gray-900">
                <ArrowLeft size={14} /> Edit Mapping
              </button>
            )}
            <ChevronRight size={14} />
            <span className="font-medium text-gray-900">Preview ({previewRows.length} items)</span>
          </div>

          {/* Warnings */}
          {uploadResult.warnings?.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-sm max-h-32 overflow-y-auto">
              <ul className="list-disc list-inside space-y-0.5">
                {uploadResult.warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}
                {uploadResult.warnings.length > 10 && <li>...and {uploadResult.warnings.length - 10} more warnings</li>}
              </ul>
            </div>
          )}

          {/* Rate card venue mapping summary */}
          {uploadResult.isRateCard && uploadResult.venueHeaders && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-blue-900 mb-1">Detected venue columns:</p>
              <div className="flex flex-wrap gap-2">
                {uploadResult.venueHeaders.map((vh, i) => {
                  const matched = uploadResult.venueMap?.[vh];
                  const isUnmatched = uploadResult.unmatchedVenues?.includes(vh);
                  return (
                    <span
                      key={i}
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        isUnmatched ? 'bg-red-100 text-red-700' : matched ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {vh}{matched ? ` → ${matched}` : isUnmatched ? ' (unmatched)' : ''}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Validation errors summary */}
          {uploadResult.errors?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-red-800 mb-1">
                {uploadResult.errors.filter(e => e.severity === 'ERROR').length} errors,{' '}
                {uploadResult.errors.filter(e => e.severity === 'WARNING').length} warnings
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {uploadResult.errors.slice(0, 15).map((e, i) => (
                  <div key={i} className={`px-2 py-1 rounded border text-xs ${SEVERITY_COLORS[e.severity]}`}>
                    <span className="font-medium">Row {e.rowIndex}:</span> {e.message}
                  </div>
                ))}
                {uploadResult.errors.length > 15 && <p className="text-gray-500 text-xs">...and {uploadResult.errors.length - 15} more</p>}
              </div>
            </div>
          )}

          {/* Preview table */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-900">
                Preview
                {uploadResult.isRateCard && <span className="ml-2 text-xs font-normal text-blue-600">Rate Card Mode</span>}
              </h4>
              <span className="text-sm text-gray-400">
                Showing {Math.min(20, previewRows.length)} of {previewRows.length}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {uploadResult.isRateCard ? (
                /* Rate card preview */
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-left text-gray-400">
                      <th className="py-2 pr-2">Category</th>
                      <th className="py-2 pr-2">Name</th>
                      <th className="py-2 pr-2">Type</th>
                      <th className="py-2 pr-2">Base ₹</th>
                      {uploadResult.venueHeaders?.map((vh, i) => (
                        <th key={i} className="py-2 pr-2 text-xs">{vh}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 20).map((row, i) => (
                      <tr key={i} className={`border-t border-gray-100 ${row.isAvailable === false ? 'opacity-40' : ''}`}>
                        <td className="py-1.5 pr-2">
                          <input
                            type="text"
                            list="category-suggestions"
                            value={row.category}
                            onChange={(e) => updateRow(i, 'category', e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-gray-600 text-xs focus:outline-none focus:border-[#E53935]"
                          />
                        </td>
                        <td className="py-1.5 pr-2 text-gray-900 text-xs font-medium">{row.name}</td>
                        <td className="py-1.5 pr-2">
                          <span className={`text-xs font-medium ${row.menuType === 'LIQUOR' ? 'text-amber-600' : 'text-green-600'}`}>
                            {row.menuType}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-gray-700 text-xs font-bold">₹{row.price}</td>
                        {uploadResult.venueHeaders?.map((vh, vi) => {
                          const vp = row.venuePrices?.[vh];
                          return (
                            <td key={vi} className="py-1.5 pr-2 text-xs">
                              {vp ? <span className="text-gray-700">₹{vp}</span> : <span className="text-gray-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                /* Standard preview */
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-left text-gray-400">
                      <th className="py-2 pr-2">Category</th>
                      <th className="py-2 pr-2">Name</th>
                      <th className="py-2 pr-2">Price</th>
                      <th className="py-2 pr-2">Variants</th>
                      <th className="py-2 pr-2">Veg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 20).map((row, i) => {
                      const rowErrors = errorByRow.get(row.index) || [];
                      const hasError = rowErrors.some(e => e.severity === 'ERROR');
                      return (
                        <tr key={i} className={`border-t border-gray-100 ${hasError ? 'bg-red-50' : ''}`}>
                          <td className="py-1.5 pr-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                list="category-suggestions"
                                value={row.category}
                                onChange={(e) => updateRow(i, 'category', e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-gray-600 text-xs focus:outline-none focus:border-[#E53935]"
                              />
                              {row.categoryInferred && (
                                <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-700 rounded-full whitespace-nowrap">AI</span>
                              )}
                            </div>
                          </td>
                          <td className="py-1.5 pr-2 text-gray-900">{row.name}</td>
                          <td className="py-1.5 pr-2">
                            {row.variants ? (
                              <span className="text-gray-500 text-xs">₹{row.price}</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-gray-400 text-xs">₹</span>
                                <input
                                  type="number"
                                  value={row.price}
                                  onChange={(e) => updateRow(i, 'price', parseFloat(e.target.value) || 0)}
                                  className="w-20 px-2 py-1 bg-white border border-gray-200 rounded text-gray-600 text-xs focus:outline-none focus:border-[#E53935]"
                                  min="0"
                                  step="0.01"
                                />
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 pr-2">
                            {row.variants ? (
                              <span className="text-gray-500 text-xs">
                                {row.variants.map((v, vi) => (
                                  <span key={vi}>
                                    {vi > 0 && ' / '}{v.name} ₹{v.price}
                                  </span>
                                ))}
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-2">
                            {row.isVeg ? <Leaf size={14} className="text-green-600" /> : <span className="text-red-600 text-xs">Non-Veg</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <datalist id="category-suggestions">
              {categorySuggestions.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          {/* Replace existing option */}
          {!onboardingMode && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="w-4 h-4 accent-[#E53935]"
              />
              <span>Replace existing menu (deletes all current items before import)</span>
            </label>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing || previewRows.length === 0}
              className="flex-1 py-3 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {importing ? <Loader size={18} className="animate-spin" /> : <CheckCircle size={18} />}
              {importing ? 'Importing...' : `Import ${previewRows.length} Items`}
            </button>
          </div>
        </div>
      )}

      {/* ── Stage 4: Import Result ── */}
      {stage === 4 && importResult && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3 text-green-800">
            <CheckCircle size={24} />
            <div>
              <p className="font-medium">
                {importResult.created || importResult.created === 0 ? `${importResult.created} items created` : ''}
                {importResult.updated ? `, ${importResult.updated} updated` : ''}
                {importResult.deleted ? `, ${importResult.deleted} deleted` : ''}
                {onboardingMode && !importResult.created ? `${importResult.created || previewRows.length} items ready for import` : ''}
                !
              </p>
              {importResult.skipped?.length > 0 && (
                <p className="text-sm text-green-600 mt-1">{importResult.skipped.length} items skipped</p>
              )}
            </div>
          </div>

          {/* Skipped items error report */}
          {importResult.skipped?.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-sm">
              <p className="font-medium mb-1">Skipped items:</p>
              <ul className="list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
                {importResult.skipped.map((s, i) => <li key={i}>{typeof s === 'string' ? s : JSON.stringify(s)}</li>)}
              </ul>
            </div>
          )}

          {/* Validation error report */}
          {uploadResult?.errors?.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-gray-900 mb-2">Validation report:</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {uploadResult.errors.map((e, i) => (
                  <div key={i} className={`px-2 py-1 rounded border text-xs ${SEVERITY_COLORS[e.severity]}`}>
                    <span className="font-medium">Row {e.rowIndex} [{e.severity}]</span> — {e.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Venue price mapping */}
          {importResult.resolvedVenueMap && Object.keys(importResult.resolvedVenueMap).length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-blue-900 mb-1">Venue price mapping:</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(importResult.resolvedVenueMap).map(([col, id]) => (
                  <span key={col} className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">
                    {col} → {id}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleReset}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all"
          >
            Upload Another File
          </button>
        </div>
      )}
    </div>
  );
}
