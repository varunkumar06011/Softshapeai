import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { edgeFetch } from '../services/edgeHealth';

// "This PC" setup for restaurants that run more than one billing PC
// (e.g. dine-in + an outside curry point). Settings live only on this PC's
// edge runtime — they are not synced to the cloud, so one PC never changes
// another PC's values. Leave everything at the defaults for a single-PC restaurant.
const PcSetupModal = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState('');
  const [billPrefix, setBillPrefix] = useState('');
  const [captainHub, setCaptainHub] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const scope = await edgeFetch('/api/edge/device-scope');
        if (cancelled) return;
        setVenues(scope.availableVenues || []);
        setVenueId(scope.boundVenueId || '');
        setBillPrefix(scope.billPrefix || '');
        setCaptainHub(scope.captainHub !== false);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Could not reach the runtime on this PC');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const scope = await edgeFetch('/api/edge/device-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boundVenueId: venueId || null,
          billPrefix: billPrefix.trim() || null,
          captainHub,
        }),
      });
      setVenueId(scope.boundVenueId || '');
      setBillPrefix(scope.billPrefix || '');
      setCaptainHub(scope.captainHub !== false);
      setSaved(true);
    } catch (e) {
      setError(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl text-slate-800">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-black">This PC</h2>
            <p className="text-xs text-slate-500 mt-1">
              Only needed when the restaurant has more than one billing PC. Saved on this PC only.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100" aria-label="Close"><X size={20} /></button>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-5 space-y-5">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-slate-600">Venue served by this PC</span>
              <select
                value={venueId}
                onChange={(e) => { setVenueId(e.target.value); setSaved(false); }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All venues (default)</option>
                {venues.map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}
              </select>
              <span className="block mt-1 text-[11px] text-slate-500">This PC will only show and bill this venue's tables and sections.</span>
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-slate-600">Bill number prefix</span>
              <input
                value={billPrefix}
                maxLength={6}
                onChange={(e) => { setBillPrefix(e.target.value.replace(/[^A-Za-z0-9-]/g, '')); setSaved(false); }}
                placeholder="e.g. D-  or  C-"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <span className="block mt-1 text-[11px] text-slate-500">Use a different prefix on each PC so bill numbers never repeat. Leave empty for a single PC.</span>
            </label>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={captainHub}
                onChange={(e) => { setCaptainHub(e.target.checked); setSaved(false); }}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="block text-sm font-bold">Captains connect to this PC</span>
                <span className="block text-[11px] text-slate-500">Turn off on a counter PC that has no captains, so captain phones never pick it by mistake.</span>
              </span>
            </label>

            {error && <p className="text-sm font-bold text-red-600">{error}</p>}
            {saved && <p className="text-sm font-bold text-green-600">Saved. Reload the cashier screen to see the change.</p>}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-100">Close</button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[#F59E0B] text-[#1E293B] text-sm font-black disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PcSetupModal;
