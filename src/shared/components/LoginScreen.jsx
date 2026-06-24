import React, { useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { authService } from '../../services/authService';

const LoginScreen = ({ role, onLogin, onBack }) => {
  const roleTitle = role.charAt(0).toUpperCase() + role.slice(1);
  const isCashier = role === 'cashier';

  // Admin/Owner login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Cashier PIN login state
  const [restaurantSlug, setRestaurantSlug] = useState('');
  const [crew, setCrew] = useState({ cashiers: [] });
  const [crewLoaded, setCrewLoaded] = useState(false);
  const [crewLoading, setCrewLoading] = useState(false);
  const [selectedCashier, setSelectedCashier] = useState(null);
  const [pin, setPin] = useState('');
  const [resolvedRestaurantId, setResolvedRestaurantId] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Admin email+password login
  const handleAdminLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = await authService.login(email.trim(), password);
      onLogin(user.role);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  // Load cashier crew from backend
  const handleLoadCrew = async () => {
    if (!restaurantSlug.trim()) {
      setError('Please enter your Restaurant ID or Slug.');
      return;
    }
    setCrewLoading(true);
    setError('');
    try {
      const data = await authService.fetchCrew(restaurantSlug.trim());
      setCrew({ cashiers: data.cashiers || [] });
      setResolvedRestaurantId(data.restaurantId || restaurantSlug.trim());
      setCrewLoaded(true);
      if ((data.cashiers || []).length === 0) {
        setError('No active cashiers found for this restaurant.');
      }
    } catch (err) {
      setError(err.message || 'Could not load staff. Check Restaurant ID.');
    } finally {
      setCrewLoading(false);
    }
  };

  // Cashier PIN login
  const handleCashierLogin = async () => {
    if (!selectedCashier) {
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
      const user = await authService.captainLogin(selectedCashier.id, pin);
      onLogin(user.role);
    } catch (err) {
      setError(err.message || 'Invalid PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-6 font-sans relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#E53935]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#B71C1C]/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-xl rounded-[48px] border border-gray-100 bg-white p-12 lg:p-16 shadow-[0_32px_64px_rgba(0,0,0,0.04)] relative z-10">
        <button
          onClick={onBack}
          className="absolute left-8 top-8 w-12 h-12 flex items-center justify-center rounded-2xl text-gray-400 hover:bg-gray-50 hover:text-gray-900 transition-all active:scale-90 border border-gray-100"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="mb-10 text-center">
          <div className="flex flex-col items-center justify-center mb-6 gap-2">
            <img
              src="/logo softshape.ai.png"
              alt="Softshape.ai"
              className="h-20 w-auto object-contain"
            />
          </div>
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-widest leading-none">
            {roleTitle} Terminal
          </h2>
          <p className="text-xs text-gray-400 mt-2 font-bold uppercase tracking-widest">
            Enterprise Operational Access
          </p>
        </div>

        <div className="space-y-6">
          {isCashier ? (
            /* ── Cashier PIN Login ── */
            <div className="space-y-6 py-4">
              {!crewLoaded ? (
                /* Step 1: Enter restaurant slug */
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">
                    Restaurant ID / Slug
                  </label>
                  <input
                    className="w-full h-14 rounded-2xl border-2 border-gray-50 bg-gray-50 px-5 text-sm font-bold outline-none focus:border-[#E53935] focus:bg-white transition-all"
                    placeholder="e.g. my-restaurant or restaurant-001"
                    value={restaurantSlug}
                    onChange={e => { setRestaurantSlug(e.target.value); setError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleLoadCrew()}
                  />
                  {error && <p className="text-[12px] font-bold text-red-600 px-1">{error}</p>}
                  <button
                    onClick={handleLoadCrew}
                    disabled={crewLoading}
                    className="w-full h-16 rounded-[24px] bg-[#E53935] px-6 text-sm font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-[#B71C1C] shadow-2xl shadow-red-100 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ShieldCheck size={20} />
                    {crewLoading ? 'Loading…' : 'Load Staff'}
                  </button>
                </div>
              ) : !selectedCashier ? (
                /* Step 2: Select cashier profile */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">
                      Select Your Profile
                    </label>
                    <button
                      onClick={() => { setCrewLoaded(false); setCrew({ cashiers: [] }); setError(''); }}
                      className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-[#E53935]"
                    >
                      ← Change Restaurant
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {crew.cashiers.map(cashier => {
                      const initials = cashier.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                      return (
                        <button
                          key={cashier.id}
                          onClick={() => { setSelectedCashier(cashier); setError(''); }}
                          className="flex items-center gap-3 p-4 rounded-3xl border-2 border-gray-50 bg-gray-50 hover:border-[#E53935] hover:bg-white transition-all group"
                        >
                          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-sm font-black shadow-sm group-hover:scale-110 transition-transform text-[#E53935]">
                            {initials}
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-tight">{cashier.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  {error && <p className="text-[12px] font-bold text-red-600 px-1">{error}</p>}
                </div>
              ) : (
                /* Step 3: Enter PIN */
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setSelectedCashier(null); setPin(''); setError(''); }}
                      className="p-2 text-gray-400 hover:text-gray-900 transition-colors"
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-2xl">
                      <div className="w-8 h-8 rounded-xl bg-[#E53935]/10 text-[#E53935] flex items-center justify-center text-xs font-black">
                        {selectedCashier.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-sm font-bold text-gray-900">{selectedCashier.name}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">
                      Personal 4-Digit PIN
                    </label>
                    <input
                      className="w-full h-16 rounded-[24px] border-2 border-gray-50 bg-gray-50 px-5 text-center text-2xl tracking-[1em] font-black outline-none focus:border-[#E53935] focus:bg-white transition-all"
                      type="password"
                      placeholder="••••"
                      maxLength={4}
                      value={pin}
                      onChange={e => { setPin(e.target.value); setError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleCashierLogin()}
                      autoFocus
                    />
                  </div>
                  {error && <p className="text-[12px] font-bold text-red-600 px-1">{error}</p>}
                  <button
                    onClick={handleCashierLogin}
                    disabled={loading}
                    className="w-full h-16 rounded-[24px] bg-[#E53935] px-6 text-sm font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-[#B71C1C] shadow-2xl shadow-red-100 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ShieldCheck size={20} />
                    {loading ? 'Authenticating…' : 'Authenticate Session'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ── Admin / Owner Email+Password Login ── */
            <div className="space-y-4">
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
            </div>
          )}

          <div className="flex items-center justify-between px-2 pt-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" className="w-4 h-4 rounded border-2 border-gray-200 text-[#E53935] focus:ring-[#E53935]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-gray-600 transition-colors">
                Trust this terminal
              </span>
            </label>
            <button className="text-[10px] font-black uppercase tracking-widest text-[#E53935] hover:underline">
              Forgot Access?
            </button>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-center gap-3 opacity-30 grayscale hover:grayscale-0 transition-all duration-700">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-900">
            Softshape Terminal System
          </p>
          <div className="h-4 w-[1px] bg-gray-400" />
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-900">
            v2.45.12-OPERATIONAL
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
