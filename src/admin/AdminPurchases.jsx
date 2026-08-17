import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Loader2, Plus, Trash2, Save, Store, Package, ArrowLeft,
  CheckCircle, AlertCircle, X, Truck, CreditCard, Ban,
  ChevronRight, Search, MessageCircle, Calendar, WifiOff, RefreshCw,
} from 'lucide-react';
import { apiFetch, isBackendReachable, subscribeReachability } from '../services/apiConfig';
import { getKolkataDateString } from '../shared/utils/dateFormat';
import { useAuth } from '../context/AuthContext';
import html2canvas from 'html2canvas';
import LedgerCategoryPicker from '../shared/components/LedgerCategoryPicker';
import PurchaseReportTemplate from './components/PurchaseReportTemplate';
import PurchaseHistory from './components/PurchaseHistory';
import { getUnitOptions } from '../shared/utils/unitConversion';
import { PAYMENT_METHODS, API_TIMEOUT_SHORT_MS, API_TIMEOUT_DEFAULT_MS, API_TIMEOUT_SAVE_DAILY_MS } from '../shared/utils/constants';

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

const STATUS_STYLES = {
  PENDING: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Pending' },
  DELIVERED: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Delivered' },
  PARTIALLY_PAID: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Partially Paid' },
  PAID: { bg: 'bg-green-50', text: 'text-green-600', label: 'Paid' },
  CANCELLED: { bg: 'bg-gray-100', text: 'text-gray-400', label: 'Cancelled', strikethrough: true },
};

