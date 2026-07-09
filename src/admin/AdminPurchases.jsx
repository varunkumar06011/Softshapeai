import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2, Plus, Trash2, Save, Store, Package, ArrowLeft,
  CheckCircle, AlertCircle, X, Truck, CreditCard, Ban,
  ChevronRight, Search,
} from 'lucide-react';
import { apiFetch } from '../services/apiConfig';
import { getKolkataDateString } from '../shared/utils/dateFormat';
import LedgerCategoryPicker from '../shared/components/LedgerCategoryPicker';

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

const STATUS_STYLES = {
  PENDING: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Pending' },
  DELIVERED: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Delivered' },
  PARTIALLY_PAID: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Partially Paid' },
  PAID: { bg: 'bg-green-50', text: 'text-green-600', label: 'Paid' },
  CANCELLED: { bg: 'bg-gray-100', text: 'text-gray-400', label: 'Cancelled', strikethrough: true },
};

export default function AdminPurchases() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // View state: 'vendors' | 'po-grid' | 'po-detail' | 'po-form' | 'vendor-detail'
  const [view, setView] = useState('vendors');
  const [selectedVendorId, setSelectedVendorId] = useState(null);
  const [selectedPOId, setSelectedPOId] = useState(null);

  // Data
  const [vendors, setVendors] = useState([]);
  const [vendorDetail, setVendorDetail] = useState(null);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [poDetail, setPoDetail] = useState(null);
  const [kitchenItems, setKitchenItems] = useState([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');

  // ── Load kitchen inventory items for autocomplete ────────────────────────────
  const loadKitchenItems = useCallback(async () => {
    try {
      const data = await apiFetch('/api/inventory/kitchen');
      setKitchenItems(data || []);
    } catch (err) {
      console.error('[AdminPurchases] Load kitchen items failed:', err);
    }
  }, []);

  useEffect(() => { loadKitchenItems(); }, [loadKitchenItems]);

  // ── Load vendors ─────────────────────────────────────────────────────────────
  const loadVendors = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/api/vendors?includeInactive=true');
      setVendors(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load POs ─────────────────────────────────────────────────────────────────
  const loadPOs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let url = '/api/purchase-orders';
      const params = [];
      if (statusFilter) params.push(`status=${statusFilter}`);
      if (vendorFilter) params.push(`vendorId=${vendorFilter}`);
      if (params.length) url += '?' + params.join('&');
      const data = await apiFetch(url);
      setPurchaseOrders(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, vendorFilter]);

  // ── Load vendor detail ───────────────────────────────────────────────────────
  const loadVendorDetail = useCallback(async (id) => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/api/vendors/${id}`);
      setVendorDetail(data);
    } catch (err) {
      setError(err.message || 'Failed to load vendor');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load PO detail ───────────────────────────────────────────────────────────
  const loadPODetail = useCallback(async (id) => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/api/purchase-orders/${id}`);
      setPoDetail(data);
    } catch (err) {
      setError(err.message || 'Failed to load purchase order');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'vendors') loadVendors();
    else if (view === 'po-grid') loadPOs();
    else if (view === 'vendor-detail' && selectedVendorId) loadVendorDetail(selectedVendorId);
    else if (view === 'po-detail' && selectedPOId) loadPODetail(selectedPOId);
  }, [view, selectedVendorId, selectedPOId, loadVendors, loadPOs, loadVendorDetail, loadPODetail]);

  const showSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  // ── Vendor CRUD ──────────────────────────────────────────────────────────────
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [vendorForm, setVendorForm] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '' });

  const handleCreateVendor = async () => {
    if (!vendorForm.name.trim()) { setError('Vendor name is required'); return; }
    setError('');
    setSaving(true);
    try {
      const result = await apiFetch('/api/vendors', { method: 'POST', body: JSON.stringify(vendorForm) });
      if (result.duplicateWarning) {
        setError(result.duplicateWarning);
      }
      showSuccess('Vendor created');
      setShowVendorForm(false);
      setVendorForm({ name: '', contactPerson: '', phone: '', email: '', address: '' });
      loadVendors();
    } catch (err) {
      setError(err.message || 'Failed to create vendor');
    } finally {
      setSaving(false);
    }
  };

  const handleRetireVendor = async (id) => {
    if (!confirm('Retire this vendor? They will be hidden from new PO creation but past POs remain intact.')) return;
    setError('');
    setSaving(true);
    try {
      await apiFetch(`/api/vendors/${id}`, { method: 'DELETE' });
      showSuccess('Vendor retired');
      loadVendors();
    } catch (err) {
      setError(err.message || 'Failed to retire vendor');
    } finally {
      setSaving(false);
    }
  };

  // ── PO Form ──────────────────────────────────────────────────────────────────
  const [poForm, setPoForm] = useState({
    vendorId: '',
    orderDate: () => getKolkataDateString(),
    notes: '',
    items: [{ name: '', quantity: '', unit: '', unitCost: '', ledgerCategoryId: null }],
  });

  const resetPOForm = () => {
    setPoForm({
      vendorId: '',
      orderDate: getKolkataDateString(),
      notes: '',
      items: [{ name: '', quantity: '', unit: '', unitCost: '', ledgerCategoryId: null, kitchenInventoryItemId: null }],
    });
  };

  const updatePOFormItem = (idx, field, value) => {
    setPoForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => i === idx ? { ...item, [field]: value } : item),
    }));
  };

  const addPOFormItem = () => {
    setPoForm((prev) => ({
      ...prev,
      items: [...prev.items, { name: '', quantity: '', unit: '', unitCost: '', ledgerCategoryId: null, kitchenInventoryItemId: null }],
    }));
  };

  const removePOFormItem = (idx) => {
    setPoForm((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((_, i) => i !== idx) : prev.items,
    }));
  };

  const poFormTotal = round2(poForm.items.reduce((sum, item) => sum + round2(item.quantity) * round2(item.unitCost), 0));

  const handleCreatePO = async () => {
    if (!poForm.vendorId) { setError('Select a vendor'); return; }
    if (poForm.items.some((i) => !i.name.trim() || !i.quantity || !i.unitCost)) {
      setError('All line items need name, quantity, and unit cost'); return;
    }
    setError('');
    setSaving(true);
    try {
      const body = {
        vendorId: poForm.vendorId,
        orderDate: poForm.orderDate,
        notes: poForm.notes,
        items: poForm.items.map((i) => ({
          name: i.name.trim(),
          quantity: parseFloat(i.quantity) || 0,
          unit: i.unit || undefined,
          unitCost: parseFloat(i.unitCost) || 0,
          ledgerCategoryId: i.ledgerCategoryId || undefined,
          kitchenInventoryItemId: i.kitchenInventoryItemId || undefined,
        })),
      };
      const result = await apiFetch('/api/purchase-orders', { method: 'POST', body: JSON.stringify(body) });
      showSuccess(`PO ${result.poNumber} created`);
      resetPOForm();
      setView('po-grid');
    } catch (err) {
      setError(err.message || 'Failed to create purchase order');
    } finally {
      setSaving(false);
    }
  };

  // ── PO Actions ───────────────────────────────────────────────────────────────
  const handleMarkDelivered = async (id) => {
    if (!confirm('Mark this purchase order as delivered?')) return;
    setError('');
    setSaving(true);
    try {
      await apiFetch(`/api/purchase-orders/${id}/mark-delivered`, { method: 'POST', body: JSON.stringify({}) });
      showSuccess('PO marked as delivered');
      loadPODetail(id);
    } catch (err) {
      setError(err.message || 'Failed to mark delivered');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelPO = async (id) => {
    if (!confirm('Cancel this purchase order? This cannot be undone if payments exist.')) return;
    setError('');
    setSaving(true);
    try {
      await apiFetch(`/api/purchase-orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
      showSuccess('PO cancelled');
      loadPODetail(id);
    } catch (err) {
      setError(err.message || 'Failed to cancel PO');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePO = async (id) => {
    if (!confirm('Permanently delete this purchase order? Only possible if PENDING with no payments.')) return;
    setError('');
    setSaving(true);
    try {
      await apiFetch(`/api/purchase-orders/${id}`, { method: 'DELETE' });
      showSuccess('PO deleted');
      setView('po-grid');
    } catch (err) {
      setError(err.message || 'Failed to delete PO');
    } finally {
      setSaving(false);
    }
  };

  // ── Payment form ─────────────────────────────────────────────────────────────
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentDate: getKolkataDateString(), method: 'cash', notes: '' });

  const handleRecordPayment = async () => {
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) { setError('Enter a valid amount'); return; }
    setError('');
    setSaving(true);
    try {
      await apiFetch(`/api/purchase-orders/${selectedPOId}/payments`, {
        method: 'POST',
        body: JSON.stringify(paymentForm),
      });
      showSuccess('Payment recorded');
      setShowPaymentForm(false);
      setPaymentForm({ amount: '', paymentDate: getKolkataDateString(), method: 'cash', notes: '' });
      loadPODetail(selectedPOId);
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading && view !== 'po-form') {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[#E53935]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
          <CheckCircle size={14} />
          {success}
        </div>
      )}

      {/* ── Vendor List View ───────────────────────────────────────────────────── */}
      {view === 'vendors' && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
                <Store size={18} className="text-[#E53935]" />
                Vendors
              </h3>
              <button
                onClick={() => setShowVendorForm(true)}
                className="flex items-center gap-1 text-xs font-black uppercase text-[#E53935] hover:bg-red-50 px-3 py-1.5 rounded-lg"
              >
                <Plus size={14} />
                New Vendor
              </button>
            </div>
          </div>

          {vendors.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
              <Store size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-xs text-gray-400 font-bold">No vendors yet. Create one to start tracking purchases.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-black uppercase text-gray-400">Name</th>
                    <th className="text-left px-4 py-2 font-black uppercase text-gray-400">Contact</th>
                    <th className="text-right px-4 py-2 font-black uppercase text-gray-400">Outstanding</th>
                    <th className="text-center px-4 py-2 font-black uppercase text-gray-400">Status</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((v) => (
                    <tr
                      key={v.id}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => { setSelectedVendorId(v.id); setView('vendor-detail'); }}
                    >
                      <td className="px-4 py-3 font-bold text-gray-800">{v.name}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {v.contactPerson || v.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-black">
                        <span className={parseFloat(v.outstandingBalance) > 0 ? 'text-[#E53935]' : 'text-gray-400'}>
                          ₹{round2(v.outstandingBalance).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${v.isActive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                          {v.isActive ? 'Active' : 'Retired'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {v.isActive && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRetireVendor(v.id); }}
                            className="text-[10px] font-bold text-gray-400 hover:text-red-600"
                          >
                            Retire
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            onClick={() => setView('po-grid')}
            className="w-full bg-gray-100 text-gray-700 rounded-lg px-4 py-2.5 text-xs font-black uppercase hover:bg-gray-200 flex items-center justify-center gap-2"
          >
            <Package size={14} />
            View Purchase Orders
          </button>
        </>
      )}

      {/* ── Vendor Detail View ─────────────────────────────────────────────────── */}
      {view === 'vendor-detail' && vendorDetail && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <button
              onClick={() => setView('vendors')}
              className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-800 mb-3"
            >
              <ArrowLeft size={14} />
              Back to Vendors
            </button>
            <h3 className="text-lg font-black text-gray-800">{vendorDetail.name}</h3>
            <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
              {vendorDetail.contactPerson && <div><span className="text-gray-400 font-bold">Contact:</span> <span className="font-bold text-gray-700">{vendorDetail.contactPerson}</span></div>}
              {vendorDetail.phone && <div><span className="text-gray-400 font-bold">Phone:</span> <span className="font-bold text-gray-700">{vendorDetail.phone}</span></div>}
              {vendorDetail.email && <div><span className="text-gray-400 font-bold">Email:</span> <span className="font-bold text-gray-700">{vendorDetail.email}</span></div>}
              {vendorDetail.address && <div><span className="text-gray-400 font-bold">Address:</span> <span className="font-bold text-gray-700">{vendorDetail.address}</span></div>}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <span className="text-[10px] font-black uppercase text-gray-400">Outstanding Balance: </span>
              <span className={`text-sm font-black ${parseFloat(vendorDetail.outstandingBalance) > 0 ? 'text-[#E53935]' : 'text-gray-400'}`}>
                ₹{round2(vendorDetail.outstandingBalance).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Purchase Order History</h4>
            {vendorDetail.purchaseOrders?.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No purchase orders yet.</p>
            ) : (
              <div className="space-y-2">
                {vendorDetail.purchaseOrders?.map((po) => {
                  const style = STATUS_STYLES[po.status] || STATUS_STYLES.PENDING;
                  return (
                    <div
                      key={po.id}
                      className="flex items-center justify-between bg-gray-50 rounded-lg p-3 cursor-pointer hover:bg-gray-100"
                      onClick={() => { setSelectedPOId(po.id); setView('po-detail'); }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-gray-700">{po.poNumber}</span>
                        <span className="text-[10px] text-gray-400">{po.orderDate}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-600">₹{round2(po.totalAmount).toLocaleString()}</span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${style.bg} ${style.text} ${style.strikethrough ? 'line-through' : ''}`}>
                          {style.label}
                        </span>
                        <ChevronRight size={14} className="text-gray-300" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── PO Grid View ───────────────────────────────────────────────────────── */}
      {view === 'po-grid' && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
                <Package size={18} className="text-[#E53935]" />
                Purchase Orders
              </h3>
              <button
                onClick={() => { resetPOForm(); setView('po-form'); }}
                className="flex items-center gap-1 text-xs font-black uppercase text-[#E53935] hover:bg-red-50 px-3 py-1.5 rounded-lg"
              >
                <Plus size={14} />
                New PO
              </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mt-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#E53935]"
              >
                <option value="">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="DELIVERED">Delivered</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="PAID">Paid</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              <select
                value={vendorFilter}
                onChange={(e) => setVendorFilter(e.target.value)}
                className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#E53935]"
              >
                <option value="">All Vendors</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          </div>

          {purchaseOrders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
              <Package size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-xs text-gray-400 font-bold">No purchase orders found. Create one to get started.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-black uppercase text-gray-400">PO #</th>
                    <th className="text-left px-4 py-2 font-black uppercase text-gray-400">Vendor</th>
                    <th className="text-left px-4 py-2 font-black uppercase text-gray-400">Date</th>
                    <th className="text-right px-4 py-2 font-black uppercase text-gray-400">Total</th>
                    <th className="text-center px-4 py-2 font-black uppercase text-gray-400">Status</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseOrders.map((po) => {
                    const style = STATUS_STYLES[po.status] || STATUS_STYLES.PENDING;
                    return (
                      <tr
                        key={po.id}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => { setSelectedPOId(po.id); setView('po-detail'); }}
                      >
                        <td className="px-4 py-3 font-black text-gray-800">{po.poNumber}</td>
                        <td className="px-4 py-3 text-gray-600">{po.vendor?.name || '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{po.orderDate}</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-700">₹{round2(po.totalAmount).toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${style.bg} ${style.text} ${style.strikethrough ? 'line-through' : ''}`}>
                            {style.label}
                          </span>
                        </td>
                        <td className="px-4 py-3"><ChevronRight size={14} className="text-gray-300" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <button
            onClick={() => setView('vendors')}
            className="w-full bg-gray-100 text-gray-700 rounded-lg px-4 py-2.5 text-xs font-black uppercase hover:bg-gray-200 flex items-center justify-center gap-2"
          >
            <Store size={14} />
            View Vendors
          </button>
        </>
      )}

      {/* ── PO Detail View ─────────────────────────────────────────────────────── */}
      {view === 'po-detail' && poDetail && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <button
              onClick={() => setView('po-grid')}
              className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-800 mb-3"
            >
              <ArrowLeft size={14} />
              Back to Purchase Orders
            </button>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-gray-800">{poDetail.poNumber}</h3>
                <p className="text-xs text-gray-500 font-bold mt-0.5">
                  {poDetail.vendor?.name} · {poDetail.orderDate}
                  {poDetail.deliveredDate && ` · Delivered: ${poDetail.deliveredDate}`}
                </p>
              </div>
              {(() => {
                const style = STATUS_STYLES[poDetail.status] || STATUS_STYLES.PENDING;
                return (
                  <span className={`text-xs font-black uppercase px-3 py-1.5 rounded-lg ${style.bg} ${style.text} ${style.strikethrough ? 'line-through' : ''}`}>
                    {style.label}
                  </span>
                );
              })()}
            </div>
            {poDetail.notes && (
              <p className="text-xs text-gray-500 mt-2 italic">{poDetail.notes}</p>
            )}
          </div>

          {/* Items table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Line Items</h4>
            <div className="space-y-2">
              {poDetail.items?.map((item, idx) => (
                <div key={item.id || idx} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                  <div className="flex-1">
                    <span className="text-xs font-bold text-gray-800">{item.name}</span>
                    {item.ledgerCategory && (
                      <span className="ml-2 text-[10px] font-bold text-gray-400 bg-white px-1.5 py-0.5 rounded">
                        {item.ledgerCategory.name}
                      </span>
                    )}
                    <span className="ml-2 text-[10px] text-gray-400">
                      {round2(item.quantity)} {item.unit || ''} × ₹{round2(item.unitCost)}
                    </span>
                  </div>
                  <span className="text-xs font-black text-gray-700">₹{round2(item.lineTotal).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs font-black uppercase text-gray-400">Total</span>
              <span className="text-sm font-black text-gray-800">₹{round2(poDetail.totalAmount).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs font-bold text-gray-400">Paid</span>
              <span className="text-xs font-bold text-green-600">₹{round2(poDetail.amountPaid).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs font-bold text-gray-400">Balance Due</span>
              <span className="text-xs font-black text-[#E53935]">₹{round2(parseFloat(poDetail.totalAmount) - parseFloat(poDetail.amountPaid)).toLocaleString()}</span>
            </div>
          </div>

          {/* Payments */}
          {poDetail.payments && poDetail.payments.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Payment History</h4>
              <div className="space-y-2">
                {poDetail.payments.map((pmt) => (
                  <div key={pmt.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                    <div>
                      <span className="text-xs font-bold text-gray-700">₹{round2(pmt.amount).toLocaleString()}</span>
                      <span className="ml-2 text-[10px] text-gray-400">{pmt.paymentDate}</span>
                      {pmt.method && <span className="ml-2 text-[10px] text-gray-400 uppercase">{pmt.method}</span>}
                      {pmt.createdBy?.name && <span className="ml-2 text-[10px] text-gray-300">by {pmt.createdBy.name}</span>}
                    </div>
                    {pmt.notes && <span className="text-[10px] text-gray-400 italic">{pmt.notes}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {poDetail.status === 'PENDING' && (
              <>
                <button
                  onClick={() => handleMarkDelivered(poDetail.id)}
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white rounded-xl px-4 py-3 text-xs font-black uppercase hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Truck size={14} />
                  Mark Delivered
                </button>
                <button
                  onClick={() => handleCancelPO(poDetail.id)}
                  disabled={saving}
                  className="flex-1 bg-gray-100 text-gray-600 rounded-xl px-4 py-3 text-xs font-black uppercase hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Ban size={14} />
                  Cancel
                </button>
                <button
                  onClick={() => handleDeletePO(poDetail.id)}
                  disabled={saving}
                  className="bg-red-50 text-red-600 rounded-xl px-4 py-3 text-xs font-black uppercase hover:bg-red-100 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
            {(poDetail.status === 'DELIVERED' || poDetail.status === 'PARTIALLY_PAID') && (
              <button
                onClick={() => setShowPaymentForm(true)}
                disabled={saving}
                className="flex-1 bg-[#E53935] text-white rounded-xl px-4 py-3 text-xs font-black uppercase hover:bg-[#B71C1C] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CreditCard size={14} />
                Record Payment
              </button>
            )}
          </div>
        </>
      )}

      {/* ── New PO Form View ───────────────────────────────────────────────────── */}
      {view === 'po-form' && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <button
              onClick={() => setView('po-grid')}
              className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-800 mb-3"
            >
              <ArrowLeft size={14} />
              Back to Purchase Orders
            </button>
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 mb-3">New Purchase Order</h3>

            {/* Vendor picker */}
            <div className="mb-3">
              <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Vendor</label>
              <select
                value={poForm.vendorId}
                onChange={(e) => setPoForm((prev) => ({ ...prev, vendorId: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
              >
                <option value="">Select vendor...</option>
                {vendors.filter((v) => v.isActive).map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            {/* Order date */}
            <div className="mb-3">
              <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Order Date</label>
              <input
                type="date"
                value={poForm.orderDate}
                onChange={(e) => setPoForm((prev) => ({ ...prev, orderDate: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
              />
            </div>

            {/* Line items */}
            <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Line Items</label>
            <div className="space-y-2 mb-2">
              {poForm.items.map((item, idx) => (
                <div key={idx} className="space-y-2 bg-gray-50 rounded-lg p-3">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4 relative">
                      <input
                        type="text"
                        placeholder="Item name"
                        value={item.name}
                        onChange={(e) => {
                          updatePOFormItem(idx, 'name', e.target.value);
                          updatePOFormItem(idx, 'kitchenInventoryItemId', null);
                          updatePOFormItem(idx, '_showSuggestions', true);
                        }}
                        onFocus={() => updatePOFormItem(idx, '_showSuggestions', true)}
                        onBlur={() => setTimeout(() => updatePOFormItem(idx, '_showSuggestions', false), 200)}
                        className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935]"
                      />
                      {item._showSuggestions && item.name && !item.kitchenInventoryItemId && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-32 overflow-y-auto">
                          {kitchenItems
                            .filter((ki) => ki.name.toLowerCase().includes(item.name.toLowerCase()))
                            .slice(0, 5)
                            .map((ki) => (
                              <button
                                key={ki.id}
                                onMouseDown={() => {
                                  updatePOFormItem(idx, 'name', ki.name);
                                  updatePOFormItem(idx, 'kitchenInventoryItemId', ki.id);
                                  updatePOFormItem(idx, 'unit', ki.unit || '');
                                  updatePOFormItem(idx, '_showSuggestions', false);
                                }}
                                className="w-full text-left px-2 py-1.5 text-xs font-bold text-gray-700 hover:bg-red-50"
                              >
                                {ki.name}
                                <span className="ml-1 text-[10px] text-gray-400">{ki.unit}</span>
                              </button>
                            ))}
                          {kitchenItems.filter((ki) => ki.name.toLowerCase().includes(item.name.toLowerCase())).length === 0 && (
                            <div className="px-2 py-1.5 text-[10px] text-gray-400 italic">No match — won't update kitchen stock</div>
                          )}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updatePOFormItem(idx, 'quantity', e.target.value)}
                      className="col-span-2 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935]"
                    />
                    <input
                      type="text"
                      placeholder="Unit"
                      value={item.unit}
                      onChange={(e) => updatePOFormItem(idx, 'unit', e.target.value)}
                      className="col-span-1 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935]"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Unit cost"
                      value={item.unitCost}
                      onChange={(e) => updatePOFormItem(idx, 'unitCost', e.target.value)}
                      className="col-span-2 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935]"
                    />
                    <span className="col-span-2 text-xs font-black text-[#E53935] text-right">
                      ₹{round2(round2(item.quantity) * round2(item.unitCost)).toLocaleString()}
                    </span>
                    <div className="col-span-1 flex justify-end">
                      {poForm.items.length > 1 && (
                        <button
                          onClick={() => removePOFormItem(idx)}
                          className="p-1 bg-red-100 rounded hover:bg-red-200"
                        >
                          <Trash2 size={12} className="text-red-600" />
                        </button>
                      )}
                    </div>
                  </div>
                  <LedgerCategoryPicker
                    entryType="GROCERY"
                    value={item.ledgerCategoryId ? { id: item.ledgerCategoryId } : null}
                    onChange={(cat) => updatePOFormItem(idx, 'ledgerCategoryId', cat?.id || null)}
                    placeholder="Tag with category (optional)"
                  />
                  {item.name && !item.kitchenInventoryItemId && (
                    <div className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                      <AlertCircle size={10} />
                      This won't update kitchen stock — no matching inventory item.
                    </div>
                  )}
                  {item.kitchenInventoryItemId && (
                    <div className="text-[10px] text-green-600 font-bold flex items-center gap-1">
                      <CheckCircle size={10} />
                      Linked to kitchen inventory — stock will update on delivery.
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={addPOFormItem}
              className="w-full border-2 border-dashed border-gray-200 rounded-lg py-2 text-xs font-bold text-gray-500 hover:border-[#E53935] hover:text-[#E53935] flex items-center justify-center gap-1 mb-3"
            >
              <Plus size={14} />
              Add Item
            </button>

            {/* Notes */}
            <div className="mb-3">
              <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Notes (optional)</label>
              <input
                type="text"
                placeholder="Any notes about this order..."
                value={poForm.notes}
                onChange={(e) => setPoForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
              />
            </div>

            {/* Total */}
            <div className="flex justify-between items-center bg-gray-50 rounded-lg p-3 mb-3">
              <span className="text-xs font-black uppercase text-gray-400">Total</span>
              <span className="text-lg font-black text-gray-800">₹{poFormTotal.toLocaleString()}</span>
            </div>

            <button
              onClick={handleCreatePO}
              disabled={saving}
              className="w-full bg-[#E53935] text-white rounded-xl px-4 py-3 text-sm font-black uppercase hover:bg-[#B71C1C] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Create Purchase Order
            </button>
          </div>
        </>
      )}

      {/* ── New Vendor Modal ───────────────────────────────────────────────────── */}
      {showVendorForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-800">New Vendor</h3>
              <button onClick={() => setShowVendorForm(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Vendor name *"
                value={vendorForm.name}
                onChange={(e) => setVendorForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
              />
              <input
                type="text"
                placeholder="Contact person"
                value={vendorForm.contactPerson}
                onChange={(e) => setVendorForm((prev) => ({ ...prev, contactPerson: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
              />
              <input
                type="text"
                placeholder="Phone"
                value={vendorForm.phone}
                onChange={(e) => setVendorForm((prev) => ({ ...prev, phone: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
              />
              <input
                type="email"
                placeholder="Email"
                value={vendorForm.email}
                onChange={(e) => setVendorForm((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
              />
              <textarea
                placeholder="Address"
                value={vendorForm.address}
                onChange={(e) => setVendorForm((prev) => ({ ...prev, address: e.target.value }))}
                rows={2}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
              />
            </div>
            <button
              onClick={handleCreateVendor}
              disabled={saving}
              className="w-full bg-[#E53935] text-white rounded-lg px-4 py-2.5 text-xs font-black uppercase hover:bg-[#B71C1C] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create Vendor
            </button>
          </div>
        </div>
      )}

      {/* ── Payment Modal ──────────────────────────────────────────────────────── */}
      {showPaymentForm && poDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-800">Record Payment</h3>
              <button onClick={() => setShowPaymentForm(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-bold">
              {poDetail.poNumber} · Balance: ₹{round2(parseFloat(poDetail.totalAmount) - parseFloat(poDetail.amountPaid)).toLocaleString()}
            </p>
            <input
              type="number"
              step="0.01"
              placeholder="Amount (₹)"
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
            />
            <input
              type="date"
              value={paymentForm.paymentDate}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, paymentDate: e.target.value }))}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
            />
            <select
              value={paymentForm.method}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, method: e.target.value }))}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank">Bank Transfer</option>
              <option value="cheque">Cheque</option>
            </select>
            <input
              type="text"
              placeholder="Notes (optional)"
              value={paymentForm.notes}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
            />
            <button
              onClick={handleRecordPayment}
              disabled={saving}
              className="w-full bg-[#E53935] text-white rounded-lg px-4 py-2.5 text-xs font-black uppercase hover:bg-[#B71C1C] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
              Record Payment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
