import React, { useState, useEffect, useCallback } from 'react';
import { Printer, Save, Calendar } from 'lucide-react';
import { apiFetch } from '../services/apiConfig';
import { printLocal } from '../utils/printOffline';
import { useAuth } from '../context/AuthContext';

const DENOMINATIONS = [
  { key: 'notes500', value: 500, label: '₹500' },
  { key: 'notes200', value: 200, label: '₹200' },
  { key: 'notes100', value: 100, label: '₹100' },
  { key: 'notes50', value: 50, label: '₹50' },
  { key: 'notes20', value: 20, label: '₹20' },
  { key: 'notes10', value: 10, label: '₹10' },
];

function getTodayDate() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  return istTime.toISOString().split('T')[0];
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export default function XReportSection() {
  const { user, restaurant } = useAuth();
  const [reportDate, setReportDate] = useState(getTodayDate());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedMsg, setSavedMsg] = useState(null);

  const [report, setReport] = useState({
    totalSales: 0,
    voucherAmount: 0,
    parcelCounterSale: 0,
    cardAmount: 0,
    cashAmount: 0,
    notes500: 0,
    notes200: 0,
    notes100: 0,
    notes50: 0,
    notes20: 0,
    notes10: 0,
  });

  const cashFromNotes = DENOMINATIONS.reduce((sum, d) => sum + (report[d.key] || 0) * d.value, 0);
  const finalAmount = round2(
    Number(report.totalSales) - Number(report.voucherAmount || 0) + Number(report.parcelCounterSale || 0)
  );
  const cardPlusCash = round2(
    Number(report.cardAmount || 0) + Number(report.cashAmount || 0)
  );
  const balanced = Math.abs(cardPlusCash - finalAmount) < 0.01;

  const loadReport = useCallback(async (date) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/xreports/${date}`);
      setReport({
        totalSales: Number(data.totalSales) || 0,
        voucherAmount: Number(data.voucherAmount) || 0,
        parcelCounterSale: Number(data.parcelCounterSale) || 0,
        cardAmount: Number(data.cardAmount) || 0,
        cashAmount: Number(data.cashAmount) || 0,
        notes500: data.notes500 || 0,
        notes200: data.notes200 || 0,
        notes100: data.notes100 || 0,
        notes50: data.notes50 || 0,
        notes20: data.notes20 || 0,
        notes10: data.notes10 || 0,
      });
    } catch (err) {
      setError(err.message || 'Failed to load X Report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport(reportDate);
  }, [reportDate, loadReport]);

  const handleFieldChange = (field, value) => {
    setReport(prev => ({ ...prev, [field]: value }));
    setSavedMsg(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/xreports', {
        method: 'POST',
        body: JSON.stringify({
          reportDate,
          totalSales: Number(report.totalSales),
          voucherAmount: Number(report.voucherAmount || 0),
          parcelCounterSale: Number(report.parcelCounterSale || 0),
          cardAmount: Number(report.cardAmount || 0),
          cashAmount: Number(report.cashAmount || 0),
          notes500: Number(report.notes500 || 0),
          notes200: Number(report.notes200 || 0),
          notes100: Number(report.notes100 || 0),
          notes50: Number(report.notes50 || 0),
          notes20: Number(report.notes20 || 0),
          notes10: Number(report.notes10 || 0),
        }),
      });
      setSavedMsg('X Report saved successfully');
      return true;
    } catch (err) {
      setError(err.message || 'Failed to save X Report');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const buildXReportText = () => {
    const W = 32;
    const center = (s) => ' '.repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s;
    const line = '─'.repeat(W);
    const dashed = '─ '.repeat(16).slice(0, W);
    const row = (label, value) => `${label}${String(value).padStart(W - label.length)}`;
    const count = (label, qty, amount) => `  ${label} × ${qty}${String('₹' + amount.toFixed(0)).padStart(W - label.length - qty.length - 5)}`;

    const restaurantName = restaurant?.name || '';
    const cashierName = user?.name || '';
    const lines = [];
    lines.push(line);
    lines.push(center('X REPORT'));
    if (restaurantName) lines.push(center(restaurantName));
    lines.push(center(`Date: ${reportDate}`));
    if (cashierName) lines.push(center(`Cashier: ${cashierName}`));
    lines.push(line);
    lines.push(row('Final Amount', '₹' + finalAmount.toFixed(2)));
    lines.push(center('(Total Sales - Vouchers + Parcel Counter)'));
    lines.push(dashed);
    lines.push(row('Voucher', '₹' + round2(Number(report.voucherAmount || 0)).toFixed(2)));
    lines.push(row('Parcel Counter', '₹' + round2(Number(report.parcelCounterSale || 0)).toFixed(2)));
    lines.push(row('Card', '₹' + round2(Number(report.cardAmount || 0)).toFixed(2)));
    lines.push(row('Cash', '₹' + round2(Number(report.cashAmount || 0)).toFixed(2)));
    lines.push(dashed);
    lines.push('Denomination breakdown:');
    DENOMINATIONS.forEach(d => {
      const qty = report[d.key] || 0;
      if (qty > 0) {
        lines.push(count(d.label, qty, qty * d.value));
      }
    });
    lines.push(line);
    lines.push(row('Cash from Notes', '₹' + round2(cashFromNotes).toFixed(2)));
    lines.push(line);
    lines.push(center('*** End of X Report ***'));
    lines.push('\n\n\n');
    return lines.join('\n');
  };

  const handlePrint = async () => {
    const ok = await handleSave();
    if (!ok) return;
    try {
      // 1. Try backend socket-based print first (uses PrintStation/Print Agent)
      await apiFetch(`/api/xreports/${reportDate}/print`, { method: 'POST' });
      setSavedMsg('X Report sent to printer');
    } catch (err) {
      // 2. Backend socket print failed — try local direct print as fallback
      console.warn('[XReport] Backend print failed, trying local print:', err);
      try {
        const result = await printLocal({
          type: 'FINAL_BILL',
          text: buildXReportText(),
        });
        if (!result.printed) {
          // 3. Local direct print also failed — fall back to browser print dialog
          console.warn('[XReport] Direct print failed:', result.error);
          openBrowserPrint(buildXReportText());
          setSavedMsg('No direct printer found — opened browser print dialog. Configure Print Agent/QZ Tray for auto-print.');
          return;
        }
        setSavedMsg('X Report printed locally');
      } catch (localErr) {
        setError('Print failed: ' + localErr.message);
      }
    }
  };

  const openBrowserPrint = (text) => {
    const printWin = window.open('', '_blank', 'width=400,height=600');
    if (!printWin) {
      setError('Popup blocked. Please allow popups to print.');
      return;
    }
    const html = `
      <html>
      <head>
        <title>X Report - ${reportDate}</title>
        <style>
          * { font-family: 'Courier New', monospace; margin: 0; padding: 0; box-sizing: border-box; }
          body { width: 280px; padding: 8px; white-space: pre; font-size: 11px; }
        </style>
      </head>
      <body>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body>
      </html>
    `;
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
    printWin.print();
  };

  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 tabular-nums";
  const labelClass = "text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1";
  const readOnlyClass = `${inputClass} bg-gray-100 cursor-not-allowed text-gray-600`;

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-wider">X Report</h2>
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gray-400" />
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/20"
            />
          </div>
        </div>

        {loading && <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>}
        {error && (
          <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs font-bold text-red-600">
            {error}
          </div>
        )}
        {savedMsg && (
          <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs font-bold text-green-600">
            {savedMsg}
          </div>
        )}

        {!loading && (
          <div className="flex flex-col gap-4">
            {/* Auto-filled summary — read only */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Auto-Filled From Sales</h3>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-sm font-bold text-gray-600">Total Sales</span>
                  <span className="text-sm font-black text-gray-900 tabular-nums">₹{round2(Number(report.totalSales)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-sm font-bold text-gray-600">Vouchers</span>
                  <span className="text-sm font-black text-purple-900 tabular-nums">₹{round2(Number(report.voucherAmount || 0)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 gap-3">
                  <span className="text-sm font-bold text-gray-600">Parcel Counter Sale <span className="text-red-500">*</span></span>
                  <input
                    type="number"
                    min="0"
                    value={report.parcelCounterSale === 0 ? '' : report.parcelCounterSale}
                    onChange={(e) => handleFieldChange('parcelCounterSale', e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
                    onWheel={(e) => e.target.blur()}
                    className="w-32 md:w-40 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 tabular-nums text-right"
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm font-black text-gray-900">Final Amount</span>
                  <span className="text-lg font-black text-blue-900 tabular-nums">₹{finalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Card & Cash entry */}
            <div className="flex flex-col gap-3">
              <div>
                <label className={labelClass}>Card Amount</label>
                <input
                  type="number"
                  value={report.cardAmount === 0 ? '' : report.cardAmount}
                  onChange={(e) => handleFieldChange('cardAmount', e.target.value === '' ? 0 : Number(e.target.value))}
                  className={inputClass}
                  step="0.01"
                  placeholder="Enter card amount"
                />
              </div>
              <div>
                <label className={labelClass}>Cash Amount</label>
                <input
                  type="number"
                  value={report.cashAmount === 0 ? '' : report.cashAmount}
                  onChange={(e) => handleFieldChange('cashAmount', e.target.value === '' ? 0 : Number(e.target.value))}
                  className={inputClass}
                  step="0.01"
                  placeholder="Enter cash amount"
                />
              </div>
            </div>

            {/* Balance check */}
            <div className={`px-4 py-2.5 rounded-lg text-sm font-black text-center ${balanced ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              Card + Cash = ₹{cardPlusCash.toFixed(2)} {balanced ? '= Final Amount ✓' : `≠ Final Amount (₹${finalAmount.toFixed(2)})`}
            </div>

            {/* Denomination count */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Cash Denomination Count</h3>
              <p className="text-[10px] font-bold text-gray-500 mb-3">Enter note counts — leave empty if none</p>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {DENOMINATIONS.map(d => (
                  <div key={d.key}>
                    <label className={labelClass}>{d.label}</label>
                    <input
                      type="number"
                      min="0"
                      value={report[d.key] === 0 ? '' : report[d.key]}
                      onChange={(e) => handleFieldChange(d.key, e.target.value === '' ? 0 : Number(e.target.value))}
                      className={inputClass}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between items-center pt-3 border-t border-gray-200">
                <span className="text-xs font-black uppercase text-gray-600">Cash from Notes</span>
                <span className="text-sm font-black text-gray-900 tabular-nums">₹{round2(cashFromNotes).toFixed(2)}</span>
              </div>
              {Number(report.cashAmount || 0) > 0 && (
                <div className="mt-2 flex justify-between items-center">
                  <span className="text-xs font-bold text-gray-500">Cash Variance</span>
                  <span className="text-sm font-black text-red-600 tabular-nums">₹{round2(Math.abs(round2(cashFromNotes) - round2(Number(report.cashAmount || 0)))).toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-black uppercase tracking-wider transition-all hover:bg-gray-700 shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handlePrint}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-[#E53935] text-white text-sm font-black uppercase tracking-wider transition-all hover:bg-[#c62828] shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Printer size={16} />
                Save & Print
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
