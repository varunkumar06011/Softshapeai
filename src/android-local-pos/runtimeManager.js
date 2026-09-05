import { createAndroidLocalPosRuntime } from './runtimeFactory';

let runtime;
let startPromise;

export function getAndroidLocalPosRuntime() {
  if (!runtime) runtime = createAndroidLocalPosRuntime();
  return runtime;
}

export function startAndroidLocalPosRuntime() {
  if (!startPromise) {
    startPromise = getAndroidLocalPosRuntime().start().catch((error) => {
      startPromise = null;
      throw error;
    });
  }
  return startPromise;
}

export async function getAndroidLocalPosPairingInfo() {
  await startAndroidLocalPosRuntime();
  if (!runtime.adapters.auth?.getPairingInfo) throw new Error('Local pairing is not available');
  return runtime.adapters.auth.getPairingInfo();
}

export function stopAndroidLocalPosRuntime() {
  if (!runtime) return Promise.resolve();
  const current = runtime;
  runtime = undefined;
  startPromise = undefined;
  return current.stop();
}
