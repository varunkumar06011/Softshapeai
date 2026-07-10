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
import { apiFetch } from '../services/apiConfig';
import { getKolkataDateString } from '../shared/utils/dateFormat';
import { printLocal } from '../utils/printOffline';
import LedgerCategoryPicker from '../shared/components/LedgerCategoryPicker';

export default function ExpenditureModule() {
  const CROSS_OUTLET_APPROVERS = ['Vinod sir', 'Chandra sir', 'BVL Srinu sir'];

  const [paidToOptions, setPaidToOptions] = useState({ staff: [] });
  const [narrationSuggestions, setNarrationSuggestions] = useState([]);
  const [approverOptions, setApproverOptions] = useState(CROSS_OUTLET_APPROVERS);

  const [paidToType, setPaidToType] = useState('STAFF');
  const [paidToSearch, setPaidToSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [paidToName, setPaidToName] = useState('');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [narrationDebounce, setNarrationDebounce] = useState('');
  const [selectedApprover, setSelectedApprover] = useState(null);
  const [approverSearch, setApproverSearch] = useState('');

  const [saving, setSaving] = useState(false);
  const [savedExpenditure, setSavedExpenditure] = useState(null);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);
  const [printingId, setPrintingId] = useState(null);

  const [todaySummary, setTodaySummary] = useState(null);
  const [recentExpenditures, setRecentExpenditures] = useState([]);
  const [summaryDate, setSummaryDate] = useState(() => getKolkataDateString());

  const paidToRef = useRef(null);
  const approverRef = useRef(null);
  const [showPaidToDropdown, setShowPaidToDropdown] = useState(false);
  const [showApproverDropdown, setShowApproverDropdown] = useState(false);
  const [showNarrationSuggestions, setShowNarrationSuggestions] = useState(false);

  const loadData = useCallback(async (date = summaryDate) => {
    setError('');
    const errors = [];

    const load = async (label, url, setter) => {
      try {
        const data = await apiFetch(url, { timeout: 60000 });
        setter(data);
      } catch (err) {
        console.error(`[ExpenditureModule] ${label} failed:`, err);
        errors.push(`${label}: ${err.message || 'failed'}`);
      }
    };

    await Promise.all([
      load('paid-to-options', '/api/expenditures/paid-to-options', (d) => setPaidToOptions(d || { staff: [] })),
      load('narration-suggestions', '/api/expenditures/narration-suggestions', (d) => setNarrationSuggestions(d || [])),
      load('today-summary', `/api/expenditures/today-summary?date=${date}`, (d) => setTodaySummary(d || null)),
      load('recent-expenditures', `/api/expenditures?date=${date}&limit=10`, (d) => setRecentExpenditures(d || [])),
    ]);

    setApproverOptions(CROSS_OUTLET_APPROVERS);

    if (errors.length > 0) {
      const isTimeout = errors.some((e) => e.toLowerCase().includes('timed out'));
      setError(
        isTimeout
          ? 'Some data took too long to load. Your saved expenditures are safe — please retry in a moment.'
          : `Could not load: ${errors.join(', ')}`
      );
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

  const filteredApprovers = approverOptions.filter((a) =>
    a.toLowerCase().includes(approverSearch.toLowerCase())
  );

  const filteredNarrations = narrationSuggestions?.filter((n) =>
    n.toLowerCase().includes(narrationDebounce.toLowerCase())
  ) || [];

  const handlePaidToSelect = (item) => {
    if (item.type === 'STAFF') {
      setSelectedEmployee(item);
      setPaidToName(item.name);
      setPaidToType('STAFF');
      setSelectedCategory(null);
    }
    setPaidToSearch(item.name || item.label || '');
    setShowPaidToDropdown(false);
  };

  const handleApproverSelect = (approver) => {
    setSelectedApprover(approver);
    setApproverSearch(approver);
    setShowApproverDropdown(false);
  };

  const handleSave = async () => {
    setError('');
    if (!paidToSearch.trim()) {
      setError('Please select who this expenditure is paid to');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (paidToType === 'STAFF' && !selectedEmployee) {
      setError('Please select a staff member');
      return;
    }
    if (paidToType === 'OTHER' && !selectedCategory) {
      setError('Please select an expense category');
      return;
    }

    setSaving(true);
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

      const body = {
        paidToType,
        paidToName: paidToName.trim() || paidToSearch.trim(),
        employeeId: paidToType === 'STAFF'
          ? (selectedEmployee?.id === 'NEW'
              ? undefined
              : (selectedEmployee?.employeeId || selectedEmployee?.id))
          : undefined,
        createEmployeeIfMissing: paidToType === 'STAFF' && selectedEmployee?.id === 'NEW',
        amount: parseFloat(amount),
        narration: narration.trim() || undefined,
        category: paidToType === 'STAFF' ? undefined : (selectedCategory?.name || undefined),
        ledgerCategoryId: paidToType === 'STAFF' ? undefined : (selectedCategory?.id || undefined),
        entryType: paidToType === 'STAFF' ? undefined : 'EXPENSE',
        approvedByName: selectedApprover || approverSearch.trim() || undefined,
        idempotencyKey,
        expenditureDate: summaryDate,
      };

      const result = await apiFetch('/api/expenditures', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setSavedExpenditure(result);
      setAmount('');
      setNarration('');
      setPaidToSearch('');
      setPaidToName('');
      setSelectedEmployee(null);
      setSelectedCategory(null);
      setSelectedApprover(null);
      setApproverSearch('');
      loadData();
      return result;
    } catch (err) {
      setError(err.message || 'Failed to create expenditure');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const dispatchExpenditurePrint = async (expenditureId) => {
    const result = await apiFetch(`/api/expenditures/${expenditureId}/print`, { method: 'POST' });
    if (result?.escposData && result?.eventId) {
      printLocal({ type: 'EXPENDITURE', escposData: result.escposData, eventId: result.eventId, data: {} })
        .catch((err) => console.warn('[ExpenditureModule] Local print attempt failed:', err?.message || err));
    }
    return result;
  };

  const handleSaveAndPrint = async () => {
    setError('');
    const expenditure = await handleSave();
    if (!expenditure) return;

    setPrinting(true);
    try {
      await dispatchExpenditurePrint(expenditure.id);
      setSavedExpenditure(null);
    } catch (err) {
      setError('Saved, but print failed — use reprint button below.');
      setSavedExpenditure(expenditure);
    } finally {
      setPrinting(false);
    }
  };

  const handlePrint = async () => {
    if (!savedExpenditure) return;
    setPrinting(true);
    try {
      await dispatchExpenditurePrint(savedExpenditure.id);
      setSavedExpenditure(null);
    } catch (err) {
      setError(err.message || 'Failed to print expenditure');
    } finally {
      setPrinting(false);
    }
  };

  const handleReprint = async (expenditureId) => {
    setError('');
    setPrintingId(expenditureId);
    try {
      await dispatchExpenditurePrint(expenditureId);
    } catch (err) {
      setError(err.message || 'Failed to print expenditure');
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
            Expenditures On
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
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-700">Expenditures — {todaySummary.date}</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
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
              {todaySummary.unverifiedAmount > 0 && (
                <p className="text-[10px] font-bold text-amber-500">₹{Number(todaySummary.unverifiedAmount).toLocaleString()}</p>
              )}
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Verified</p>
              <p className="text-xl font-black text-green-600">{todaySummary.verifiedCount}</p>
              {todaySummary.verifiedAmount > 0 && (
                <p className="text-[10px] font-bold text-green-500">₹{Number(todaySummary.verifiedAmount).toLocaleString()}</p>
              )}
            </div>
          </div>
          {/* Category Breakdown */}
          {todaySummary.categoryBreakdown?.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">By Category</p>
              <div className="space-y-1.5">
                {todaySummary.categoryBreakdown.map((c) => (
                  <div key={c.category} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-xs font-bold text-gray-700">{c.category}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-gray-400">{c.count}x</span>
                      <span className="text-sm font-black text-[#E53935] tabular-nums">₹{Number(c.totalAmount).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Staff Breakdown */}
          {todaySummary.staffBreakdown?.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">By Staff</p>
              <div className="space-y-1.5">
                {todaySummary.staffBreakdown.slice(0, 5).map((s) => (
                  <div key={s.name} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-xs font-bold text-gray-700">{s.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-gray-400">{s.count}x</span>
                      <span className="text-sm font-black text-[#E53935] tabular-nums">₹{Number(s.totalAmount).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
                {todaySummary.staffBreakdown.length > 5 && (
                  <p className="text-[10px] text-gray-400 font-bold text-center pt-1">+{todaySummary.staffBreakdown.length - 5} more</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expenditure Form */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
          <Receipt size={18} className="text-[#E53935]" />
          Create Cash Expenditure
        </h3>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs font-bold">
            {error}
          </div>
        )}

        {/* Paid To Type Toggle */}
        <div>
          <label className="text-xs font-black uppercase text-gray-400 mb-1 block">Paid To Type</label>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => {
                setPaidToType('STAFF');
                setSelectedCategory(null);
                setPaidToSearch('');
                setPaidToName('');
                setSelectedEmployee(null);
              }}
              className={`flex-1 py-2 text-xs font-black uppercase ${paidToType === 'STAFF' ? 'bg-[#E53935] text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
            >
              Staff
            </button>
            <button
              onClick={() => {
                setPaidToType('OTHER');
                setSelectedEmployee(null);
                setPaidToSearch('');
                setPaidToName('');
                setSelectedCategory(null);
              }}
              className={`flex-1 py-2 text-xs font-black uppercase ${paidToType === 'OTHER' ? 'bg-[#E53935] text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
            >
              Other
            </button>
          </div>
        </div>

        {/* Paid To - Staff search or Category picker */}
        <div>
          <label className="text-xs font-black uppercase text-gray-400 mb-1 block">
            {paidToType === 'STAFF' ? 'Staff Member' : 'Expense Category'}
          </label>
          {paidToType === 'OTHER' ? (
            <LedgerCategoryPicker
              entryType="EXPENSE"
              value={selectedCategory}
              onChange={(cat) => {
                setSelectedCategory(cat);
                setPaidToName(cat?.name || '');
              }}
              placeholder="Search category..."
            />
          ) : (
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
                    setSelectedEmployee(null);
                    setPaidToName('');
                  }}
                  onFocus={() => setShowPaidToDropdown(true)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
                />
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
              {showPaidToDropdown && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto pb-1">
                  {filteredStaff.length > 0 && (
                    <div className="p-1">
                      <p className="sticky top-0 z-10 text-[10px] font-black uppercase text-gray-400 px-2 py-1 bg-white">Staff</p>
                      {filteredStaff.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handlePaidToSelect({ ...s, type: 'STAFF' })}
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
                      <p className="text-[10px] font-black uppercase text-gray-400 px-2 py-1">New staff</p>
                      <button
                        onClick={() => handlePaidToSelect({ id: 'NEW', name: paidToSearch.trim(), role: 'NEW STAFF', type: 'STAFF' })}
                        className="w-full text-left px-3 py-2 text-sm font-bold hover:bg-gray-50 rounded-lg text-[#E53935]"
                      >
                        Add as staff: {paidToSearch.trim()}
                      </button>
                    </div>
                  )}
                  {!paidToSearch.trim() && filteredStaff.length === 0 && (
                    <p className="px-3 py-3 text-xs text-gray-400 text-center">Start typing to search staff</p>
                  )}
                </div>
              )}
            </div>
          )}
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
                      key={a}
                      onClick={() => handleApproverSelect(a)}
                      className="w-full text-left px-3 py-2 text-sm font-bold hover:bg-gray-50 rounded-lg"
                    >
                      {a}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-3 text-xs text-gray-400 text-center">No matching approver</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Save & Print Button */}
        <button
          onClick={handleSaveAndPrint}
          disabled={saving || printing}
          className="w-full bg-[#E53935] text-white rounded-xl px-4 py-3 text-sm font-black uppercase hover:bg-[#B71C1C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving || printing ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {saving ? 'Saving...' : 'Printing...'}
            </>
          ) : (
            <>
              <Printer size={16} />
              Save & Print
            </>
          )}
        </button>
      </div>

      {/* Saved Expenditure Print Preview */}
      {savedExpenditure && (
        <div className="bg-white rounded-xl border border-green-300 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-600">
            <Check size={18} />
            <h3 className="text-sm font-black uppercase tracking-widest">Expenditure Created — #{savedExpenditure.expenditureNo}</h3>
          </div>
          <div className="text-sm space-y-1">
            <p><span className="font-bold text-gray-400">Paid To:</span> <span className="font-bold text-gray-900">{savedExpenditure.paidToName}</span></p>
            <p><span className="font-bold text-gray-400">Amount:</span> <span className="font-black text-[#E53935]">₹{Number(savedExpenditure.amount).toLocaleString()}</span></p>
            <p><span className="font-bold text-gray-400">Date:</span> <span className="font-bold text-gray-900">{savedExpenditure.expenditureDate}</span></p>
            {savedExpenditure.narration && <p><span className="font-bold text-gray-400">Narration:</span> {savedExpenditure.narration}</p>}
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
              onClick={() => setSavedExpenditure(null)}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-black uppercase hover:bg-gray-200"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Recent Expenditures */}
      {recentExpenditures.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-700">Recent Expenditures</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {recentExpenditures.map((v) => (
              <div key={v.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">{v.narration || v.paidToName || '—'}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">#{v.expenditureNo} · {v.paidToName}{v.category ? ` · ${v.category}` : ''} · {v.expenditureDate}</p>
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
                    title="Print expenditure"
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
