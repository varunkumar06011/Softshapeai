// ─────────────────────────────────────────────────────────────────────────────
// AnimatedModal — Reusable modal dialog with Framer Motion transitions
// ─────────────────────────────────────────────────────────────────────────────
// Provides a modal component with two variants:
//   - 'center' (default): fades in backdrop, scales up content from center
//   - 'bottom': slides up from bottom (mobile bottom-sheet style)
//
// Features:
//   - Backdrop click to close
//   - Escape key to close
//   - Body scroll lock when open
//   - Reduced-motion support (instant transitions)
//   - Configurable max width and padding
//
// Props: isOpen, onClose, children, variant, maxWidth, className
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  modalBackdropVariants,
  modalContentVariants,
  bottomSheetVariants,
  springs,
  useMotionConfig,
} from '../animations';

export default function AnimatedModal({
  isOpen,
  onClose,
  children,
  variant = 'center',
  className = '',
  backdropClassName = '',
  closeOnBackdropClick = true,
  closeOnEsc = true,
}) {
  const { shouldReduce, transition } = useMotionConfig();

  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, closeOnEsc, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  const isBottomSheet = variant === 'bottom-sheet';
  const contentVariants = isBottomSheet ? bottomSheetVariants : modalContentVariants;
  const contentTransition = transition || (isBottomSheet ? springs.gentle : springs.standard);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial="initial"
          animate="animate"
          exit="exit"
          variants={modalBackdropVariants}
          transition={transition || { duration: 0.2 }}
          className={`fixed inset-0 z-[9999] flex ${isBottomSheet ? 'items-end' : 'items-center'} justify-center bg-black/50 backdrop-blur-sm p-4 ${backdropClassName}`}
          onClick={closeOnBackdropClick ? onClose : undefined}
        >
          <motion.div
            initial="initial"
            animate="animate"
            exit="exit"
            variants={contentVariants}
            transition={contentTransition}
            className={className}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
