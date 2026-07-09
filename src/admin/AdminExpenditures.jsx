import { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  Search,
  Loader2,
  Check,
  Printer,
  X,
  Filter,
  Download,
  Plus,
  Pencil,
} from 'lucide-react';
import { apiFetch } from '../services/apiConfig';
import CreateExpenditureModal from './CreateExpenditureModal';

export default function AdminExpenditures() {
  const today = new Date().toISOString().split('T')[0];
  const [expenditures, setExpenditures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: today,
    endDate: today,
    status: '',
    type: '',
  });
  const [actionLoading, setActionLoading] = useState({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editExpenditure, setEditExpenditure] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const loadExpenditures = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('startDate', filters.startDate || today);
      params.set('endDate', filters.endDate || today);
      if (filters.status) params.set('status', filters.status);
      if (filters.type) {
        if (filters.type === 'STAFF') params.set('paidToType', 'STAFF');
        else params.set('category', filters.type);
      }
      params.set('limit', '500');
      const data = await apiFetch(`/api/expenditures?${params.toString()}`);
      setExpenditures(data || []);
    } catch (err) {
      console.error('[AdminExpenditures] Load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, today]);

  useEffect(() => {
    loadExpenditures();
  }, [loadExpenditures]);

  const handleAction = async (id, action) => {
    setActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      await apiFetch(`/api/expenditures/${id}/${action}`, { method: 'POST' });
      loadExpenditures();
    } catch (err) {
      console.error(`[AdminExpenditures] ${action} failed:`, err);
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleExport = () => {
    const headers = ['Exp No', 'Date', 'Paid To', 'Type', 'Category', 'Amount', 'Narration', 'Approved By', 'Status'];
    const rows = expenditures.map((v) => [
      v.expenditureNo,
      v.expenditureDate,
      v.paidToName,
      v.paidToType,
      v.category || '',
      Number(v.amount).toFixed(2),
      v.narration || '',
      v.approvedByName || v.approvedBy?.name || '',
      v.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenditures_${filters.startDate || 'all'}_to_${filters.endDate || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalAmount = expenditures
    .filter((v) => v.status !== 'VOIDED')
    .reduce((sum, v) => sum + Number(v.amount), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
          <Wallet size={22} className="text-[#E53935]" />
          Expenditures
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-[#E53935] text-white rounded-lg px-3 py-2 text-xs font-black uppercase hover:bg-[#B71C1C]"
          >
            <Plus size={14} />
            Create Expenditure
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 rounded-lg px-3 py-2 text-xs font-black uppercase hover:bg-gray-200"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Expenditures</p>
          <p className="text-xl font-black text-gray-900">{expenditures.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Amount</p>
          <p className="text-xl font-black text-[#E53935]">₹{totalAmount.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Voided</p>
          <p className="text-xl font-black text-red-600">{expenditures.filter((v) => v.status === 'VOIDED').length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3 flex-wrap">
        <Filter size={16} className="text-gray-400" />
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500">From</span>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-[#E53935]"
          />
          <span className="text-xs font-bold text-gray-500">to</span>
          <input
            type="date"
            value={filters.endDate}
            min={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-[#E53935]"
          />
        </div>
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-[#E53935]"
        >
          <option value="">All Status</option>
          <option value="UNVERIFIED">Unverified</option>
          <option value="VERIFIED">Verified</option>
          <option value="VOIDED">Voided</option>
        </select>
        <select
          value={filters.type}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-[#E53935]"
        >
          <option value="">All Types</option>
          <option value="STAFF">Staff</option>
          <option value="MISCELLANEOUS">Miscellaneous</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="KITCHEN">Kitchen</option>
          <option value="ENTERTAINMENT">Entertainment</option>
          <option value="OTHER">Other</option>
        </select>
        {(filters.startDate !== today || filters.endDate !== today || filters.status || filters.type) && (
          <button
            onClick={() => setFilters({ startDate: today, endDate: today, status: '', type: '' })}
            className="text-xs font-bold text-gray-400 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : expenditures.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm font-bold text-gray-400">No expenditures found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-[10px] font-black uppercase text-gray-400 tracking-widest">Exp No</th>
                  <th className="text-left px-4 py-3 text-[10px] font-black uppercase text-gray-400 tracking-widest">Date</th>
                  <th className="text-left px-4 py-3 text-[10px] font-black uppercase text-gray-400 tracking-widest">Paid To</th>
                  <th className="text-left px-4 py-3 text-[10px] font-black uppercase text-gray-400 tracking-widest">Type</th>
                  <th className="text-left px-4 py-3 text-[10px] font-black uppercase text-gray-400 tracking-widest">Category</th>
                  <th className="text-right px-4 py-3 text-[10px] font-black uppercase text-gray-400 tracking-widest">Amount</th>
                  <th className="text-left px-4 py-3 text-[10px] font-black uppercase text-gray-400 tracking-widest">Narration</th>
                  <th className="text-left px-4 py-3 text-[10px] font-black uppercase text-gray-400 tracking-widest">Approved By</th>
                  <th className="text-center px-4 py-3 text-[10px] font-black uppercase text-gray-400 tracking-widest">Status</th>
                  <th className="text-center px-4 py-3 text-[10px] font-black uppercase text-gray-400 tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {expenditures.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-black text-gray-900">#{v.expenditureNo}</td>
                    <td className="px-4 py-3 font-bold text-gray-700">{v.expenditureDate}</td>
                    <td className="px-4 py-3 font-bold text-gray-900">{v.paidToName}</td>
                    <td className="px-4 py-3 font-bold text-gray-500 text-xs">{v.paidToType}</td>
                    <td className="px-4 py-3 font-bold text-gray-500 text-xs">{v.category || '—'}</td>
                    <td className="px-4 py-3 text-right font-black text-[#E53935]">₹{Number(v.amount).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate">{v.narration || '—'}</td>
                    <td className="px-4 py-3 text-xs font-bold text-gray-600">{v.approvedByName || v.approvedBy?.name || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${
                        v.status === 'VERIFIED' ? 'bg-green-100 text-green-700' :
                        v.status === 'VOIDED' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => {
                            setEditExpenditure(v);
                            setShowEditModal(true);
                          }}
                          disabled={v.status === 'VOIDED'}
                          title="Edit"
                          className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 disabled:opacity-50"
                        >
                          <Pencil size={14} />
                        </button>
                        {v.status === 'UNVERIFIED' && (
                          <button
                            onClick={() => handleAction(v.id, 'verify')}
                            disabled={actionLoading[v.id]}
                            title="Verify"
                            className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-50"
                          >
                            {actionLoading[v.id] ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          </button>
                        )}
                        {v.status !== 'VOIDED' && (
                          <button
                            onClick={() => handleAction(v.id, 'void')}
                            disabled={actionLoading[v.id]}
                            title="Void"
                            className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                          >
                            <X size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleAction(v.id, 'print')}
                          disabled={actionLoading[v.id]}
                          title="Reprint"
                          className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                        >
                          <Printer size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateExpenditureModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSaved={() => loadExpenditures()}
      />

      <CreateExpenditureModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditExpenditure(null);
        }}
        onSaved={() => {
          loadExpenditures();
          setShowEditModal(false);
          setEditExpenditure(null);
        }}
        editExpenditure={editExpenditure}
      />
    </div>
  );
}
