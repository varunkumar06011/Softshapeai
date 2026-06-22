import { useState, useEffect } from "react";
import { API_BASE } from "../services/apiConfig";
import { getSocket } from "./useSocket";

const LS_KEY = "softshape_venue_prices_v1";
const LS_TTL_MS = 5 * 60 * 1000; // 5 minutes

function readLocalCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > LS_TTL_MS) { localStorage.removeItem(LS_KEY); return null; }
    return data;
  } catch { return null; }
}

function writeLocalCache(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota */ }
}

let cachedVenuePrices = null;
let fetchPromise = null;

export function useVenuePrices() {
  const [venuePrices, setVenuePrices] = useState(() => cachedVenuePrices || readLocalCache() || {});

  useEffect(() => {
    const loadPrices = () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      fetchPromise = fetch(`${API_BASE}/api/venue/all-prices`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => {
          clearTimeout(timeoutId);
          cachedVenuePrices = data;
          writeLocalCache(data);
          setVenuePrices(data);
          return data;
        })
        .catch((err) => {
          clearTimeout(timeoutId);
          console.error("Failed to fetch venue prices:", err);
          // Fall back to localStorage so menu is not empty on cold start
          const local = readLocalCache();
          if (local) { cachedVenuePrices = local; setVenuePrices(local); }
          return cachedVenuePrices || {};
        });
      return fetchPromise;
    };

    const handleVenuePriceUpdate = () => {
      cachedVenuePrices = null;
      fetchPromise = null;
      localStorage.removeItem(LS_KEY);
      loadPrices();
    };

    window.addEventListener("softshape_venue_prices_updated", handleVenuePriceUpdate);

    if (!cachedVenuePrices && !fetchPromise) loadPrices();
    // NOTE: loadPrices already calls setVenuePrices in its .then chain;
    // do NOT add a redundant .then here — it causes a double state update.

    return () => {
      window.removeEventListener("softshape_venue_prices_updated", handleVenuePriceUpdate);
    };
  }, []);

  // Socket listener for real-time venue price updates from admin
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleSocketPriceUpdate = () => {
      cachedVenuePrices = null;
      fetchPromise = null;
      localStorage.removeItem(LS_KEY);
      fetch(`${API_BASE}/api/venue/all-prices`)
        .then((res) => res.json())
        .then((data) => {
          cachedVenuePrices = data;
          setVenuePrices(data);
        })
        .catch((err) => console.error("Failed to re-fetch venue prices:", err));
    };

    socket.on("venuePrices:updated", handleSocketPriceUpdate);
    return () => {
      socket.off("venuePrices:updated", handleSocketPriceUpdate);
    };
  }, []);

  return venuePrices;
}
