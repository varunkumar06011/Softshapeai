// ─────────────────────────────────────────────────────────────────────────────
// Register SW — Service Worker registration for PWA offline support
// ─────────────────────────────────────────────────────────────────────────────
// Registers the service worker (/sw.js) for Progressive Web App features:
//   - Offline page caching (app shell + static assets)
//   - Background sync for pending actions
//   - Push notification support (future)
//
// Skips registration in localhost dev mode unless VITE_ENABLE_SW_DEV is set.
// Handles update notifications and forces reload when a new SW takes control.
// ─────────────────────────────────────────────────────────────────────────────

export async function registerSW() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service workers not supported — offline features disabled');
    return;
  }

  // Tauri desktop apps load files from local disk — a service worker only
  // causes harm by serving stale cached bundles after a Tauri app update,
  // leaving the app in a broken state where buttons stop working.
  // Unregister any leftover SW from a previous browser-mode session and skip.
  if (typeof window !== 'undefined' && window.__TAURI__) {
    console.log('[SW] Tauri desktop detected — unregistering stale SW');
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
      // Also clear all caches left behind by the old SW
      if (window.caches) {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
        }
      }
    } catch (err) {
      console.error('[SW] Failed to clean up Tauri SW:', err);
    }
    return;
  }

  // Don't register SW in localhost dev mode unless explicitly enabled
  if (import.meta.env.DEV && !import.meta.env.VITE_ENABLE_SW_DEV) {
    console.log('[SW] Skipping SW registration in dev mode');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      type: 'module',
    });

    // Listen for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version available — notify the app
          console.log('[SW] New version available — dispatching event');
          window.dispatchEvent(new CustomEvent('sw-update-available', {
            detail: { registration },
          }));

          // Auto-activate in background (user will see changes on next reload)
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    // Listen for controller change (new SW took over)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        console.log('[SW] Controller changed — reloading for new version');
        window.location.reload();
      }
    });

    console.log('[SW] Service worker registered successfully');
  } catch (err) {
    console.error('[SW] Registration failed:', err);
  }
}

export async function unregisterSW() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      await reg.unregister();
    }
    console.log('[SW] All service workers unregistered');
  } catch (err) {
    console.error('[SW] Unregistration failed:', err);
  }
}
