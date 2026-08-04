// ─────────────────────────────────────────────────────────────────────────────
// AnimatedButton — Reusable button with tap animation and haptic feedback
// ─────────────────────────────────────────────────────────────────────────────
// Wraps a standard button with Framer Motion tap/hover scale animations:
//   - Tap: scales down to 0.96 (disabled if reduced-motion is on)
//   - Hover: scales up to 1.02 (disabled if reduced-motion is on)
//   - Haptic feedback on click (light vibration, can be disabled via prop)
//   - Forwards ref to the underlying button element
//
// Props: children, onClick, haptic (default true), disabled, className, ...rest
// ─────────────────────────────────────────────────────────────────────────────

import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { springs, useMotionConfig } from '../animations';
import { hapticLight } from '../hooks/useHaptics';

const AnimatedButton = forwardRef(function AnimatedButton(
  { children, onClick, haptic = true, disabled = false, className = '', ...rest },
  ref
) {
  const { shouldReduce } = useMotionConfig();

  const tapScale = shouldReduce ? 1 : 0.96;
  const hoverScale = shouldReduce ? 1 : 1.02;

  const handleClick = (e) => {
    if (haptic && !disabled) hapticLight();
    onClick?.(e);
  };

  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: tapScale }}
      whileHover={{ scale: hoverScale }}
      transition={shouldReduce ? { duration: 0 } : springs.snappy}
      onClick={handleClick}
      disabled={disabled}
      className={className}
      {...rest}
    >
      {children}
    </motion.button>
  );
});

export default AnimatedButton;
