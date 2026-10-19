// ─────────────────────────────────────────────────────────────────────────────
// CaptainEdgeLogin — captain login through the outlet's billing PC
// ─────────────────────────────────────────────────────────────────────────────
// The captain app is edge-only (see services/captainEdgeOnly.js):
//   1. Outlet — the billing PCs on this WiFi are found automatically and
//      listed by outlet name. Captains move between outlets, so the outlet is
//      picked at every login. No code to type, no cloud. If the search does
//      not find a PC, its address (shown on the cashier screen) can be typed.
//   2. Staff — the captain list comes from that outlet's PC.
//   3. PIN  — checked by that PC, which also hands out the LAN credentials.
// Two outlets sharing one WiFi each appear once; a captain can only ever log
// in to the PC of the outlet they picked.
// ─────────────────────────────────────────────────────────────────────────────

/* global __APP_VERSION__ */
import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, ShieldCheck, Store, RefreshCw, Wifi } from 'lucide-react';
import { authService } from '../services/authService';
import { useAuth } from '../context/AuthContext';
import { discoverEdgeOnLAN, findBillingPcsOnLan, isCurrentEdgeForOutlet, stopUsingManualEdgeUrl, probeBillingPcAt } from '../services/edgeHealth';

const LAST_PC_ADDRESS_KEY = 'captain_last_pc_address';

