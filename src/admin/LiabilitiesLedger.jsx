import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Plus, Save, ArrowLeft, CreditCard, AlertCircle,
  X, RefreshCw, Ban, Wallet, Users, TrendingDown,
} from 'lucide-react';
import { apiFetch } from '../services/apiConfig';
import { getKolkataDateString } from '../shared/utils/dateFormat';
import LedgerCategoryPicker from '../shared/components/LedgerCategoryPicker';

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

const STATUS_STYLES = {
  ACTIVE: { bg: 'bg-green-50', text: 'text-green-600', label: 'Active' },
  CLOSED: { bg: 'bg-gray-100', text: 'text-gray-400', label: 'Closed' },
};

const TYPE_LABELS = {
  LOAN: 'Loan',
  LINE_OF_CREDIT: 'Line of Credit',
  OTHER: 'Other',
};

const SOURCE_LABELS = {
  MANUAL: 'Manual',
  OPENING_BALANCE: 'Opening Balance',
};

export default function LiabilitiesLedger() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [liabilities, setLiabilities] = useState([]);
  const [summary, setSummary] = useState(null);
  const [detail, setDetail] = useState(null);
  const [view, setView] = useState('list'); // 'list' | 'detail' | 'form'
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [hasUnconvertedLoans, setHasUnconvertedLoans] = useState(false);

  const [form, setForm] = useState({
    name: '',
    liabilityType: 'LOAN',
    ledgerCategoryId: null,
    principalAmount: '',
    interestRate: '',
    startDate: getKolkataDateString(),
    lender: '',
    notes: '',
  });

  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentDate: getKolkataDateString(),
    notes: '',
  });

  const [closeForm, setCloseForm] = useState({ closeNotes: '' });

  const loadLiabilities = useCallback(async () => {
    setLoading(true);
    try {
      const [data, sum] = await Promise.all([
        apiFetch('/api/liabilities'),
        apiFetch('/api/liabilities/summary'),
      ]);
      setLiabilities(data || []);
      setSummary(sum || null);
    } catch (err) {
      setError(err.message || 'Failed to load liabilities');
    } finally {
      setLoading(false);
    }
  }, []);

  const checkUnconvertedLoans = useCallback(async () => {
    try {
      const ob = await apiFetch('/api/opening-balance');
      if (ob && ob.isFinalized) {
        const lines = await apiFetch('/api/opening-balance/lines');
        const unconverted = (lines || []).filter(
          (l) => l.lineType === 'LOAN' && !l.refId
        );
        setHasUnconvertedLoans(unconverted.length > 0);
      } else {
        setHasUnconvertedLoans(false);
      }
    } catch {
      setHasUnconvertedLoans(false);
    }
  }, []);

  useEffect(() => {
    loadLiabilities();
    checkUnconvertedLoans();
  }, [loadLiabilities, checkUnconvertedLoans]);

  const resetForm = () => {
    setForm({
      name: '',
      liabilityType: 'LOAN',
      ledgerCategoryId: null,
      principalAmount: '',
      interestRate: '',
      startDate: getKolkataDateString(),
      lender: '',
      notes: '',
    });
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.principalAmount || !form.startDate) {
      setError('Name, principal amount, and start date are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/liabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          liabilityType: form.liabilityType,
          ledgerCategoryId: form.ledgerCategoryId || undefined,
          principalAmount: parseFloat(form.principalAmount),
          interestRate: form.interestRate ? parseFloat(form.interestRate) : undefined,
          startDate: form.startDate,
          lender: form.lender || undefined,
          notes: form.notes || undefined,
        }),
      });
      setSuccess('Liability created successfully');
      resetForm();
      setView('list');
      loadLiabilities();
    } catch (err) {
      setError(err.message || 'Failed to create liability');
    } finally {
      setSaving(false);
    }
  };

  const handlePayment = async () => {
    if (!detail || !paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      setError('Valid payment amount required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/liabilities/${detail.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(paymentForm.amount),
          paymentDate: paymentForm.paymentDate,
          notes: paymentForm.notes || undefined,
        }),
      });
      setSuccess('Payment recorded successfully');
      setShowPaymentModal(false);
      setPaymentForm({ amount: '', paymentDate: getKolkataDateString(), notes: '' });
      const updated = await apiFetch(`/api/liabilities/${detail.id}`);
      setDetail(updated);
      loadLiabilities();
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    if (!detail) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/liabilities/${detail.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closeNotes: closeForm.closeNotes || undefined,
        }),
      });
      setSuccess('Liability closed successfully');
      setShowCloseModal(false);
      setCloseForm({ closeNotes: '' });
      const updated = await apiFetch(`/api/liabilities/${detail.id}`);
      setDetail(updated);
      loadLiabilities();
    } catch (err) {
      setError(err.message || 'Failed to close liability');
    } finally {
      setSaving(false);
    }
  };

  const handleConvertLoans = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await apiFetch('/api/opening-balance/convert-liability-lines', {
        method: 'POST',
      });
      setSuccess(`Converted ${result.converted} loan(s) from opening balance`);
      setHasUnconvertedLoans(false);
      loadLiabilities();
    } catch (err) {
      setError(err.message || 'Failed to convert loan lines');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (id) => {
    setLoading(true);
    try {
      const d = await apiFetch(`/api/liabilities/${id}`);
      setDetail(d);
      setView('detail');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Summary Cards ───────────────────────────────────────────────────────────
  const SummaryCards = () => {
    if (!summary) return null;
    const cards = [
      { label: 'Accounts Payable', value: summary.accountsPayable, icon: Wallet, color: 'text-amber-600' },
      { label: 'Loans & Credit', value: summary.loansAndCredit, icon: CreditCard, color: 'text-blue-600' },
      { label: 'Payroll Payable', value: summary.payrollPayable, icon: Users, color: 'text-purple-600' },
      { label: 'Total', value: summary.total, icon: TrendingDown, color: 'text-red-600' },
    ];
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-1 mb-1">
                <Icon size={12} className={c.color} />
                <span className="text-[10px] font-bold text-gray-400">{c.label}</span>
              </div>
              <div className={`text-sm font-black ${c.color}`}>{round2(c.value).toFixed(2)}</div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── List View ───────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div>
        {error && <div className="mb-3 text-xs font-bold text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}
        {success && <div className="mb-3 text-xs font-bold text-green-600 bg-green-50 rounded px-3 py-2">{success}</div>}

        <SummaryCards />

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-gray-800">Liabilities</h2>
          <div className="flex gap-2">
            {hasUnconvertedLoans && (
              <button
                onClick={handleConvertLoans}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-blue-500 rounded hover:bg-blue-600 disabled:opacity-50"
              >
                <RefreshCw size={12} className={saving ? 'animate-spin' : ''} />
                Convert Opening Balance Loans
              </button>
            )}
            <button
              onClick={() => { resetForm(); setView('form'); }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-[#E53935] rounded hover:bg-[#D32F2F]"
            >
              <Plus size={12} />
              Add Liability
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
        ) : liabilities.length === 0 ? (
          <div className="text-center py-8 text-xs font-bold text-gray-400">
            <CreditCard size={32} className="mx-auto mb-2 text-gray-300" />
            No liabilities recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-left py-2 px-2 font-bold">Name</th>
                  <th className="text-left py-2 px-2 font-bold">Type</th>
                  <th className="text-right py-2 px-2 font-bold">Principal</th>
                  <th className="text-right py-2 px-2 font-bold">Current Balance</th>
                  <th className="text-left py-2 px-2 font-bold">Status</th>
                  <th className="text-left py-2 px-2 font-bold">Source</th>
                </tr>
              </thead>
              <tbody>
                {liabilities.map((liab) => {
                  const style = STATUS_STYLES[liab.status] || STATUS_STYLES.ACTIVE;
                  return (
                    <tr
                      key={liab.id}
                      onClick={() => openDetail(liab.id)}
                      className="border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                    >
                      <td className="py-2 px-2 font-bold text-gray-800">{liab.name}</td>
                      <td className="py-2 px-2 text-gray-600">{TYPE_LABELS[liab.liabilityType] || liab.liabilityType}</td>
                      <td className="py-2 px-2 text-right font-bold text-gray-700">{round2(liab.principalAmount).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-bold text-gray-800">{round2(liab.currentBalance).toFixed(2)}</td>
                      <td className="py-2 px-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${style.bg} ${style.text}`}>
                          {style.label}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-gray-500 text-[10px]">{SOURCE_LABELS[liab.sourceType] || liab.sourceType}</td>
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

  // ── Detail View ─────────────────────────────────────────────────────────────
  if (view === 'detail' && detail) {
    const style = STATUS_STYLES[detail.status] || STATUS_STYLES.ACTIVE;
    return (
      <div>
        {error && <div className="mb-3 text-xs font-bold text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}
        {success && <div className="mb-3 text-xs font-bold text-green-600 bg-green-50 rounded px-3 py-2">{success}</div>}

        <button
          onClick={() => { setView('list'); setDetail(null); }}
          className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-700 mb-3"
        >
          <ArrowLeft size={14} />
          Back to list
        </button>

        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-sm font-black text-gray-800">{detail.name}</h2>
              <span className="text-[10px] font-bold text-gray-400">{TYPE_LABELS[detail.liabilityType] || detail.liabilityType}</span>
            </div>
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${style.bg} ${style.text}`}>
              {style.label}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-gray-400 font-bold mb-0.5">Principal</div>
              <div className="font-bold text-gray-700">{round2(detail.principalAmount).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-400 font-bold mb-0.5">Current Balance</div>
              <div className="font-bold text-gray-700">{round2(detail.currentBalance).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-400 font-bold mb-0.5">Interest Rate</div>
              <div className="font-bold text-gray-700">{detail.interestRate ? `${round2(detail.interestRate)}%` : '—'}</div>
            </div>
            <div>
              <div className="text-gray-400 font-bold mb-0.5">Start Date</div>
              <div className="font-bold text-gray-700">{detail.startDate}</div>
            </div>
            <div>
              <div className="text-gray-400 font-bold mb-0.5">Lender</div>
              <div className="font-bold text-gray-700">{detail.lender || '—'}</div>
            </div>
            <div>
              <div className="text-gray-400 font-bold mb-0.5">Source</div>
              <div className="font-bold text-gray-700">{SOURCE_LABELS[detail.sourceType] || detail.sourceType}</div>
            </div>
          </div>

          {detail.notes && (
            <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
              <span className="font-bold text-gray-400">Notes: </span>{detail.notes}
            </div>
          )}

          {/* Action buttons */}
          {detail.status === 'ACTIVE' && (
            <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => setShowPaymentModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-[#E53935] rounded hover:bg-[#D32F2F]"
              >
                <Wallet size={12} />
                Record Payment
              </button>
              <button
                onClick={() => setShowCloseModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
              >
                <Ban size={12} />
                Close Liability
              </button>
            </div>
          )}
        </div>

        {/* Payment history */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-xs font-black text-gray-800 mb-2">Payment History</h3>
          {(!detail.payments || detail.payments.length === 0) ? (
            <div className="text-xs font-bold text-gray-400 py-4 text-center">
              No payments recorded yet.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-left py-2 px-2 font-bold">Date</th>
                  <th className="text-right py-2 px-2 font-bold">Amount</th>
                  <th className="text-left py-2 px-2 font-bold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {detail.payments.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="py-2 px-2 font-bold text-gray-700">{p.paymentDate}</td>
                    <td className="py-2 px-2 text-right font-bold text-green-600">{round2(Number(p.amount)).toFixed(2)}</td>
                    <td className="py-2 px-2 text-gray-500">{p.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Payment modal */}
        {showPaymentModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-5 max-w-md w-full">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black text-gray-800">Record Payment</h3>
                <button onClick={() => setShowPaymentModal(false)}><X size={16} className="text-gray-400" /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Amount</label>
                  <input
                    type="number" step="0.01"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    placeholder={`Max: ${round2(detail.currentBalance).toFixed(2)}`}
                    className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Payment Date</label>
                  <input
                    type="date"
                    value={paymentForm.paymentDate}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Notes</label>
                  <input
                    type="text"
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                    placeholder="Optional"
                    className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowPaymentModal(false)} className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Cancel</button>
                  <button
                    onClick={handlePayment}
                    disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-[#E53935] rounded hover:bg-[#D32F2F] disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Record Payment
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Close modal */}
        {showCloseModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-5 max-w-md w-full">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black text-gray-800">Close Liability</h3>
                <button onClick={() => setShowCloseModal(false)}><X size={16} className="text-gray-400" /></button>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Closing a liability marks it as settled. Use this for forgiven loans or refinanced debt, not normal payments.
                Remaining balance: <span className="font-bold text-gray-700">{round2(detail.currentBalance).toFixed(2)}</span>
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Close Notes</label>
                  <textarea
                    value={closeForm.closeNotes}
                    onChange={(e) => setCloseForm({ closeNotes: e.target.value })}
                    rows={3}
                    placeholder="e.g. Loan forgiven by lender, refinanced to new bank..."
                    className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowCloseModal(false)} className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Cancel</button>
                  <button
                    onClick={handleClose}
                    disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-gray-600 rounded hover:bg-gray-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                    Confirm Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Form View ───────────────────────────────────────────────────────────────
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
          <h2 className="text-sm font-black text-gray-800 mb-4">Add Liability</h2>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. SBI Kitchen Renovation Loan"
                className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Type *</label>
              <select
                value={form.liabilityType}
                onChange={(e) => setForm({ ...form, liabilityType: e.target.value })}
                className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
              >
                <option value="LOAN">Loan</option>
                <option value="LINE_OF_CREDIT">Line of Credit</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Category</label>
              <LedgerCategoryPicker
                entryType="LIABILITY"
                value={form.ledgerCategoryId ? { id: form.ledgerCategoryId } : null}
                onChange={(cat) => setForm({ ...form, ledgerCategoryId: cat?.id || null })}
                placeholder="Tag with liability category (optional)"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Principal Amount *</label>
                <input
                  type="number" step="0.01"
                  value={form.principalAmount}
                  onChange={(e) => setForm({ ...form, principalAmount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Interest Rate (%)</label>
                <input
                  type="number" step="0.01"
                  value={form.interestRate}
                  onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                  placeholder="e.g. 12.5"
                  className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Start Date *</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Lender</label>
                <input
                  type="text"
                  value={form.lender}
                  onChange={(e) => setForm({ ...form, lender: e.target.value })}
                  placeholder="e.g. State Bank of India"
                  className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
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
                Create Liability
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
