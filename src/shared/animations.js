// ─────────────────────────────────────────────────────────────────────────────
// Animations — Framer Motion presets, spring physics, and reduced-motion support
// ─────────────────────────────────────────────────────────────────────────────
// Centralized animation configuration used across the app:
//   - useMotionConfig(): hook that detects prefers-reduced-motion and returns
//     shouldReduce flag + zero-duration transition override
//   - springs: spring physics presets (standard, gentle, snappy, page)
//   - modalBackdropVariants: fade in/out for modal overlays
//   - modalContentVariants: scale + slide for modal content
//   - bottomSheetVariants: slide up from bottom for mobile bottom sheets
//   - stepVariants: slide transitions for onboarding wizard steps
//   - pageVariants: fade + slide for page transitions
//
// All variants respect reduced-motion via useMotionConfig().
// ─────────────────────────────────────────────────────────────────────────────

import { useReducedMotion } from 'framer-motion';

// === Reduced motion support ===
export function useMotionConfig() {
  const shouldReduce = useReducedMotion();
  return {
    shouldReduce,
    transition: shouldReduce ? { duration: 0 } : undefined,
  };
}

// === Spring physics presets ===
export const springs = {
  standard: { type: 'spring', stiffness: 300, damping: 30, mass: 1 },
  gentle:    { type: 'spring', stiffness: 200, damping: 26, mass: 1 },
  snappy:    { type: 'spring', stiffness: 500, damping: 30, mass: 0.8 },
  page:      { type: 'spring', stiffness: 260, damping: 28, mass: 1 },
  step:      { type: 'spring', stiffness: 320, damping: 30, mass: 1 },
};

// === Framer Motion variants ===

export const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
};

export const stepVariants = {
  enter: (direction) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction) => ({
    x: direction > 0 ? '-100%' : '100%',
    opacity: 0,
  }),
};

export const modalBackdropVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
};

export const modalContentVariants = {
  initial: { scale: 0.92, opacity: 0, y: 20 },
  animate: { scale: 1, opacity: 1, y: 0 },
  exit:    { scale: 0.92, opacity: 0, y: 20 },
};

export const bottomSheetVariants = {
  initial: { y: '100%', opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit:    { y: '100%', opacity: 0 },
};

export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.04,
    },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -12 },
};
