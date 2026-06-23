import React, { useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { authService } from '../../services/authService';

const LoginScreen = ({ role, onLogin, onBack }) => {
  const roleTitle = role.charAt(0).toUpperCase() + role.slice(1);
  const isCashier = role === 'cashier';
  const isCaptain = role === 'captain';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [selectedCaptain, setSelectedCaptain] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = await authService.login(email, password, 'restaurant-001');
      onLogin(user.role);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleCaptainLogin = async () => {
    if (!selectedCaptain) {
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
      const user = await authService.captainLogin(selectedCaptain, pin, 'restaurant-001');
      onLogin(user.role);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-6 font-sans relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#E53935]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#B71C1C]/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-xl rounded-[48px] border border-gray-100 bg-white p-12 lg:p-16 shadow-[0_32px_64px_rgba(0,0,0,0.04)] relative z-10 animate-fade-in">
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
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-widest leading-none">{roleTitle} Terminal</h2>
          <p className="text-xs text-gray-400 mt-2 font-bold uppercase tracking-widest">Enterprise Operational Access</p>
        </div>

        <div className="space-y-6">

          {isCaptain ? (
            <div className="space-y-6 py-4">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Select Your Profile</label>
              <div className="grid grid-cols-2 gap-4">
                {['Ajay Kumar', 'Raja Behera', 'Sagar', 'Durga Prasad', 'Subbaiah', 'Happy', 'Subbu', 'Sunil', 'Rama Rao'].map(name => (
                  <button
                    key={name}
                    onClick={() => { setSelectedCaptain(name); setError(''); }}
                    className={`flex items-center gap-3 p-4 rounded-3xl border-2 transition-all group ${selectedCaptain === name ? 'border-[#E53935] bg-white' : 'border-gray-50 bg-gray-50 hover:border-[#E53935] hover:bg-white'}`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-lg shadow-sm group-hover:scale-110 transition-transform">
                      {name.includes('Lakshmi') || name.includes('Meena') ? '👩‍💼' : '👨‍💼'}
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-tight">{name}</span>
                  </button>
                ))}
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
            </div>

          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Username</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="Email address"
                  autoComplete="username"
                  className="w-full h-14 rounded-2xl border-2 border-gray-50 bg-gray-50 px-5 text-sm font-black outline-none focus:border-[#E53935] focus:bg-white transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Access Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Password"
                  autoComplete="current-password"
                  className="w-full h-14 rounded-2xl border-2 border-gray-50 bg-gray-50 px-5 text-sm font-black outline-none focus:border-[#E53935] focus:bg-white transition-all"
                />
              </div>

              {error && (
                <p className="text-[12px] font-bold text-red-600 px-1">{error}</p>
              )}

              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full h-16 rounded-[24px] bg-[#E53935] px-6 text-sm font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-[#B71C1C] shadow-2xl shadow-red-100 hover:scale-[1.02] active:scale-[0.98] mt-4 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShieldCheck size={20} /> {loading ? 'Authenticating…' : 'Authenticate Session'}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between px-2 pt-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" className="w-4 h-4 rounded border-2 border-gray-200 text-[#E53935] focus:ring-[#E53935]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-gray-600 transition-colors">Trust this terminal</span>
            </label>
            <button className="text-[10px] font-black uppercase tracking-widest text-[#E53935] hover:underline">Forgot Access?</button>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-center gap-3 opacity-30 grayscale hover:grayscale-0 transition-all duration-700">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-900">Softshape Terminal System</p>
          <div className="h-4 w-[1px] bg-gray-400" />
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-900">v2.45.12-OPERATIONAL</p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
