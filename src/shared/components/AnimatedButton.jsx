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
