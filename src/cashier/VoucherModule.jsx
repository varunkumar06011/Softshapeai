import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wallet,
  Search,
  Loader2,
  Check,
  Printer,
  X,
  ChevronDown,
  Receipt,
  Calendar,
} from 'lucide-react';
import { API_BASE, getAuthHeaders, apiFetch } from '../services/apiConfig';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';

export default function VoucherModule() {
  const restaurantId = getCurrentRestaurantId();

  const [paidToOptions, setPaidToOptions] = useState({ staff: [] });
  const [approvers, setApprovers] = useState([]);
  const [narrationSuggestions, setNarrationSuggestions] = useState([]);

  const [paidToType, setPaidToType] = useState('STAFF');
  const [paidToSearch, setPaidToSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [paidToName, setPaidToName] = useState('');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [narrationDebounce, setNarrationDebounce] = useState('');
  const [voucherDate, setVoucherDate] = useState(() => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    return ist.toISOString().split('T')[0];
  });
  const [selectedApprover, setSelectedApprover] = useState(null);
  const [approverSearch, setApproverSearch] = useState('');

  const [saving, setSaving] = useState(false);
  const [savedVoucher, setSavedVoucher] = useState(null);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);
  const [printingId, setPrintingId] = useState(null);

  const [todaySummary, setTodaySummary] = useState(null);
  const [recentVouchers, setRecentVouchers] = useState([]);
  const [summaryDate, setSummaryDate] = useState(() => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    return ist.toISOString().split('T')[0];
  });

  const paidToRef = useRef(null);
  const approverRef = useRef(null);
  const [showPaidToDropdown, setShowPaidToDropdown] = useState(false);
  const [showApproverDropdown, setShowApproverDropdown] = useState(false);
  const [showNarrationSuggestions, setShowNarrationSuggestions] = useState(false);

  const loadData = useCallback(async (date = summaryDate) => {
    try {
      const [opts, approverList, narrations, summary, recent] = await Promise.all([
        apiFetch('/api/vouchers/paid-to-options'),
        apiFetch('/api/vouchers/approver-options'),
        apiFetch('/api/vouchers/narration-suggestions'),
        apiFetch(`/api/vouchers/today-summary?date=${date}`),
        apiFetch(`/api/vouchers?date=${date}&limit=10`),
      ]);
      setPaidToOptions(opts || { staff: [] });
      setApprovers(approverList || []);
      setNarrationSuggestions(narrations || []);
      setTodaySummary(summary || null);
      setRecentVouchers(recent || []);
    } catch (err) {
      console.error('[VoucherModule] Failed to load data:', err);
    }
  }, [summaryDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadData(summaryDate);
  }, [summaryDate]);

  // Debounced narration
  useEffect(() => {
    const timer = setTimeout(() => setNarrationDebounce(narration), 300);
    return () => clearTimeout(timer);
  }, [narration]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (paidToRef.current && !paidToRef.current.contains(e.target)) setShowPaidToDropdown(false);
      if (approverRef.current && !approverRef.current.contains(e.target)) setShowApproverDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredStaff = paidToOptions.staff?.filter((s) =>
    s.name.toLowerCase().includes(paidToSearch.toLowerCase())
  ) || [];

  const filteredApprovers = approvers?.filter((a) =>
    a.name.toLowerCase().includes(approverSearch.toLowerCase())
  ) || [];

  const filteredNarrations = narrationSuggestions?.filter((n) =>
    n.toLowerCase().includes(narrationDebounce.toLowerCase())
  ) || [];

  const handlePaidToSelect = (item) => {
    if (item.id) {
      setSelectedEmployee(item);
      setPaidToName(item.name);
      setPaidToType('STAFF');
    } else {
      setSelectedEmployee(null);
      setPaidToType('OTHER');
      setPaidToName(item.name || '');
    }
    setPaidToSearch(item.name || item.label || '');
    setShowPaidToDropdown(false);
  };

  const handleApproverSelect = (approver) => {
    setSelectedApprover(approver);
    setApproverSearch(approver.name);
    setShowApproverDropdown(false);
  };

  const handleSave = async () => {
    setError('');
    if (!paidToSearch.trim()) {
      setError('Please select who this voucher is paid to');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setSaving(true);
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

      const body = {
        paidToType,
        paidToName: paidToType === 'STAFF' ? (selectedEmployee?.name || paidToSearch.trim()) : paidToSearch.trim(),
        employeeId: paidToType === 'STAFF' ? (selectedEmployee?.employeeId || selectedEmployee?.id) : undefined,
        amount: parseFloat(amount),
        narration: narration.trim() || undefined,
        approvedById: selectedApprover?.id || undefined,
        idempotencyKey,
        voucherDate,
      };

      const result = await apiFetch('/api/vouchers', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setSavedVoucher(result);
      setAmount('');
      setNarration('');
      setPaidToSearch('');
      setSelectedEmployee(null);
      setSelectedApprover(null);
      setApproverSearch('');
      setVoucherDate(() => {
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const ist = new Date(now.getTime() + istOffset);
        return ist.toISOString().split('T')[0];
      });
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to create voucher');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    if (!savedVoucher) return;
    setPrinting(true);
    try {
      await apiFetch(`/api/vouchers/${savedVoucher.id}/print`, { method: 'POST' });
      setSavedVoucher(null);
    } catch (err) {
      setError(err.message || 'Failed to print voucher');
    } finally {
      setPrinting(false);
    }
  };

  const handleReprint = async (voucherId) => {
    setError('');
    setPrintingId(voucherId);
    try {
      await apiFetch(`/api/vouchers/${voucherId}/print`, { method: 'POST' });
    } catch (err) {
      setError(err.message || 'Failed to print voucher');
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Date Filter */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
            <Calendar size={18} className="text-[#E53935]" />
            Vouchers On
          </h3>
          <input
            type="date"
            value={summaryDate}
            onChange={(e) => setSummaryDate(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[#E53935]"
          />
        </div>
      </div>

      {/* Today's Summary */}
      {todaySummary && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wallet size={18} className="text-[#E53935]" />
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-700">Vouchers — {todaySummary.date}</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Count</p>
              <p className="text-xl font-black text-gray-900">{todaySummary.count}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Amount</p>
              <p className="text-xl font-black text-[#E53935]">₹{Number(todaySummary.totalAmount).toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Unverified</p>
              <p className="text-xl font-black text-amber-600">{todaySummary.unverifiedCount}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Verified</p>
              <p className="text-xl font-black text-green-600">{todaySummary.verifiedCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* Voucher Form */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
          <Receipt size={18} className="text-[#E53935]" />
          Create Cash Voucher
        </h3>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs font-bold">
            {error}
          </div>
        )}

        {/* Paid To - Searchable Dropdown */}
        <div>
          <label className="text-xs font-black uppercase text-gray-400 mb-1 block">Paid To</label>
          <div className="relative" ref={paidToRef}>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search staff..."
                value={paidToSearch}
                onChange={(e) => {
                  setPaidToSearch(e.target.value);
                  setShowPaidToDropdown(true);
                  if (paidToType !== 'STAFF') {
                    setPaidToType('STAFF');
                    setSelectedEmployee(null);
                  }
                }}
                onFocus={() => setShowPaidToDropdown(true)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
              />
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            {showPaidToDropdown && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredStaff.length > 0 && (
                  <div className="p-1">
                    <p className="text-[10px] font-black uppercase text-gray-400 px-2 py-1">Staff</p>
                    {filteredStaff.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handlePaidToSelect(s)}
                        className="w-full text-left px-3 py-2 text-sm font-bold hover:bg-gray-50 rounded-lg"
                      >
                        {s.name}
                        {s.role && <span className="text-[10px] text-gray-400 ml-2">{s.role}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {paidToSearch.trim() && filteredStaff.length === 0 && (
                  <div className="p-1 border-t border-gray-100">
                    <button
                      onClick={() => handlePaidToSelect({ name: paidToSearch.trim() })}
                      className="w-full text-left px-3 py-2 text-sm font-bold hover:bg-gray-50 rounded-lg text-[#E53935]"
                    >
                      + Use "{paidToSearch.trim()}" as a new name
                    </button>
                  </div>
                )}
                {filteredStaff.length === 0 && !paidToSearch.trim() && (
                  <p className="px-3 py-3 text-xs text-gray-400 text-center">No staff found</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Voucher Date */}
        <div>
          <label className="text-xs font-black uppercase text-gray-400 mb-1 block">Voucher Date</label>
          <div className="relative">
            <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="date"
              value={voucherDate}
              max={(() => {
                const now = new Date();
                const istOffset = 5.5 * 60 * 60 * 1000;
                const ist = new Date(now.getTime() + istOffset);
                return ist.toISOString().split('T')[0];
              })()}
              onChange={(e) => setVoucherDate(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
            />
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs font-black uppercase text-gray-400 mb-1 block">Amount (₹)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onWheel={(e) => e.target.blur()}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-lg font-black outline-none focus:border-[#E53935]"
          />
        </div>

        {/* Narration with debounced autocomplete */}
        <div className="relative">
          <label className="text-xs font-black uppercase text-gray-400 mb-1 block">Narration</label>
          <input
            type="text"
            placeholder="Enter narration..."
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            onFocus={() => setShowNarrationSuggestions(true)}
            onBlur={() => setTimeout(() => setShowNarrationSuggestions(false), 200)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
          />
          {showNarrationSuggestions && filteredNarrations.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {filteredNarrations.slice(0, 8).map((n, i) => (
                <button
                  key={i}
                  onMouseDown={() => { setNarration(n); setShowNarrationSuggestions(false); }}
                  className="w-full text-left px-3 py-2 text-sm font-bold hover:bg-gray-50 rounded-lg"
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Approved By - Searchable Dropdown */}
        <div>
          <label className="text-xs font-black uppercase text-gray-400 mb-1 block">Approved By</label>
          <div className="relative" ref={approverRef}>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search approver..."
                value={approverSearch}
                onChange={(e) => {
                  setApproverSearch(e.target.value);
                  setShowApproverDropdown(true);
                }}
                onFocus={() => setShowApproverDropdown(true)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
              />
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            {showApproverDropdown && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {filteredApprovers.length > 0 ? (
                  filteredApprovers.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => handleApproverSelect(a)}
                      className="w-full text-left px-3 py-2 text-sm font-bold hover:bg-gray-50 rounded-lg"
                    >
                      {a.name}
                      <span className="text-[10px] text-gray-400 ml-2">{a.role}</span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-3 text-xs text-gray-400 text-center">No approvers found</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[#E53935] text-white rounded-xl px-4 py-3 text-sm font-black uppercase hover:bg-[#B71C1C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check size={16} />
              Save Voucher
            </>
          )}
        </button>
      </div>

      {/* Saved Voucher Print Preview */}
      {savedVoucher && (
        <div className="bg-white rounded-xl border border-green-300 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-600">
            <Check size={18} />
            <h3 className="text-sm font-black uppercase tracking-widest">Voucher Created — #{savedVoucher.voucherNo}</h3>
          </div>
          <div className="text-sm space-y-1">
            <p><span className="font-bold text-gray-400">Paid To:</span> <span className="font-bold text-gray-900">{savedVoucher.paidToName}</span></p>
            <p><span className="font-bold text-gray-400">Amount:</span> <span className="font-black text-[#E53935]">₹{Number(savedVoucher.amount).toLocaleString()}</span></p>
            <p><span className="font-bold text-gray-400">Date:</span> <span className="font-bold text-gray-900">{savedVoucher.voucherDate}</span></p>
            {savedVoucher.narration && <p><span className="font-bold text-gray-400">Narration:</span> {savedVoucher.narration}</p>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              disabled={printing}
              className="flex-1 bg-[#E53935] text-white rounded-xl px-4 py-2.5 text-sm font-black uppercase hover:bg-[#B71C1C] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
              Print
            </button>
            <button
              onClick={() => setSavedVoucher(null)}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-black uppercase hover:bg-gray-200"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Recent Vouchers */}
      {recentVouchers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-700">Recent Vouchers</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {recentVouchers.map((v) => (
              <div key={v.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">#{v.voucherNo} — {v.paidToName}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">{v.voucherDate} · {v.paidToType}</p>
                </div>
                <div className="text-right flex items-center gap-2">
                  <div>
                    <p className="text-sm font-black text-[#E53935]">₹{Number(v.amount).toLocaleString()}</p>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                      v.status === 'VERIFIED' ? 'bg-green-100 text-green-700' :
                      v.status === 'VOIDED' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {v.status}
                    </span>
                  </div>
                  <button
                    onClick={() => handleReprint(v.id)}
                    disabled={printingId === v.id}
                    title="Print voucher"
                    className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  >
                    {printingId === v.id ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
