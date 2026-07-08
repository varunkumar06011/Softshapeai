// ─────────────────────────────────────────────────────────────────────────────
// TodaySpecials — Today's special items management and captain target tracking
// ─────────────────────────────────────────────────────────────────────────────
// Admin panel for managing daily special menu items and captain performance:
//   - Create/edit/delete special items (with image upload, active toggle, expiry)
//   - Set captain revenue targets and discount limits
//   - View all menu items flagged as isSpecial
//   - Toggle special active/inactive status
//   - Set expiry date/time for time-limited specials
//
// Special items appear highlighted in the POS and customer-facing menu.
// Captain targets are used in reports to track performance vs goals.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Edit2, Trash2, Save, X, Target, Zap, CheckCircle2, ChevronRight, Image as ImageIcon, Users, Flame
} from 'lucide-react';
import { StarIcon } from '../shared/icons/StarIcon';
import { useMenu } from '../context/MenuContext';
import { useSocket } from '../hooks/useSocket';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';
import { authService } from '../services/authService';
import { saveCaptainTarget, fetchAllCaptainTargets } from '../services/captainTargetService';
import { createMenuItem, updateMenuItem, deleteMenuItem, bulkImportSpecials } from '../services/menuService';
import { API_BASE, getAuthHeaders } from '../services/apiConfig';
import { modalBackdropVariants, modalContentVariants, springs, useMotionConfig } from '../shared/animations';

