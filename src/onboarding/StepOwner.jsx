// ─────────────────────────────────────────────────────────────────────────────
// StepOwner — Owner registration with phone OTP verification (Step 1)
// ─────────────────────────────────────────────────────────────────────────────
// Collects owner account information:
//   - Full name, email address, password (with show/hide toggle)
//   - Phone number with Firebase OTP verification (send + verify)
//   - Supports both web (reCAPTCHA) and Android (Capacitor native) OTP
//   - Email uniqueness check via /api/onboard/check-email
//   - Phone normalization (converts 10-digit to +91 format)
//
// OTP flow:
//   1. User enters phone → click "Send OTP" → Firebase sends OTP
//   2. User enters OTP → click "Verify" → Firebase verifies
//   3. Only after verification can the user proceed to next step
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect } from 'react';
import { User, Mail, Lock, ShieldCheck, Eye, EyeOff, Smartphone, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import {
  sendPhoneOtp as sendOtp,
  verifyPhoneOtp as verifyOtp,
  clearRecaptcha as clearRecaptchaUtil,
  isNativePlatform,
  FirebaseAuthentication,
} from '../lib/phoneAuth';
import { apiFetch } from '../services/apiConfig';

// Normalize phone number to +91XXXXXXXXXX format
function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return '+91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  if (raw.startsWith('+')) return raw.trim();
  return '+' + digits;
}

function getPasswordStrength(password) {
  if (!password || password.length < 8) return { label: 'Too short', color: 'bg-gray-200', width: '10%', score: 0 };
  let score = 1;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (password.length >= 12) score++;
  const map = [
    { label: 'Weak', color: 'bg-red-500', width: '25%' },
    { label: 'Fair', color: 'bg-yellow-500', width: '50%' },
    { label: 'Good', color: 'bg-blue-500', width: '75%' },
    { label: 'Strong', color: 'bg-green-500', width: '100%' },
  ];
  return { ...map[score - 1], score };
}

