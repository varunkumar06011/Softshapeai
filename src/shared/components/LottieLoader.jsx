// ─────────────────────────────────────────────────────────────────────────────
// LottieLoader.jsx — Loading state that plays a Lottie animation
// ─────────────────────────────────────────────────────────────────────────────
// Wraps LottieAnimation with the centered layout + label used by loading states.
// The default animation (loading cat) is bundled via a static JSON import so it
// renders even fully offline. Falls back to the standard spinner if a custom
// `src` fetch fails or `animationData` is missing.
//
// Usage:  <LottieLoader label="Loading section…" />            — fills parent
//         <LottieLoader label="…" size={80} className="py-8" /> — inline block
// ─────────────────────────────────────────────────────────────────────────────

import LottieAnimation from './LottieAnimation';
import loadingAnimation from '../../assets/lottie/loading.json';

export default function LottieLoader({ label = 'Loading…', size = 160, animationData, src, className }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className || 'h-full min-h-[300px]'}`}>
      <LottieAnimation
        animationData={animationData || loadingAnimation}
        src={src}
        size={size}
        fallback={<div className="w-8 h-8 border-2 border-[#E53935] border-t-transparent rounded-full animate-spin" />}
      />
      {label && <span className="text-sm font-bold text-gray-400">{label}</span>}
    </div>
  );
}
