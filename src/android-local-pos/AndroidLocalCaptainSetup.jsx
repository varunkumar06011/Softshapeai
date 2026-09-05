import { useEffect, useState } from 'react';
import { createCashierHubClient } from './captainClient';
import { isAndroidLocalCaptainEnabled } from './config';
import { getStoredCashierHub, saveCashierHub, setEdgeCaptainMode } from './hubStorage';
import AndroidLocalCaptainStatus from './AndroidLocalCaptainStatus';

export default function AndroidLocalCaptainSetup({ children }) {
  const enabled = isAndroidLocalCaptainEnabled();
  const [hub, setHub] = useState(() => getStoredCashierHub());
  const [url, setUrl] = useState(() => getStoredCashierHub().url || '');
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState('Captain');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enabled || !hub.url || !hub.token) return undefined;
    const client = createCashierHubClient({ baseUrl: hub.url, token: hub.token });
    client.status().catch(() => {
      setHub({ url: '', token: '' });
    });
    return undefined;
  }, [enabled, hub.url, hub.token]);

  if (!enabled) return children;
  if (hub.url && hub.token) return <AndroidLocalCaptainStatus>{children}</AndroidLocalCaptainStatus>;

  async function pair() {
    setSaving(true);
    setError('');
    try {
      const client = createCashierHubClient({ baseUrl: url });
      const result = await client.pair({ code, deviceName });
      await saveCashierHub({ url, token: result.deviceToken });
      setHub({ url: url.trim().replace(/\/+$/, ''), token: result.deviceToken });
    } catch (pairError) {
      setError(pairError.message || 'Could not pair with Cashier');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto mt-12 max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-bold text-slate-900">Connect to Cashier</h1>
        <p className="mt-2 text-sm text-slate-600">Enter the Cashier tablet address and the pairing code shown on it.</p>
        <label className="mt-5 block text-xs font-bold uppercase tracking-wide text-slate-600">Cashier address</label>
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="http://192.168.1.20:3101" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm" />
        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-600">Pairing code</label>
        <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" maxLength={6} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-lg tracking-[0.4em]" />
        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-600">Device name</label>
        <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button type="button" onClick={pair} disabled={saving || !url.trim() || code.length !== 6} className="mt-5 w-full rounded-lg bg-red-700 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? 'Connecting…' : 'Connect Cashier'}
        </button>
        <button type="button" onClick={() => { setEdgeCaptainMode(); window.location.reload(); }} className="mt-3 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">
          Use PC Edge Server instead
        </button>
      </div>
    </div>
  );
}