const CaptainEdgeLogin = ({ onBack }) => {
  const { setAuth } = useAuth();
  const [step, setStep] = useState('outlet'); // outlet | staff | pin
  const [outlets, setOutlets] = useState([]);
  const [scanning, setScanning] = useState(true);
  const [outlet, setOutlet] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAddress, setShowAddress] = useState(false);
  const [pcAddress, setPcAddress] = useState(() => {
    try { return localStorage.getItem(LAST_PC_ADDRESS_KEY) || ''; } catch { return ''; }
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const scan = useCallback(async () => {
    setStep('outlet');
    setScanning(true);
    setOutlets([]);
    setError('');
    const found = await findBillingPcsOnLan({
      forCaptain: true,
      onFound: list => { if (mountedRef.current) setOutlets(list); },
    }).catch(() => []);
    if (!mountedRef.current) return;
    setOutlets(found);
    setScanning(false);
    if (found.length === 0) {
      setError('No billing PC found on this WiFi. Connect this phone to the restaurant WiFi and make sure the billing PC is on, then search again.');
    }
  }, []);

  // Connect to the outlet's PC and load its captains.
  const openOutlet = useCallback(async (target) => {
    setLoading(true);
    setError('');
    try {
      const url = await discoverEdgeOnLAN({ expectedRestaurantId: target.outletId, forCaptain: true, force: true }).catch(() => null);
      if (!url || !(await isCurrentEdgeForOutlet(target.outletId))) {
        throw new Error(`${target.name}'s billing PC was not found on this WiFi.`);
      }
      const staff = await authService.fetchCaptainsFromEdge(url);
      if (staff.length === 0) throw new Error(`No captains are set up for ${target.name}.`);
      if (!mountedRef.current) return false;
      setOutlet(target);
      setStaffList(staff);
      setStep('staff');
      return true;
    } catch (err) {
      if (mountedRef.current) setError(err.message || 'Could not reach the billing PC.');
      return false;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // The search did not find the PC (or it is on another part of the network):
  // check the address the captain typed and open that outlet.
  const connectByAddress = async () => {
    if (!pcAddress.trim()) { setError('Enter the billing PC address, e.g. 192.168.1.50'); return; }
    setLoading(true);
    setError('');
    const found = await probeBillingPcAt(pcAddress).catch(() => null);
    setLoading(false);
    if (!mountedRef.current) return;
    if (!found) {
      setError(`No billing PC answered at ${pcAddress.trim()}. Check the address shown on the billing PC screen, and that this phone is on the same WiFi.`);
      return;
    }
    try { localStorage.setItem(LAST_PC_ADDRESS_KEY, pcAddress.trim()); } catch { /* ignore */ }
    setOutlets(prev => (prev.some(o => o.outletId === found.outletId) ? prev : [...prev, found]));
    setShowAddress(false);
    await openOutlet(found);
  };

  // PCs found before are checked first, so both outlets usually show within
  // a second; the rest of the WiFi is searched while the list is on screen.
  useEffect(() => {
    stopUsingManualEdgeUrl();
    try { localStorage.removeItem('softshape_captain_outlet'); } catch { /* ignore */ }
    const timer = setTimeout(scan, 0);
    return () => clearTimeout(timer);
  }, [scan]);

  const handleLogin = async () => {
    if (!selectedUser) { setError('Please select your profile.'); return; }
    if (!pin || pin.length !== 4) { setError('Please enter your 4-digit PIN.'); return; }
    setLoading(true);
    setError('');
    try {
      const { token, user, restaurant } = await authService.captainEdgeLogin(outlet.outletId, selectedUser.id, pin);
      setAuth({ token, user, restaurant });
    } catch (err) {
      setError(err.message || 'Invalid PIN');
      setPin('');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const changeOutlet = () => {
    setOutlet(null);
    setSelectedUser(null);
    setPin('');
    scan();
  };

  const primaryButton = 'w-full h-16 rounded-[24px] bg-[#E53935] px-6 text-sm font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-[#B71C1C] shadow-2xl shadow-red-100 active:scale-[0.98] mt-4 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed';
  const linkButton = 'text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4 sm:p-6 font-sans relative overflow-hidden">
      <div className="w-full max-w-xl rounded-[32px] sm:rounded-[48px] border border-gray-100 bg-white p-6 sm:p-12 shadow-[0_32px_64px_rgba(0,0,0,0.04)] relative z-10 mx-auto">
        <button
          onClick={onBack}
          className="absolute left-4 top-4 sm:left-8 sm:top-8 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl text-gray-400 hover:bg-gray-50 hover:text-gray-900 transition-all active:scale-90 border border-gray-100"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="mb-6 sm:mb-10 mt-6 sm:mt-0 text-center">
          <div className="flex justify-center mb-6">
            <img src="/logo softshape.ai.png" alt="Softshape" className="h-20 w-auto object-contain" />
          </div>
          <h2 className="text-lg sm:text-xl font-black text-gray-900 uppercase tracking-widest leading-none">
            Captain Terminal
          </h2>
          {outlet && (
            <p className="text-xs text-gray-500 mt-3 font-bold flex items-center justify-center gap-2">
              <Store size={14} /> {outlet.name}
              <button onClick={changeOutlet} className="text-[#E53935] uppercase tracking-widest text-[10px] font-black hover:underline">Change</button>
            </p>
          )}
        </div>

        <div className="space-y-6">
          {step === 'outlet' && (
            <>
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Select Your Outlet</label>
              <div className="grid gap-3">
                {outlets.map(o => (
                  <button
                    key={o.outletId}
                    onClick={() => openOutlet(o)}
                    disabled={loading}
                    className="w-full text-left p-4 rounded-2xl border-2 border-gray-50 bg-gray-50 hover:border-[#E53935] hover:bg-white transition-all disabled:opacity-50 flex items-center gap-3"
                  >
                    <Store size={18} className="text-[#E53935]" />
                    <span className="text-sm font-black text-gray-900">{o.name}</span>
                  </button>
                ))}
              </div>
              {scanning && (
                <p className="text-xs font-bold text-gray-500 flex items-center gap-2 px-1">
                  <Wifi size={14} className="animate-pulse" /> Searching this WiFi for billing PCs…
                </p>
              )}
              {error && <p className="text-[12px] font-bold text-red-600 px-1">{error}</p>}
              {!scanning && (
                <button onClick={scan} disabled={loading} className={primaryButton}>
                  <RefreshCw size={20} /> Search Again
                </button>
              )}
              {showAddress ? (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Billing PC Address</label>
                  <input
                    className="w-full h-14 rounded-[20px] border-2 border-gray-50 bg-gray-50 px-5 text-center text-lg font-black outline-none focus:border-[#E53935] focus:bg-white transition-all"
                    type="text"
                    inputMode="decimal"
                    autoCapitalize="none"
                    autoCorrect="off"
                    placeholder="e.g. 192.168.1.50"
                    value={pcAddress}
                    onChange={(e) => { setPcAddress(e.target.value); setError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && connectByAddress()}
                  />
                  <p className="text-[11px] font-bold text-gray-400 px-1">Shown at the bottom of the billing PC screen.</p>
                  <button onClick={connectByAddress} disabled={loading} className={primaryButton}>
                    <Store size={20} /> {loading ? 'Checking…' : 'Connect'}
                  </button>
                </div>
              ) : (
                <button onClick={() => { setShowAddress(true); setError(''); }} className={`${linkButton} w-full`}>
                  Enter billing PC address
                </button>
              )}
            </>
          )}

          {step === 'staff' && (
            <>
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Select Your Profile</label>
              <div className="grid grid-cols-2 gap-4">
                {staffList.map(user => (
                  <button
                    key={user.id}
                    onClick={() => { setSelectedUser(user); setError(''); setStep('pin'); }}
                    className="flex items-center gap-3 p-4 rounded-3xl border-2 border-gray-50 bg-gray-50 hover:border-[#E53935] hover:bg-white transition-all"
                  >
                    <span className="text-[11px] font-black uppercase tracking-tight">{user.name}</span>
                  </button>
                ))}
              </div>
              {error && <p className="text-[12px] font-bold text-red-600 px-1">{error}</p>}
            </>
          )}

          {step === 'pin' && (
            <>
              <div className="text-center mb-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Selected</p>
                <p className="text-lg font-black text-gray-900">{selectedUser?.name}</p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Personal 4-Digit PIN</label>
                <input
                  className="w-full h-16 rounded-[24px] border-2 border-gray-50 bg-gray-50 px-5 text-center text-2xl tracking-[1em] font-black outline-none focus:border-[#E53935] focus:bg-white transition-all"
                  type="password"
                  inputMode="numeric"
                  placeholder="••••"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => { setPin(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
              {error && <p className="text-[12px] font-bold text-red-600 px-1">{error}</p>}
              <button onClick={handleLogin} disabled={loading} className={primaryButton}>
                <ShieldCheck size={20} /> {loading ? 'Checking…' : 'Log In'}
              </button>
              <button onClick={() => { setStep('staff'); setPin(''); setError(''); }} className={linkButton}>
                &larr; Back to staff list
              </button>
            </>
          )}
        </div>

        <p className="mt-8 text-center text-[9px] font-black uppercase tracking-[0.2em] text-gray-300">
          v{__APP_VERSION__ || '0.0.0'}
        </p>
      </div>
    </div>
  );
};

export default CaptainEdgeLogin;
