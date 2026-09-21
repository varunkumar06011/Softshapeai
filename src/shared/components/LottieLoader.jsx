// ─────────────────────────────────────────────────────────────────────────────
// LottieLoader.jsx — Full-area loading screen that plays a Lottie animation
// ─────────────────────────────────────────────────────────────────────────────
// Wraps LottieAnimation with the centered layout + label used by loading states.
// While the JSON is fetching — or if it is missing/fails — falls back to the
// standard spinner so the loader never renders blank.
//
// Usage:  <LottieLoader label="Loading section…" />
// ─────────────────────────────────────────────────────────────────────────────

import LottieAnimation from './LottieAnimation';

export default function LottieLoader({ label = 'Loading…', size = 160, src }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-3">
      <LottieAnimation
        src={src}
        size={size}
        fallback={<div className="w-8 h-8 border-2 border-[#E53935] border-t-transparent rounded-full animate-spin" />}
      />
      {label && <span className="text-sm font-bold text-gray-400">{label}</span>}
    </div>
  );
}
