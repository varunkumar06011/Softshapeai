// ─────────────────────────────────────────────────────────────────────────────
// Firebase Initialization — Firebase app setup for phone authentication
// ─────────────────────────────────────────────────────────────────────────────
// Initializes Firebase with config from Vite environment variables.
// Used for phone OTP verification during onboarding (Firebase Auth).
// Falls back to dummy config if env vars are not set (prevents crash in dev).
//
// Exports:
//   firebaseApp — initialized Firebase app instance
//   firebaseAuth — Firebase Auth instance
//   RecaptchaVerifier — reCAPTCHA verifier class for phone auth
//   signInWithPhoneNumber — phone auth sign-in function
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "dummy_api_key_to_prevent_crash",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "dummy.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "dummy-project",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export { RecaptchaVerifier, signInWithPhoneNumber };
