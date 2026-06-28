import { useState, useEffect, useCallback } from 'react';
import { apiUrl, getAuthHeaders } from '../services/apiConfig.js';

const flagCache = new Map();

export function useFeatureFlag(key) {
  const [enabled, setEnabled] = useState(flagCache.get(key) ?? false);
  const [loading, setLoading] = useState(!flagCache.has(key));

  useEffect(() => {
    if (flagCache.has(key)) {
      setEnabled(flagCache.get(key));
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl(`/api/public/feature-flags/${key}`), {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setEnabled(data.enabled);
            flagCache.set(key, data.enabled);
          }
        }
      } catch {
        // Silently fail — default to false
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [key]);

  return { enabled, loading };
}

export function clearFeatureFlagCache() {
  flagCache.clear();
}
