// ─────────────────────────────────────────────────────────────────────────────
// LoginScreen — Multi-mode login screen (email/password, PIN, phone OTP)
// ─────────────────────────────────────────────────────────────────────────────
// Provides login functionality for all user roles:
//   - Email + Password login (with restaurant join code)
//   - PIN login (captain/cashier quick login with 4-digit PIN)
//   - Phone OTP login (Firebase OTP verification)
//   - Outlet switching (multi-outlet organizations)
//
// On successful login:
//   - Stores JWT token in localStorage
//   - Calls onLogin callback with auth data
//   - Reconnects socket with new JWT token
//
// Props: role (admin/cashier/captain), onLogin, onBack
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Users, Download, Cloud } from 'lucide-react';
import { authService } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import { reconnectSocket } from '../../hooks/useSocket';

<<<<<<< HEAD
const LoginScreen = ({ role, onLogin, onBack }) => {
=======
// Resolves the backend base URL from Vite env vars
function getApiBase() {
  return (
    import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || ''
  );
}

const LoginScreen = ({ role, onLogin, onBack, onEdgeSetup, edgeAvailable }) => {
>>>>>>> 050cfae (end of the heain era)
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const roleTitle = role.charAt(0).toUpperCase() + role.slice(1);
  const isCashier = role === 'cashier';

  // Admin/Owner login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [restaurantCode, setRestaurantCode] = useState('');

  // Captain / Cashier login state
  const [slug, setSlug] = useState('');
  const [staffList, setStaffList] = useState([]);
  const [restaurantId, setRestaurantId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [step, setStep] = useState('slug'); // slug | staff | pin
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Multi-outlet picker state
  const [accessibleOutlets, setAccessibleOutlets] = useState([]);
  const [showOutletPicker, setShowOutletPicker] = useState(false);

  // Trust this terminal — persists session across browser restarts
  const [trustTerminal, setTrustTerminal] = useState(() => {
    return localStorage.getItem('ss_trust_terminal') === 'true';
  });

  // Pre-fill restaurant code from ?code= query param for cashier/captain logins
  useEffect(() => {
    if (!isCashier && role !== 'captain' && role !== 'manager') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) setSlug(code);
  }, [isCashier, role]);

  // Admin email+password login
  const handleAdminLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    if (!restaurantCode.trim()) {
      setError('Please enter your restaurant code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await authService.login(email.trim(), password, restaurantCode.trim());
      localStorage.setItem('ss_trust_terminal', String(trustTerminal));
      if (data.accessibleOutlets && data.accessibleOutlets.length > 1) {
        setAccessibleOutlets(data.accessibleOutlets);
        setShowOutletPicker(true);
        return;
      }
      const { token, user, restaurant } = data;
      setAuth({ token, user, restaurant });
      reconnectSocket(token);
      onLogin(user.role);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleOutletSelect = async (outlet) => {
    setLoading(true);
    setError('');
    try {
      const { token, user, restaurant } = await authService.switchOutlet(outlet.id);
      setShowOutletPicker(false);
      setAccessibleOutlets([]);
      setAuth({ token, user, restaurant });
      reconnectSocket(token);
      onLogin(user.role);
    } catch (err) {
      setError(err.message || 'Failed to switch outlet');
    } finally {
      setLoading(false);
    }
  };

  const handleFetchStaff = async () => {
    if (!slug.trim()) {
      setError('Please enter the restaurant code or slug.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await authService.fetchCrew(slug.trim());
      const staff = isCashier ? data.cashiers : role === 'manager' ? data.managers : data.captains;
      if (!staff || staff.length === 0) {
        const roleLabel = isCashier ? 'cashiers' : role === 'manager' ? 'managers' : 'captains';
        const hint = role === 'manager'
          ? ' Ask an owner/admin to create a Manager in Staff Management.'
          : '';
        throw new Error(`No ${roleLabel} found for this restaurant.${hint}`);
      }
      setStaffList(staff);
      setRestaurantId(data.outletId || data.restaurantId);
      setStep('staff');
    } catch (err) {
      setError(err.message || 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

  const handleCaptainLogin = async () => {
    if (!selectedUser) {
      setError('Please select your profile.');
      return;
    }
    if (!pin || pin.length !== 4) {
      setError('Please enter your 4-digit PIN.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { token, user, restaurant } = await authService.captainLogin(restaurantId, selectedUser.id, pin, '', role);
      localStorage.setItem('ss_trust_terminal', String(trustTerminal));
      setAuth({ token, user, restaurant });
      reconnectSocket(token);
      onLogin(user.role);
    } catch (err) {
      setError(err.message || 'Invalid PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4 sm:p-6 font-sans relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#E53935]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#B71C1C]/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-xl rounded-[32px] sm:rounded-[48px] border border-gray-100 bg-white p-6 sm:p-12 lg:p-16 shadow-[0_32px_64px_rgba(0,0,0,0.04)] relative z-10 mx-auto">
        <button
          onClick={onBack}
          className="absolute left-4 top-4 sm:left-8 sm:top-8 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl text-gray-400 hover:bg-gray-50 hover:text-gray-900 transition-all active:scale-90 border border-gray-100"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="mb-6 sm:mb-10 mt-6 sm:mt-0 text-center">
          <div className="flex flex-col items-center justify-center mb-6 gap-2">
            <img
              src="/logo softshape.ai.png"
              alt="Softshape.ai"
              className="h-20 w-auto object-contain"
            />
          </div>
          <h2 className="text-lg sm:text-xl font-black text-gray-900 uppercase tracking-widest leading-none">
            {roleTitle} Terminal
          </h2>
          <p className="text-xs text-gray-400 mt-2 font-bold uppercase tracking-widest">
            Enterprise Operational Access
          </p>
        </div>

        {role === 'captain' && (
          <a
            href={import.meta.env.VITE_CAPTAIN_ANDROID_DOWNLOAD_URL || 'https://github.com/varunkumar06011/Softshapeai/releases/download/v1.2.7/captain-android.apk'}
            download="SoftShape-Captain.apk"
            className="flex items-center justify-center gap-2 rounded-2xl bg-[#B71C1C] px-4 py-3 text-sm font-black uppercase tracking-widest text-white hover:bg-[#8B0000] transition-colors mb-2"
          >
            <Download size={18} />
            Download Captain App
          </a>
        )}

        <div className="space-y-6">
          {isCashier || role === 'captain' || role === 'manager' ? (
            <div className="space-y-6 py-4">
              {step === 'slug' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Restaurant Code or Slug</label>
                    <input
                      className="w-full h-14 rounded-2xl border-2 border-gray-50 bg-gray-50 px-5 text-sm font-black outline-none focus:border-[#E53935] focus:bg-white transition-all"
                      type="text"
                      value={slug}
                      onChange={(e) => { setSlug(e.target.value); setError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleFetchStaff()}
                      placeholder="e.g. your-restaurant-code"
                    />
                  </div>
                  {error && (
                    <p className="text-[12px] font-bold text-red-600 px-1">{error}</p>
                  )}
                  <button
                    onClick={handleFetchStaff}
                    disabled={loading}
                    className="w-full h-16 rounded-[24px] bg-[#E53935] px-6 text-sm font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-[#B71C1C] shadow-2xl shadow-red-100 hover:scale-[1.02] active:scale-[0.98] mt-4 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Users size={20} /> {loading ? 'Loading…' : 'Find Staff'}
                  </button>
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
                        className={`flex items-center gap-3 p-4 rounded-3xl border-2 transition-all group ${selectedUser?.id === user.id ? 'border-[#E53935] bg-white' : 'border-gray-50 bg-gray-50 hover:border-[#E53935] hover:bg-white'}`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-lg shadow-sm group-hover:scale-110 transition-transform">
                          {user.name.includes('Lakshmi') || user.name.includes('Meena') ? '👩‍💼' : '👨‍💼'}
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-tight">{user.name}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setStep('slug'); setStaffList([]); setSelectedUser(null); }}
                    className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600"
                  >
                    &larr; Back to slug
                  </button>
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
                      placeholder="••••"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => { setPin(e.target.value); setError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleCaptainLogin()}
                    />
                  </div>
                  {error && (
                    <p className="text-[12px] font-bold text-red-600 px-1">{error}</p>
                  )}
                  <button
                    onClick={handleCaptainLogin}
                    disabled={loading}
                    className="w-full h-16 rounded-[24px] bg-[#E53935] px-6 text-sm font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-[#B71C1C] shadow-2xl shadow-red-100 hover:scale-[1.02] active:scale-[0.98] mt-4 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ShieldCheck size={20} /> {loading ? 'Authenticating…' : 'Authenticate Session'}
                  </button>
                  <button
                    onClick={() => { setStep('staff'); setPin(''); setError(''); }}
                    className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600"
                  >
                    &larr; Back to staff list
                  </button>
                </>
              )}
            </div>
          ) : (
            /* ── Admin / Owner Email+Password Login ── */
            <div className="space-y-4">
              {showOutletPicker ? (
                <div className="space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Select Outlet</p>
                  <div className="grid gap-3">
                    {accessibleOutlets.map(outlet => (
                      <button
                        key={outlet.id}
                        onClick={() => handleOutletSelect(outlet)}
                        disabled={loading}
                        className="w-full text-left p-4 rounded-2xl border-2 border-gray-50 bg-gray-50 hover:border-[#E53935] hover:bg-white transition-all disabled:opacity-50"
                      >
                        <p className="text-sm font-black text-gray-900">{outlet.name}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{outlet.restaurantCode}</p>
                      </button>
                    ))}
                  </div>
                  {error && <p className="text-[12px] font-bold text-red-600 px-1">{error}</p>}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">
                      Restaurant Code
                    </label>
                <input
                  type="text"
                  value={restaurantCode}
                  onChange={e => { setRestaurantCode(e.target.value); setError(''); }}
                  placeholder="e.g. A3BK9Z"
                  className="w-full h-14 rounded-2xl border-2 border-gray-50 bg-gray-50 px-5 text-sm font-black outline-none focus:border-[#E53935] focus:bg-white transition-all"
                />
                <p className="text-[10px] font-bold text-gray-400 ml-1 mt-1">
                  The 6-character code shown after onboarding
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">
                  Username
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  placeholder="Email address"
                  autoComplete="username"
                  className="w-full h-14 rounded-2xl border-2 border-gray-50 bg-gray-50 px-5 text-sm font-black outline-none focus:border-[#E53935] focus:bg-white transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">
                  Access Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
                  placeholder="Password"
                  autoComplete="current-password"
                  className="w-full h-14 rounded-2xl border-2 border-gray-50 bg-gray-50 px-5 text-sm font-black outline-none focus:border-[#E53935] focus:bg-white transition-all"
                />
              </div>
              {error && <p className="text-[12px] font-bold text-red-600 px-1">{error}</p>}
              <button
                onClick={handleAdminLogin}
                disabled={loading}
                className="w-full h-16 rounded-[24px] bg-[#E53935] px-6 text-sm font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-[#B71C1C] shadow-2xl shadow-red-100 hover:scale-[1.02] active:scale-[0.98] mt-4 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShieldCheck size={20} />
                {loading ? 'Authenticating…' : 'Authenticate Session'}
              </button>
            </>
          )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-2 pt-2 gap-4 sm:gap-0">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={trustTerminal}
                onChange={(e) => setTrustTerminal(e.target.checked)}
                className="w-5 h-5 sm:w-4 sm:h-4 rounded border-2 border-gray-200 text-[#E53935] focus:ring-[#E53935]"
              />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-gray-600 transition-colors">
                Trust this terminal
              </span>
            </label>
            <button onClick={() => navigate('/forgot-password')} className="text-[10px] font-black uppercase tracking-widest text-[#E53935] hover:underline">
              Forgot Access?
            </button>
          </div>
        </div>

        {isCashier && onEdgeSetup && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <button
              onClick={onEdgeSetup}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl border-2 border-gray-100 bg-gray-50 text-xs font-black uppercase tracking-widest text-gray-500 hover:border-rose-300 hover:text-rose-600 hover:bg-rose-50 transition-all"
            >
              <Cloud size={16} />
              Link to Cloud Restaurant
            </button>
            {edgeAvailable && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-600">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Edge server connected
              </span>
            )}
          </div>
        )}

        <div className="mt-8 sm:mt-12 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 opacity-40 sm:opacity-30 grayscale hover:grayscale-0 transition-all duration-700">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-900">
            Softshape Terminal System
          </p>
          <div className="hidden sm:block h-4 w-[1px] bg-gray-400" />
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-900">
            v{__APP_VERSION__ || '0.0.0'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
