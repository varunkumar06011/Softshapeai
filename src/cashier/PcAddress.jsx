import { useEffect, useState } from 'react';
import { getEdgeUrl } from '../services/edgeHealth';

const REFRESH_MS = 60_000;

// This billing PC's address on the restaurant WiFi, shown in a corner of the
// cashier screen so staff can type it into the captain app when the captain
// app's automatic search does not find the PC. Read from the local runtime's
// /health; hidden when the runtime is not reachable.
const PcAddress = () => {
  const [address, setAddress] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch(`${getEdgeUrl()}/health`, { signal: controller.signal });
        const health = res.ok ? await res.json() : null;
        if (!cancelled) setAddress(health?.lanIp || null);
      } catch {
        if (!cancelled) setAddress(null);
      } finally {
        clearTimeout(timer);
      }
    };
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!address) return null;
  return (
    <div className="px-3 pt-2 text-white/60 select-text" title="Billing PC address — type this into the captain app if it does not find this PC">
      <span className="block text-[9px] font-black uppercase tracking-wider">PC address</span>
      <span className="block text-[11px] font-bold break-all">{address}</span>
    </div>
  );
};

export default PcAddress;
