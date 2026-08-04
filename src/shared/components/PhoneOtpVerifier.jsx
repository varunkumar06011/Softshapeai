// ─────────────────────────────────────────────────────────────────────────────
// PhoneOtpVerifier — Phone OTP verification component for onboarding/settings
// ─────────────────────────────────────────────────────────────────────────────
// Provides phone OTP verification flow using Firebase Authentication:
//   1. User enters phone number (auto-normalized to +91 format)
//   2. Click "Send OTP" → Firebase sends OTP via SMS
//   3. User enters 6-digit OTP
//   4. Click "Verify" → Firebase verifies OTP
//   5. On success, calls onVerified callback with phone number and Firebase UID
//
// Features:
//   - Cross-platform: web (reCAPTCHA) and Android (Capacitor native)
//   - Resend OTP with cooldown timer
//   - Phone format validation
//   - Loading and error states
//   - Backend phone uniqueness check
//
// Used in StepOwner (onboarding) and SettingsPage (phone change).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import { Loader2, CheckCircle, Phone, ArrowLeft } from 'lucide-react';
import {
  sendPhoneOtp,
  verifyPhoneOtp,
  clearRecaptcha as clearRecaptchaUtil,
  isNativePlatform,
  FirebaseAuthentication,
} from '../../lib/phoneAuth';
import { API_BASE } from '../../services/apiConfig';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const COUNTDOWN_SECONDS = 120; // 2 min for Firebase OTP

