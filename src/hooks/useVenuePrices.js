import { useState, useEffect } from "react";
import { API_BASE } from "../services/apiConfig";
import { getSocket } from "./useSocket";

let cachedVenuePrices = null;
let fetchPromise = null;

export function useVenuePrices() {
  const [venuePrices, setVenuePrices] = useState(cachedVenuePrices || {});

  useEffect(() => {
    const loadPrices = () => {
      fetchPromise = fetch(`${API_BASE}/api/venue/all-prices`)
        .then((res) => res.json())
        .then((data) => {
          cachedVenuePrices = data;
          setVenuePrices(data);
          return data;
        })
        .catch((err) => {
          console.error("Failed to fetch venue prices:", err);
          return {};
        });
      return fetchPromise;
    };

    const handleVenuePriceUpdate = () => {
      cachedVenuePrices = null;
      fetchPromise = null;
      loadPrices();
    };

    window.addEventListener("softshape_venue_prices_updated", handleVenuePriceUpdate);

    if (!cachedVenuePrices && !fetchPromise) loadPrices();

    fetchPromise?.then((data) => setVenuePrices(data));

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
