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
