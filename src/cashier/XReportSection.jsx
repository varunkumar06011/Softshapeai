import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Printer, Save, Calendar, RefreshCw, CheckCircle2, Lock } from 'lucide-react';
import { apiFetch } from '../services/apiConfig';
import { isEdgeLocalAuth, edgeFetch } from '../services/edgeHealth';
import { printLocal } from '../utils/printOffline';
import { buildXReportEscpos } from '../utils/escposFrontend';
import { sendOutputIntent, generateIntentId } from '../services/outputClient';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';

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

const STATUS_LABELS = {
  DRAFT: 'Draft',
  PAYOUT_CONFIRMED: 'Payout Confirmed',
  FINALIZED: 'Finalized',
};

export default function XReportSection() {
  const { user, restaurant } = useAuth();
  const restaurantId = restaurant?.id || null;
  const socket = useSocket(restaurantId);
  const [reportDate, setReportDate] = useState(getTodayDate());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState(null);
  const [savedMsg, setSavedMsg] = useState(null);
  const [expenditures, setExpenditures] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [staleSource, setStaleSource] = useState(false);
  const pauseAutoRefreshRef = useRef(false);

  const [report, setReport] = useState({
    id: null,
    totalSales: 0,
    expenditureAmount: 0,
    cardAmount: 0,
    cashAmount: 0,
    upiAmount: 0,
    otherAmount: 0,
    tipsAmount: 0,
    cashTipsAmount: 0,
    cardTipsAmount: 0,
    upiTipsAmount: 0,
    otherTipsAmount: 0,
    tipsPaidAmount: 0,
    cashExpenditures: 0,
    expectedCash: 0,
    totalAmount: 0,
    reportStatus: 'DRAFT',
    tipsPaidConfirmedAt: null,
    notes500: 0,
    notes200: 0,
    notes100: 0,
    notes50: 0,
    notes20: 0,
    notes10: 0,
  });

  const cashFromNotes = DENOMINATIONS.reduce((sum, d) => sum + (report[d.key] || 0) * d.value, 0);
  const expenditureTotal = round2(expenditures.reduce((sum, v) => sum + Number(v.amount || 0), 0));
  // Expected cash = cashCollected - cashExpenditures - tipsPaid (computed by backend)
  const expectedCash = round2(Number(report.expectedCash || report.totalAmount || 0));
  // Variance between expected cash and counted notes
  const cashVariance = round2(expectedCash - cashFromNotes);
  // Suggested denomination breakdown to make up the expected cash (greedy)
  const denominationSuggestion = (() => {
    let remaining = Math.round(expectedCash);
    return DENOMINATIONS.map(d => {
      const count = Math.floor(remaining / d.value);
      remaining -= count * d.value;
      return { ...d, suggestedCount: count };
    });
  })();

  const isDraft = report.reportStatus === 'DRAFT';
  const isPayoutConfirmed = report.reportStatus === 'PAYOUT_CONFIRMED';
  const isFinalized = report.reportStatus === 'FINALIZED';
  const hasTips = round2(Number(report.tipsAmount || 0)) > 0;

  const loadReport = useCallback(async (date) => {
    setLoading(true);
    setError(null);
    try {
      const edgeLocal = isEdgeLocalAuth();
      let data, exps;
      if (edgeLocal) {
        const [reportData, expData] = await Promise.all([
          edgeFetch(`/api/edge/x-report?date=${date}`),
          edgeFetch(`/api/edge/expenditures?date=${date}`),
        ]);
        data = reportData;
        exps = expData;
      } else {
        const [reportData, expData] = await Promise.all([
          apiFetch(`/api/xreports/${date}`, { timeout: 60000 }),
          apiFetch(`/api/expenditures?date=${date}&outletId=${restaurantId}`, { timeout: 60000 }),
        ]);
        data = reportData;
        exps = expData;
      }
      setReport({
        id: data.id || null,
        totalSales: Number(data.totalSales) || 0,
        expenditureAmount: Number(data.expenditureAmount) || 0,
        cardAmount: Number(data.cardAmount) || 0,
        cashAmount: Number(data.cashAmount) || 0,
        upiAmount: Number(data.upiAmount) || 0,
        otherAmount: Number(data.otherAmount) || 0,
        tipsAmount: Number(data.tipsAmount) || 0,
        cashTipsAmount: Number(data.cashTipsAmount) || 0,
        cardTipsAmount: Number(data.cardTipsAmount) || 0,
        upiTipsAmount: Number(data.upiTipsAmount) || 0,
        otherTipsAmount: Number(data.otherTipsAmount) || 0,
        tipsPaidAmount: Number(data.tipsPaidAmount) || 0,
        cashExpenditures: Number(data.cashExpenditures) || 0,
        expectedCash: Number(data.expectedCash) || 0,
        totalAmount: Number(data.totalAmount) || 0,
        reportStatus: data.reportStatus || 'DRAFT',
        reportVersion: data.reportVersion || 1,
        tipsPaidConfirmedAt: data.tipsPaidConfirmedAt || null,
        notes500: data.notes500 || 0,
        notes200: data.notes200 || 0,
        notes100: data.notes100 || 0,
        notes50: data.notes50 || 0,
        notes20: data.notes20 || 0,
        notes10: data.notes10 || 0,
      });
      setStaleSource(!!data.staleSource);
      setExpenditures((exps || []).filter((v) => v.status !== 'VOIDED' && !v.voided && v.entryType !== 'LIABILITY_PAYMENT'));
    } catch (err) {
      setError(err.message || 'Failed to load X Report');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadReport(reportDate);
  }, [reportDate, loadReport]);

  const handleRefresh = useCallback(async () => {
    try {
      const edgeLocal = isEdgeLocalAuth();
      let data;
      if (edgeLocal) {
        data = await edgeFetch(`/api/edge/x-report?date=${reportDate}`);
      } else {
        data = await apiFetch(`/api/xreports/${reportDate}`, { timeout: 60000 });
      }
      setReport(prev => ({
        ...prev,
        totalSales: Number(data.totalSales) || 0,
        expenditureAmount: Number(data.expenditureAmount) || 0,
        cardAmount: Number(data.cardAmount) || 0,
        cashAmount: Number(data.cashAmount) || 0,
        upiAmount: Number(data.upiAmount) || 0,
        otherAmount: Number(data.otherAmount) || 0,
        tipsAmount: Number(data.tipsAmount) || 0,
        cashTipsAmount: Number(data.cashTipsAmount) || 0,
        cardTipsAmount: Number(data.cardTipsAmount) || 0,
        upiTipsAmount: Number(data.upiTipsAmount) || 0,
        otherTipsAmount: Number(data.otherTipsAmount) || 0,
        tipsPaidAmount: Number(data.tipsPaidAmount) || 0,
        cashExpenditures: Number(data.cashExpenditures) || 0,
        expectedCash: Number(data.expectedCash) || 0,
        totalAmount: Number(data.totalAmount) || 0,
        reportStatus: data.reportStatus || prev.reportStatus,
      }));
      setLastUpdated(new Date());
      setSavedMsg('Refreshed from current transactions');
    } catch (err) {
      setError('Failed to refresh: ' + err.message);
    }
  }, [reportDate]);

  // Auto-refresh every 30s while DRAFT, but pause while user is editing fields
  useEffect(() => {
    const interval = setInterval(() => {
      if (!pauseAutoRefreshRef.current && isDraft) {
        handleRefresh();
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [handleRefresh, isDraft]);

  // Real-time refresh on order:paid events while DRAFT
  useEffect(() => {
    if (!socket) return;
    const onOrderPaid = () => {
      if (!pauseAutoRefreshRef.current && isDraft) {
        handleRefresh();
      }
    };
    socket.on('order:paid', onOrderPaid);
    return () => {
      socket.off('order:paid', onOrderPaid);
    };
  }, [socket, handleRefresh, isDraft]);

  const handleFieldChange = (field, value) => {
    setReport(prev => ({ ...prev, [field]: value }));
    setSavedMsg(null);
  };

  const handleInputFocus = () => {
    pauseAutoRefreshRef.current = true;
  };

  const handleInputBlur = () => {
    pauseAutoRefreshRef.current = false;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        reportDate,
        notes500: Number(report.notes500 || 0),
        notes200: Number(report.notes200 || 0),
        notes100: Number(report.notes100 || 0),
        notes50: Number(report.notes50 || 0),
        notes20: Number(report.notes20 || 0),
        notes10: Number(report.notes10 || 0),
      };

      if (isEdgeLocalAuth()) {
        await edgeFetch('/api/edge/x-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/xreports', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setSavedMsg('X Report saved successfully');
      return true;
    } catch (err) {
      setError(err.message || 'Failed to save X Report');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmPayout = async () => {
    setConfirming(true);
    setError(null);
    try {
      const payload = {
        notes500: Number(report.notes500 || 0),
        notes200: Number(report.notes200 || 0),
        notes100: Number(report.notes100 || 0),
        notes50: Number(report.notes50 || 0),
        notes20: Number(report.notes20 || 0),
        notes10: Number(report.notes10 || 0),
      };
      const updated = await apiFetch(`/api/xreports/${reportDate}/confirm-payout`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setReport(prev => ({
        ...prev,
        ...flattenReport(updated),
      }));
      setSavedMsg('Tip payout confirmed — tips paid from cash drawer');
    } catch (err) {
      setError(err.message || 'Failed to confirm payout');
    } finally {
      setConfirming(false);
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    setError(null);
    try {
      const updated = await apiFetch(`/api/xreports/${reportDate}/finalize`, {
        method: 'POST',
      });
      setReport(prev => ({
        ...prev,
        ...flattenReport(updated),
      }));
      setSavedMsg('X Report finalized — snapshot locked');
    } catch (err) {
      setError(err.message || 'Failed to finalize');
    } finally {
      setFinalizing(false);
    }
  };

  const buildXReportText = () => {
    const W = 32;
    const center = (s) => ' '.repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s;
    const line = '─'.repeat(W);
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
    lines.push(row('Total Sale', '₹' + round2(Number(report.totalSales)).toFixed(2)));
    lines.push(row('  Cash Collected', '₹' + round2(Number(report.cashAmount)).toFixed(2)));
    lines.push(row('  Card Collected', '₹' + round2(Number(report.cardAmount)).toFixed(2)));
    lines.push(row('  UPI Collected', '₹' + round2(Number(report.upiAmount)).toFixed(2)));
    lines.push(row('  Other Collected', '₹' + round2(Number(report.otherAmount)).toFixed(2)));
    lines.push(line);
    lines.push(row('Tips Collected', '₹' + round2(Number(report.tipsAmount)).toFixed(2)));
    lines.push(row('Tips Paid (from Cash)', '₹' + round2(Number(report.tipsPaidAmount)).toFixed(2)));
    lines.push(line);
    lines.push(row('Expenditure (Total)', '₹' + round2(expenditureTotal).toFixed(2)));
    if (expenditures.length > 0) {
      lines.push(`  ${'Paid To'.padEnd(14)}${'Type'.padEnd(9)}Amt`);
      expenditures.forEach((v) => {
        const name = (v.paidToName || '').slice(0, 14).padEnd(14);
        const type = (v.category || v.paidToType || '').slice(0, 9).padEnd(9);
        const amt = ('₹' + Number(v.amount).toFixed(2)).padStart(W - 2 - 14 - 9);
        lines.push(`  ${name}${type}${amt}`);
      });
    }
    lines.push(line);
    lines.push(center('EXPECTED CASH'));
    lines.push(center('₹' + expectedCash.toFixed(2)));
    lines.push(center('(Cash Collected - Cash Exp - Tips Paid)'));
    lines.push(line);
    lines.push('Denomination breakdown:');
    DENOMINATIONS.forEach(d => {
      const qty = report[d.key] || 0;
      if (qty > 0) {
        lines.push(count(d.label, qty, qty * d.value));
      }
    });
    lines.push(line);
    lines.push(row('Cash from Notes', '₹' + round2(cashFromNotes).toFixed(2)));
    lines.push(row(cashVariance === 0 ? 'Balanced' : cashVariance > 0 ? 'Short by' : 'Over by', '₹' + Math.abs(cashVariance).toFixed(2)));
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
    cardAmount: round2(Number(report.cardAmount || 0)),
    cashAmount: round2(Number(report.cashAmount || 0)),
    upiAmount: round2(Number(report.upiAmount || 0)),
    otherAmount: round2(Number(report.otherAmount || 0)),
    tipsAmount: round2(Number(report.tipsAmount || 0)),
    tipsPaidAmount: round2(Number(report.tipsPaidAmount || 0)),
    expenditureAmount: round2(expenditureTotal),
    finalAmount: expectedCash,
    expenditures: expenditures.map((v) => ({
      paidToName: v.paidToName,
      paidToType: v.paidToType,
      category: v.category,
      narration: v.narration,
      approvedByName: v.approvedByName || v.approvedBy?.name || null,
      amount: Number(v.amount),
    })),
    denominations: DENOMINATIONS.map(d => ({
      label: `Rs.${d.value}`,
      value: d.value,
      count: report[d.key] || 0,
    })),
    cashFromNotes: round2(cashFromNotes),
  });

  const handlePrint = async () => {
    if (!isFinalized) {
      setError('X Report must be finalized before printing. Confirm tip payout (if tips > 0) then finalize.');
      return;
    }

    const edgeLocal = isEdgeLocalAuth();

    if (edgeLocal) {
      try {
        const result = await edgeFetch(`/api/edge/x-report/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportDate,
            cashierName: user?.name || '',
            totalSales: round2(Number(report.totalSales)),
            cardAmount: round2(Number(report.cardAmount || 0)),
            cashAmount: round2(Number(report.cashAmount || 0)),
            upiAmount: round2(Number(report.upiAmount || 0)),
            otherAmount: round2(Number(report.otherAmount || 0)),
            tipsAmount: round2(Number(report.tipsAmount || 0)),
            tipsPaidAmount: round2(Number(report.tipsPaidAmount || 0)),
            expenditureAmount: round2(expenditureTotal),
            expenditures: expenditures.map(v => ({
              paidToName: v.paidToName,
              paidToType: v.paidToType,
              category: v.category,
              amount: Number(v.amount),
            })),
            denominations: DENOMINATIONS.map(d => ({ label: `Rs.${d.value}`, value: d.value, count: report[d.key] || 0 })),
            cashFromNotes: round2(cashFromNotes),
          }),
        });
        if (result?.pending) {
          setSavedMsg('X Report — printing in progress, will complete shortly.');
        } else if (result?.printed) {
          setSavedMsg('X Report printed');
        } else if (result?.printError) {
          setSavedMsg('X Report print failed — use reprint to try again.');
        } else {
          setSavedMsg('X Report printed');
        }
        return;
      } catch (err) {
        setError('Print failed: ' + err.message);
        return;
      }
    }

    // Cloud-auth users: backend socket + output intent + local fallback
    let escposData = null;
    let eventId = null;
    try {
      const result = await apiFetch(`/api/xreports/${reportDate}/print`, { method: 'POST' });
      escposData = result?.escposData || null;
      eventId = result?.eventId || null;
    } catch (err) {
      console.warn('[XReport] Backend print request failed, trying local print only:', err);
    }

    try {
      try {
        const xReportPayload = {
          restaurantName: restaurant?.name || '',
          cashierName: user?.name || '',
          reportDate,
          totalSales: round2(Number(report.totalSales)),
          cardAmount: round2(Number(report.cardAmount || 0)),
          cashAmount: round2(Number(report.cashAmount || 0)),
          upiAmount: round2(Number(report.upiAmount || 0)),
          otherAmount: round2(Number(report.otherAmount || 0)),
          tipsAmount: round2(Number(report.tipsAmount || 0)),
          tipsPaidAmount: round2(Number(report.tipsPaidAmount || 0)),
          expenditureAmount: round2(expenditureTotal),
          finalAmount: expectedCash,
          expenditures: expenditures.map((v) => ({
            paidToName: v.paidToName,
            paidToType: v.paidToType,
            category: v.category,
            narration: v.narration,
            approvedByName: v.approvedByName || v.approvedBy?.name || null,
            amount: Number(v.amount),
          })),
          denominations: DENOMINATIONS.map(d => ({
            label: `Rs.${d.value}`,
            value: d.value,
            count: report[d.key] || 0,
          })),
          cashFromNotes: round2(cashFromNotes),
        };
        const intentResult = await sendOutputIntent({
          type: 'OUTPUT',
          intentId: generateIntentId(),
          intent: 'PRINT_X_REPORT',
          payload: xReportPayload,
          priority: 'NORMAL',
        });
        if (intentResult?.ok) {
          setSavedMsg(intentResult?.pending
            ? 'X Report — printing in progress, will complete shortly.'
            : 'X Report printed via runtime');
          return;
        }
      } catch (intentErr) {
        console.warn('[XReport] Output intent failed, falling back to local print:', intentErr.message);
      }

      const result = await printLocal({
        type: 'FINAL_BILL',
        escposData: escposData || buildXReportEscposData(),
        eventId: eventId || undefined,
      });
      if (!result.printed) {
        console.warn('[XReport] Direct print failed:', result.error);
        openBrowserPrint(buildXReportText());
        setSavedMsg('No direct printer found — opened browser print dialog. Configure Print Agent/QZ Tray for auto-print.');
        return;
      }
      setSavedMsg('X Report printed');
    } catch (localErr) {
      setError('Print failed: ' + localErr.message);
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

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-black text-gray-900 uppercase tracking-wider">X Report</h2>
            {lastUpdated && (
              <p className="text-[10px] font-bold text-gray-400 mt-0.5">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
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

        {/* Status badge */}
        <div className="mb-3 flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
            isDraft ? 'bg-amber-100 text-amber-700' :
            isPayoutConfirmed ? 'bg-blue-100 text-blue-700' :
            'bg-green-100 text-green-700'
          }`}>
            {STATUS_LABELS[report.reportStatus] || report.reportStatus}
          </span>
          {isFinalized && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-600">
              <Lock size={12} /> Immutable snapshot
            </span>
          )}
          {staleSource && !isDraft && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-700">
              ⚠ Source Changed — Reopen Required
            </span>
          )}
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
            {/* Sales + Gross Collections (read-only, backend-computed) */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <div className="flex justify-between items-center pb-2 border-b border-gray-200 mb-2">
                <span className="text-sm font-black text-gray-700 uppercase tracking-wide">Total Sale</span>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-black text-gray-900 tabular-nums">₹{round2(Number(report.totalSales)).toFixed(2)}</span>
                  {isDraft && (
                    <button
                      onClick={handleRefresh}
                      className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 underline"
                      title="Refresh from current transactions"
                    >
                      <RefreshCw size={12} /> Refresh
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 pl-2">
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm font-bold text-gray-600">Cash Collected</span>
                  <span className="text-sm font-black text-gray-900 tabular-nums">₹{round2(Number(report.cashAmount)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm font-bold text-gray-600">Card Collected</span>
                  <span className="text-sm font-black text-gray-900 tabular-nums">₹{round2(Number(report.cardAmount)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm font-bold text-gray-600">UPI Collected</span>
                  <span className="text-sm font-black text-gray-900 tabular-nums">₹{round2(Number(report.upiAmount)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm font-bold text-gray-600">Other Collected</span>
                  <span className="text-sm font-black text-gray-900 tabular-nums">₹{round2(Number(report.otherAmount)).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Tips Collected + Mandatory Tip Payout */}
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <div className="flex justify-between items-center pb-2 border-b border-amber-200 mb-2">
                <span className="text-sm font-black text-amber-700 uppercase tracking-wide">Tips Collected</span>
                <span className="text-lg font-black text-amber-900 tabular-nums">₹{round2(Number(report.tipsAmount)).toFixed(2)}</span>
              </div>
              <div className="flex flex-col gap-1 pl-2">
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-xs font-bold text-amber-600">Cash Tips</span>
                  <span className="text-xs font-bold text-amber-900 tabular-nums">₹{round2(Number(report.cashTipsAmount)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-xs font-bold text-amber-600">Card Tips</span>
                  <span className="text-xs font-bold text-amber-900 tabular-nums">₹{round2(Number(report.cardTipsAmount)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-xs font-bold text-amber-600">UPI Tips</span>
                  <span className="text-xs font-bold text-amber-900 tabular-nums">₹{round2(Number(report.upiTipsAmount)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-xs font-bold text-amber-600">Other Tips</span>
                  <span className="text-xs font-bold text-amber-900 tabular-nums">₹{round2(Number(report.otherTipsAmount)).toFixed(2)}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-amber-200">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black uppercase text-amber-700">Tips Paid (from Cash)</span>
                  <span className="text-sm font-black text-amber-900 tabular-nums">₹{round2(Number(report.tipsPaidAmount)).toFixed(2)}</span>
                </div>
                <p className="text-[10px] font-bold text-amber-500 mt-1">
                  Mandatory same-day cash payout — amount equals total tips and cannot be edited.
                </p>
              </div>
            </div>

            {/* Expenditure — auto total + itemized voucher table */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-black text-gray-700 uppercase tracking-wide">Expenditure</span>
                <span className="text-lg font-black text-purple-900 tabular-nums">₹{round2(expenditures.reduce((sum, v) => sum + Number(v.amount || 0), 0)).toFixed(2)}</span>
              </div>
              {expenditures.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-200">
                        <th className="py-1.5 pr-2">Paid To</th>
                        <th className="py-1.5 pr-2">Type</th>
                        <th className="py-1.5 pr-2">Narration</th>
                        <th className="py-1.5 pr-2">Approved By</th>
                        <th className="py-1.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenditures.map((v) => (
                        <tr key={v.id} className="border-b border-gray-100">
                          <td className="py-1.5 pr-2 font-semibold text-gray-800">{v.paidToName}</td>
                          <td className="py-1.5 pr-2 text-gray-500">{v.category || v.paidToType}</td>
                          <td className="py-1.5 pr-2 text-gray-500">{v.narration || '—'}</td>
                          <td className="py-1.5 pr-2 text-gray-500">{v.approvedByName || v.approvedBy?.name || '—'}</td>
                          <td className="py-1.5 text-right font-bold text-gray-900 tabular-nums">₹{Number(v.amount).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs font-semibold text-gray-400 mt-2">No vouchers for this date.</p>
              )}
            </div>

            {/* Expected Cash — standout block */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 flex flex-col items-center justify-center gap-1">
              <span className="text-xs font-black uppercase tracking-widest text-blue-700">Expected Cash</span>
              <span className="text-3xl md:text-4xl font-black text-blue-900 tabular-nums">₹{expectedCash.toFixed(2)}</span>
              <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Cash Collected - Cash Exp - Tips Paid</span>
            </div>

            {/* Denomination Count — only editable while DRAFT */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Cash Denomination Count</h3>
                {isDraft && (
                  <button
                    onClick={() => {
                      denominationSuggestion.forEach(d => handleFieldChange(d.key, d.suggestedCount));
                    }}
                    className="text-[10px] font-bold text-blue-600 hover:text-blue-800 underline"
                    title="Auto-fill note counts to match the expected cash"
                  >
                    Fill Suggestion
                  </button>
                )}
              </div>
              <p className="text-[10px] font-bold text-gray-500 mb-3">
                Enter note counts — suggested counts show how to reach the expected cash
              </p>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {DENOMINATIONS.map((d, i) => {
                  const sugg = denominationSuggestion[i];
                  const entered = report[d.key] || 0;
                  const matches = entered === sugg.suggestedCount;
                  return (
                    <div key={d.key}>
                      <label className={labelClass}>{d.label}</label>
                      <input
                        type="number"
                        min="0"
                        value={entered === 0 ? '' : entered}
                        onChange={(e) => handleFieldChange(d.key, e.target.value === '' ? 0 : Number(e.target.value))}
                        onFocus={handleInputFocus}
                        onBlur={handleInputBlur}
                        onWheel={(e) => e.target.blur()}
                        disabled={!isDraft}
                        className={`${inputClass} ${matches && entered > 0 ? 'ring-2 ring-green-400/40 border-green-300' : ''} ${!isDraft ? 'bg-gray-100 text-gray-500' : ''}`}
                        placeholder="0"
                      />
                      {sugg.suggestedCount > 0 && isDraft && (
                        <p className="text-[9px] font-bold text-blue-500 mt-0.5 text-center">
                          need {sugg.suggestedCount}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex justify-between items-center pt-3 border-t border-gray-200">
                <span className="text-xs font-black uppercase text-gray-600">Cash from Notes</span>
                <span className="text-sm font-black text-gray-900 tabular-nums">₹{round2(cashFromNotes).toFixed(2)}</span>
              </div>
              {/* Variance indicator */}
              <div className="mt-2 flex justify-between items-center pt-2 border-t border-gray-200">
                <span className="text-xs font-black uppercase text-gray-600">
                  {cashVariance === 0 ? 'Balanced' : cashVariance > 0 ? 'Short by' : 'Over by'}
                </span>
                <span className={`text-sm font-black tabular-nums ${
                  cashVariance === 0 ? 'text-green-600' : cashVariance > 0 ? 'text-red-600' : 'text-amber-600'
                }`}>
                  ₹{Math.abs(cashVariance).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Action buttons — state machine flow */}
            <div className="flex flex-col gap-3">
              {/* DRAFT: Save denominations + Confirm Payout (if tips > 0) or Finalize (if tips = 0) */}
              {isDraft && (
                <>
                  <div className="flex gap-3">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex-1 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-black uppercase tracking-wider transition-all hover:bg-gray-700 shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Save size={16} />
                      {saving ? 'Saving...' : 'Save Denominations'}
                    </button>
                  </div>
                  {hasTips ? (
                    <button
                      onClick={handleConfirmPayout}
                      disabled={confirming}
                      className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-black uppercase tracking-wider transition-all hover:bg-blue-700 shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={16} />
                      {confirming ? 'Confirming...' : `I Paid ₹${round2(Number(report.tipsAmount)).toFixed(2)} Tips from Cash Drawer`}
                    </button>
                  ) : (
                    <button
                      onClick={handleFinalize}
                      disabled={finalizing}
                      className="w-full py-2.5 rounded-lg bg-green-600 text-white text-sm font-black uppercase tracking-wider transition-all hover:bg-green-700 shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Lock size={16} />
                      {finalizing ? 'Finalizing...' : 'Finalize Report'}
                    </button>
                  )}
                </>
              )}

              {/* PAYOUT_CONFIRMED: Finalize */}
              {isPayoutConfirmed && (
                <button
                  onClick={handleFinalize}
                  disabled={finalizing}
                  className="w-full py-2.5 rounded-lg bg-green-600 text-white text-sm font-black uppercase tracking-wider transition-all hover:bg-green-700 shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Lock size={16} />
                  {finalizing ? 'Finalizing...' : 'Finalize Report'}
                </button>
              )}

              {/* FINALIZED: Print */}
              {isFinalized && (
                <button
                  onClick={handlePrint}
                  className="w-full py-2.5 rounded-lg bg-[#E53935] text-white text-sm font-black uppercase tracking-wider transition-all hover:bg-[#c62828] shadow-md flex items-center justify-center gap-2"
                >
                  <Printer size={16} />
                  Print X Report
                </button>
              )}

              {/* Print hint for non-finalized states */}
              {!isFinalized && (
                <p className="text-[10px] font-bold text-gray-400 text-center">
                  Printing is available only after finalization.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Flatten a backend X-report row into the frontend state shape.
function flattenReport(data) {
  return {
    id: data.id || null,
    totalSales: Number(data.totalSales) || 0,
    expenditureAmount: Number(data.expenditureAmount) || 0,
    cardAmount: Number(data.cardAmount) || 0,
    cashAmount: Number(data.cashAmount) || 0,
    upiAmount: Number(data.upiAmount) || 0,
    otherAmount: Number(data.otherAmount) || 0,
    tipsAmount: Number(data.tipsAmount) || 0,
    cashTipsAmount: Number(data.cashTipsAmount) || 0,
    cardTipsAmount: Number(data.cardTipsAmount) || 0,
    upiTipsAmount: Number(data.upiTipsAmount) || 0,
    otherTipsAmount: Number(data.otherTipsAmount) || 0,
    tipsPaidAmount: Number(data.tipsPaidAmount) || 0,
    cashExpenditures: Number(data.cashExpenditures) || 0,
    expectedCash: Number(data.expectedCash) || 0,
    totalAmount: Number(data.totalAmount) || 0,
    reportStatus: data.reportStatus || 'DRAFT',
    reportVersion: data.reportVersion || 1,
    tipsPaidConfirmedAt: data.tipsPaidConfirmedAt || null,
    staleSource: !!data.staleSource,
    notes500: data.notes500 || 0,
    notes200: data.notes200 || 0,
    notes100: data.notes100 || 0,
    notes50: data.notes50 || 0,
    notes20: data.notes20 || 0,
    notes10: data.notes10 || 0,
  };
}