export default function TodaySpecials() {
  const { shouldReduce } = useMotionConfig();
  const { allMenuItems, refreshMenu } = useMenu();
  const specials = allMenuItems
    ? Array.from(new Map(allMenuItems.filter(i => i.isSpecial).map(i => [i.n, i])).values())
    : [];

  const [targets, setTargets] = useState({});
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [captains, setCaptains] = useState([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [selectedCaptain, setSelectedCaptain] = useState(null);
  const [pushStatus, setPushStatus] = useState(null);
  const [bulkRows, setBulkRows] = useState([
    { n: '', c: 'Main Course', p: '', t: 'veg', menuType: 'FOOD', channel: 'BOTH' },
  ]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [selectedSpecialIds, setSelectedSpecialIds] = useState(new Set());

  // Target assignment states
  const [revenueTarget, setRevenueTarget] = useState(5000);
  const [discountLimit, setDiscountLimit] = useState(5);

  const [formData, setFormData] = useState({
    id: null,
    n: '', // name
    c: 'Main Course', // category
    p: '', // price
    t: 'veg', // type
    img: '',
    available: true,
    isCombo: false,
    active: true,
    specialChannel: 'BOTH',
    createdAt: null,
    expiresAt: null,
    swiggySynced: false,
    zomatoSynced: false,
  });
  const [staffSold, setStaffSold] = useState([]);
  const restaurantId = getCurrentRestaurantId();
  const socket = useSocket(restaurantId);



  useEffect(() => {
    fetchAllCaptainTargets()
      .then(data => { setTargets(data); setTargetsLoading(false); })
      .catch(() => setTargetsLoading(false));
  }, []);

  useEffect(() => {
    const loadStaffSold = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/analytics/today-specials-by-staff`, {
          headers: { ...getAuthHeaders() },
        });
        if (!res.ok) throw new Error('Failed to fetch staff specials');
        const data = await res.json();
        setStaffSold(data.staff || []);
      } catch (err) {
        console.error('[TodaySpecials] Failed to load staff sold:', err);
      }
    };
    loadStaffSold();
    if (!socket) return;
    socket.on('order:paid', loadStaffSold);
    return () => {
      socket.off('order:paid', loadStaffSold);
    };
  }, [socket]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        setFormData({ ...formData, img: canvas.toDataURL('image/jpeg', 0.8) });
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const buildSpecialPayload = () => {
    const price = Number(formData.p);
    if (!formData.n || !price) return null;
    return {
      name: formData.n,
      category: formData.c,
      price,
      isVeg: formData.t === 'veg',
      imageUrl: formData.img || null,
      isAvailable: formData.available !== false,
      menuType: 'FOOD',
      isSpecial: true,
      specialChannel: ['CASHIER', 'CAPTAIN', 'BOTH'].includes(formData.specialChannel) ? formData.specialChannel : 'BOTH',
      specialActive: formData.active !== false,
      specialExpiresAt: formData.expiresAt
        ? new Date(formData.expiresAt).toISOString()
        : formData.id
          ? null
          : new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString(),
      syncToAllOutlets: true,
    };
  };

  const handleSave = async () => {
    const payload = buildSpecialPayload();
    if (!payload) return;

    try {
      if (formData.id) {
        await updateMenuItem(formData.id, payload);
      } else {
        await createMenuItem(payload);
      }
      await refreshMenu();
      setFormData({
        id: null, n: '', c: 'Main Course', p: '', t: 'veg', img: '', available: true, isCombo: false, active: true, specialChannel: 'BOTH', createdAt: null, expiresAt: null, swiggySynced: false, zomatoSynced: false
      });
      setIsModalOpen(false);
      simulatePush();
    } catch (err) {
      console.error('[TodaySpecials] Failed to save special:', err);
      alert('Failed to save special. Please try again.');
    }
  };

  const handleBulkSave = async () => {
    const validRows = bulkRows.filter(r => r.n.trim() && Number(r.p) > 0);
    if (validRows.length === 0) {
      alert('Enter at least one item with a name and price.');
      return;
    }
    setBulkSaving(true);
    try {
      const payload = validRows.map(r => ({
        name: r.n.trim(),
        category: r.c || 'Main Course',
        price: Number(r.p),
        isVeg: r.t === 'veg',
        menuType: r.menuType === 'LIQUOR' ? 'LIQUOR' : 'FOOD',
        specialChannel: r.channel || 'BOTH',
        isAvailable: true,
      }));
      await bulkImportSpecials(payload, true);
      await refreshMenu();
      setBulkRows([{ n: '', c: 'Main Course', p: '', t: 'veg', menuType: 'FOOD', channel: 'BOTH' }]);
      setIsBulkModalOpen(false);
      simulatePush();
    } catch (err) {
      console.error('[TodaySpecials] Bulk import failed:', err);
      alert('Bulk import failed: ' + (err.message || 'Unknown error'));
    } finally {
      setBulkSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this special?')) return;
    try {
      await deleteMenuItem(id);
      await refreshMenu();
    } catch (err) {
      console.error('[TodaySpecials] Failed to delete special:', err);
      alert('Failed to delete special. Please try again.');
    }
  };

  const handleActivate = async (id) => {
    try {
      await updateMenuItem(id, {
        specialActive: true,
        specialExpiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString(),
        syncToAllOutlets: true,
      });
      await refreshMenu();
      simulatePush();
    } catch (err) {
      console.error('[TodaySpecials] Failed to activate special:', err);
      alert('Failed to activate special. Please try again.');
    }
  };

  const toggleSelectAll = () => {
    if (selectedSpecialIds.size === specials.length) {
      setSelectedSpecialIds(new Set());
    } else {
      setSelectedSpecialIds(new Set(specials.map(s => s.id)));
    }
  };

  const toggleSelectSpecial = (id) => {
    const next = new Set(selectedSpecialIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedSpecialIds(next);
  };

  const handleBulkMakeAvailable = async () => {
    if (selectedSpecialIds.size === 0) return;
    try {
      await Promise.all(
        Array.from(selectedSpecialIds).map(id =>
          updateMenuItem(id, { isAvailable: true, isSpecial: true, syncToAllOutlets: true })
        )
      );
      await refreshMenu();
      setSelectedSpecialIds(new Set());
      simulatePush();
    } catch (err) {
      console.error('[TodaySpecials] Bulk make available failed:', err);
      alert('Failed to update items. Please try again.');
    }
  };

  const simulatePush = () => {
    setPushStatus('pushing');
    setTimeout(() => {
      setPushStatus('success');
      setTimeout(() => setPushStatus(null), 3000);
    }, 1500);
  };

  const handleAssignTarget = async () => {
    if (!selectedCaptain) return;
    try {
      const saved = await saveCaptainTarget(selectedCaptain.id, revenueTarget, discountLimit);
      setTargets(prev => ({
        ...prev,
        [selectedCaptain.id]: {
          revenueTarget: saved.revenueTarget,
          discountLimit: saved.discountLimit,
          assignedAt: saved.assignedAt,
        },
      }));
      setIsTargetModalOpen(false);
      setSelectedCaptain(null);
    } catch (err) {
      console.error('[TodaySpecials] Failed to assign target:', err);
      alert('Failed to save assignment. Please try again.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <StarIcon className="text-amber-500 fill-amber-500" /> Today Specials
          </h2>
          <p className="text-xs font-bold text-gray-500 mt-1">Manage daily recommendations & captain targets</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setIsTargetModalOpen(true)}
            className="flex-1 md:flex-none px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-black uppercase tracking-widest hover:border-gray-300 hover:shadow-sm transition-all flex items-center justify-center gap-2"
          >
            <Target size={16} className="text-[#E53935]" /> Assign Targets
          </button>
          <button
            onClick={() => setIsBulkModalOpen(true)}
            className="flex-1 md:flex-none px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-black uppercase tracking-widest hover:border-gray-300 hover:shadow-sm transition-all flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Bulk Import
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex-1 md:flex-none px-5 py-2.5 bg-[#E53935] text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-md shadow-red-100 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={16} /> New Special
          </button>
        </div>
      </div>

      {/* STAFF LEADERBOARD */}
      <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm">
        <h3 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-2">
          <Users size={16} className="text-[#E53935]" /> Top Specials Sellers Today
        </h3>
        {staffSold.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {staffSold.map(staff => (
              <div key={staff.userId} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                <span className="text-sm font-bold text-gray-900 truncate">{staff.name || staff.userId}</span>
                <div className="text-right shrink-0">
                  <span className="text-sm font-black text-[#E53935]">{staff.soldCount}</span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase ml-1">sold</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs font-bold text-gray-400">No specials sold yet. Sales will appear here once a captain or cashier settles a bill containing a special.</p>
        )}
      </div>

      {/* BULK SELECTION TOOLBAR */}
      {specials.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedSpecialIds.size === specials.length && specials.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-[#E53935] focus:ring-[#E53935]"
            />
            <span className="text-sm font-bold text-gray-700">
              Select All ({selectedSpecialIds.size}/{specials.length})
            </span>
          </label>
          <button
            onClick={handleBulkMakeAvailable}
            disabled={selectedSpecialIds.size === 0}
            className="px-4 py-2 bg-green-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            Make Available
          </button>
        </div>
      )}

      {/* SPECIALS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {specials.map(special => {
          const isExpired = Date.now() > (special.expiresAt || 0);
          const isActive = special.active && !isExpired;
          return (
            <div key={special.id} className={`bg-white rounded-2xl border ${isActive ? 'border-amber-200 shadow-lg shadow-amber-50' : 'border-gray-200 opacity-70 grayscale'} overflow-hidden flex flex-col group`}>
              <div className="h-40 w-full bg-gray-100 relative overflow-hidden flex-shrink-0">
                {special.img ? (
                  <img src={special.img} alt={special.n} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <ImageIcon size={32} />
                  </div>
                )}

                <div className="absolute top-3 left-3 flex gap-2">
                  <label className="w-6 h-6 rounded-md flex items-center justify-center bg-white shadow-sm border border-gray-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSpecialIds.has(special.id)}
                      onChange={() => toggleSelectSpecial(special.id)}
                      className="w-4 h-4 rounded border-gray-300 text-[#E53935] focus:ring-[#E53935]"
                    />
                  </label>
                </div>

                <div className="absolute top-3 right-3 flex gap-2">
                  {special.isCombo && (
                    <span className="bg-amber-500 text-white px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">Combo</span>
                  )}
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center bg-white shadow-sm border ${special.t === 'veg' ? 'border-green-500 text-green-500' : 'border-red-500 text-red-500'}`}>
                    <div className={`w-2 h-2 rounded-full ${special.t === 'veg' ? 'bg-green-500' : 'bg-red-500'}`} />
                  </div>
                </div>
              </div>

              <div className="p-4 flex flex-col flex-grow">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-sm font-black text-gray-900 leading-tight">{special.n}</h3>
                  <span className="text-sm font-black text-[#E53935]">₹{special.p}</span>
                </div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{special.c}</span>

                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                      {isActive ? (special.available ? 'Active' : 'Hidden') : (isExpired ? 'Expired' : 'Inactive')}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {!isActive ? (
                      <button
                        onClick={() => handleActivate(special.id)}
                        className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-green-600 transition-colors"
                      >
                        Activate
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => { setFormData(special); setIsModalOpen(true); }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(special.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {specials.length === 0 && (
          <div className="col-span-full py-16 bg-white rounded-3xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center">
            <StarIcon size={40} className="text-gray-300 mb-4" />
            <h3 className="text-lg font-black text-gray-900 mb-2">No Specials Added</h3>
            <p className="text-xs font-bold text-gray-500 max-w-sm">Create today's specials to instantly push recommendations to the Captain App.</p>
          </div>
        )}
      </div>

      {/* SWIGGY/ZOMATO SYNC ACTIONS */}
      <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#FFF4F4] text-[#E53935] rounded-2xl flex items-center justify-center">
            <Zap size={24} />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-900">Sync Aggregators</h3>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Push specials to Swiggy & Zomato</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {pushStatus === 'success' && (
            <span className="text-[10px] font-black uppercase tracking-widest text-green-600 flex items-center gap-1">
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={shouldReduce ? { duration: 0 } : springs.snappy}
                className="flex items-center gap-1"
              >
                <CheckCircle2 size={14} /> Synced Successfully
              </motion.span>
            </span>
          )}
          <button
            onClick={simulatePush}
            disabled={pushStatus === 'pushing'}
            className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {pushStatus === 'pushing' ? 'Syncing...' : 'Push Updates'}
          </button>
        </div>
      </div>

      {/* CREATE SPECIAL MODAL */}
      <AnimatePresence>
      {isModalOpen && (
        <motion.div
          initial="initial"
          animate="animate"
          exit="exit"
          variants={modalBackdropVariants}
          transition={shouldReduce ? { duration: 0 } : { duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            initial="initial"
            animate="animate"
            exit="exit"
            variants={modalContentVariants}
            transition={shouldReduce ? { duration: 0 } : springs.standard}
            className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">
                {formData.id ? 'Edit Special' : 'New Special'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100"><X size={18} /></button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Item Name</label>
                  <input
                    type="text"
                    value={formData.n}
                    onChange={e => setFormData({ ...formData, n: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[#E53935]/20 focus:border-[#E53935] outline-none transition-all"
                    placeholder="e.g. Special Chicken Biryani"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Category</label>
                  <select
                    value={formData.c}
                    onChange={e => setFormData({ ...formData, c: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
                  >
                    <option>Starters</option>
                    <option>Main Course</option>
                    <option>Desserts</option>
                    <option>Drinks</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Price (₹)</label>
                  <input
                    type="number"
                    value={formData.p}
                    onChange={e => setFormData({ ...formData, p: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
                    placeholder="e.g. 450"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Diet Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFormData({ ...formData, t: 'veg' })}
                    className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${formData.t === 'veg' ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <div className="w-2 h-2 rounded-full bg-green-500" /> Veg
                  </button>
                  <button
                    onClick={() => setFormData({ ...formData, t: 'non-veg' })}
                    className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${formData.t === 'non-veg' ? 'bg-red-50 border-red-200 text-red-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <div className="w-2 h-2 rounded-full bg-red-500" /> Non-Veg
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Channel</label>
                <select
                  value={formData.specialChannel}
                  onChange={e => setFormData({ ...formData, specialChannel: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
                >
                  <option value="BOTH">Both (Cashier + Captain)</option>
                  <option value="CASHIER">Cashier Only</option>
                  <option value="CAPTAIN">Captain Only</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Image</label>
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center relative bg-gray-50 hover:bg-gray-100 transition-colors group overflow-hidden">
                  {formData.img ? (
                    <>
                      <img src={formData.img} alt="Preview" className="h-32 object-contain mb-2" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-[10px] font-black uppercase tracking-widest bg-black/50 px-3 py-1.5 rounded-lg">Change Image</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="text-gray-400 mb-2" />
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Upload Image</span>
                    </>
                  )}
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.available}
                    onChange={e => setFormData({ ...formData, available: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-[#E53935] focus:ring-[#E53935]"
                  />
                  <span className="text-sm font-bold text-gray-700">Currently Available</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isCombo}
                    onChange={e => setFormData({ ...formData, isCombo: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-sm font-bold text-gray-700">Combo Special</span>
                </label>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3 mt-auto">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-3 bg-white text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-widest border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.n || !formData.p}
                className="flex-1 py-3 bg-[#E53935] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md shadow-red-100 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Save size={14} /> Save Special
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* BULK IMPORT MODAL */}
      <AnimatePresence>
      {isBulkModalOpen && (
        <motion.div
          initial="initial"
          animate="animate"
          exit="exit"
          variants={modalBackdropVariants}
          transition={shouldReduce ? { duration: 0 } : { duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            initial="initial"
            animate="animate"
            exit="exit"
            variants={modalContentVariants}
            transition={shouldReduce ? { duration: 0 } : springs.standard}
            className="bg-white w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">Bulk Import Today Specials</h3>
              <button onClick={() => setIsBulkModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100"><X size={18} /></button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-3">
                <Zap size={18} className="text-blue-600 shrink-0 mt-0.5" />
                <p className="text-xs font-bold text-blue-800 leading-relaxed">
                  Items saved here are pushed to <span className="font-black">all outlets</span> in this organization automatically. Existing items with the same name will be updated, not duplicated.
                </p>
              </div>

              <div className="space-y-3">
                {bulkRows.map((row, idx) => (
                  <div key={idx} className="bg-gray-50/60 border border-gray-200 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Item #{idx + 1}</span>
                      <button
                        onClick={() => {
                          const next = [...bulkRows];
                          next.splice(idx, 1);
                          setBulkRows(next);
                        }}
                        disabled={bulkRows.length === 1}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-30 transition-colors p-1 rounded-lg hover:bg-red-50"
                        title="Remove row"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Item Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Special Chicken Biryani"
                          value={row.n}
                          onChange={e => {
                            const next = [...bulkRows];
                            next[idx] = { ...next[idx], n: e.target.value };
                            setBulkRows(next);
                          }}
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Category</label>
                        <input
                          type="text"
                          placeholder="e.g. Main Course"
                          value={row.c}
                          onChange={e => {
                            const next = [...bulkRows];
                            next[idx] = { ...next[idx], c: e.target.value };
                            setBulkRows(next);
                          }}
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Price (₹)</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={row.p}
                          onChange={e => {
                            const next = [...bulkRows];
                            next[idx] = { ...next[idx], p: e.target.value };
                            setBulkRows(next);
                          }}
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Diet</label>
                        <select
                          value={row.t}
                          onChange={e => {
                            const next = [...bulkRows];
                            next[idx] = { ...next[idx], t: e.target.value };
                            setBulkRows(next);
                          }}
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
                        >
                          <option value="veg">Veg</option>
                          <option value="non-veg">Non-Veg</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Menu Type</label>
                        <select
                          value={row.menuType}
                          onChange={e => {
                            const next = [...bulkRows];
                            next[idx] = { ...next[idx], menuType: e.target.value };
                            setBulkRows(next);
                          }}
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
                        >
                          <option value="FOOD">Food</option>
                          <option value="LIQUOR">Liquor</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Channel</label>
                        <select
                          value={row.channel}
                          onChange={e => {
                            const next = [...bulkRows];
                            next[idx] = { ...next[idx], channel: e.target.value };
                            setBulkRows(next);
                          }}
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
                        >
                          <option value="BOTH">Both</option>
                          <option value="CASHIER">Cashier</option>
                          <option value="CAPTAIN">Captain</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setBulkRows([...bulkRows, { n: '', c: 'Main Course', p: '', t: 'veg', menuType: 'FOOD', channel: 'BOTH' }])}
                className="w-full px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 hover:border-gray-300 transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={14} /> Add Another Item
              </button>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3 mt-auto">
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="flex-1 py-3 bg-white text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-widest border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkSave}
                disabled={bulkSaving || !bulkRows.some(r => r.n.trim() && Number(r.p) > 0)}
                className="flex-1 py-3 bg-[#E53935] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md shadow-red-100 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Save size={14} /> {bulkSaving ? 'Saving...' : 'Save All to All Outlets'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ASSIGN TARGETS MODAL */}
      <AnimatePresence>
      {isTargetModalOpen && (
        <motion.div
          initial="initial"
          animate="animate"
          exit="exit"
          variants={modalBackdropVariants}
          transition={shouldReduce ? { duration: 0 } : { duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
        >
          <motion.div
            initial="initial"
            animate="animate"
            exit="exit"
            variants={modalContentVariants}
            transition={shouldReduce ? { duration: 0 } : springs.standard}
            className="bg-white w-full max-w-[440px] rounded-[28px] overflow-hidden shadow-2xl shadow-black/15 flex flex-col"
          >
            {!selectedCaptain ? (
              // Step 1: Select Captain
              <>
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-[#FFF4F4] flex items-center justify-center">
                      <Users size={15} className="text-[#E53935]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-gray-900 tracking-tight">Assign Targets</h3>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Select a captain</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsTargetModalOpen(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="p-4 grid grid-cols-2 gap-2.5 max-h-[65vh] overflow-y-auto">
                  {captains.map(cap => {
                    const initials = cap.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '';
                    const currentTarget = targets[cap.id]?.revenueTarget;
                    return (
                      <button
                        key={cap.id}
                        onClick={() => {
                          setSelectedCaptain(cap);
                          setRevenueTarget(currentTarget || 5000);
                          setDiscountLimit(targets[cap.id]?.discountLimit || 5);
                        }}
                        className="p-4 rounded-2xl border border-gray-100 bg-gray-50/60 hover:border-[#E53935]/25 hover:bg-[#FFF5F5] hover:shadow-lg hover:shadow-red-50 transition-all text-left group active:scale-95"
                      >
                        <div className="w-11 h-11 rounded-2xl bg-red-50 text-[#B71C1C] flex items-center justify-center text-sm font-black mb-3 group-hover:scale-110 transition-transform shadow-sm">
                          {initials}
                        </div>
                        <h4 className="text-xs font-black text-gray-900 truncate mb-1.5">{cap.name}</h4>
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${currentTarget ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {currentTarget ? `₹${currentTarget.toLocaleString('en-IN')}` : 'No Target'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              // Step 2: Assign Target Settings
              <>
                {/* Captain Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                  <button
                    onClick={() => setSelectedCaptain(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors shrink-0"
                  >
                    <ChevronRight size={15} className="rotate-180" />
                  </button>
                  <div className={`w-11 h-11 rounded-2xl ${selectedCaptain.color} flex items-center justify-center text-sm font-black shadow-sm shrink-0`}>
                    {selectedCaptain.initials}
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-gray-900 tracking-tight truncate">{selectedCaptain.name}</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-widest shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Today Active
                      </span>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Daily targets</p>
                  </div>
                  <button
                    onClick={() => setIsTargetModalOpen(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="px-6 py-6 space-y-7 overflow-y-auto max-h-[65vh]">

                  {/* ── Revenue Target ── */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-500">
                        <Flame size={12} className="text-[#E53935]" /> Daily Revenue Target
                      </label>
                      <span className="text-2xl font-black text-gray-900 tracking-tighter tabular-nums">
                        ₹{revenueTarget >= 15000 ? '15,000+' : revenueTarget.toLocaleString('en-IN')}
                      </span>
                    </div>

                    {/* Quick chips */}
                    <div className="flex gap-2 mb-4 flex-wrap">
                      {[
                        { label: '₹3K', val: 3000 },
                        { label: '₹5K', val: 5000 },
                        { label: '₹10K', val: 10000 },
                        { label: 'MAX', val: 15000 },
                      ].map(({ label, val }) => (
                        <button
                          key={val}
                          onClick={() => setRevenueTarget(val)}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${revenueTarget === val
                              ? 'bg-[#E53935] border-[#E53935] text-white shadow-md shadow-red-100'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-[#E53935]/40 hover:text-[#E53935]'
                            }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Gradient slider */}
                    <input
                      type="range"
                      min="3000"
                      max="15000"
                      step="500"
                      value={revenueTarget}
                      onChange={(e) => setRevenueTarget(parseInt(e.target.value))}
                      className="w-full h-2.5 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #E53935 0%, #FF7043 ${((revenueTarget - 3000) / 12000) * 100}%, #F3F4F6 ${((revenueTarget - 3000) / 12000) * 100}%, #F3F4F6 100%)`,
                        accentColor: '#E53935',
                      }}
                    />
                    <div className="flex justify-between mt-2 text-[9px] font-black text-gray-400">
                      <span>₹3,000</span>
                      <span>₹15,000+</span>
                    </div>
                  </div>

                  {/* ── Discount Limit ── */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Max Discount Auth</label>
                      <span className="text-2xl font-black text-gray-900 tracking-tighter tabular-nums">{discountLimit}%</span>
                    </div>

                    {/* Quick chips */}
                    <div className="flex gap-2 mb-4 flex-wrap">
                      {[5, 10, 15, 20].map(val => (
                        <button
                          key={val}
                          onClick={() => setDiscountLimit(val)}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${discountLimit === val
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-400 hover:text-indigo-600'
                            }`}
                        >
                          {val}%
                        </button>
                      ))}
                    </div>

                    {/* Gradient slider */}
                    <input
                      type="range"
                      min="0"
                      max="20"
                      step="1"
                      value={discountLimit}
                      onChange={(e) => setDiscountLimit(parseInt(e.target.value))}
                      className="w-full h-2.5 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #4F46E5 0%, #818CF8 ${(discountLimit / 20) * 100}%, #F3F4F6 ${(discountLimit / 20) * 100}%, #F3F4F6 100%)`,
                        accentColor: '#4F46E5',
                      }}
                    />
                    <div className="flex justify-between mt-2 text-[9px] font-black text-gray-400">
                      <span>0%</span>
                      <span>20%</span>
                    </div>
                  </div>
                </div>

                {/* Confirm Button */}
                <div className="px-6 py-5 border-t border-gray-100">
                  <button
                    onClick={handleAssignTarget}
                    className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-white transition-all hover:scale-[1.02] active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, #E53935 0%, #FF6B6B 100%)',
                      boxShadow: '0 8px 24px -4px rgba(229,57,53,0.35)',
                    }}
                  >
                    Confirm Assignment
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
