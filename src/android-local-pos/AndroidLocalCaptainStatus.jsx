import { useEffect, useState } from 'react';
import { createCashierHubClient } from './captainClient';
import { getStoredCashierHub } from './hubStorage';

const STATUS_INTERVAL_MS = 5000;

export default function AndroidLocalCaptainStatus({ children }) {
  const [connected, setConnected] = useState(true);
  const [lastError, setLastError] = useState('');
  const hub = getStoredCashierHub();

  useEffect(() => {
    if (!hub.url || !hub.token) return undefined;
    const client = createCashierHubClient({ baseUrl: hub.url, token: hub.token, timeoutMs: 2500 });
    let active = true;

    async function check() {
      try {
        await client.status();
        if (active) {
          setConnected(true);
          setLastError('');
        }
      } catch (error) {
        if (active) {
          setConnected(false);
          setLastError(error.message || 'Cashier hub unavailable');
        }
      }
    }

    check();
    const interval = setInterval(check, STATUS_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [hub.url, hub.token]);

  if (!hub.url || !hub.token || connected) return children;

  return (
    <>
      <div role="status" className="fixed inset-x-0 top-0 z-[100] bg-amber-600 px-4 py-2 text-center text-xs font-semibold text-white">
        Cashier hub disconnected{lastError ? `: ${lastError}` : ''}. Check the local Wi-Fi connection.
      </div>
      {children}
    </>
  );
}