export default function AdminPurchases() {
  const { restaurant, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Outlet selection — mirrors AdminDailyBalanceSheet pattern.
  // "all" → show/save across all tenant outlets
  // specific id → show/save for that outlet only
  const [outletId, setOutletId] = useState(() => {
    try {
      const raw = localStorage.getItem('ss_accessible_outlets');
      const outlets = raw ? JSON.parse(raw) : [];
      if (outlets.length > 1) return 'all';
      if (outlets.length === 1) return outlets[0].id;
    } catch {}
    const rid = user?.activeRestaurantId || user?.restaurantId || restaurant?.id;
    return rid || 'all';
  });
  const accessibleOutlets = useMemo(() => {
    try {
      const raw = localStorage.getItem('ss_accessible_outlets');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }, []);

  // View state: 'vendors' | 'po-grid' | 'po-detail' | 'po-form' | 'vendor-detail' | 'daily-entry' | 'purchase-history'
  const [view, setView] = useState('daily-entry');
  const [selectedVendorId, setSelectedVendorId] = useState(null);
  const [selectedPOId, setSelectedPOId] = useState(null);

  // Data
  const [vendors, setVendors] = useState([]);
  const [vendorDetail, setVendorDetail] = useState(null);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [poDetail, setPoDetail] = useState(null);
  const [kitchenItems, setKitchenItems] = useState([]);

  // Vendor payment form state
  const [showVendorPaymentForm, setShowVendorPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentDate, setPaymentDate] = useState(getKolkataDateString());
  const [paymentNarration, setPaymentNarration] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  // Daily purchase entry state
  const [dailyRows, setDailyRows] = useState([]);
  const [dailyEntryDate, setDailyEntryDate] = useState(getKolkataDateString());
  const [dailyEntryReadOnly, setDailyEntryReadOnly] = useState(false);
  const [dailyKitchenItems, setDailyKitchenItems] = useState([]);
  const [dailySaving, setDailySaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pendingVendorRowIndex, setPendingVendorRowIndex] = useState(null);
  const [backendOnline, setBackendOnline] = useState(isBackendReachable());

  // Per-tenant draft key — no 'default' fallback to prevent cross-tenant leakage
  const DRAFT_KEY = `dailyPurchaseDraft_${restaurant?.id || user?.id || 'unknown'}`;

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

  // Subscribe to backend reachability changes (non-blocking, informational only)
  useEffect(() => {
    const unsub = subscribeReachability((reachable) => setBackendOnline(reachable));
    return unsub;
  }, []);

  // Load draft from localStorage if no saved entries exist (today only)
  useEffect(() => {
    if (view !== 'daily-entry') return;
    const today = getKolkataDateString();
    if (dailyEntryDate !== today) return;
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.date === today && parsed.rows?.length > 0) {
          apiFetch(`/api/purchase-orders/daily?date=${today}${outletId ? `&outletId=${outletId}` : ''}`, { timeout: API_TIMEOUT_SHORT_MS })
            .then((data) => { if (!data || data.length === 0) setDailyRows(parsed.rows); })
            .catch(() => setDailyRows(parsed.rows));
        }
      } catch { /* invalid draft */ }
    }
  }, [view, dailyEntryDate, DRAFT_KEY]);

  // Save draft to localStorage whenever dailyRows changes (today only)
  useEffect(() => {
    if (view !== 'daily-entry') return;
    const today = getKolkataDateString();
    if (dailyEntryDate !== today) return;
    const hasData = dailyRows.some((r) => r.itemName?.trim());
    if (hasData) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        date: today,
        rows: dailyRows.map(({ _showSuggestions, ...rest }) => rest),
        savedAt: new Date().toISOString(),
      }));
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [dailyRows, view, dailyEntryDate, DRAFT_KEY]);

  // ── Load vendors ─────────────────────────────────────────────────────────────
  const loadVendors = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/api/vendors?includeInactive=true', { timeout: API_TIMEOUT_DEFAULT_MS });
      setVendors(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, []);

  const [recalcingBalances, setRecalcingBalances] = useState(false);
  const handleRecalcBalances = async () => {
    setRecalcingBalances(true);
    setError('');
    try {
      const result = await apiFetch('/api/vendors/recalc-balances', { method: 'POST', timeout: API_TIMEOUT_DEFAULT_MS });
      showSuccess(`Balances recalculated — ${result.correctedCount} of ${result.totalVendors} vendors updated.`);
      await loadVendors();
    } catch (err) {
      setError(err.message || 'Failed to recalculate vendor balances');
    } finally {
      setRecalcingBalances(false);
    }
  };

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

  // ── Record vendor payment ────────────────────────────────────────────────────
  const handleVendorPayment = async () => {
    if (!selectedVendorId) return;
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) { setError('Enter a valid payment amount'); return; }
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      setError('Select a valid payment method'); return;
    }
    setSavingPayment(true);
    setError('');
    try {
      const result = await apiFetch(`/api/vendors/${selectedVendorId}/payments`, {
        method: 'POST',
        timeout: API_TIMEOUT_DEFAULT_MS,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          paymentMethod,
          paymentDate,
          narration: paymentNarration || undefined,
        }),
      });

      setVendorDetail((prev) => prev ? {
        ...prev,
        outstandingBalance: String(result.newOutstandingBalance),
      } : prev);

      setVendors((prev) => prev.map((v) => v.id === selectedVendorId
        ? { ...v, outstandingBalance: String(result.newOutstandingBalance) }
        : v
      ));

      setShowVendorPaymentForm(false);
      setPaymentAmount('');
      setPaymentNarration('');
      setPaymentMethod('CASH');
      setPaymentDate(getKolkataDateString());
      showSuccess(`Payment of ₹${round2(amt).toLocaleString()} recorded. New balance: ₹${round2(result.newOutstandingBalance).toLocaleString()}`);
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setSavingPayment(false);
    }
  };

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
    else if (view === 'daily-entry') loadVendors();
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
      const result = await apiFetch('/api/vendors', { method: 'POST', timeout: API_TIMEOUT_DEFAULT_MS, body: JSON.stringify(vendorForm) });
      if (result.duplicateWarning) {
        setError(result.duplicateWarning);
      }
      showSuccess('Vendor created');
      setShowVendorForm(false);
      setVendorForm({ name: '', contactPerson: '', phone: '', email: '', address: '' });
      await loadVendors();
      if (pendingVendorRowIndex != null && result.id) {
        updateDailyRow(pendingVendorRowIndex, 'vendorId', result.id);
        setPendingVendorRowIndex(null);
      }
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
    orderDate: getKolkataDateString(),
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

  const poFormTotal = round2(poForm.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitCost), 0));

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

  // ── Daily Purchase Entry ─────────────────────────────────────────────────────
  const loadDailyKitchenItems = useCallback(async () => {
    try {
      const data = await apiFetch('/api/purchase-orders/daily/items');
      setDailyKitchenItems(data || []);
    } catch (err) {
      console.error('[AdminPurchases] Load daily kitchen items failed:', err);
    }
  }, []);

  const loadDailyEntries = useCallback(async (date) => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/api/purchase-orders/daily?date=${date}${outletId ? `&outletId=${outletId}` : ''}`);

      if (data.length === 0) {
        setDailyRows([{ itemName: '', kitchenInventoryItemId: null, vendorId: '', categoryId: null, categoryName: null, quantity: '', unit: '', unitPrice: '', previousPrice: null, paymentStatus: 'PENDING', paymentMethod: 'CASH' }]);
      } else {
        setDailyRows(data.map((e) => ({
          id: e.id,
          itemName: e.itemName,
          kitchenInventoryItemId: e.kitchenInventoryItemId,
          vendorId: e.vendorId,
          categoryId: e.categoryId || null,
          categoryName: e.categoryName || null,
          quantity: String(e.quantity),
          unit: e.unit || 'NOS',
          unitPrice: String(e.unitPrice),
          previousPrice: e.previousPrice,
          paymentStatus: e.paymentStatus,
          paymentMethod: e.paymentMethod || 'CASH',
        })));
      }
      setDailyEntryReadOnly(false);
    } catch (err) {
      setError(err.message || 'Failed to load daily entries');
    } finally {
      setLoading(false);
    }
  }, [outletId]);

  useEffect(() => {
    if (view === 'daily-entry') {
      loadDailyKitchenItems();
      loadDailyEntries(dailyEntryDate);
    }
  }, [view, dailyEntryDate, loadDailyKitchenItems, loadDailyEntries]);

  const addDailyRow = () => {
    setDailyRows((prev) => [...prev, { itemName: '', kitchenInventoryItemId: null, vendorId: '', categoryId: null, categoryName: null, quantity: '', unit: '', unitPrice: '', previousPrice: null, paymentStatus: 'PENDING', paymentMethod: 'CASH' }]);
  };

  const removeDailyRow = (idx) => {
    setDailyRows((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  };

  const updateDailyRow = (idx, field, value) => {
    setDailyRows((prev) => prev.map((row, i) => {
      if (i !== idx) return row;
      const updated = { ...row, [field]: value };
      if (field === 'itemName') {
        updated.kitchenInventoryItemId = null;
        updated.previousPrice = null;
        updated._showSuggestions = true;
      }
      return updated;
    }));
  };

  const selectDailyItem = (idx, item) => {
    setDailyRows((prev) => prev.map((row, i) => i === idx ? {
      ...row,
      itemName: item.name,
      kitchenInventoryItemId: item.id,
      unit: item.unit || row.unit,
      _showSuggestions: false,
    } : row));
    // Fetch previous price (relative to the currently selected date)
    apiFetch(`/api/purchase-orders/daily/previous-price?kitchenInventoryItemId=${item.id}&beforeDate=${dailyEntryDate}`)
      .then((data) => {
        if (data.previousPrice != null) {
          setDailyRows((prev) => prev.map((row, i) => i === idx ? { ...row, previousPrice: data.previousPrice } : row));
        }
      })
      .catch(() => {});
  };

  const dailyTotal = round2(dailyRows.reduce((sum, r) => sum + Number(r.quantity) * Number(r.unitPrice), 0));

  const dailyRowsValid = useMemo(() => {
    const filledRows = dailyRows.filter((r) => r.itemName?.trim() && (parseFloat(r.quantity) || 0) > 0);
    if (filledRows.length === 0) return false;
    return filledRows.every((r) =>
      r.itemName?.trim() &&
      r.vendorId &&
      r.unit?.trim() &&
      r.unitPrice !== '' && !isNaN(parseFloat(r.unitPrice)) &&
      (r.paymentStatus === 'PENDING' || (r.paymentStatus === 'DONE' && PAYMENT_METHODS.includes(r.paymentMethod)))
    );
  }, [dailyRows]);

  const handleSaveDaily = async () => {
    console.log('[AdminPurchases] handleSaveDaily clicked', { dailyEntryReadOnly, dailyEntryDate, rows: dailyRows.length });
    // When "All Outlets" is selected, require the user to pick a specific outlet
    // before saving — purchases must be saved to a single outlet.
    if (outletId === 'all' && accessibleOutlets.length > 1) {
      setError('Please select a specific outlet before saving. Purchases cannot be saved to "All Outlets".');
      return;
    }
    // Filter out completely empty rows (no item name, no qty, no price)
    const validRows = dailyRows.filter((r) => r.itemName?.trim() && (parseFloat(r.quantity) || 0) > 0);
    if (validRows.length === 0) {
      setError('At least one row with an item name and quantity is required.');
      return;
    }
    for (const row of validRows) {
      if (!row.itemName?.trim()) { setError('Item name is required for all rows'); return; }
      if (!row.vendorId) { setError(`Vendor is required for item "${row.itemName}"`); return; }
      if (!row.unit?.trim()) { setError(`Unit is required for item "${row.itemName}"`); return; }
      if (row.paymentStatus === 'DONE' && !PAYMENT_METHODS.includes(row.paymentMethod)) {
        setError(`Payment method is required for DONE item "${row.itemName}"`); return;
      }
    }
    setError('');
    setDailySaving(true);
    try {
      const savedResult = await apiFetch('/api/purchase-orders/daily', {
        method: 'POST',
        timeout: API_TIMEOUT_SAVE_DAILY_MS,
        body: JSON.stringify({
          date: dailyEntryDate,
          outletId: outletId && outletId !== 'all' ? outletId : undefined,
          rows: validRows.map((r) => ({
            itemName: r.itemName.trim(),
            kitchenInventoryItemId: r.kitchenInventoryItemId || undefined,
            vendorId: r.vendorId,
            categoryId: r.categoryId || undefined,
            quantity: parseFloat(r.quantity) || 0,
            unit: r.unit.trim(),
            unitPrice: parseFloat(r.unitPrice) || 0,
            paymentStatus: r.paymentStatus,
            paymentMethod: r.paymentStatus === 'DONE' ? r.paymentMethod : undefined,
          })),
        }),
      });
      if (!Array.isArray(savedResult) || savedResult.length !== validRows.length) {
        console.error('[AdminPurchases] Save mismatch:', validRows.length, 'submitted,', savedResult?.length, 'confirmed');
        setError(`Save may be incomplete — submitted ${validRows.length} but backend confirmed ${savedResult?.length || 0}. Please refresh to verify.`);
        loadDailyEntries(dailyEntryDate);
        return;
      }
      showSuccess(`${savedResult.length} entries saved`);
      localStorage.removeItem(DRAFT_KEY);
      loadDailyEntries(dailyEntryDate);
    } catch (err) {
      const isConnectionError = err.message?.includes('timed out') || err.message?.includes('ERR_CONNECTION') || err.message?.includes('Failed to fetch');
      if (isConnectionError) {
        setError('Connection failed — your entries are preserved on this screen. Check network and try again. Do NOT refresh or your entries will be lost.');
      } else {
        setError(err.message || 'Failed to save daily entries');
      }
    } finally {
      setDailySaving(false);
    }
  };

  const dailyRemarks = useMemo(() => {
    const changes = [];
    for (const r of dailyRows) {
      if (r.previousPrice != null && r.itemName && r.unitPrice) {
        const diff = round2(r.unitPrice) - round2(r.previousPrice);
        if (diff > 0) changes.push(`${r.itemName} ↑ ₹${diff}`);
        else if (diff < 0) changes.push(`${r.itemName} ↓ ₹${Math.abs(diff)}`);
      }
    }
    return changes.join(', ');
  }, [dailyRows]);

  const handleWhatsAppShare = async () => {
    setError('');
    setSharing(true);

    // Detect mobile vs desktop synchronously (needed for popup strategy)
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // Desktop: open a blank tab NOW (within user gesture) to avoid popup blocker.
    // We'll navigate it to WhatsApp Web after the image is generated.
    let whatsappTab = null;
    if (!isMobile) {
      whatsappTab = window.open('', '_blank');
      if (!whatsappTab) {
        setError('Popup blocked. Please allow popups for this site to open WhatsApp Web, then try again.');
        setSharing(false);
        return;
      }
      // Show a loading state in the tab while we generate the image
      try {
        whatsappTab.document.write('<html><head><title>Opening WhatsApp Web…</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f2f5;color:#333}p{text-align:center;font-size:16px}</style></head><body><p>Preparing WhatsApp Web…<br>Please wait.</p></body></html>');
      } catch { /* cross-origin, ignore */ }
    }

    // Build vendor name lookup from already-loaded vendors state
    const vendorMap = new Map(vendors.map((v) => [v.id, v.name]));

    // Step 1: Gather rows — prefer locally-loaded dailyRows, fall back to backend fetch
    let validRows = [];
    const localRows = dailyRows.filter((r) => r.itemName?.trim() && (parseFloat(r.quantity) || 0) > 0);

    if (localRows.length > 0) {
      // Use data already in UI state (works offline)
      validRows = localRows.map((r) => ({
        itemName: r.itemName,
        quantity: String(r.quantity),
        unit: r.unit || '',
        unitPrice: String(r.unitPrice),
        vendorName: vendorMap.get(r.vendorId) || '',
        paymentStatus: r.paymentStatus,
        paymentMethod: r.paymentMethod || '',
      }));
    } else {
      // No local data — try fetching from backend
      try {
        const savedEntries = await apiFetch(`/api/purchase-orders/daily?date=${dailyEntryDate}${outletId ? `&outletId=${outletId}` : ''}`, { timeout: API_TIMEOUT_SHORT_MS });
        if (!savedEntries || savedEntries.length === 0) {
          setError('No saved purchase entries to share. Save entries first.');
          if (whatsappTab) try { whatsappTab.close(); } catch {}
          setSharing(false);
          return;
        }
        validRows = savedEntries.map((e) => ({
          itemName: e.itemName,
          quantity: String(e.quantity),
          unit: e.unit || '',
          unitPrice: String(e.unitPrice),
          vendorName: e.vendorName || '',
          paymentStatus: e.paymentStatus,
          paymentMethod: e.paymentMethod || '',
        }));
      } catch (err) {
        setError('No purchase entries found locally or on server. Save entries first.');
        if (whatsappTab) try { whatsappTab.close(); } catch {}
        setSharing(false);
        return;
      }
    }

    let container = null;
    let root = null;
    try {
      // Format date for display
      const dateObj = new Date(dailyEntryDate + 'T00:00:00');
      const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const now = new Date();
      const generatedOn = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' | ' +
                        now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      const templateData = {
        restaurantName: restaurant?.name || restaurant?.businessName || '',
        date: dateStr,
        weekday,
        rows: validRows,
        remarks: dailyRemarks || '',
        generatedOn,
        generatedBy: user?.name || 'Admin',
      };

      // Create detached DOM container (off-screen but rendered)
      container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '900px';
      container.style.background = '#ffffff';
      document.body.appendChild(container);

      // Render template into detached container (static import — no dynamic chunk needed)
      root = createRoot(container);
      root.render(
        <PurchaseReportTemplate
          data={templateData}
          logoSrc={restaurant?.logoUrl || '/logo softshape.ai.png'}
        />
      );

      // Wait for React to flush + images to load
      await new Promise(resolve => setTimeout(resolve, 300));
      const imgs = container.querySelectorAll('img');
      if (imgs.length > 0) {
        await Promise.all(Array.from(imgs).map((img) =>
          img.complete ? Promise.resolve() : new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          })
        ));
      }

      // Capture with html2canvas — allowTaint for local images, skip logo on CORS failure
      const canvas = await html2canvas(container, {
        scale: 3,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
        imageTimeout: 5000,
      });

      // Cleanup React root and container
      root.unmount();
      root = null;
      document.body.removeChild(container);
      container = null;

      // Convert to PNG blob
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1.0));
      if (!blob) {
        setError('Failed to generate report image.');
        if (whatsappTab) try { whatsappTab.close(); } catch {}
        return;
      }

      const fileName = `Daily-Purchase-${dailyEntryDate}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      const shareText = `${restaurant?.name ? `${restaurant.name} — ` : ''}Daily Purchase Entry on ${dailyEntryDate}`;

      if (isMobile && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        // Mobile: use Web Share API (opens native WhatsApp with image attached)
        await navigator.share({
          title: `Daily Purchase Entry — ${dailyEntryDate}`,
          text: shareText,
          files: [file],
        });
      } else {
        // Desktop: download image, then navigate the pre-opened tab to WhatsApp Web
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        // Navigate the pre-opened tab to WhatsApp Web
        const whatsappUrl = `https://web.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
        if (whatsappTab) {
          try {
            whatsappTab.location.href = whatsappUrl;
          } catch {
            // Cross-origin restriction — fall back to opening a new tab
            whatsappTab.close();
            window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
          }
        } else {
          // Tab was blocked earlier, try again (may still fail)
          window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
        }
        showSuccess('Image downloaded. Attach it in WhatsApp Web (opened in new tab).');
      }
    } catch (err) {
      console.error('[AdminPurchases] WhatsApp share failed:', err);
      if (whatsappTab) try { whatsappTab.close(); } catch {}
      if (err.name !== 'AbortError') {
        setError('Failed to generate/share report image. Please try again.');
      }
    } finally {
      // Cleanup if something failed mid-render
      if (root) { try { root.unmount(); } catch {} }
      if (container && container.parentNode) { try { document.body.removeChild(container); } catch {} }
      setSharing(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading && view !== 'po-form' && view !== 'daily-entry') {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[#E53935]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto" data-tour="admin-purchases">
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" data-tour="admin-purchases-vendors">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
                <Store size={18} className="text-[#E53935]" />
                Vendors
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRecalcBalances}
                  disabled={recalcingBalances}
                  className="flex items-center gap-1 text-xs font-bold uppercase text-gray-500 hover:bg-gray-100 px-3 py-1.5 rounded-lg disabled:opacity-50"
                  title="Recalculate all vendor outstanding balances"
                >
                  {recalcingBalances ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Recalc Balances
                </button>
                <button
                  onClick={() => setShowVendorForm(true)}
                  className="flex items-center gap-1 text-xs font-black uppercase text-[#E53935] hover:bg-red-50 px-3 py-1.5 rounded-lg"
                >
                  <Plus size={14} />
                  New Vendor
                </button>
              </div>
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
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {v.isActive && parseFloat(v.outstandingBalance) > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVendorId(v.id);
                              setShowVendorPaymentForm(true);
                              setView('vendor-detail');
                              loadVendorDetail(v.id);
                            }}
                            className="text-[10px] font-bold text-green-600 hover:bg-green-50 px-2 py-1 rounded mr-2"
                          >
                            Payment
                          </button>
                        )}
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

          <div className="flex gap-2">
            <button
              onClick={() => setView('po-grid')}
              className="flex-1 bg-gray-100 text-gray-700 rounded-lg px-4 py-2.5 text-xs font-black uppercase hover:bg-gray-200 flex items-center justify-center gap-2"
            >
              <Package size={14} />
              Purchase Orders
            </button>
            <button
              onClick={() => setView('daily-entry')}
              className="flex-1 bg-red-50 text-[#E53935] rounded-lg px-4 py-2.5 text-xs font-black uppercase hover:bg-red-100 flex items-center justify-center gap-2"
            >
              <Calendar size={14} />
              Daily Entry
            </button>
          </div>
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

          {/* Vendor Payment Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">Record Payment</h4>
              {parseFloat(vendorDetail.outstandingBalance) > 0 && !showVendorPaymentForm && (
                <button
                  onClick={() => setShowVendorPaymentForm(true)}
                  className="flex items-center gap-1 text-xs font-black uppercase text-green-600 hover:bg-green-50 px-3 py-1.5 rounded-lg"
                >
                  <CreditCard size={14} />
                  New Payment
                </button>
              )}
            </div>

            {showVendorPaymentForm ? (
              <div className="space-y-3">
                <div className="text-xs font-bold text-gray-500">
                  Outstanding: <span className="text-[#E53935]">₹{round2(vendorDetail.outstandingBalance).toLocaleString()}</span>
                  {parseFloat(vendorDetail.outstandingBalance) > 0 && (
                    <button
                      onClick={() => setPaymentAmount(String(round2(vendorDetail.outstandingBalance)))}
                      className="ml-2 text-[10px] font-black text-green-600 hover:bg-green-50 px-2 py-0.5 rounded"
                    >
                      Pay Full Amount
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount (₹)"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935]"
                  />
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935]"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank</option>
                    <option value="UPI">UPI</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935]"
                  />
                  <input
                    type="text"
                    placeholder="Narration (optional)"
                    value={paymentNarration}
                    onChange={(e) => setPaymentNarration(e.target.value)}
                    className="bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleVendorPayment}
                    disabled={savingPayment}
                    className="flex items-center gap-1 text-xs font-black uppercase text-white bg-green-600 hover:bg-green-700 px-4 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {savingPayment ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                    {savingPayment ? 'Saving...' : 'Record Payment'}
                  </button>
                  <button
                    onClick={() => { setShowVendorPaymentForm(false); setPaymentAmount(''); setPaymentNarration(''); }}
                    className="text-xs font-black uppercase text-gray-500 hover:bg-gray-100 px-4 py-1.5 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                {parseFloat(vendorDetail.outstandingBalance) > 0
                  ? `Outstanding: ₹${round2(vendorDetail.outstandingBalance).toLocaleString()} — click "New Payment" to record a payment.`
                  : 'No outstanding balance.'}
              </p>
            )}
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" data-tour="admin-purchases-list">
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

          <div className="flex gap-2">
            <button
              onClick={() => setView('vendors')}
              className="flex-1 bg-gray-100 text-gray-700 rounded-lg px-4 py-2.5 text-xs font-black uppercase hover:bg-gray-200 flex items-center justify-center gap-2"
            >
              <Store size={14} />
              Vendors
            </button>
            <button
              onClick={() => setView('daily-entry')}
              className="flex-1 bg-red-50 text-[#E53935] rounded-lg px-4 py-2.5 text-xs font-black uppercase hover:bg-red-100 flex items-center justify-center gap-2"
            >
              <Calendar size={14} />
              Daily Entry
            </button>
          </div>
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
                      ₹{round2(Number(item.quantity) * Number(item.unitCost)).toLocaleString()}
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

      {/* ── Daily Purchase Entry View ──────────────────────────────────────────── */}
      {view === 'daily-entry' && (
        <>
          {!backendOnline && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
              <WifiOff size={14} className="text-amber-500" />
              <span className="text-xs font-bold text-amber-700">Server may be unreachable — save may take longer than usual. Your draft is preserved on this screen.</span>
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
                <Calendar size={18} className="text-[#E53935]" />
                Daily Purchase Entry
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                {accessibleOutlets.length > 1 && (
                  <select
                    value={outletId}
                    onChange={(e) => setOutletId(e.target.value)}
                    className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#E53935]"
                  >
                    <option value="all">All Outlets</option>
                    {accessibleOutlets.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                )}
                <input
                  type="date"
                  value={dailyEntryDate}
                  max={getKolkataDateString()}
                  onChange={(e) => setDailyEntryDate(e.target.value)}
                  className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#E53935]"
                />
                <button
                  onClick={() => setView('purchase-history')}
                  className="text-[10px] font-black uppercase text-[#E53935] hover:bg-red-50 bg-red-50 px-2 py-1 rounded"
                >
                  History
                </button>
                <button
                  onClick={() => setView('vendors')}
                  className="text-[10px] font-black uppercase text-gray-500 hover:text-[#E53935] bg-gray-50 px-2 py-1 rounded"
                >
                  Vendors
                </button>
              </div>
            </div>
          </div>

          {/* Rows */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            {dailyRows.map((row, idx) => {
              const rowTotal = round2(Number(row.quantity) * Number(row.unitPrice));
              const priceUp = row.previousPrice != null && round2(row.unitPrice) > row.previousPrice;
              const priceDown = row.previousPrice != null && round2(row.unitPrice) < row.previousPrice;
              return (
                <div key={idx} className="space-y-2 bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black text-gray-400 w-6">{idx + 1}</span>
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-center">
                    {/* Item name with autocomplete */}
                    <div className="col-span-12 sm:col-span-4 relative">
                      <input
                        type="text"
                        placeholder="Item name"
                        value={row.itemName}
                        disabled={dailyEntryReadOnly}
                        onChange={(e) => updateDailyRow(idx, 'itemName', e.target.value)}
                        onFocus={() => updateDailyRow(idx, '_showSuggestions', true)}
                        onBlur={() => setTimeout(() => updateDailyRow(idx, '_showSuggestions', false), 200)}
                        className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935] disabled:bg-gray-100"
                      />
                      {row._showSuggestions && row.itemName && !dailyEntryReadOnly && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-32 overflow-y-auto">
                          {dailyKitchenItems
                            .filter((ki) => ki.itemName.toLowerCase().includes(row.itemName.toLowerCase()))
                            .slice(0, 5)
                            .map((ki) => (
                              <button
                                key={ki.kitchenInventoryItemId}
                                onMouseDown={() => selectDailyItem(idx, { id: ki.kitchenInventoryItemId, name: ki.itemName, unit: ki.unit })}
                                className="w-full text-left px-2 py-1.5 text-xs font-bold text-gray-700 hover:bg-red-50"
                              >
                                {ki.itemName}
                                <span className="ml-1 text-[10px] text-gray-400">{ki.unit}</span>
                              </button>
                            ))}
                          {dailyKitchenItems.filter((ki) => ki.itemName.toLowerCase().includes(row.itemName.toLowerCase())).length === 0 && (
                            <div className="px-2 py-1.5 text-[10px] text-gray-400 italic">No match — new item will be created</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Vendor + add button */}
                    <div className="col-span-12 sm:col-span-3 flex items-center gap-1">
                      <select
                        value={row.vendorId}
                        disabled={dailyEntryReadOnly}
                        onChange={(e) => updateDailyRow(idx, 'vendorId', e.target.value)}
                        className="flex-1 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935] disabled:bg-gray-100"
                      >
                        <option value="">Vendor...</option>
                        {vendors.filter((v) => v.isActive).map((v) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                      {!dailyEntryReadOnly && (
                        <button
                          onClick={() => { setPendingVendorRowIndex(idx); setShowVendorForm(true); }}
                          title="Add new vendor"
                          className="p-1 bg-green-50 text-green-600 rounded hover:bg-green-100"
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </div>

                    {/* Qty */}
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Qty"
                      value={row.quantity}
                      disabled={dailyEntryReadOnly}
                      onChange={(e) => updateDailyRow(idx, 'quantity', e.target.value)}
                      className="col-span-3 sm:col-span-1 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935] disabled:bg-gray-100"
                    />

                    {/* Unit */}
                    <select
                      value={row.unit}
                      disabled={dailyEntryReadOnly}
                      onChange={(e) => updateDailyRow(idx, 'unit', e.target.value)}
                      className="col-span-2 sm:col-span-1 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935] disabled:bg-gray-100"
                    >
                      <option value="">Unit...</option>
                      {getUnitOptions(row.unit).map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>

                    {/* Unit price with price change flag */}
                    <div className="col-span-4 sm:col-span-2 flex items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="₹/unit"
                        value={row.unitPrice}
                        disabled={dailyEntryReadOnly}
                        onChange={(e) => updateDailyRow(idx, 'unitPrice', e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-[#E53935] disabled:bg-gray-100"
                      />
                      {priceUp && <span className="text-[10px] font-black text-red-600 whitespace-nowrap">⬆ ₹{row.previousPrice}</span>}
                      {priceDown && <span className="text-[10px] font-black text-green-600 whitespace-nowrap">⬇ ₹{row.previousPrice}</span>}
                    </div>

                    {/* Total */}
                    <span className="col-span-2 sm:col-span-1 text-xs font-black text-[#E53935] text-right">
                      ₹{rowTotal.toLocaleString()}
                    </span>

                    {/* Delete */}
                    <div className="col-span-1 flex justify-end">
                      {!dailyEntryReadOnly && dailyRows.length > 1 && (
                        <button
                          onClick={() => removeDailyRow(idx)}
                          className="p-1 bg-red-100 rounded hover:bg-red-200"
                        >
                          <Trash2 size={12} className="text-red-600" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Payment status + method */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex bg-gray-100 rounded-lg p-0.5">
                      <button
                        onClick={() => updateDailyRow(idx, 'paymentStatus', 'PENDING')}
                        disabled={dailyEntryReadOnly}
                        className={`text-[10px] font-black uppercase px-3 py-1 rounded ${row.paymentStatus === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'text-gray-400'}`}
                      >
                        Pending
                      </button>
                      <button
                        onClick={() => updateDailyRow(idx, 'paymentStatus', 'DONE')}
                        disabled={dailyEntryReadOnly}
                        className={`text-[10px] font-black uppercase px-3 py-1 rounded ${row.paymentStatus === 'DONE' ? 'bg-green-100 text-green-700' : 'text-gray-400'}`}
                      >
                        Done
                      </button>
                    </div>
                    {row.paymentStatus === 'DONE' && (
                      <select
                        value={row.paymentMethod}
                        disabled={dailyEntryReadOnly}
                        onChange={(e) => updateDailyRow(idx, 'paymentMethod', e.target.value)}
                        className="text-[10px] font-bold bg-white border border-gray-200 rounded px-2 py-1 outline-none focus:border-[#E53935] disabled:bg-gray-100"
                      >
                        <option value="CASH">Cash</option>
                        <option value="BANK">Bank</option>
                        <option value="UPI">UPI</option>
                        <option value="CHEQUE">Cheque</option>
                      </select>
                    )}
                  </div>

                  {/* Category picker */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-gray-400 whitespace-nowrap">Category</span>
                    <div className="flex-1">
                      <LedgerCategoryPicker
                        entryType="GROCERY"
                        value={row.categoryId ? { id: row.categoryId, name: row.categoryName } : null}
                        onChange={(cat) => {
                          setDailyRows((prev) => prev.map((r, i) => i === idx ? {
                            ...r,
                            categoryId: cat?.id || null,
                            categoryName: cat?.name || null,
                          } : r));
                        }}
                        placeholder="Select or create category..."
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add row */}
            {!dailyEntryReadOnly && (
              <button
                onClick={addDailyRow}
                className="w-full border-2 border-dashed border-gray-200 rounded-lg py-2 text-xs font-bold text-gray-500 hover:border-[#E53935] hover:text-[#E53935] flex items-center justify-center gap-1"
              >
                <Plus size={14} />
                Add Item
              </button>
            )}

            {/* Final Price + Remarks */}
            <div className="flex justify-between items-center bg-gray-50 rounded-lg p-3">
              <span className="text-xs font-black uppercase text-gray-400">Final Price</span>
              <span className="text-lg font-black text-gray-800">₹{dailyTotal.toLocaleString()}</span>
            </div>

            {dailyRemarks && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <span className="text-[10px] font-black uppercase text-amber-600">Remarks</span>
                <span className="text-xs font-bold text-amber-800">{dailyRemarks}</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleSaveDaily}
                className="flex-1 bg-[#E53935] text-white rounded-xl px-4 py-3 text-xs font-black uppercase hover:bg-[#B71C1C] flex items-center justify-center gap-2"
              >
                {dailySaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Today's Entries
              </button>
              <button
                onClick={handleWhatsAppShare}
                disabled={sharing}
                className="flex-1 bg-green-500 text-white rounded-xl px-4 py-3 text-xs font-black uppercase hover:bg-green-600 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {sharing ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
                {sharing ? 'Generating...' : 'Send to WhatsApp'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Purchase History View ──────────────────────────────────────────────── */}
      {view === 'purchase-history' && (
        <PurchaseHistory
          onBack={() => setView('daily-entry')}
          outletId={outletId}
        />
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
