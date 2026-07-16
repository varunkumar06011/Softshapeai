import { useState, useEffect, useCallback } from "react";
import { getEdgeUrl, getStoredEdgeApiKey } from "../services/edgeHealth";

// Hook that polls the edge server for dead-lettered sync records and returns
// the count + records so the UI can show a recovery banner.
// Polls every 30 seconds when the edge server is available.

const POLL_INTERVAL_MS = 30_000;

export function useDeadLetterAlert() {
  const [deadLetterCount, setDeadLetterCount] = useState(0);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchDeadLetters = useCallback(async () => {
    const edgeUrl = getEdgeUrl();
    const apiKey = getStoredEdgeApiKey();
    if (!edgeUrl || !apiKey) return;

    try {
      const res = await fetch(`${edgeUrl}/api/edge/sync/dead-letter`, {
        headers: { "x-edge-api-key": apiKey },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      const data = await res.json();
      setDeadLetterCount(data.count || 0);
      setRecords(data.records || []);
    } catch {
      // Edge server unreachable — silently skip
    }
  }, []);

  useEffect(() => {
    fetchDeadLetters();
    const interval = setInterval(fetchDeadLetters, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchDeadLetters]);

  const retryAll = useCallback(async () => {
    const edgeUrl = getEdgeUrl();
    const apiKey = getStoredEdgeApiKey();
    if (!edgeUrl || !apiKey) return;
    try {
      await fetch(`${edgeUrl}/api/edge/sync/retry`, {
        method: "POST",
        headers: { "x-edge-api-key": apiKey },
      });
      await fetchDeadLetters();
    } catch (err) {
      console.error("[DeadLetter] Retry all failed:", err);
    }
  }, [fetchDeadLetters]);

  const retryOne = useCallback(async (queueId) => {
    const edgeUrl = getEdgeUrl();
    const apiKey = getStoredEdgeApiKey();
    if (!edgeUrl || !apiKey) return;
    try {
      await fetch(`${edgeUrl}/api/edge/sync/dead-letter/${queueId}/retry`, {
        method: "POST",
        headers: { "x-edge-api-key": apiKey },
      });
      await fetchDeadLetters();
    } catch (err) {
      console.error("[DeadLetter] Retry one failed:", err);
    }
  }, [fetchDeadLetters]);

  const discardOne = useCallback(async (queueId) => {
    const edgeUrl = getEdgeUrl();
    const apiKey = getStoredEdgeApiKey();
    if (!edgeUrl || !apiKey) return;
    try {
      await fetch(`${edgeUrl}/api/edge/sync/dead-letter/${queueId}/discard`, {
        method: "POST",
        headers: { "x-edge-api-key": apiKey },
      });
      await fetchDeadLetters();
    } catch (err) {
      console.error("[DeadLetter] Discard one failed:", err);
    }
  }, [fetchDeadLetters]);

  return {
    deadLetterCount,
    records,
    loading,
    refetch: fetchDeadLetters,
    retryAll,
    retryOne,
    discardOne,
  };
}
