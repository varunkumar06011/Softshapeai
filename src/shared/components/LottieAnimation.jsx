// ─────────────────────────────────────────────────────────────────────────────
// LottieAnimation.jsx — Plays a Lottie JSON file from the public folder
// ─────────────────────────────────────────────────────────────────────────────
// Fetches the animation JSON once per src and caches it in memory (the file is
// also precached by the service worker, so it works offline). Renders nothing —
// or `fallback` — while the JSON loads or if it fails.
//
// Usage:  <LottieAnimation src="/lottie/dance-cat.json" size={240} />
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import { httpFetch } from '../../utils/httpClient';

const animationCache = new Map();

export default function LottieAnimation({
  src = '/lottie/loading.json',
  size = 160,
  loop = true,
  className,
  style,
  fallback = null,
}) {
  const animationData = animationCache.get(src) || null;
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (animationData) return;
    let cancelled = false;
    httpFetch(src, {}, { retries: 0 })
      .then((r) => {
        if (!r.ok) throw new Error(`${src} ${r.status}`);
        return r.json();
      })
      .then((data) => {
        animationCache.set(src, data);
        if (!cancelled) forceRender((n) => n + 1);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [src, animationData]);

  if (!animationData) return fallback;

  return (
    <Lottie
      animationData={animationData}
      loop={loop}
      autoplay
      className={className}
      style={{ width: size, height: size, ...style }}
    />
  );
}
