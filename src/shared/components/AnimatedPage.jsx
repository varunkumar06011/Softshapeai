// ─────────────────────────────────────────────────────────────────────────────
// AnimatedPage — Page wrapper with enter/exit transitions for route changes
// ─────────────────────────────────────────────────────────────────────────────
// Wraps page content with Framer Motion fade + slide transition:
//   - Enter: fade in + slide up slightly
//   - Exit: fade out + slide down slightly
//   - Respects reduced-motion preference (instant transition)
//
// Used by route components to provide smooth page transitions.
// Props: children, className
// ─────────────────────────────────────────────────────────────────────────────

import { motion } from 'framer-motion';
import { pageVariants, springs, useMotionConfig } from '../animations';

export default function AnimatedPage({ children, className = '' }) {
  const { transition } = useMotionConfig();

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={transition || springs.page}
      className={className}
    >
      {children}
    </motion.div>
  );
}
