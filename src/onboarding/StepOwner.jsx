import React, { useState, useRef, useEffect } from 'react';
import { User, Mail, Lock, ShieldCheck, Eye, EyeOff, Smartphone, Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { firebaseAuth, RecaptchaVerifier, signInWithPhoneNumber } from '../lib/firebase';
import { apiFetch } from '../services/apiConfig';

function getApiBase() {
  return import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || '';
}

function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return '+91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  if (raw.startsWith('+')) return raw.trim();
  return '+' + digits;
}

const StepOwner = ({ data, onChange, onNext, onBack, sessionId }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});

  // Email OTP state
  const [emailOtpStatus, setEmailOtpStatus] = useState('idle'); // idle | sending | sent | verifying | verified | error
  const [emailOtp, setEmailOtp] = useState('');
  const [emailError, setEmailError] = useState('');

  // Phone OTP state
  const [phoneOtpStatus, setPhoneOtpStatus] = useState('idle');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const recaptchaRef = useRef(null);
  const recaptchaContainerId = 'recaptcha-container-owner';

  // Timer state
  const [emailTimeLeft, setEmailTimeLeft] = useState(300);
  const [phoneTimeLeft, setPhoneTimeLeft] = useState(120);
  const emailTimerRef = useRef(null);
  const phoneTimerRef = useRef(null);

  // Clear phone verification state and timers on unmount
  useEffect(() => {
    return () => {
      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch {}
        recaptchaRef.current = null;
      }
      if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch {}
        window.recaptchaVerifier = null;
      }
      clearInterval(emailTimerRef.current);
      clearInterval(phoneTimerRef.current);
    };
  }, []);

  const formatTimer = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const startEmailTimer = () => {
    setEmailTimeLeft(300);
    clearInterval(emailTimerRef.current);
    emailTimerRef.current = setInterval(() => {
      setEmailTimeLeft(prev => {
        if (prev <= 1) { clearInterval(emailTimerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const startPhoneTimer = () => {
    setPhoneTimeLeft(120);
    clearInterval(phoneTimerRef.current);
    phoneTimerRef.current = setInterval(() => {
      setPhoneTimeLeft(prev => {
        if (prev <= 1) { clearInterval(phoneTimerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleChange = (field, value) => {
    // Proof invalidation: if email changes after verification, clear the proof
    if (field === 'email' && data.emailVerificationProof && value !== data.email) {
      onChange({ ...data, [field]: value, emailVerificationProof: undefined });
    } else if (field === 'phone' && data.phoneVerificationProof && value !== data.phone) {
      onChange({ ...data, [field]: value, phoneVerificationProof: undefined });
    } else {
      onChange({ ...data, [field]: value });
    }
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!data.name || data.name.length < 2) newErrors.name = 'Name must be at least 2 characters';
    if (!data.email || !data.email.includes('@')) newErrors.email = 'Please enter a valid email address';
    if (!data.phone || data.phone.length < 10) newErrors.phone = 'Please enter a valid phone number';
    if (!data.password || data.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    if (data.password !== data.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = () => {
    if (validate()) {
      onNext();
    }
  };

  // ── Email OTP ──────────────────────────────────────────────
  const sendEmailOtp = async () => {
    if (!data.email || !data.email.includes('@')) {
      setEmailError('Please enter a valid email first');
      return;
    }
    setEmailOtpStatus('sending');
    setEmailError('');
    try {
      await apiFetch('/api/verify/email/send', {
        method: 'POST',
        body: JSON.stringify({ email: data.email, sessionId })
      });
      setEmailOtpStatus('sent');
      startEmailTimer();
    } catch (err) {
      setEmailError(err.message || 'Failed to send code');
      setEmailOtpStatus('error');
    }
  };

  const verifyEmailOtp = async () => {
    if (!emailOtp || emailOtp.length !== 6) {
      setEmailError('Enter the 6-digit code');
      return;
    }
    setEmailOtpStatus('verifying');
    setEmailError('');
    try {
      const res = await apiFetch('/api/verify/email/verify', {
        method: 'POST',
        body: JSON.stringify({ email: data.email, sessionId, otp: emailOtp })
      });
      onChange({ ...data, emailVerificationProof: res.proof });
      setEmailOtpStatus('verified');
    } catch (err) {
      setEmailError(err.message || 'Invalid code');
      setEmailOtpStatus('sent');
    }
  };

  // ── Phone OTP (Firebase) ─────────────────────────────────
  const sendPhoneOtp = async () => {
    if (!data.phone || data.phone.length < 10) {
      setPhoneError('Please enter a valid phone number first');
      return;
    }
    setPhoneOtpStatus('sending');
    setPhoneError('');
    try {
      // Fully destroy existing reCAPTCHA instance
      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch {}
        recaptchaRef.current = null;
      }
      if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch {}
        window.recaptchaVerifier = null;
      }

      // Wipe and re-inject the container div so reCAPTCHA sees a clean element
      const container = document.getElementById(recaptchaContainerId);
      if (container) {
        container.innerHTML = '';
        // Force DOM reset by replacing the node
        const fresh = document.createElement('div');
        fresh.id = recaptchaContainerId;
        container.parentNode.replaceChild(fresh, container);
      }

      // Small delay to let DOM settle
      await new Promise(r => setTimeout(r, 100));

      recaptchaRef.current = new RecaptchaVerifier(firebaseAuth, recaptchaContainerId, {
        size: 'invisible',
        callback: () => {},
        'expired-callback': () => {
          setPhoneError('reCAPTCHA expired. Please try again.');
          setPhoneOtpStatus('error');
        }
      });
      window.recaptchaVerifier = recaptchaRef.current;

      const phone = normalizePhone(data.phone);
      const result = await signInWithPhoneNumber(firebaseAuth, phone, recaptchaRef.current);
      setConfirmationResult(result);
      setPhoneOtpStatus('sent');
      startPhoneTimer();
    } catch (err) {
      // Clean up on failure so next attempt starts fresh
      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch {}
        recaptchaRef.current = null;
      }
      window.recaptchaVerifier = null;
      setPhoneError(err.message || 'Failed to send SMS');
      setPhoneOtpStatus('error');
    }
  };

  const verifyPhoneOtp = async () => {
    if (!phoneOtp || phoneOtp.length < 4) {
      setPhoneError('Enter the verification code');
      return;
    }
    setPhoneOtpStatus('verifying');
    setPhoneError('');
    try {
      const credential = await confirmationResult.confirm(phoneOtp);
      const idToken = await credential.user.getIdToken();
      const res = await apiFetch('/api/verify/phone/verify', {
        method: 'POST',
        body: JSON.stringify({ idToken, sessionId })
      });
      onChange({ ...data, phoneVerificationProof: res.proof });
      setPhoneOtpStatus('verified');
    } catch (err) {
      setPhoneError(err.message || 'Invalid code');
      setPhoneOtpStatus('sent');
    }
  };

  const allVerified = data.emailVerificationProof && data.phoneVerificationProof;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <User size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Owner Account</h2>
        <p className="text-gray-500">Create your admin account and verify your contact details</p>
      </div>

      {/* Invisible reCAPTCHA mount point */}
      <div id={recaptchaContainerId} />

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">Your Name *</label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className={`w-full px-4 py-3 bg-gray-50 border rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900 ${errors.name ? 'border-red-500' : 'border-gray-100'}`}
            placeholder="e.g., John Doe"
          />
          {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
        </div>

        {/* Email + OTP */}
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">Email Address *</label>
          <div className="relative">
            <Mail size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type="email"
              value={data.email}
              onChange={(e) => handleChange('email', e.target.value)}
              disabled={data.emailVerificationProof}
              className={`w-full pl-10 pr-24 py-3 bg-gray-50 border rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900 disabled:opacity-60 ${errors.email ? 'border-red-500' : 'border-gray-100'}`}
              placeholder="e.g., owner@example.com"
            />
            <button
              type="button"
              onClick={sendEmailOtp}
              disabled={emailOtpStatus === 'sending' || emailOtpStatus === 'verifying' || data.emailVerificationProof}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-semibold bg-[#E53935] text-white rounded-lg hover:bg-[#B71C1C] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {data.emailVerificationProof ? 'Verified' : emailOtpStatus === 'sending' ? 'Sending…' : 'Send Code'}
            </button>
          </div>
          {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
          {emailError && <p className="text-red-400 text-xs mt-1">{emailError}</p>}

          {emailOtpStatus === 'error' && !data.emailVerificationProof && (
            <div className="mt-1">
              <button type="button" onClick={sendEmailOtp} className="text-xs text-[#E53935] cursor-pointer hover:underline">Resend Code</button>
            </div>
          )}
          {(emailOtpStatus === 'sent' || emailOtpStatus === 'verifying') && !data.emailVerificationProof && (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={emailOtp}
                  onChange={(e) => setEmailOtp(e.target.value)}
                  placeholder="6-digit code"
                  className="w-32 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900 text-center text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={verifyEmailOtp}
                  disabled={emailOtpStatus === 'verifying'}
                  className="px-4 py-2 text-xs font-semibold bg-[#E53935] text-white rounded-lg hover:bg-[#B71C1C] disabled:opacity-50 transition-all"
                >
                  {emailOtpStatus === 'verifying' ? <Loader2 size={14} className="animate-spin inline" /> : 'Verify'}
                </button>
              </div>
              <div className="flex items-center justify-between px-0.5">
                <span className="text-xs text-gray-400">
                  {emailTimeLeft > 0 ? `Code expires in ${formatTimer(emailTimeLeft)}` : 'Code expired.'}
                </span>
                {(emailTimeLeft === 0 || emailTimeLeft <= 240) ? (
                  <button type="button" onClick={sendEmailOtp} className="text-xs text-[#E53935] cursor-pointer hover:underline">Resend Code</button>
                ) : (
                  <span className="text-xs text-gray-400">Resend in {formatTimer(emailTimeLeft - 240)}</span>
                )}
              </div>
            </div>
          )}
          {data.emailVerificationProof && (
            <p className="text-green-600 text-xs mt-1 flex items-center gap-1"><CheckCircle size={12} /> Email verified</p>
          )}
        </div>

        {/* Phone + OTP */}
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">Phone Number *</label>
          <div className="relative">
            <Smartphone size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <span className="absolute left-[2.25rem] top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 select-none pointer-events-none">+91</span>
            <input
              type="tel"
              value={data.phone?.replace(/\D/g, '').replace(/^91/, '') || ''}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                handleChange('phone', digits);
              }}
              disabled={data.phoneVerificationProof}
              className={`w-full pl-[5rem] pr-24 py-3 bg-gray-50 border rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900 disabled:opacity-60 ${errors.phone ? 'border-red-500' : 'border-gray-100'}`}
              placeholder="9876543210"
            />
            <button
              type="button"
              onClick={sendPhoneOtp}
              disabled={phoneOtpStatus === 'sending' || phoneOtpStatus === 'verifying' || data.phoneVerificationProof}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-semibold bg-[#E53935] text-white rounded-lg hover:bg-[#B71C1C] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {data.phoneVerificationProof ? 'Verified' : phoneOtpStatus === 'sending' ? 'Sending…' : 'Send OTP'}
            </button>
          </div>
          {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
          {phoneError && <p className="text-red-400 text-xs mt-1">{phoneError}</p>}

          {phoneOtpStatus === 'error' && !data.phoneVerificationProof && (
            <div className="mt-1">
              <button type="button" onClick={sendPhoneOtp} className="text-xs text-[#E53935] cursor-pointer hover:underline">Resend OTP</button>
            </div>
          )}
          {(phoneOtpStatus === 'sent' || phoneOtpStatus === 'verifying') && !data.phoneVerificationProof && (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={phoneOtp}
                  onChange={(e) => setPhoneOtp(e.target.value)}
                  placeholder="Enter OTP"
                  className="w-32 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900 text-center text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={verifyPhoneOtp}
                  disabled={phoneOtpStatus === 'verifying'}
                  className="px-4 py-2 text-xs font-semibold bg-[#E53935] text-white rounded-lg hover:bg-[#B71C1C] disabled:opacity-50 transition-all"
                >
                  {phoneOtpStatus === 'verifying' ? <Loader2 size={14} className="animate-spin inline" /> : 'Verify'}
                </button>
              </div>
              <div className="flex items-center justify-between px-0.5">
                <span className="text-xs text-gray-400">
                  {phoneTimeLeft > 0 ? `Code expires in ${formatTimer(phoneTimeLeft)}` : 'Code expired.'}
                </span>
                {(phoneTimeLeft === 0 || phoneTimeLeft <= 60) ? (
                  <button type="button" onClick={sendPhoneOtp} className="text-xs text-[#E53935] cursor-pointer hover:underline">Resend OTP</button>
                ) : (
                  <span className="text-xs text-gray-400">Resend in {formatTimer(phoneTimeLeft - 60)}</span>
                )}
              </div>
            </div>
          )}
          {data.phoneVerificationProof && (
            <p className="text-green-600 text-xs mt-1 flex items-center gap-1"><CheckCircle size={12} /> Phone verified</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">Password *</label>
          <div className="relative">
            <Lock size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={data.password}
              onChange={(e) => handleChange('password', e.target.value)}
              className={`w-full pl-10 pr-12 py-3 bg-gray-50 border rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900 ${errors.password ? 'border-red-500' : 'border-gray-100'}`}
              placeholder="Min 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-[#E53935] focus:outline-none"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {errors.password ? (
            <p className="text-red-400 text-xs mt-1">{errors.password}</p>
          ) : (
            <p className="text-xs text-gray-400 mt-1">Must be at least 8 characters</p>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">Confirm Password *</label>
          <div className="relative">
            <ShieldCheck size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={data.confirmPassword}
              onChange={(e) => handleChange('confirmPassword', e.target.value)}
              className={`w-full pl-10 pr-12 py-3 bg-gray-50 border rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900 ${errors.confirmPassword ? 'border-red-500' : 'border-gray-100'}`}
              placeholder="Re-enter password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-[#E53935] focus:outline-none"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {errors.confirmPassword && <p className="text-red-400 text-xs mt-1">{errors.confirmPassword}</p>}
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          disabled={!allVerified}
          className="flex-1 py-3 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
      {!allVerified && (
        <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
          <AlertCircle size={12} /> Verify both email and phone to continue
        </p>
      )}
    </div>
  );
};

export default StepOwner;
