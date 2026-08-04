// ─────────────────────────────────────────────────────────────────────────────
// TableQRCodes — QR code generation and printing for restaurant tables
// ─────────────────────────────────────────────────────────────────────────────
// Generates QR codes for each table that link to the customer-facing menu:
//   - Fetches all tables for the current restaurant
//   - Generates QR code SVG for each table with HMAC-signed URL
//   - QR code encodes: {API_BASE}/menu/{slug}?table={tableId}&sig={hmac}
//   - Print all QR codes (one per page) for physical table stickers
//   - Download individual QR codes as SVG
//
// The HMAC signature prevents customers from tampering with table IDs in the URL.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { apiFetch, API_BASE } from '../services/apiConfig';
import { QrCode, Printer, ArrowLeft, Download, Plus, Trash2 } from 'lucide-react';

export default function TableQRCodes() {
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [qrSignatures, setQrSignatures] = useState({});
  const [reps, setReps] = useState([]);
  const [repForm, setRepForm] = useState({ name: '', slug: '', outletType: 'FOOD' });
  const [repQrUrls, setRepQrUrls] = useState({});
  const [savingRep, setSavingRep] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        // Fetch current restaurant and its tables
        const data = await apiFetch('/api/restaurant/me');
        setRestaurant(data.restaurant);
        setTables(data.tables || []);

        // Fetch HMAC signatures for each table
        const sigPromises = (data.tables || []).map(async (t) => {
          try {
            const sigData = await apiFetch(`/api/tables/${t.id}/qr-url`);
            return { tableId: t.id, sig: sigData.sig, url: sigData.url };
          } catch (e) {
            console.warn(`[TableQRCodes] Failed to fetch sig for table ${t.id}:`, e);
          }
          return null;
        });
        const sigResults = await Promise.all(sigPromises);
        const sigMap = {};
        sigResults.forEach(r => {
          if (r) sigMap[r.tableId] = r;
        });
        setQrSignatures(sigMap);

        // Load representative QR codes
        try {
          const repsData = await apiFetch('/api/representative-qr');
          setReps(repsData || []);
          const repUrlMap = {};
          for (const r of repsData || []) {
            try {
              const qrData = await apiFetch(`/api/representative-qr/${r.id}/qr-url`);
              repUrlMap[r.id] = qrData.url;
            } catch (e) {
              console.warn(`[TableQRCodes] Failed to fetch QR for representative ${r.id}:`, e);
            }
          }
          setRepQrUrls(repUrlMap);
        } catch (e) {
          console.warn('[TableQRCodes] Failed to load representative QR codes:', e);
        }
      } catch (err) {
        setError(err.message || 'Failed to load tables');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const getQrUrl = (tableId) => {
    if (!restaurant?.slug || !tableId) return '';
    const base = window.location.origin;
    const sigData = qrSignatures[tableId];
    if (sigData && sigData.sig) {
      return `${base}/user-menu/${encodeURIComponent(restaurant.slug)}/${encodeURIComponent(tableId)}/${sigData.sig}`;
    }
    // Fallback: no signature (menu-only mode)
    return `${base}/user-menu/${encodeURIComponent(restaurant.slug)}/${encodeURIComponent(tableId)}`;
  };

  const handleSaveRep = async (e) => {
    e.preventDefault();
    if (!repForm.name.trim() || !repForm.slug.trim()) return;
    setSavingRep(true);
    try {
      const saved = await apiFetch('/api/representative-qr', {
        method: 'POST',
        body: JSON.stringify({
          name: repForm.name.trim(),
          slug: repForm.slug.trim(),
          outletType: repForm.outletType,
        }),
      });
      setReps((prev) => [saved, ...prev]);
      const qrData = await apiFetch(`/api/representative-qr/${saved.id}/qr-url`);
      setRepQrUrls((prev) => ({ ...prev, [saved.id]: qrData.url }));
      setRepForm({ name: '', slug: '', outletType: 'FOOD' });
    } catch (err) {
      setError(err.message || 'Failed to save representative QR');
    } finally {
      setSavingRep(false);
    }
  };

  const getRepQrUrl = (rep) => {
    if (repQrUrls[rep.id]) return repQrUrls[rep.id];
    return '';
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = (id, label, isRep = false) => {
    const svg = document.getElementById(isRep ? `qr-rep-${id}` : `qr-${id}`);
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      const size = 400;
      canvas.width = size;
      canvas.height = size + 60;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, size, size);

      // Draw label
      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 24px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${isRep ? '' : 'Table '}${label}`, size / 2, size + 40);

      const link = document.createElement('a');
      link.download = isRep ? `qr-rep-${label}.png` : `qr-table-${label}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="text-gray-400 font-semibold animate-pulse">Loading tables...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md text-center">
          <p className="text-red-500 font-bold mb-4">{error}</p>
          <button onClick={() => navigate('/admin/dashboard')} className="px-6 py-2.5 bg-[#E53935] text-white rounded-xl text-xs font-black uppercase tracking-widest">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-6 font-['Inter',sans-serif]">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">Table QR Codes</h1>
              <p className="text-sm text-gray-400 font-semibold">
                {restaurant?.name || 'Your Restaurant'} — {tables.length} tables
              </p>
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1A1A1A] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-colors"
          >
            <Printer size={16} />
            Print All
          </button>
        </div>

        {/* QR Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {tables.map((table) => {
            const qrUrl = getQrUrl(table.id);
            return (
              <div
                key={table.id}
                className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_10px_30px_rgba(0,0,0,0.03)] flex flex-col items-center gap-3 print:break-inside-avoid"
              >
                <div className="bg-gray-50 rounded-xl p-3">
                  <QRCodeSVG
                    id={`qr-${table.id}`}
                    value={qrUrl}
                    size={140}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <div className="text-center">
                  <p className="text-lg font-black text-gray-900">Table {table.number}</p>
                  <p className="text-[10px] text-gray-400 font-semibold mt-1 break-all max-w-[140px]">
                    {qrUrl}
                  </p>
                </div>
                <button
                  onClick={() => handleDownload(table.id, table.number, false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-[#FF4D4F] text-[10px] font-black uppercase tracking-wider hover:bg-[#FF4D4F] hover:text-white transition-colors"
                >
                  <Download size={12} />
                  PNG
                </button>
              </div>
            );
          })}
        </div>

        {/* Representative QR Codes */}
        <div className="mt-12">
          <h2 className="text-xl font-black text-gray-900 tracking-tight mb-4">Representative QR Codes</h2>
          <p className="text-sm text-gray-400 font-semibold mb-4">
            Non-table QR codes for areas like a bar counter or entrance. These never appear as tables in POS.
          </p>

          <form onSubmit={handleSaveRep} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_10px_30px_rgba(0,0,0,0.03)] mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Name (e.g. Bar Counter)"
                value={repForm.name}
                onChange={(e) => setRepForm({ ...repForm, name: e.target.value })}
                className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-[#E53935]"
              />
              <input
                type="text"
                placeholder="URL slug (e.g. bar-counter)"
                value={repForm.slug}
                onChange={(e) => setRepForm({ ...repForm, slug: e.target.value })}
                className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-[#E53935]"
              />
              <select
                value={repForm.outletType}
                onChange={(e) => setRepForm({ ...repForm, outletType: e.target.value })}
                className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-[#E53935]"
              >
                <option value="FOOD">Food Menu</option>
                <option value="BAR">Bar Menu</option>
              </select>
            </div>
            <div className="mt-4">
              <button
                type="submit"
                disabled={savingRep}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#E53935] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-700 disabled:opacity-50"
              >
                <Plus size={14} />
                {savingRep ? 'Saving...' : 'Create Representative QR'}
              </button>
            </div>
          </form>

          {reps.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {reps.map((rep) => {
                const qrUrl = getRepQrUrl(rep);
                return (
                  <div
                    key={rep.id}
                    className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_10px_30px_rgba(0,0,0,0.03)] flex flex-col items-center gap-3 print:break-inside-avoid"
                  >
                    <div className="bg-gray-50 rounded-xl p-3">
                      {qrUrl ? (
                        <QRCodeSVG
                          id={`qr-rep-${rep.id}`}
                          value={qrUrl}
                          size={140}
                          level="M"
                          includeMargin={false}
                        />
                      ) : (
                        <div className="w-[140px] h-[140px] flex items-center justify-center text-[10px] text-gray-400 font-bold">Loading QR...</div>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-black text-gray-900">{rep.name}</p>
                      <p className="text-[10px] text-gray-400 font-semibold mt-1 break-all max-w-[140px]">{qrUrl || 'Generating signed URL...'}</p>
                    </div>
                    <button
                      onClick={() => handleDownload(rep.id, rep.name, true)}
                      disabled={!qrUrl}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-[#FF4D4F] text-[10px] font-black uppercase tracking-wider hover:bg-[#FF4D4F] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download size={12} />
                      PNG
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {tables.length === 0 && reps.length === 0 && (
          <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center">
            <QrCode size={48} className="text-gray-200 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">No Tables Found</h3>
            <p className="text-sm text-gray-400 font-semibold mb-6">
              Set up your floor plan first to generate QR codes for each table.
            </p>
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="px-6 py-2.5 bg-[#E53935] text-white rounded-xl text-xs font-black uppercase tracking-widest"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
