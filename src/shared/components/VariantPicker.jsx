// ─────────────────────────────────────────────────────────────────────────────
// VariantPicker — Size/variant selection modal for bar items (liquor/beer)
// ─────────────────────────────────────────────────────────────────────────────
// Allows users to select a size variant when adding bar items to an order:
//   - Liquor: peg (30ml), half (60ml), full (90ml), or bottle (750ml)
//   - Beer: pint (330ml), bottle (650ml)
//   - Custom sizes from item.availableSizes
//   - Price calculation per variant (proportional to base peg price)
//   - Quantity selector
//
// Constants:
//   - BAR_UNIT_ML = 30 (standard peg size)
//   - FULL_BOTTLE_ML = 750 (standard liquor bottle)
//   - BEER_BOTTLE_ML = 650 (standard beer bottle)
//
// Props: item (menu item with variants), onSelect (callback with selected variant), onClose
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { isBeerItem } from '../../utils/itemHelpers';
import { modalBackdropVariants, bottomSheetVariants, springs, useMotionConfig } from '../animations';

// Standard bar unit sizes in milliliters
const BAR_UNIT_ML = 30;
const FULL_BOTTLE_ML = 750;
const BEER_BOTTLE_ML = 650;

export default function VariantPicker({ item, onSelect, onClose }) {
  const { shouldReduce } = useMotionConfig();

  useEffect(() => {
    if (!item) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [item, onClose]);

  if (!item) return null;

  // TYPE B bottle items should not use this picker - added directly to cart
  if (item.menuType === 'LIQUOR' && item.isBottleItem) {
    return null;
  }

  // Check if item is beer
  const isBeer = isBeerItem(item);

  // Beer items should only show 650ml bottle option
  if (isBeer) {
    return (
      <AnimatePresence>
      <motion.div
        initial="initial"
        animate="animate"
        exit="exit"
        variants={modalBackdropVariants}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={`Select variant for ${item.n || item.name}`}
      >
        <motion.div
          initial="initial"
          animate="animate"
          exit="exit"
          variants={bottomSheetVariants}
          transition={shouldReduce ? { duration: 0 } : springs.gentle}
          className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-md sm:max-w-lg shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-gray-900">{item.n || item.name}</h3>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                Select variant
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close variant picker"
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => onSelect(item, {
                id: 'beer_bottle',
                name: '650ml Bottle',
                price: Number(item.p || item.price || item.variants?.[0]?.price || 0)
              })}
              className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 border-gray-105 bg-white hover:border-[#E53935] hover:bg-[#FFF5F5] transition-all group"
            >
              <span className="text-sm sm:text-base font-black text-gray-800 group-hover:text-[#B71C1C]">
                650ml Bottle
              </span>
              <span className="text-sm sm:text-base font-black text-[#E53935]">
                ₹{item.p || item.price || item.variants?.[0]?.price || 0}
              </span>
            </button>
          </div>
        </motion.div>
      </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={modalBackdropVariants}
      transition={shouldReduce ? { duration: 0 } : { duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Select variant for ${item.n}`}
    >
      <motion.div
        initial="initial"
        animate="animate"
        exit="exit"
        variants={bottomSheetVariants}
        transition={shouldReduce ? { duration: 0 } : springs.gentle}
        className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-md sm:max-w-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-gray-900">{item.n}</h3>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
              Select variant
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close variant picker"
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          {item.menuType === 'LIQUOR' ? (
            <>
              <button
                onClick={() => {
                  const variant = item.variants?.[0];
                  if (!variant) {
                    console.error('No variant found for liquor item:', item);
                    return;
                  }
                  onSelect(item, {
                    id: variant.id,
                    name: variant.name || '30ml',
                    price: Number(variant.price || 0)
                  });
                }}
                className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 border-gray-105 bg-white hover:border-[#E53935] hover:bg-[#FFF5F5] transition-all group"
              >
                <span className="text-sm sm:text-base font-black text-gray-800 group-hover:text-[#B71C1C]">
                  {item.variants?.[0]?.name || '30ml'}
                </span>
                <span className="text-sm sm:text-base font-black text-[#E53935]">
                  ₹{item.variants?.[0]?.price || 0}
                </span>
              </button>
              <button
                onClick={() => onSelect(item, { id: 'full_bottle', name: 'Full Bottle', price: Number(item.fullBottlePrice) })}
                className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 border-gray-105 bg-white hover:border-[#E53935] hover:bg-[#FFF5F5] transition-all group"
              >
                <span className="text-sm sm:text-base font-black text-gray-800 group-hover:text-[#B71C1C]">
                  Full Bottle ({FULL_BOTTLE_ML}ml)
                </span>
                <span className="text-sm sm:text-base font-black text-[#E53935]">
                  ₹{item.fullBottlePrice}
                </span>
              </button>
            </>
          ) : (
            item.variants.map((v) => (
              <button
                key={v.id}
                onClick={() => onSelect(item, v)}
                className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 border-gray-105 bg-white hover:border-[#E53935] hover:bg-[#FFF5F5] transition-all group"
              >
                <span className="text-sm sm:text-base font-black text-gray-800 group-hover:text-[#B71C1C]">
                  {v.name}
                </span>
                <span className="text-sm sm:text-base font-black text-[#E53935]">
                  ₹{v.price}
                </span>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
    </AnimatePresence>
  );
}
