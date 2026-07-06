import React, { useState, useEffect, useCallback } from 'react';
import { Printer, Save, Calendar } from 'lucide-react';
import { apiFetch } from '../services/apiConfig';
import { printLocal } from '../utils/printOffline';
import { buildXReportEscpos } from '../utils/escposFrontend';
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

function formatCurrency(value) {
  const amount = round2(Number(value || 0));
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    tipsAmount: 0,
    notes500: 0,
    notes200: 0,
    notes100: 0,
    notes50: 0,
    notes20: 0,
    notes10: 0,
  });

  const [vouchers, setVouchers] = useState([]);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [vouchersError, setVouchersError] = useState(null);

  const cashFromNotes = DENOMINATIONS.reduce((sum, d) => sum + (report[d.key] || 0) * d.value, 0);
  const expenditureTotal = round2(Number(report.voucherAmount || 0));
  const balanceAmount = round2(Number(report.totalSales || 0) - expenditureTotal);
  const expectedCash = round2(Number(report.cashAmount || 0));
  const cashVariance = round2(cashFromNotes - expectedCash);

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
        tipsAmount: Number(data.tipsAmount) || 0,
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

  const loadVouchers = useCallback(async (date) => {
    setVouchersLoading(true);
    setVouchersError(null);
    try {
      const params = new URLSearchParams({ date, limit: '300' });
      const data = await apiFetch(`/api/vouchers?${params.toString()}`);
      const filtered = (data || []).filter((voucher) => voucher.status !== 'VOIDED');
      setVouchers(filtered);
    } catch (err) {
      setVouchersError(err.message || 'Failed to load expenditure vouchers');
      setVouchers([]);
    } finally {
      setVouchersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport(reportDate);
    loadVouchers(reportDate);
  }, [reportDate, loadReport, loadVouchers]);

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
          tipsAmount: Number(report.tipsAmount || 0),
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
    const row = (label, value) => `${label}${String(value).padStart(Math.max(1, W - label.length))}`;
    const voucherRow = (paidTo, type, amount) => {
      const name = (paidTo || '—').toString().slice(0, 12).padEnd(12, ' ');
      const typeLabel = (type || '').toString().slice(0, 8).padEnd(8, ' ');
      const amountStr = formatCurrency(amount);
      const left = `  ${name}${typeLabel}`;
      return `${left}${amountStr.padStart(Math.max(1, W - left.length))}`;
    };
    const denomLine = (label, qty, amount) => `  ${label} × ${qty}${String('₹' + amount.toFixed(0)).padStart(Math.max(1, W - label.length - String(qty).length - 5))}`;

    const restaurantName = restaurant?.name || '';
    const cashierName = user?.name || '';
    const lines = [];
    lines.push(line);
    lines.push(center('X REPORT'));
    if (restaurantName) lines.push(center(restaurantName));
    lines.push(center(`Date: ${reportDate}`));
    if (cashierName) lines.push(center(`Cashier: ${cashierName}`));
    lines.push(line);
    lines.push(row('Total Sale', formatCurrency(report.totalSales)));
    lines.push(row('  Cash', formatCurrency(report.cashAmount)));
    lines.push(row('  Card', formatCurrency(report.cardAmount)));
    lines.push(row('  Tips', formatCurrency(report.tipsAmount)));
    lines.push(line);
    lines.push(row('Expenditure', formatCurrency(expenditureTotal)));
    if (vouchers.length > 0) {
      lines.push('  Paid To      Type      Amount');
      vouchers.forEach((voucher) => {
        const paidTo = voucher.paidToName || voucher.employee?.name || '—';
        const type = voucher.paidToType === 'STAFF' ? 'Staff' : (voucher.category || 'Other');
        lines.push(voucherRow(paidTo, type, voucher.amount));
      });
    } else {
      lines.push('  (No vouchers recorded)');
    }
    lines.push(line);
    lines.push(center('BALANCE'));
    lines.push(center(formatCurrency(balanceAmount)));
    lines.push(line);
    lines.push('Denomination breakdown:');
    DENOMINATIONS.forEach(d => {
      const qty = report[d.key] || 0;
      if (qty > 0) {
        lines.push(denomLine(d.label, qty, qty * d.value));
      }
    });
    lines.push(line);
    lines.push(row('Cash from Notes', formatCurrency(cashFromNotes)));
    lines.push(row('Expected Cash', formatCurrency(expectedCash)));
    lines.push(row('Variance', formatCurrency(cashVariance)));
    lines.push(line);
    lines.push(center('*** End of Report ***'));
    lines.push('\n\n\n');
    return lines.join('\n');
  };

  const buildXReportEscposData = () => buildXReportEscpos({
    restaurantName: restaurant?.name || '',
    cashierName: user?.name || '',
    reportDate,
    totalSales: round2(Number(report.totalSales)),
    cashAmount: expectedCash,
    cardAmount: round2(Number(report.cardAmount || 0)),
    tipsAmount: round2(Number(report.tipsAmount || 0)),
    expenditureTotal,
    balanceAmount,
    vouchers: vouchers.map((voucher) => ({
      paidTo: voucher.paidToName || voucher.employee?.name || '—',
      type: voucher.paidToType === 'STAFF' ? 'Staff' : (voucher.category || 'Other'),
      amount: Number(voucher.amount) || 0,
    })),
    denominations: DENOMINATIONS.map(d => ({
      label: d.label,
      qty: report[d.key] || 0,
      amount: (report[d.key] || 0) * d.value,
    })),
    cashFromNotes: round2(cashFromNotes),
    expectedCash,
    cashVariance,
  });

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
          escposData: buildXReportEscposData(),
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
            {/* Total Sale */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 mb-1">Total Sale</p>
                  <p className="text-xs text-gray-500">Auto-computed from todays paid bills</p>
                </div>
                <div className="text-3xl font-black text-gray-900 tabular-nums">{formatCurrency(report.totalSales)}</div>
              </div>
              <div className="mt-4 bg-white rounded-lg border border-gray-100 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 mb-3">From that:</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold uppercase text-gray-500">Cash (auto)</span>
                    <span className="text-xl font-black text-emerald-700 tabular-nums">{formatCurrency(report.cashAmount)}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold uppercase text-gray-500">Card / UPI (auto)</span>
                    <span className="text-xl font-black text-blue-700 tabular-nums">{formatCurrency(report.cardAmount)}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold uppercase text-gray-500" htmlFor="tips-input">Tips (manual)</label>
                    <input
                      id="tips-input"
                      type="number"
                      value={report.tipsAmount === 0 ? '' : report.tipsAmount}
                      onChange={(e) => handleFieldChange('tipsAmount', e.target.value === '' ? 0 : Number(e.target.value))}
                      onWheel={(e) => e.target.blur()}
                      className={inputClass}
                      placeholder="0.00"
                      step="0.01"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Expenditure */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 mb-1">Expenditure</p>
                  <p className="text-xs text-gray-500">Vouchers paid on {reportDate}</p>
                </div>
                <div className="text-2xl font-black text-red-700 tabular-nums">{formatCurrency(expenditureTotal)}</div>
              </div>
              {vouchersError && (
                <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-[11px] font-semibold text-red-600">
                  {vouchersError}
                </div>
              )}
              {vouchersLoading ? (
                <div className="text-center py-6 text-sm text-gray-400">Loading vouchers…</div>
              ) : vouchers.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-400">No expenditure vouchers recorded for this date.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] font-black uppercase tracking-widest text-gray-500">
                        <th className="py-2 pr-3">Paid To</th>
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2 pr-3">Narration</th>
                        <th className="py-2 pr-3">Approved By</th>
                        <th className="py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vouchers.map((voucher) => (
                        <tr key={voucher.id || voucher.voucherNo} className="border-t border-gray-100">
                          <td className="py-2 pr-3 font-semibold text-gray-900 whitespace-nowrap">{voucher.paidToName || voucher.employee?.name || '—'}</td>
                          <td className="py-2 pr-3 text-[11px] font-bold text-gray-500 whitespace-nowrap">
                            {voucher.paidToType === 'STAFF' ? 'Staff' : (voucher.category || 'Other')}
                          </td>
                          <td className="py-2 pr-3 text-[11px] text-gray-600 max-w-[200px] truncate" title={voucher.narration || ''}>
                            {voucher.narration || '—'}
                          </td>
                          <td className="py-2 pr-3 text-[11px] font-semibold text-gray-600 whitespace-nowrap">
                            {voucher.approvedByName || voucher.approvedBy?.name || '—'}
                          </td>
                          <td className="py-2 text-right font-black text-gray-900 tabular-nums">{formatCurrency(voucher.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Balance */}
            <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-6 text-center shadow-lg">
              <p className="text-[11px] font-black uppercase tracking-[0.4em] text-white/70">Balance</p>
              <p className="text-xs text-white/70 mb-2">Total Sale − Expenditure</p>
              <p className="text-4xl font-black tabular-nums">{formatCurrency(balanceAmount)}</p>
            </div>

            {/* Denomination count & reconciliation */}
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
                      onWheel={(e) => e.target.blur()}
                      className={inputClass}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm font-black">
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <p className="text-[10px] font-bold uppercase text-gray-500 mb-1">Cash from Notes</p>
                  <p className="text-xl text-gray-900 tabular-nums">{formatCurrency(cashFromNotes)}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <p className="text-[10px] font-bold uppercase text-gray-500 mb-1">Expected Cash (auto)</p>
                  <p className="text-xl text-gray-900 tabular-nums">{formatCurrency(report.cashAmount)}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <p className="text-[10px] font-bold uppercase text-gray-500 mb-1">Variance</p>
                  <p className={`text-xl tabular-nums ${cashVariance === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{formatCurrency(cashVariance)}</p>
                </div>
              </div>
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
