import { useState, useEffect } from "react";
import { API_BASE } from "../services/apiConfig";

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

  return venuePrices;
}
