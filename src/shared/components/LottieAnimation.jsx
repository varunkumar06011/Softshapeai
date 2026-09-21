// ─────────────────────────────────────────────────────────────────────────────
// LottieAnimation.jsx — Plays a Lottie animation
// ─────────────────────────────────────────────────────────────────────────────
// Preferred usage is the `animationData` prop — import the JSON statically so it
// ships inside the JS bundle and works with zero network (fully offline-safe):
//
//   import danceCat from '../../assets/lottie/dance-cat.json';
//   <LottieAnimation animationData={danceCat} size={240} />
//
// A `src` URL (e.g. '/lottie/foo.json' from public/) is also supported — fetched
// once and cached in memory — but requires network or a precached asset.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import { httpFetch } from '../../utils/httpClient';

const animationCache = new Map();

export default function LottieAnimation({
  animationData: dataProp,
  src,
  size = 160,
  loop = true,
  className,
  style,
  fallback = null,
}) {
  const animationData = dataProp || (src ? animationCache.get(src) : null) || null;
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (dataProp || !src || animationData) return;
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
  }, [src, dataProp, animationData]);

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
