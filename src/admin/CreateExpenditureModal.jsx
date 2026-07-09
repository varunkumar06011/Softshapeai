import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, ChevronDown, Loader2, Save, Wallet } from 'lucide-react';
import { apiFetch } from '../services/apiConfig';
import { getKolkataDateString } from '../shared/utils/dateFormat';
import LedgerCategoryPicker from '../shared/components/LedgerCategoryPicker';

const CROSS_OUTLET_APPROVERS = ['Vinod sir', 'Chandra sir', 'BVL Srinu sir'];

export default function CreateExpenditureModal({ isOpen, onClose, onSaved, editExpenditure }) {
  const isEditMode = !!editExpenditure;
  const [paidToOptions, setPaidToOptions] = useState({ staff: [] });
  const [approverOptions, setApproverOptions] = useState(CROSS_OUTLET_APPROVERS);
  const [narrationSuggestions, setNarrationSuggestions] = useState([]);

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
  const [expenditureDate, setExpenditureDate] = useState(() => getKolkataDateString());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const paidToRef = useRef(null);
  const approverRef = useRef(null);
  const [showPaidToDropdown, setShowPaidToDropdown] = useState(false);
  const [showApproverDropdown, setShowApproverDropdown] = useState(false);
  const [showNarrationSuggestions, setShowNarrationSuggestions] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [optsRes, narrationsRes] = await Promise.allSettled([
        apiFetch('/api/expenditures/paid-to-options'),
        apiFetch('/api/expenditures/narration-suggestions'),
      ]);
      if (optsRes.status === 'fulfilled') setPaidToOptions(optsRes.value || { staff: [] });
      if (narrationsRes.status === 'fulfilled') setNarrationSuggestions(narrationsRes.value || []);
    } catch (err) {
      console.error('[CreateExpenditureModal] Load options failed:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
      if (isEditMode && editExpenditure) {
        const exp = editExpenditure;
        setPaidToType(exp.paidToType || 'STAFF');
        setPaidToSearch(exp.paidToName || '');
        setPaidToName(exp.paidToName || '');
        setAmount(String(exp.amount || ''));
        setNarration(exp.narration || '');
        setNarrationDebounce(exp.narration || '');
        setExpenditureDate(exp.expenditureDate || getKolkataDateString());
        setSelectedApprover(exp.approvedByName || exp.approvedBy?.name || null);
        setApproverSearch(exp.approvedByName || exp.approvedBy?.name || '');
        if (exp.paidToType === 'STAFF') {
          setSelectedEmployee(exp.employee ? { ...exp.employee, type: 'STAFF' } : null);
          setSelectedCategory(null);
        } else {
          setSelectedEmployee(null);
          setSelectedCategory(exp.category ? { id: exp.ledgerCategoryId, name: exp.category } : null);
        }
      } else {
        setExpenditureDate(getKolkataDateString());
      }
    }
  }, [isOpen, loadData, isEditMode, editExpenditure]);

  useEffect(() => {
    const timer = setTimeout(() => setNarrationDebounce(narration), 300);
    return () => clearTimeout(timer);
  }, [narration]);

  useEffect(() => {
    const handler = (e) => {
      if (paidToRef.current && !paidToRef.current.contains(e.target)) setShowPaidToDropdown(false);
      if (approverRef.current && !approverRef.current.contains(e.target)) setShowApproverDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const resetForm = () => {
    setPaidToType('STAFF');
    setPaidToSearch('');
    setSelectedEmployee(null);
    setSelectedCategory(null);
    setPaidToName('');
    setAmount('');
    setNarration('');
    setNarrationDebounce('');
    setSelectedApprover(null);
    setApproverSearch('');
    setExpenditureDate(getKolkataDateString());
    setError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

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
      if (isEditMode) {
        const body = {
          paidToType,
          paidToName: paidToName.trim() || paidToSearch.trim(),
          employeeId: paidToType === 'STAFF'
            ? (selectedEmployee?.id === 'NEW'
                ? undefined
                : (selectedEmployee?.employeeId || selectedEmployee?.id))
            : undefined,
          amount: parseFloat(amount),
          narration: narration.trim() || undefined,
          category: paidToType === 'STAFF' ? undefined : (selectedCategory?.name || undefined),
          ledgerCategoryId: paidToType === 'STAFF' ? undefined : (selectedCategory?.id || undefined),
          entryType: paidToType === 'STAFF' ? undefined : 'EXPENSE',
          approvedByName: selectedApprover || approverSearch.trim() || undefined,
          expenditureDate,
        };

        const result = await apiFetch(`/api/expenditures/${editExpenditure.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });

        onSaved?.(result);
        handleClose();
      } else {
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
          createdVia: 'ADMIN',
          amount: parseFloat(amount),
          narration: narration.trim() || undefined,
          category: paidToType === 'STAFF' ? undefined : (selectedCategory?.name || undefined),
          ledgerCategoryId: paidToType === 'STAFF' ? undefined : (selectedCategory?.id || undefined),
          entryType: paidToType === 'STAFF' ? undefined : 'EXPENSE',
          approvedByName: selectedApprover || approverSearch.trim() || undefined,
          idempotencyKey,
          expenditureDate,
        };

        const result = await apiFetch('/api/expenditures', {
          method: 'POST',
          body: JSON.stringify(body),
        });

        onSaved?.(result);
        handleClose();
      }
    } catch (err) {
      setError(err.message || (isEditMode ? 'Failed to update expenditure' : 'Failed to create expenditure'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-800 flex items-center gap-2">
            <Wallet size={18} className="text-[#E53935]" />
            {isEditMode ? 'Edit Expenditure' : 'Create Expenditure'}
          </h3>
          <button onClick={handleClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs font-bold">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-black uppercase text-gray-400 mb-1 block">Date</label>
            <input
              type="date"
              value={expenditureDate}
              max={getKolkataDateString()}
              onChange={(e) => setExpenditureDate(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
            />
          </div>

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
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredStaff.length > 0 && (
                      <div className="p-1">
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
                    setSelectedApprover(null);
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
                <Save size={16} />
                {isEditMode ? 'Update Expenditure' : 'Save Expenditure'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
