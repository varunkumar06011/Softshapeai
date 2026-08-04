// ─────────────────────────────────────────────────────────────────────────────
// Audio Service — Web Audio API sound effects and haptic feedback
// ─────────────────────────────────────────────────────────────────────────────
// Provides sound effects for POS events (order placed, bill printed, error)
// using the Web Audio API. Includes:
//   - Global AudioContext singleton (created on first use)
//   - iOS audio unlock (requires user gesture to enable audio)
//   - Haptic feedback integration (vibration on supported devices)
//   - State subscription system (listeners notified on enable/disable)
//
// Sounds:
//   - success: ascending tones (order placed, payment received)
//   - error: descending tones (failed operation)
//   - notification: single tone (waiter call, new order)
//
// Exports: playSound(name), getAudioState(), subscribe(listener), unlockAudio()
// ─────────────────────────────────────────────────────────────────────────────

import { hapticLight, hapticSuccess } from '../shared/hooks/useHaptics';

// Singleton AudioContext — created lazily on first use
let globalAudioCtx = null;
// Set of listener functions notified on state changes
let listeners = new Set();
// Whether audio has been unlocked (iOS requires user gesture)
let isUnlocked = false;

function emitState() {
  const state = getAudioState();
  listeners.forEach(l => l(state));
}

export function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!globalAudioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    globalAudioCtx = new AudioContextClass();
    globalAudioCtx.addEventListener('statechange', () => {
      isUnlocked = globalAudioCtx.state === 'running';
      emitState();
    });
  }
  return globalAudioCtx;
}

export function getAudioState() {
  const ctx = getAudioContext();
  if (!ctx) return 'unsupported';
  return ctx.state;
}

export function subscribeToAudioState(callback) {
  listeners.add(callback);
  callback(getAudioState());
  return () => {
    listeners.delete(callback);
  };
}

export function unlockAudioContext() {
  const ctx = getAudioContext();
  if (!ctx) return Promise.resolve();

  if (ctx.state === 'suspended') {
    return ctx.resume().then(() => {
      // Play a short silent buffer to satisfy older iOS versions
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      isUnlocked = true;
      emitState();
      console.log("[AudioService] AudioContext unlocked successfully via resume.");
    }).catch(err => {
      console.warn("[AudioService] Failed to resume AudioContext:", err);
    });
  } else if (ctx.state === 'running') {
    isUnlocked = true;
    emitState();
    return Promise.resolve();
  }
  return Promise.resolve();
}

if (typeof window !== 'undefined') {
  const handleInteraction = () => {
    unlockAudioContext();
    // Haptic feedback to warm up vibration API
    hapticLight();

    window.removeEventListener('click', handleInteraction);
    window.removeEventListener('touchstart', handleInteraction);
    window.removeEventListener('keydown', handleInteraction);
  };

  window.addEventListener('click', handleInteraction);
  window.addEventListener('touchstart', handleInteraction);
  window.addEventListener('keydown', handleInteraction);
}

export function playChimeTone() {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;

  try {
    // Chime tone 1 (A5 note)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.25, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Chime tone 2 (C6 note)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1046.5, now + 0.08);
    gain2.gain.setValueAtTime(0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.25, now + 0.13);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.38);
  } catch (err) {
    console.error("[AudioService] Error playing chime tone:", err);
  }

  // Sync physical vibration with the sound
  hapticSuccess();
}
