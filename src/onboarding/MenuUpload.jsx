// ─────────────────────────────────────────────────────────────────────────────
// MenuUpload — Excel menu upload with AI parsing support
// ─────────────────────────────────────────────────────────────────────────────
// Provides menu import functionality via file upload:
//   - Drag-and-drop or click to upload Excel (.xlsx) or CSV files
//   - Parses uploaded file and displays editable preview table
//   - AI parsing option: upload menu image → Groq API extracts items
//   - Edit parsed rows before importing (name, price, category, veg/non-veg)
//   - Import to backend via /api/menu/import or /api/menu/ai-parse
//   - Works in both onboarding mode and admin menu management mode
//
// Used by StepMenu (onboarding) and AdminComponents (menu management).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileSpreadsheet, FileText, AlertCircle, CheckCircle, Loader, Leaf, Download, Layers } from 'lucide-react';
import { API_BASE, getAuthHeaders } from '../services/apiConfig';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';

export default function MenuUpload({ onImported, onboardingMode = false, restaurantType, existingCategories = [], sessionId, targetVenueId }) {
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [editedRows, setEditedRows] = useState(null);
  const fileInputRef = useRef(null);
  const [categorySuggestions, setCategorySuggestions] = useState(existingCategories);
  const [uploadMode, setUploadMode] = useState('standard'); // 'standard' | 'rate-card'
  const [venueNames, setVenueNames] = useState([]);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const isPdf = file?.name?.toLowerCase().endsWith('.pdf') || false;

  // Fetch existing categories in non-onboarding mode if not provided via props
  useEffect(() => {
    if (!onboardingMode && existingCategories.length === 0) {
      const restaurantId = getCurrentRestaurantId();
      fetch(`${API_BASE}/api/menu/categories?restaurantId=${encodeURIComponent(restaurantId)}`, {
        headers: getAuthHeaders(),
      })
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          if (Array.isArray(data)) {
            setCategorySuggestions(data.filter(c => c.isActive !== false).map(c => c.name));
          }
        })
        .catch(() => {});
    } else {
      setCategorySuggestions(existingCategories);
    }
  }, [onboardingMode, existingCategories]);

  const handleFileSelect = (selected) => {
    if (!selected) return;
    setFile(selected);
    setParsed(null);
    setImportResult(null);
    setEditedRows(null);
    setError('');
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

  const downloadTemplate = async () => {
    let csv;
    if (uploadMode === 'rate-card') {
      // Dynamic template: fetch venue names from API
      let venues = venueNames;
      if (venues.length === 0 && !onboardingMode) {
        try {
          const res = await fetch(`${API_BASE}/api/venues`, { headers: { ...getAuthHeaders() } });
          if (res.ok) {
            const data = await res.json();
            venues = data.map(v => v.name).filter(Boolean);
            setVenueNames(venues);
          }
        } catch (e) {
          // fallback to example venue names
        }
      }
      const venueCols = venues.length > 0 ? venues : ['Bar (AC)', 'Conference Hall', 'PDR', 'Rooms', 'Parcel'];
      const header = ['Category', 'Subcategory', 'Item Name', 'Type', 'Unit', ...venueCols].join(',');
      const exampleRows = [
        ['Liquor', 'Whiskey', 'Antiquity 750ml', 'LIQUOR', '750ml', ...venueCols.map(() => '200')].join(','),
        ['Food', 'Starters', 'Fish Fry B/L', 'FOOD', 'plate', ...venueCols.map(() => '410')].join(','),
      ];
      csv = [header, ...exampleRows].join('\n');
    } else {
      csv = 'Category,Item Name,Price,Veg\nStarters,Paneer Tikka,250,1\nStarters,Chicken Wings,320,0\nMain Course,Dal Makhani,180,1\nMain Course,Butter Chicken,380,0\nBeverages,Fresh Lime Soda,80,1\nBeverages,Masala Chai,40,1';
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = uploadMode === 'rate-card' ? 'rate-card-template.csv' : 'menu-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleParse = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    setParsed(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (restaurantType) {
        formData.append('restaurantType', restaurantType);
      }
      if (sessionId) {
        formData.append('sessionId', sessionId);
      }

      const res = await fetch(`${API_BASE}/api/menu/admin/upload`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body: formData,
        signal: AbortSignal.timeout(isPdf ? 120000 : 30000),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to parse file');
      }

      const data = await res.json();
      setParsed(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    setImporting(true);
    setError('');

    try {
      if (onboardingMode) {
        // During onboarding, restaurant doesn't exist yet. Return parsed rows
        // so the parent wizard can include them in the final onboarding payload.
        // Include mode and venueHeaders so bulk-import can resolve venues later.
        const result = { created: parsed.rows.length, skipped: [] };
        setImportResult(result);
        if (onImported) onImported({
          rows: parsed.rows,
          mode: parsed.mode || 'standard',
          venueHeaders: parsed.venueHeaders || [],
        });
        return;
      }

      const restaurantId = getCurrentRestaurantId();
      const res = await fetch(`${API_BASE}/api/menu/admin/bulk-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          restaurantId,
          rows: editedRows || parsed.rows,
          mode: parsed.mode || 'standard',
          venueMap: parsed.venueMap || {},
          replaceExisting,
          ...(targetVenueId && targetVenueId !== 'all' ? { targetVenueId } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to import menu');
      }

      const result = await res.json();
      setImportResult(result);
      if (onImported) onImported(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParsed(null);
    setImportResult(null);
    setEditedRows(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateRow = (index, field, value) => {
    const target = editedRows || parsed.rows;
    const next = target.map((r, i) => i === index ? { ...r, [field]: value } : r);
    setEditedRows(next);
  };

  return (
    <div className="space-y-4">
      {/* Upload mode selector */}
      {!parsed && !importResult && (
        <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
          <button
            onClick={() => setUploadMode('standard')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
              uploadMode === 'standard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            Standard Menu
          </button>
          <button
            onClick={() => setUploadMode('rate-card')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
              uploadMode === 'rate-card' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            <Layers size={14} /> Rate Card
          </button>
        </div>
      )}

      {/* File picker / drag-drop */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center bg-gray-50 transition-all ${
          isDragging ? 'border-[#E53935] bg-[#FFF5F5]' : 'border-gray-200'
        }`}
      >
        <Upload size={48} className={`mx-auto mb-4 transition-all ${isDragging ? 'text-[#E53935]' : 'text-gray-400'}`} />
        <p className="text-gray-900 mb-2">{isDragging ? 'Drop your file here' : uploadMode === 'rate-card' ? 'Upload your rate card sheet' : 'Upload your menu file'}</p>
        <p className="text-sm text-gray-400 mb-4">
          {uploadMode === 'rate-card'
            ? 'Supported formats: Excel (.xlsx), CSV (.csv). Rows = items, columns = venue prices.'
            : 'Supported formats: Excel (.xlsx), CSV (.csv), PDF (.pdf)'}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.pdf"
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
          onClick={downloadTemplate}
          className="inline-flex items-center gap-2 ml-3 px-4 py-3 text-sm text-gray-600 hover:text-[#E53935] transition-all"
        >
          <Download size={16} /> Download template
        </button>
        {file && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-600">
            {file.name.endsWith('.pdf') ? <FileText size={16} /> : <FileSpreadsheet size={16} />}
            <span>{file.name}</span>
            <span className="text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Parse button */}
      {file && !parsed && !importResult && (
        <button
          onClick={handleParse}
          disabled={loading}
          className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />}
          {loading ? (isPdf ? 'AI parsing menu...' : 'Parsing...') : 'Parse File'}
        </button>
      )}

      {/* Parsed preview */}
      {parsed && !importResult && (
        <div className="space-y-4">
          {parsed.confidence === 'LOW' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2 text-yellow-800 text-sm">
              <AlertCircle size={18} />
              Low confidence parse — please review the rows carefully before importing.
            </div>
          )}

          {parsed.warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-sm">
              <p className="font-medium mb-1">Warnings:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* Rate card venue mapping summary */}
          {parsed.mode === 'rate-card' && parsed.venueHeaders && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-blue-900 mb-1">Detected venue columns:</p>
              <div className="flex flex-wrap gap-2">
                {parsed.venueHeaders.map((vh, i) => {
                  const matched = parsed.venueMap?.[vh];
                  const isUnmatched = parsed.unmatchedVenues?.includes(vh);
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

          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-900">
                Preview ({parsed.rows.length} items)
                {parsed.mode === 'rate-card' && <span className="ml-2 text-xs font-normal text-blue-600">Rate Card Mode</span>}
              </h4>
              <span className="text-sm text-gray-400">Confidence: {parsed.confidence}</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {parsed.mode === 'rate-card' ? (
                /* Rate card preview: show item name, category, type, base price, per-venue prices */
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-left text-gray-400">
                      <th className="py-2 pr-2">Category</th>
                      <th className="py-2 pr-2">Name</th>
                      <th className="py-2 pr-2">Type</th>
                      <th className="py-2 pr-2">Base ₹</th>
                      {parsed.venueHeaders?.map((vh, i) => (
                        <th key={i} className="py-2 pr-2 text-xs">{vh}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(editedRows || parsed.rows).map((row, i) => (
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
                        {parsed.venueHeaders?.map((vh, vi) => {
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
                /* Standard preview (existing) */
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
                    {(editedRows || parsed.rows).map((row, i) => (
                      <tr key={i} className="border-t border-gray-100">
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
                    ))}
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

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (editedRows) {
                  setParsed(prev => ({ ...prev, rows: editedRows }));
                }
                handleImport();
              }}
              disabled={importing || parsed.rows.length === 0}
              className="flex-1 py-3 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {importing ? <Loader size={18} className="animate-spin" /> : <CheckCircle size={18} />}
              {importing ? 'Importing...' : `Import ${(editedRows || parsed.rows).length} Items`}
            </button>
          </div>
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3 text-green-800">
            <CheckCircle size={24} />
            <div>
              <p className="font-medium">
                {importResult.created} items created{importResult.updated ? `, ${importResult.updated} updated` : ''}!
                {importResult.deleted ? `, ${importResult.deleted} deleted` : ''}
              </p>
              {importResult.skipped.length > 0 && (
                <p className="text-sm text-green-600 mt-1">{importResult.skipped.length} items skipped</p>
              )}
            </div>
          </div>

          {importResult.skipped.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-sm">
              <p className="font-medium mb-1">Skipped items:</p>
              <ul className="list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
                {importResult.skipped.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

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
