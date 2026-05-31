import { useState, useEffect } from "react";
import { API_BASE } from "../services/apiConfig";

let cachedVenuePrices = null;
let fetchPromise = null;

export function useVenuePrices() {
  const [venuePrices, setVenuePrices] = useState(cachedVenuePrices || {});

  useEffect(() => {
    if (cachedVenuePrices) return;

    if (!fetchPromise) {
      console.log("Fetching venue prices..."); fetchPromise = fetch(`${API_BASE}/api/venue/all-prices`)
        .then((res) => res.json())
        .then((data) => {
          cachedVenuePrices = data;
          return data;
        })
        .catch((err) => {
          console.error("Failed to fetch venue prices:", err);
          return {};
        });
    }

    fetchPromise.then((data) => {
      setVenuePrices(data);
    });
  }, []);

  return venuePrices;
}
