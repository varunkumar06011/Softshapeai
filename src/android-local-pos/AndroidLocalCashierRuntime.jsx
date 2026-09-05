import { useEffect, useState } from 'react';
import { isAndroidLocalPosEnabled } from './config';

export default function AndroidLocalCashierRuntime({ children }) {
  const [status, setStatus] = useState({ state: 'starting', error: null });
  const [pairing, setPairing] = useState(null);
  const enabled = isAndroidLocalPosEnabled();

  useEffect(() => {
    if (!enabled) return undefined;

    let active = true;

    import('./runtimeManager')
      .then(async ({ startAndroidLocalPosRuntime, getAndroidLocalPosPairingInfo }) => {
        if (!active) return null;
        const nextStatus = await startAndroidLocalPosRuntime();
        const pairingInfo = await getAndroidLocalPosPairingInfo();
        return { nextStatus, pairingInfo };
      })
      .then((result) => {
        if (active && result?.nextStatus) {
          setStatus({ state: result.nextStatus.state, error: null });
          setPairing(result.pairingInfo);
        }
      })
      .catch((error) => {
        if (active) setStatus({ state: 'error', error: error.message || 'Local POS startup failed' });
      });

    return () => {
      active = false;
      import('./runtimeManager')
        .then(({ stopAndroidLocalPosRuntime }) => stopAndroidLocalPosRuntime())
        .catch(() => {});
    };
  }, [enabled]);

  if (!enabled) return children;

  return (
    <>
      {status.state === 'error' && (
        <div role="alert" className="fixed inset-x-0 top-0 z-[100] bg-red-700 px-4 py-2 text-center text-xs font-semibold text-white">
          Local POS startup failed: {status.error}
        </div>
      )}
      {status.state === 'ready' && pairing && (
        <div className="fixed inset-x-0 bottom-0 z-[100] bg-slate-900 px-4 py-2 text-center text-xs font-semibold text-white">
          Local POS ready · Captain pairing code: <span className="font-mono tracking-widest">{pairing.code}</span>
        </div>
      )}
      {children}
    </>
  );
}

