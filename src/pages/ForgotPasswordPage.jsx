// ─────────────────────────────────────────────────────────────────────────────
// ForgotPasswordPage — Password reset request page
// ─────────────────────────────────────────────────────────────────────────────
// Allows users to request a password reset:
//   - User enters restaurant join code and email address
//   - Backend sends a reset link via email (Resend service)
//   - Reset link contains a JWT token valid for 15 minutes
//   - Link redirects to /reset-password page
//
// Endpoint: POST /api/auth/forgot-password
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';

// Resolves the backend base URL from Vite env vars
function getApiBase() {
  return import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || '';
}

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [restaurantCode, setRestaurantCode] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!restaurantCode.trim() || !email.trim()) {
      setError('Please fill in both fields.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          restaurantCode: restaurantCode.trim().toUpperCase(),
        }),
      });
      await res.json();
      // Always show success regardless of whether email exists (privacy-safe)
      setSubmitted(true);
    } catch {
      // Show success even on network error to avoid email enumeration
      setSubmitted(true);
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
            Reset Access
          </h2>
          <p className="text-xs text-gray-400 mt-2 font-bold uppercase tracking-widest">
            Password Recovery
          </p>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center gap-5 py-4">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
              <Mail size={28} className="text-green-500" />
            </div>
            <p className="text-sm font-black text-gray-700 text-center leading-relaxed max-w-xs">
              If this email exists in our system, a password reset link has been sent.
            </p>
            <p className="text-[11px] font-bold text-gray-400 text-center">
              Check your inbox and spam folder.
            </p>
            <button
              onClick={() => navigate('/')}
              className="mt-2 text-[11px] font-black uppercase tracking-widest text-[#E53935] hover:underline"
            >
              ← Back to Login
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">
                Restaurant Code
              </label>
              <input
                type="text"
                value={restaurantCode}
                onChange={e => { setRestaurantCode(e.target.value); setError(''); }}
                placeholder="e.g. YOUR-CODE"
                className="w-full h-14 rounded-2xl border-2 border-gray-50 bg-gray-50 px-5 text-sm font-black outline-none focus:border-[#E53935] focus:bg-white transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="admin@yourrestaurant.com"
                autoComplete="email"
                className="w-full h-14 rounded-2xl border-2 border-gray-50 bg-gray-50 px-5 text-sm font-black outline-none focus:border-[#E53935] focus:bg-white transition-all"
              />
            </div>

            {error && <p className="text-[12px] font-bold text-red-600 px-1">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full h-16 rounded-[24px] bg-[#E53935] px-6 text-sm font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-[#B71C1C] shadow-2xl shadow-red-100 hover:scale-[1.02] active:scale-[0.98] mt-4 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 size={18} className="animate-spin" /> Sending…</>
              ) : (
                'Send Reset Link'
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

export default ForgotPasswordPage;
