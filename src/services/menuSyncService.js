import { useState, useEffect, useCallback } from 'react';
import { fetchMenuFromBackend } from './menuService';

const PIESOCKET_API_KEY = "VCXCEuvhGcBDP7XhiJJUDvR1e1PNwgvPAY2ZeMyB";
const ROOM_ID = "softshape_menu_demo_2";
const WS_URL = `wss://free.blr2.piesocket.com/v3/${ROOM_ID}?api_key=${PIESOCKET_API_KEY}`;

// Single canonical storage key used everywhere — fixes the dual-key split-brain bug
const STORAGE_KEY = "softshape_unified_menu";

let globalSocket = null;
let globalMenu = null;
let _isLoading = true; // true until first successful load
const subscribers = new Set();
let isConnecting = false;

/** Public accessor so hooks can read the loading state without importing internals */
export function isMenuLoading() {
  return _isLoading;
}

/** Dispatch a window event so any legacy/inline listeners (e.g. CaptainApp) also react */
function dispatchMenuEvent(menu) {
  try {
    window.dispatchEvent(new CustomEvent('softshape_menu_updated', { detail: menu }));
  } catch (_) {}
}

function broadcastUpdate() {
  if (globalSocket && globalSocket.readyState === WebSocket.OPEN && globalMenu) {
    globalSocket.send(JSON.stringify({
      type: 'SYNC_MENU',
      payload: globalMenu
    }));
  }
}

function notifySubscribers() {
  subscribers.forEach(callback => callback(globalMenu));
}

async function loadInitialMenu() {
  try {
    const apiItems = await fetchMenuFromBackend();
    const saved = localStorage.getItem(STORAGE_KEY);
    const localItems = saved ? JSON.parse(saved) : [];

    // Keep only active specials from local storage; base items always come from API
    const localSpecials = localItems.filter(i => i.isSpecial);
    const specialNames = new Set(localSpecials.map(s => s.n.toLowerCase()));
    const filteredBase = apiItems.filter(m => !specialNames.has(m.n.toLowerCase()));

    globalMenu = [...localSpecials, ...filteredBase];
  } catch (err) {
    console.error('[MenuSync] Failed to load initial menu', err);
    const saved = localStorage.getItem(STORAGE_KEY);
    globalMenu = saved ? JSON.parse(saved) : [];
  }

  _isLoading = false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(globalMenu));
  notifySubscribers();
  dispatchMenuEvent(globalMenu);
  broadcastUpdate();
}

function initSocket() {
  if (globalSocket || isConnecting) return;
  isConnecting = true;

  try {
    globalSocket = new WebSocket(WS_URL);

    globalSocket.onopen = () => {
      console.log('[MenuSync] Connected to Realtime Relay');
      isConnecting = false;

      // Ask any peer for their latest state
      globalSocket.send(JSON.stringify({ type: 'REQUEST_STATE' }));

      // Start loading immediately (no artificial delay) if we don't have data yet
      if (!globalMenu) {
        // Try localStorage first for instant paint, then validate with API
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            globalMenu = JSON.parse(saved);
            _isLoading = false;
            notifySubscribers();
            dispatchMenuEvent(globalMenu);
          } catch (_) {}
        }
        // Always do a fresh API fetch to validate / hydrate
        loadInitialMenu();
      }
    };

    globalSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'REQUEST_STATE' && globalMenu) {
          // A peer just connected — send them our current state
          broadcastUpdate();
        } else if (data.type === 'SYNC_MENU' && data.payload) {
          // Received an update from another panel/tab
          globalMenu = data.payload;
          _isLoading = false;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(globalMenu));
          notifySubscribers();
          dispatchMenuEvent(globalMenu);
        }
      } catch (_) {}
    };

    globalSocket.onclose = () => {
      console.log('[MenuSync] Disconnected. Reconnecting in 3s...');
      globalSocket = null;
      isConnecting = false;
      setTimeout(initSocket, 3000);
    };

    globalSocket.onerror = () => {
      globalSocket?.close();
    };
  } catch (err) {
    isConnecting = false;
    console.error('[MenuSync] Connection failed', err);
    // Even if WebSocket fails, load the menu from API so the app works
    if (!globalMenu) loadInitialMenu();
  }
}

export function useGlobalMenuSync() {
  const [menu, setMenu] = useState(() => {
    if (globalMenu) return globalMenu;
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  const [loading, setLoading] = useState(_isLoading);

  useEffect(() => {
    initSocket();

    const handleUpdate = (newMenu) => {
      setMenu(newMenu);
      setLoading(false);
    };

    subscribers.add(handleUpdate);

    // If globalMenu is already resolved, hydrate immediately (no flicker)
    if (globalMenu) {
      handleUpdate(globalMenu);
    }

    return () => {
      subscribers.delete(handleUpdate);
    };
  }, []);

  const setGlobalMenu = useCallback((updater) => {
    const nextMenu = typeof updater === 'function'
      ? updater(globalMenu || menu || [])
      : updater;

    globalMenu = nextMenu;
    _isLoading = false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextMenu));

    // Optimistic local update
    setMenu(nextMenu);

    // Notify all subscribers in this tab
    notifySubscribers();

    // Dispatch window event for any legacy listeners
    dispatchMenuEvent(nextMenu);

    // Broadcast to all connected peers (other tabs/devices)
    broadcastUpdate();
  }, [menu]);

  const refreshMenu = useCallback(async () => {
    try {
      const apiItems = await fetchMenuFromBackend();

      setGlobalMenu(prev => {
        // Preserve only currently active specials during a base refresh
        const currentMenu = prev || globalMenu || [];
        const activeSpecials = currentMenu.filter(
          i => i.isSpecial && i.active && (!i.expiresAt || Date.now() < i.expiresAt)
        );
        const specialNames = new Set(activeSpecials.map(s => s.n.toLowerCase()));
        const filteredBase = apiItems.filter(m => !specialNames.has(m.n.toLowerCase()));
        return [...activeSpecials, ...filteredBase];
      });

      return apiItems;
    } catch (err) {
      throw err;
    }
  }, [setGlobalMenu]);

  return {
    globalMenu: menu || [],
    isLoadingMenu: loading,
    setGlobalMenu,
    refreshMenu,
  };
}