const PhoneOtpVerifier = ({ phone, sessionId, onVerified, onError, onCancel }) => {
  const [status, setStatus] = useState('idle'); // idle | sending | sent | verifying | verified | error
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [errorMsg, setErrorMsg] = useState('');
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN_SECONDS);
  const inputRefs = useRef([]);
  const timerRef = useRef(null);
  const recaptchaVerifierRef = useRef(null);
  const confirmationResultRef = useRef(null);
  const verificationIdRef = useRef(null);
  const phoneCodeSentListenerRef = useRef(null);
  const recaptchaContainerId = `recaptcha-${useId()}`;
  const isNative = isNativePlatform;

  const startTimer = useCallback(() => {
    setTimeLeft(COUNTDOWN_SECONDS);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const clearRecaptcha = useCallback(async () => {
    if (isNative) return;
    await clearRecaptchaUtil(recaptchaVerifierRef.current);
    recaptchaVerifierRef.current = null;
    const container = document.getElementById(recaptchaContainerId);
    if (container) container.replaceChildren();
  }, [recaptchaContainerId, isNative]);

  useEffect(() => {
    // On native, listen for phoneCodeSent to capture verificationId
    if (isNative) {
      FirebaseAuthentication.addListener('phoneCodeSent', (event) => {
        verificationIdRef.current = event.verificationId;
      }).then(handle => { phoneCodeSentListenerRef.current = handle; });
    }
    return () => {
      clearInterval(timerRef.current);
      clearRecaptcha();
      if (phoneCodeSentListenerRef.current) {
        phoneCodeSentListenerRef.current.remove();
        phoneCodeSentListenerRef.current = null;
      }
    };
  }, [clearRecaptcha, isNative]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const handleSend = async () => {
    setErrorMsg('');
    setStatus('sending');
    await clearRecaptcha();

    try {
      const liveContainer = isNative ? null : document.getElementById(recaptchaContainerId);
      const result = await sendPhoneOtp(phone, liveContainer);
      if (result.verificationId) {
        verificationIdRef.current = result.verificationId;
      }
      if (result.confirmationResult) {
        confirmationResultRef.current = result.confirmationResult;
      }
      if (result.recaptchaVerifier) {
        recaptchaVerifierRef.current = result.recaptchaVerifier;
      }
      setDigits(['', '', '', '', '', '']);
      setStatus('sent');
      startTimer();
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      await clearRecaptcha();
      const msg = err.message?.includes('auth/')
        ? 'Failed to send SMS. Check the phone number format (+91XXXXXXXXXX).'
        : (err.message || 'Failed to send code');
      setErrorMsg(msg);
      setStatus('error');
      onError?.(msg);
    }
  };

  const handleDigitChange = (index, value) => {
    const char = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits];
        next[index] = '';
        setDigits(next);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }
    if (e.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = [...digits];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  const handleVerify = async () => {
    const code = digits.join('');
    if (code.length !== 6) {
      setErrorMsg('Please enter all 6 digits.');
      return;
    }
    const ctx = isNative
      ? { verificationId: verificationIdRef.current }
      : { confirmationResult: confirmationResultRef.current };
    if (isNative ? !ctx.verificationId : !ctx.confirmationResult) {
      setErrorMsg('Session expired. Please resend the code.');
      return;
    }
    setErrorMsg('');
    setStatus('verifying');
    try {
      const { idToken } = await verifyPhoneOtp(ctx, code);
      const data = await apiFetch('/api/verify/phone/verify', {
        method: 'POST',
        body: JSON.stringify({ idToken, sessionId }),
      });
      clearInterval(timerRef.current);
      await clearRecaptcha();
      confirmationResultRef.current = null;
      verificationIdRef.current = null;
      setStatus('verified');
      onVerified?.(data.proof, data.phoneNumber);
    } catch (err) {
      const msg = err.message?.includes('auth/invalid-verification-code')
        ? 'Incorrect code. Please try again.'
        : (err.message || 'Verification failed');
      setErrorMsg(msg);
      setStatus('sent');
      onError?.(msg);
    }
  };

  if (status === 'verified') {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <CheckCircle size={40} className="text-green-500" />
        <p className="text-sm font-black uppercase tracking-widest text-green-600">Phone Verified</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div id={recaptchaContainerId} />

      {(status === 'idle' || status === 'error') && (
        <>
          <p className="text-[11px] font-bold text-gray-500 text-center">
            We'll send a 6-digit code via SMS to <span className="text-gray-800 font-black">{phone}</span>
          </p>
          {errorMsg && <p className="text-[12px] font-bold text-red-600 text-center">{errorMsg}</p>}
          <button
            onClick={handleSend}
            disabled={status === 'sending'}
            className="w-full h-16 rounded-[24px] bg-[#E53935] px-6 text-sm font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-[#B71C1C] shadow-2xl shadow-red-100 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Phone size={18} /> Send Code
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors justify-center w-full pt-2"
            >
              <ArrowLeft size={14} /> Cancel
            </button>
          )}
        </>
      )}

      {status === 'sending' && (
        <div className="flex items-center justify-center gap-3 py-4 text-gray-500">
          <Loader2 size={20} className="animate-spin text-[#E53935]" />
          <span className="text-sm font-black uppercase tracking-widest">Sending SMS…</span>
        </div>
      )}

      {(status === 'sent' || status === 'verifying') && (
        <>
          <button
            onClick={() => {
              clearInterval(timerRef.current);
              clearRecaptcha();
              confirmationResultRef.current = null;
              verificationIdRef.current = null;
              setStatus('idle');
              setDigits(['', '', '', '', '', '']);
              setErrorMsg('');
            }}
            className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors mb-2"
          >
            <ArrowLeft size={14} /> Back
          </button>

          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 text-center">
            Enter the 6-digit code sent to <span className="text-gray-700">{phone}</span>
          </p>

          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={el => (inputRefs.current[i] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={e => handleDigitChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                className="w-12 h-14 rounded-2xl border-2 border-gray-50 bg-gray-50 text-center text-xl font-black outline-none focus:border-[#E53935] focus:bg-white transition-all"
              />
            ))}
          </div>

          {errorMsg && <p className="text-[12px] font-bold text-red-600 text-center">{errorMsg}</p>}

          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-black text-gray-400 tabular-nums">
              {timeLeft > 0 ? `Expires in ${formatTime(timeLeft)}` : 'Code expired'}
            </span>
            {timeLeft === 0 ? (
              <button
                onClick={handleSend}
                className="text-[11px] font-black uppercase tracking-widest text-[#E53935] hover:underline"
              >
                Resend Code
              </button>
            ) : (
              <span className="text-[11px] font-black text-gray-300 uppercase tracking-widest">Resend in {formatTime(timeLeft)}</span>
            )}
          </div>

          <button
            onClick={handleVerify}
            disabled={status === 'verifying' || digits.join('').length !== 6}
            className="w-full h-16 rounded-[24px] bg-[#E53935] px-6 text-sm font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-[#B71C1C] shadow-2xl shadow-red-100 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'verifying' ? (
              <><Loader2 size={18} className="animate-spin" /> Verifying…</>
            ) : (
              'Verify Code'
            )}
          </button>
        </>
      )}
    </div>
  );
};

export default PhoneOtpVerifier;
