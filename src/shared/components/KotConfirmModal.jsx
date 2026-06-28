// ─────────────────────────────────────────────────────────────────────────────
// KotConfirmModal — Confirmation modal before sending KOT to kitchen/bar printer
// ─────────────────────────────────────────────────────────────────────────────
// Displays a summary of items being sent as a KOT (Kitchen Order Ticket):
//   - Item count and total quantity
//   - Total amount
//   - Confirm and Cancel buttons
//   - Loading state during KOT submission
//
// Used by POS (Cashier/Captain) when the user taps "Send KOT" or "Place Order".
// Props: isOpen, itemCount, totalQty, amount, label, onConfirm, onCancel
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2 } from 'lucide-react';

export default function KotConfirmModal({ isOpen, itemCount, totalQty, amount, label = 'Send KOT', onConfirm, onCancel }) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) setLoading(false);
  }, [isOpen]);

  const handleConfirm = () => {
    setLoading(true);
    onConfirm?.();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-black text-base text-gray-900">Confirm KOT</h3>
              <button onClick={onCancel} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
                <X size={16} className="text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Items</span>
                <span className="text-sm font-bold text-gray-900">{itemCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Total Quantity</span>
                <span className="text-sm font-bold text-gray-900">{totalQty}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Amount</span>
                <span className="text-sm font-bold text-gray-900">₹{amount?.toFixed(2) ?? '0.00'}</span>
              </div>
            </div>

            <div className="p-4 flex gap-3 border-t border-gray-100">
              <button
                onClick={onCancel}
                disabled={loading}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-[#B71C1C] text-white text-sm font-bold hover:bg-[#8B0000] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    <Send size={16} /> {label}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
