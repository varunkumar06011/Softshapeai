// ─────────────────────────────────────────────────────────────────────────────
// ResetPasswordPage — Password reset form with token validation
// ─────────────────────────────────────────────────────────────────────────────
// Allows users to set a new password using a reset token:
//   - Extracts JWT token from URL query parameter
//   - Validates token with backend (POST /api/auth/verify-reset-token)
//   - New password and confirm password fields (with show/hide toggle)
//   - Password strength indicator
//   - Submits new password to backend (POST /api/auth/reset-password)
//   - Redirects to login on success
//
// Token expires after 15 minutes (enforced by backend).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react';

// Resolves the backend base URL from Vite env vars
function getApiBase() {
  return import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || '';
}

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    setToken(t || null);
  }, []);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => navigate('/'), 2000);
      return () => clearTimeout(timer);
    }
  }, [success, navigate]);

  const validate = () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
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
          onClick={() => navigate('/')}
          className="absolute left-4 top-4 sm:left-8 sm:top-8 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl text-gray-400 hover:bg-gray-50 hover:text-gray-900 transition-all active:scale-90 border border-gray-100"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="mb-8 mt-6 sm:mt-0 text-center">
          <div className="flex flex-col items-center justify-center mb-6">
            <img
              src="/logo softshape.ai.png"
              alt="Softshape.ai"
              className="h-20 w-auto object-contain"
            />
          </div>
          <h2 className="text-lg sm:text-xl font-black text-gray-900 uppercase tracking-widest leading-none">
            New Password
          </h2>
          <p className="text-xs text-gray-400 mt-2 font-bold uppercase tracking-widest">
            Secure Account Recovery
          </p>
        </div>

        {!token ? (
          <div className="flex flex-col items-center gap-5 py-4">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
              <span className="text-3xl">⚠️</span>
            </div>
            <p className="text-sm font-black text-red-600 text-center">
              Invalid or missing reset link.
            </p>
            <p className="text-[11px] font-bold text-gray-400 text-center">
              Please request a new password reset link.
            </p>
            <button
              onClick={() => navigate('/forgot-password')}
              className="mt-2 text-[11px] font-black uppercase tracking-widest text-[#E53935] hover:underline"
            >
              Request New Link
            </button>
          </div>
        ) : success ? (
          <div className="flex flex-col items-center gap-5 py-4">
            <CheckCircle size={48} className="text-green-500" />
            <p className="text-sm font-black text-gray-700 text-center">
              Password reset successfully!
            </p>
            <p className="text-[11px] font-bold text-gray-400 text-center">
              Redirecting to login…
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  className="w-full h-14 rounded-2xl border-2 border-gray-50 bg-gray-50 px-5 pr-12 text-sm font-black outline-none focus:border-[#E53935] focus:bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  className="w-full h-14 rounded-2xl border-2 border-gray-50 bg-gray-50 px-5 pr-12 text-sm font-black outline-none focus:border-[#E53935] focus:bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {password.length > 0 && (
              <div className="flex gap-1 px-1">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-all ${
                      password.length >= (i + 1) * 2
                        ? password.length >= 12
                          ? 'bg-green-500'
                          : password.length >= 8
                          ? 'bg-yellow-400'
                          : 'bg-red-400'
                        : 'bg-gray-100'
                    }`}
                  />
                ))}
              </div>
            )}

            {error && <p className="text-[12px] font-bold text-red-600 px-1">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full h-16 rounded-[24px] bg-[#E53935] px-6 text-sm font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-[#B71C1C] shadow-2xl shadow-red-100 hover:scale-[1.02] active:scale-[0.98] mt-4 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 size={18} className="animate-spin" /> Resetting…</>
              ) : (
                'Reset Password'
              )}
            </button>

            <div className="text-center pt-2">
              <button
                onClick={() => navigate('/')}
                className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Back to Login
              </button>
            </div>
          </div>
        )}

        <div className="mt-8 sm:mt-12 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 opacity-40 sm:opacity-30 grayscale hover:grayscale-0 transition-all duration-700">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-900">
            Softshape Terminal System
          </p>
          <div className="hidden sm:block h-4 w-[1px] bg-gray-400" />
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-900">
            v2.45.12-OPERATIONAL
          </p>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
