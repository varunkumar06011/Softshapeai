import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, FileText, AlertCircle, CheckCircle, Loader, Leaf, Download } from 'lucide-react';
import { API_BASE, getAuthHeaders } from '../services/apiConfig';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';

export default function MenuUpload({ onImported, onboardingMode = false }) {
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [editedRows, setEditedRows] = useState(null);
  const fileInputRef = useRef(null);

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

  const downloadTemplate = () => {
    const csv = 'Category,Item Name,Price,Veg\nStarters,Paneer Tikka,250,1\nStarters,Chicken Wings,320,0\nMain Course,Dal Makhani,180,1\nMain Course,Butter Chicken,380,0\nBeverages,Fresh Lime Soda,80,1\nBeverages,Masala Chai,40,1';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'menu-template.csv';
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

      const res = await fetch(`${API_BASE}/api/menu/upload`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body: formData,
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
        const result = { created: parsed.rows.length, skipped: [] };
        setImportResult(result);
        if (onImported) onImported(parsed.rows);
        return;
      }

      const restaurantId = getCurrentRestaurantId();
      const res = await fetch(`${API_BASE}/api/menu/bulk-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ restaurantId, rows: parsed.rows }),
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
        <p className="text-gray-900 mb-2">{isDragging ? 'Drop your file here' : 'Upload your menu file'}</p>
        <p className="text-sm text-gray-400 mb-4">Supported formats: Excel (.xlsx), CSV (.csv), PDF (.pdf)</p>
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
          {loading ? 'Parsing...' : 'Parse File'}
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

          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-900">Preview ({parsed.rows.length} items)</h4>
              <span className="text-sm text-gray-400">Confidence: {parsed.confidence}</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-left text-gray-400">
                    <th className="py-2 pr-2">Category</th>
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 pr-2">Price</th>
                    <th className="py-2 pr-2">Veg</th>
                  </tr>
                </thead>
                <tbody>
                  {(editedRows || parsed.rows).map((row, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={row.category}
                          onChange={(e) => updateRow(i, 'category', e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-gray-600 text-xs focus:outline-none focus:border-[#E53935]"
                        />
                      </td>
                      <td className="py-1.5 pr-2 text-gray-900">{row.name}</td>
                      <td className="py-1.5 pr-2">
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
                      </td>
                      <td className="py-1.5 pr-2">
                        {row.isVeg ? <Leaf size={14} className="text-green-600" /> : <span className="text-red-600 text-xs">Non-Veg</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

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
              <p className="font-medium">{importResult.created} items created successfully!</p>
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
