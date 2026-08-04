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