const StepOwner = ({ data, onChange, onNext, onBack, sessionId }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [emailExists, setEmailExists] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);

  // Phone OTP state
  const [phoneOtpStatus, setPhoneOtpStatus] = useState('idle');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [phoneAttempts, setPhoneAttempts] = useState(0);
  const recaptchaRef = useRef(null);
  const recaptchaWrapperRef = useRef(null);
  const confirmationResultRef = useRef(null);
  const verificationIdRef = useRef(null);
  const phoneCodeSentListenerRef = useRef(null);
  const lastPhoneOtpAttemptRef = useRef(0);
  const isNative = isNativePlatform;

  // Timer state
  const [phoneTimeLeft, setPhoneTimeLeft] = useState(300);
  const phoneTimerRef = useRef(null);

  const strength = getPasswordStrength(data.password);

  // Clear phone verification state and timers on unmount
  useEffect(() => {
    // On native, listen for phoneCodeSent to capture verificationId
    if (isNative) {
      FirebaseAuthentication.addListener('phoneCodeSent', (event) => {
        verificationIdRef.current = event.verificationId;
      }).then(handle => { phoneCodeSentListenerRef.current = handle; });
    }
    return () => {
      if (recaptchaRef.current) {
        clearRecaptchaUtil(recaptchaRef.current);
        recaptchaRef.current = null;
      }
      confirmationResultRef.current = null;
      verificationIdRef.current = null;
      clearInterval(phoneTimerRef.current);
      if (phoneCodeSentListenerRef.current) {
        phoneCodeSentListenerRef.current.remove();
        phoneCodeSentListenerRef.current = null;
      }
    };
  }, [isNative]);

  const formatTimer = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const startPhoneTimer = () => {
    setPhoneTimeLeft(300);
    clearInterval(phoneTimerRef.current);
    phoneTimerRef.current = setInterval(() => {
      setPhoneTimeLeft(prev => {
        if (prev <= 1) { clearInterval(phoneTimerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleEmailBlur = async () => {
    const email = (data.email || '').trim();
    if (!email || !email.includes('@')) return;

    setEmailChecking(true);
    setEmailExists(false);

    try {
      const res = await apiFetch(`/api/onboard/check-email?email=${encodeURIComponent(email)}`);
      const json = await res.json();
      if (json.exists) {
        setEmailExists(true);
        setErrors(prev => ({ ...prev, email: null }));
      }
    } catch {
      // Network error — silent fail, backend will catch it at submit
    } finally {
      setEmailChecking(false);
    }
  };

  const handleChange = (field, value) => {
    if (field === 'phone' && data.phoneVerificationProof && value !== data.phone) {
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
    if (!data.termsAccepted) newErrors.termsAccepted = 'You must agree to the Terms of Service';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = () => {
    if (validate()) {
      onNext();
    }
  };

  // ── Phone OTP (Firebase) ─────────────────────────────────
  const sendPhoneOtp = async () => {
    if (!data.phone || data.phone.length < 10) {
      setPhoneError('Please enter a valid phone number first');
      return;
    }
    const cooldownMs = 30000; // 30s between attempts
    const elapsed = Date.now() - lastPhoneOtpAttemptRef.current;
    if (elapsed < cooldownMs) {
      const wait = Math.ceil((cooldownMs - elapsed) / 1000);
      setPhoneError(`Please wait ${wait} seconds before resending`);
      return;
    }
    setPhoneOtpStatus('sending');
    setPhoneError('');
    try {
      // Clean up existing reCAPTCHA (web only)
      if (recaptchaRef.current) {
        await clearRecaptchaUtil(recaptchaRef.current);
        recaptchaRef.current = null;
      }

      let liveContainer = null;
      if (!isNative) {
        // Create a brand-new DOM element so reCAPTCHA never sees a reused container
        const wrapper = recaptchaWrapperRef.current;
        if (!wrapper) throw new Error('reCAPTCHA wrapper missing');
        const freshDiv = document.createElement('div');
        wrapper.appendChild(freshDiv);
        liveContainer = freshDiv;
      }

      const phone = normalizePhone(data.phone);
      const result = await sendOtp(phone, liveContainer);
      if (result.verificationId) {
        verificationIdRef.current = result.verificationId;
      }
      if (result.confirmationResult) {
        confirmationResultRef.current = result.confirmationResult;
      }
      if (result.recaptchaVerifier) {
        recaptchaRef.current = result.recaptchaVerifier;
      }
      lastPhoneOtpAttemptRef.current = Date.now();
      setPhoneOtpStatus('sent');
      startPhoneTimer();
      setPhoneAttempts(prev => prev + 1);
    } catch (err) {
      console.error('[sendPhoneOtp] error:', err.code, err.message);
      if (recaptchaRef.current) {
        await clearRecaptchaUtil(recaptchaRef.current);
        recaptchaRef.current = null;
      }
      confirmationResultRef.current = null;
      verificationIdRef.current = null;
      setPhoneError(err.message || 'Failed to send SMS');
      setPhoneOtpStatus('error');
    }
  };

  const verifyPhoneOtp = async () => {
    if (!phoneOtp || phoneOtp.length < 4) {
      setPhoneError('Enter the verification code');
      return;
    }
    const ctx = isNative
      ? { verificationId: verificationIdRef.current }
      : { confirmationResult: confirmationResultRef.current };
    if (isNative ? !ctx.verificationId : !ctx.confirmationResult) {
      setPhoneError('Session expired. Please resend the code.');
      setPhoneOtpStatus('error');
      return;
    }
    setPhoneOtpStatus('verifying');
    setPhoneError('');
    try {
      const { idToken } = await verifyOtp(ctx, phoneOtp);

      // Retry backend call up to 3 times on network error
      let res, lastErr;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          res = await apiFetch('/api/verify/phone/verify', {
            method: 'POST',
            body: JSON.stringify({ idToken, sessionId })
          });
          break; // success
        } catch (err) {
          lastErr = err;
          if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
        }
      }
      if (!res) throw lastErr;

      onChange({ ...data, phoneVerificationProof: res.proof });
      setPhoneOtpStatus('verified');
    } catch (err) {
      console.error('[verifyPhoneOtp] error:', err.code, err.message);
      setPhoneError(err.message || 'Invalid code');
      setPhoneOtpStatus('sent');
    }
  };

  const phoneVerified = !!data.phoneVerificationProof;
  const canSkipVerification = phoneAttempts >= 3;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <User size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Your Login Details</h2>
        <p className="text-gray-500">Create your admin account and verify your contact details</p>
      </div>

      {/* Invisible reCAPTCHA mount point */}
      <div ref={recaptchaWrapperRef} />

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Your Name *</label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className={`w-full px-4 py-3 bg-white border rounded-xl focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="e.g., John Doe"
          />
          {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
          <div className="relative">
            <Mail size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type="email"
              value={data.email}
              onChange={(e) => {
                handleChange('email', e.target.value);
                setEmailExists(false);
              }}
              onBlur={handleEmailBlur}
              className={`w-full pl-10 pr-4 py-3 bg-white border rounded-xl focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all ${
                emailExists ? 'border-red-500 bg-red-50' : errors.email ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="e.g., owner@example.com"
            />
          </div>
          {emailChecking && (
            <p className="text-xs text-gray-400 mt-1 animate-pulse">Checking email…</p>
          )}
          {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
          {emailExists && (
            <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex flex-col gap-1">
              <p className="text-sm font-bold text-red-700">
                This email is already in use, please use another email.
              </p>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1">You&apos;ll verify this later from your account settings</p>
        </div>

        {/* Phone + OTP */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
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
              className={`w-full pl-[5rem] pr-24 py-3 bg-white border rounded-xl focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 disabled:opacity-60 transition-all ${errors.phone ? 'border-red-500' : 'border-gray-300'}`}
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
                  className="w-32 px-3 py-2 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 text-center text-sm font-mono transition-all"
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
                <button
                  type="button"
                  onClick={sendPhoneOtp}
                  disabled={phoneTimeLeft > 0 && phoneTimeLeft > 240}
                  className={`text-xs transition-all ${phoneTimeLeft > 0 && phoneTimeLeft > 240 ? 'text-gray-400 cursor-not-allowed' : 'text-[#E53935] hover:underline'}`}
                >
                  {phoneTimeLeft > 0 && phoneTimeLeft > 240 ? `Resend in ${formatTimer(phoneTimeLeft - 240)}` : 'Resend OTP'}
                </button>
              </div>
            </div>
          )}
          {data.phoneVerificationProof && (
            <p className="text-green-600 text-xs mt-1 flex items-center gap-1"><CheckCircle size={12} /> Phone verified</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Password *</label>
          <div className="relative">
            <Lock size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={data.password}
              onChange={(e) => handleChange('password', e.target.value)}
              className={`w-full pl-10 pr-12 py-3 bg-white border rounded-xl focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all ${errors.password ? 'border-red-500' : 'border-gray-300'}`}
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
          {/* Strength meter */}
          <div className="mt-2 space-y-1">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full ${strength.color} transition-all duration-300`} style={{ width: strength.width }} />
            </div>
            <p className="text-xs text-gray-400">{strength.label} {strength.score >= 2 ? '' : '— add numbers & symbols'}</p>
          </div>
          {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password *</label>
          <div className="relative">
            <ShieldCheck size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={data.confirmPassword}
              onChange={(e) => handleChange('confirmPassword', e.target.value)}
              className={`w-full pl-10 pr-12 py-3 bg-white border rounded-xl focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all ${errors.confirmPassword ? 'border-red-500' : 'border-gray-300'}`}
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

        {/* Terms & Conditions */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.termsAccepted || false}
              onChange={(e) => handleChange('termsAccepted', e.target.checked)}
              className="mt-0.5 w-4 h-4 text-[#E53935] rounded border-gray-300 focus:ring-[#E53935]"
            />
            <span className="text-sm text-gray-700">
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#E53935] hover:underline font-medium">Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#E53935] hover:underline font-medium">Privacy Policy</a>
              {' '}*
            </span>
          </label>
          {errors.termsAccepted && <p className="text-red-400 text-xs">{errors.termsAccepted}</p>}

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.marketingConsent || false}
              onChange={(e) => handleChange('marketingConsent', e.target.checked)}
              className="mt-0.5 w-4 h-4 text-[#E53935] rounded border-gray-300 focus:ring-[#E53935]"
            />
            <span className="text-sm text-gray-700">
              Send me product updates and tips via email (optional)
            </span>
          </label>
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
          disabled={!phoneVerified || emailExists || emailChecking}
          className="flex-1 py-3 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
      {!phoneVerified && (
        <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
          <AlertCircle size={12} /> Verify your phone number to continue
        </p>
      )}
      {canSkipVerification && !phoneVerified && (
        <p className="text-xs text-gray-400 text-center">
          Having trouble?{' '}
          <button
            type="button"
            onClick={() => onChange({ ...data, phoneVerificationProof: 'skipped' })}
            className="text-[#E53935] hover:underline font-medium"
          >
            Continue without verifying
          </button>{' '}
          (you can verify later from Settings)
        </p>
      )}
    </div>
  );
};

export default StepOwner;
