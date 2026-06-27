import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

// ── Web SDK (fallback for browser) ─────────────────────────
import { initializeApp } from "firebase/app";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber as webSignInWithPhoneNumber,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "dummy_api_key_to_prevent_crash",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "dummy.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "dummy-project",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef",
};

const firebaseApp = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);

export { firebaseAuth, RecaptchaVerifier };

const isNative = Capacitor.isNativePlatform();

/**
 * Send an OTP to the given phone number.
 *
 * - On native (Android/iOS): uses @capacitor-firebase/authentication
 *   which leverages the native Firebase SDK — no reCAPTCHA needed.
 * - On web: falls back to the Firebase Web SDK with invisible reCAPTCHA.
 *
 * @param {string} phoneNumber  E.164 format, e.g. "+919876543210"
 * @param {HTMLElement} recaptchaContainer  DOM element for reCAPTCHA (web only)
 * @returns {Promise<{ verificationId: string, confirmationResult?: object }>}
 *   - On native: returns { verificationId }
 *   - On web: returns { verificationId, confirmationResult } where
 *     confirmationResult has a .confirm(code) method
 */
export async function sendPhoneOtp(phoneNumber, recaptchaContainer) {
  if (isNative) {
    // Native path — no reCAPTCHA required.
    // The plugin fires `phoneCodeSent` event with the verificationId.
    const result = await FirebaseAuthentication.signInWithPhoneNumber({
      phoneNumber,
    });
    // On some platforms the verificationId comes back in the result,
    // on others it comes via the `phoneCodeSent` listener.
    // We return what we get; the caller should also listen for events.
    return {
      verificationId: result.verificationId || null,
    };
  }

  // Web path — use Firebase Web SDK with invisible reCAPTCHA
  if (!recaptchaContainer) {
    throw new Error("reCAPTCHA container missing from DOM");
  }
  const recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, recaptchaContainer, {
    size: "invisible",
    callback: () => {},
  });
  const confirmationResult = await webSignInWithPhoneNumber(
    firebaseAuth,
    phoneNumber,
    recaptchaVerifier
  );
  return {
    verificationId: null,
    confirmationResult,
    recaptchaVerifier,
  };
}

/**
 * Verify the OTP code.
 *
 * @param {object} ctx  Context returned by sendPhoneOtp (or a manual object)
 * @param {string} code  6-digit SMS code
 * @returns {Promise<{ idToken: string, phoneNumber: string }>}
 */
export async function verifyPhoneOtp(ctx, code) {
  if (isNative) {
    const result = await FirebaseAuthentication.confirmVerificationCode({
      verificationId: ctx.verificationId,
      verificationCode: code,
    });
    const idTokenResult = await FirebaseAuthentication.getIdToken();
    return {
      idToken: idTokenResult.token,
      phoneNumber: result.user?.phoneNumber || "",
    };
  }

  // Web path
  const credential = await ctx.confirmationResult.confirm(code);
  const idToken = await credential.user.getIdToken();
  return {
    idToken,
    phoneNumber: credential.user.phoneNumber || "",
  };
}

/**
 * Clean up reCAPTCHA resources (web only).
 */
export async function clearRecaptcha(recaptchaVerifier) {
  if (isNative) return;
  if (recaptchaVerifier) {
    try {
      await recaptchaVerifier.clear();
    } catch {
      // ignore
    }
  }
}

/**
 * Sign out the current Firebase user (native + web).
 */
export async function signOutFirebase() {
  if (isNative) {
    await FirebaseAuthentication.signOut();
  } else {
    await import("firebase/auth").then(({ signOut }) => signOut(firebaseAuth));
  }
}

/**
 * Whether we are running on a native platform (Android/iOS).
 */
export const isNativePlatform = isNative;

/**
 * The FirebaseAuthentication plugin instance, for attaching listeners
 * (e.g. `phoneCodeSent`, `phoneVerificationCompleted`, `phoneVerificationFailed`).
 */
export { FirebaseAuthentication };
