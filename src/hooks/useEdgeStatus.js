// ─────────────────────────────────────────────────────────────────────────────
// useEdgeStatus — React hook for tracking edge server availability
// ─────────────────────────────────────────────────────────────────────────────
// Subscribes to edgeClient's availability pub/sub and re-renders when
// the edge server comes online or goes offline.
//
// Usage:
//   import { useEdgeStatus } from '../hooks/useEdgeStatus';
//
//   function MyComponent() {
//     const { edgeAvailable, edgeUrl } = useEdgeStatus();
//     return (
//       <div>
//         {edgeAvailable ? 'Edge: Connected' : 'Edge: Disconnected'}
//       </div>
//     );
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { isEdgeAvailable, getEdgeUrl, subscribeEdgeAvailability } from '../services/edgeClient';

export function useEdgeStatus() {
  const [available, setAvailable] = useState(isEdgeAvailable());
  const edgeUrl = getEdgeUrl();

  useEffect(() => {
    const unsubscribe = subscribeEdgeAvailability((isAvailable) => {
      setAvailable(isAvailable);
    });
    return unsubscribe;
  }, []);

  return {
    edgeAvailable: available,
    edgeUrl,
  };
}
