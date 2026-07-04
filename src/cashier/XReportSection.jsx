import React, { useState, useEffect, useCallback } from 'react';
import { Printer, Save, Calendar, TrendingUp, CreditCard, Banknote, Receipt } from 'lucide-react';
import { apiFetch } from '../services/apiConfig';

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
  const [reportDate, setReportDate] = useState(getTodayDate());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedMsg, setSavedMsg] = useState(null);

  const [report, setReport] = useState({
    totalSales: 0,
    voucherAmount: 0,
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
  const totalAmount = round2(Number(report.totalSales) + Number(report.voucherAmount || 0));
  const cardPlusCashPlusVoucher = round2(
    Number(report.cardAmount || 0) + Number(report.cashAmount || 0) + Number(report.voucherAmount || 0)
  );
  const balanced = Math.abs(cardPlusCashPlusVoucher - round2(Number(report.totalSales))) < 0.01;
  const cashBalanced = Math.abs(round2(cashFromNotes) - round2(Number(report.cashAmount || 0))) < 0.01;

  const loadReport = useCallback(async (date) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/xreports/${date}`);
      setReport({
        totalSales: Number(data.totalSales) || 0,
        voucherAmount: Number(data.voucherAmount) || 0,
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
    if (!balanced) {
      setError(`Card + Cash + Voucher (₹${cardPlusCashPlusVoucher}) must equal Total Sales (₹${round2(Number(report.totalSales))})`);
      return false;
    }
    if (!cashBalanced) {
      setError(`Cash from Notes (₹${round2(cashFromNotes)}) must equal Cash Amount (₹${round2(Number(report.cashAmount || 0))})`);
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/xreports', {
        method: 'POST',
        body: JSON.stringify({
          reportDate,
          totalSales: Number(report.totalSales),
          voucherAmount: Number(report.voucherAmount || 0),
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

  const handlePrint = async () => {
    const ok = await handleSave();
    if (!ok) return;
    try {
      const printContent = generatePrintHTML();
      const printWin = window.open('', '_blank', 'width=400,height=600');
      if (!printWin) {
        setError('Popup blocked. Please allow popups to print.');
        return;
      }
      printWin.document.write(printContent);
      printWin.document.close();
      printWin.focus();
      printWin.print();
      await apiFetch(`/api/xreports/${reportDate}/print`, { method: 'POST' });
    } catch (err) {
      setError('Print failed: ' + err.message);
    }
  };

  const generatePrintHTML = () => {
    return `
      <html>
      <head>
        <title>X Report - ${reportDate}</title>
        <style>
          * { font-family: 'Courier New', monospace; margin: 0; padding: 0; box-sizing: border-box; }
          body { width: 280px; padding: 8px; }
          h1 { font-size: 14px; text-align: center; margin-bottom: 4px; }
          .date { text-align: center; font-size: 11px; margin-bottom: 8px; }
          .section { border-top: 1px dashed #000; padding-top: 6px; margin-top: 6px; }
          .row { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
          .total { font-weight: bold; font-size: 13px; border-top: 2px solid #000; padding-top: 4px; margin-top: 4px; }
          .denom { font-size: 10px; }
          .footer { text-align: center; font-size: 9px; margin-top: 8px; border-top: 1px dashed #000; padding-top: 4px; }
        </style>
      </head>
      <body>
        <h1>X REPORT</h1>
        <div class="date">Date: ${reportDate}</div>
        <div class="section">
          <div class="row"><span>Total Sales</span><span>₹${round2(Number(report.totalSales)).toFixed(2)}</span></div>
          <div class="row"><span>Voucher Amount</span><span>₹${round2(Number(report.voucherAmount || 0)).toFixed(2)}</span></div>
          <div class="row"><span>Card Amount</span><span>₹${round2(Number(report.cardAmount || 0)).toFixed(2)}</span></div>
          <div class="row"><span>Cash Amount</span><span>₹${round2(Number(report.cashAmount || 0)).toFixed(2)}</span></div>
        </div>
        <div class="section">
          <div class="row total"><span>Total Amount</span><span>₹${totalAmount.toFixed(2)}</span></div>
          <div class="row"><span>Cash from Notes</span><span>₹${round2(cashFromNotes).toFixed(2)}</span></div>
          <div class="row"><span>Variance</span><span>₹${round2(Math.abs(round2(cashFromNotes) - round2(Number(report.cashAmount || 0)))).toFixed(2)}</span></div>
        </div>
        <div class="section denom">
          <div class="row"><span>₹500 x ${report.notes500 || 0}</span><span>₹${(report.notes500 || 0) * 500}</span></div>
          <div class="row"><span>₹200 x ${report.notes200 || 0}</span><span>₹${(report.notes200 || 0) * 200}</span></div>
          <div class="row"><span>₹100 x ${report.notes100 || 0}</span><span>₹${(report.notes100 || 0) * 100}</span></div>
          <div class="row"><span>₹50 x ${report.notes50 || 0}</span><span>₹${(report.notes50 || 0) * 50}</span></div>
          <div class="row"><span>₹20 x ${report.notes20 || 0}</span><span>₹${(report.notes20 || 0) * 20}</span></div>
          <div class="row"><span>₹10 x ${report.notes10 || 0}</span><span>₹${(report.notes10 || 0) * 10}</span></div>
          <div class="row total"><span>Cash from Notes</span><span>₹${round2(cashFromNotes).toFixed(2)}</span></div>
        </div>
        <div class="footer">*** End of X Report ***</div>
      </body>
      </html>
    `;
  };

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 tabular-nums";
  const labelClass = "text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1";

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
          <>
            {/* Summary tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp size={14} className="text-blue-500" />
                  <span className="text-[10px] font-black uppercase text-blue-400">Total Sales</span>
                </div>
                <p className="text-lg font-black text-blue-900 tabular-nums">₹{round2(Number(report.totalSales)).toFixed(0)}</p>
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Receipt size={14} className="text-purple-500" />
                  <span className="text-[10px] font-black uppercase text-purple-400">Vouchers</span>
                </div>
                <p className="text-lg font-black text-purple-900 tabular-nums">₹{round2(Number(report.voucherAmount || 0)).toFixed(0)}</p>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <CreditCard size={14} className="text-green-500" />
                  <span className="text-[10px] font-black uppercase text-green-400">Card</span>
                </div>
                <p className="text-lg font-black text-green-900 tabular-nums">₹{round2(Number(report.cardAmount || 0)).toFixed(0)}</p>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Banknote size={14} className="text-amber-500" />
                  <span className="text-[10px] font-black uppercase text-amber-400">Cash</span>
                </div>
                <p className="text-lg font-black text-amber-900 tabular-nums">₹{round2(Number(report.cashAmount || 0)).toFixed(0)}</p>
              </div>
            </div>

            {/* Editable fields */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div>
                <label className={labelClass}>Total Sales (auto-filled)</label>
                <input
                  type="number"
                  value={report.totalSales === 0 ? '' : report.totalSales}
                  onChange={(e) => handleFieldChange('totalSales', e.target.value === '' ? 0 : Number(e.target.value))}
                  className={inputClass}
                  step="0.01"
                  placeholder="0"
                />
              </div>
              <div>
                <label className={labelClass}>Voucher Amount</label>
                <input
                  type="number"
                  value={report.voucherAmount === 0 ? '' : report.voucherAmount}
                  onChange={(e) => handleFieldChange('voucherAmount', e.target.value === '' ? 0 : Number(e.target.value))}
                  className={inputClass}
                  step="0.01"
                  placeholder="0"
                />
              </div>
              <div>
                <label className={labelClass}>Card Amount</label>
                <input
                  type="number"
                  value={report.cardAmount === 0 ? '' : report.cardAmount}
                  onChange={(e) => handleFieldChange('cardAmount', e.target.value === '' ? 0 : Number(e.target.value))}
                  className={inputClass}
                  step="0.01"
                  placeholder="0"
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
                  placeholder="0"
                />
              </div>
            </div>

            {/* Consolidated Summary */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-gray-700 mb-3">Daily Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Sales</p>
                  <p className="text-base font-black text-gray-900 tabular-nums">₹{round2(Number(report.totalSales)).toFixed(2)}</p>
                </div>
                <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Amount</p>
                  <p className="text-base font-black text-blue-900 tabular-nums">₹{totalAmount.toFixed(2)}</p>
                </div>
                <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Cash from Notes</p>
                  <p className="text-base font-black text-amber-900 tabular-nums">₹{round2(cashFromNotes).toFixed(2)}</p>
                </div>
                <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Variance</p>
                  <p className={`text-base font-black tabular-nums ${balanced && cashBalanced ? 'text-green-600' : 'text-red-600'}`}>
                    ₹{round2(Math.abs(round2(cashFromNotes) - round2(Number(report.cashAmount || 0)))).toFixed(2)}
                  </p>
                </div>
              </div>
              {/* Payment Breakdown Bar */}
              <div className="mb-3">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Payment Breakdown</p>
                <div className="flex h-6 rounded-lg overflow-hidden border border-gray-200">
                  {Number(report.cardAmount || 0) > 0 && (
                    <div className="bg-green-500 flex items-center justify-center text-[9px] font-black text-white" style={{ width: `${(Number(report.cardAmount || 0) / Math.max(round2(Number(report.totalSales)), 0.01)) * 100}%` }}>
                      {((Number(report.cardAmount || 0) / Math.max(round2(Number(report.totalSales)), 0.01)) * 100).toFixed(0)}%
                    </div>
                  )}
                  {Number(report.cashAmount || 0) > 0 && (
                    <div className="bg-amber-500 flex items-center justify-center text-[9px] font-black text-white" style={{ width: `${(Number(report.cashAmount || 0) / Math.max(round2(Number(report.totalSales)), 0.01)) * 100}%` }}>
                      {((Number(report.cashAmount || 0) / Math.max(round2(Number(report.totalSales)), 0.01)) * 100).toFixed(0)}%
                    </div>
                  )}
                  {Number(report.voucherAmount || 0) > 0 && (
                    <div className="bg-purple-500 flex items-center justify-center text-[9px] font-black text-white" style={{ width: `${(Number(report.voucherAmount || 0) / Math.max(round2(Number(report.totalSales)), 0.01)) * 100}%` }}>
                      {((Number(report.voucherAmount || 0) / Math.max(round2(Number(report.totalSales)), 0.01)) * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
                <div className="flex gap-3 mt-1.5 text-[9px] font-bold text-gray-500">
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" />Card</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500" />Cash</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-500" />Voucher</span>
                </div>
              </div>
              {/* Balance indicators */}
              <div className="flex flex-wrap gap-2">
                <div className={`px-3 py-1.5 rounded-lg text-xs font-black ${balanced ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                  Card + Cash + Voucher = ₹{cardPlusCashPlusVoucher.toFixed(2)} {balanced ? '✓' : '✗'}
                </div>
                <div className={`px-3 py-1.5 rounded-lg text-xs font-black ${cashBalanced ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                  Cash from Notes = ₹{round2(cashFromNotes).toFixed(2)} {cashBalanced ? '✓' : '✗'}
                </div>
              </div>
            </div>

            {/* Denomination table */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-gray-700 mb-3">Cash Denomination Count</h3>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
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
                <span className="text-lg font-black text-gray-900 tabular-nums">₹{round2(cashFromNotes).toFixed(2)}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !balanced || !cashBalanced}
                className="flex-1 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-black uppercase tracking-wider transition-all hover:bg-gray-700 shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handlePrint}
                disabled={saving || !balanced || !cashBalanced}
                className="flex-1 py-2.5 rounded-lg bg-[#E53935] text-white text-sm font-black uppercase tracking-wider transition-all hover:bg-[#c62828] shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Printer size={16} />
                Save & Print
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
