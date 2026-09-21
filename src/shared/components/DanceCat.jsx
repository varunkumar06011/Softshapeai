// ─────────────────────────────────────────────────────────────────────────────
// DanceCat.jsx — Dance-cat Lottie animation (bundled JSON, works offline)
// ─────────────────────────────────────────────────────────────────────────────
// Thin wrapper so callers (e.g. ErrorBoundary) can lazy-import this component —
// keeping lottie-web + the animation JSON out of bundles that never render it.
// ─────────────────────────────────────────────────────────────────────────────

import LottieAnimation from './LottieAnimation';
import danceCat from '../../assets/lottie/dance-cat.json';

export default function DanceCat({ size = 140 }) {
  return <LottieAnimation animationData={danceCat} size={size} />;
}
