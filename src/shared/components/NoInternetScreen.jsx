// ─────────────────────────────────────────────────────────────────────────────
// NoInternetScreen.jsx — Full-screen offline state shown when the network drops
// ─────────────────────────────────────────────────────────────────────────────
// Rendered in place of page content while the backend is unreachable. Plays the
// dance-cat Lottie animation (precached by the service worker, so it works with
// no connection) and auto-dismisses as soon as connectivity is restored — the
// parent gate subscribes to shared reachability in apiConfig.
//
// "Retry" forces an immediate backend reachability re-check.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Loader2, RefreshCw, WifiOff } from 'lucide-react';
import LottieAnimation from './LottieAnimation';
import { checkBackendReachability } from '../../services/apiConfig';

export default function NoInternetScreen() {
  const [checking, setChecking] = useState(false);

  const handleRetry = async () => {
    setChecking(true);
    try {
      await checkBackendReachability();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#FFF5F5] p-6 text-center">
      <LottieAnimation src="/lottie/dance-cat.json" size={260} />
      <div className="mt-2 flex items-center gap-2 text-[#E53935]">
        <WifiOff size={18} />
        <span className="text-xs font-black uppercase tracking-widest">You're offline</span>
      </div>
      <h2 className="mt-2 text-2xl font-black text-gray-900">Chill while the Internet Restores</h2>
      <p className="mt-2 max-w-sm text-sm font-bold text-gray-400">
        This page will come back on its own the moment the connection returns.
      </p>
      <button
        onClick={handleRetry}
        disabled={checking}
        className="mt-6 flex items-center justify-center gap-2 px-6 py-3 bg-[#E53935] text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-[#B71C1C] transition-colors disabled:opacity-60"
      >
        {checking ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        {checking ? 'Checking…' : 'Retry'}
      </button>
    </div>
  );
}
