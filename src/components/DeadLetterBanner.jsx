import { useState } from "react";
import { useDeadLetterAlert } from "../hooks/useDeadLetterAlert";

// Banner shown on the cashier dashboard when dead-lettered sync records exist.
// Provides retry-all, per-record retry, and per-record discard actions.
export function DeadLetterBanner() {
  const { deadLetterCount, records, retryAll, retryOne, discardOne } = useDeadLetterAlert();
  const [expanded, setExpanded] = useState(false);

  if (deadLetterCount === 0) return null;

  const oldestRecord = records[0];
  const oldestAgeMs = oldestRecord ? Date.now() - (oldestRecord.createdAt || 0) : 0;
  const isCritical = oldestAgeMs > 15 * 60 * 1000; // 15 minutes

  return (
    <div
      style={{
        background: isCritical ? "#fef2f2" : "#fffbeb",
        border: `1px solid ${isCritical ? "#ef4444" : "#f59e0b"}`,
        borderRadius: "8px",
        padding: "12px 16px",
        marginBottom: "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "20px" }}>{isCritical ? "🔴" : "🟡"}</span>
          <div>
            <strong>{deadLetterCount} sync record(s) failed</strong>
            {isCritical && (
              <span style={{ color: "#dc2626", marginLeft: "8px", fontSize: "13px" }}>
                — oldest is over 15 minutes old, requires attention
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              padding: "4px 12px",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              background: "white",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            {expanded ? "Hide" : "Details"}
          </button>
          <button
            onClick={retryAll}
            style={{
              padding: "4px 12px",
              border: "1px solid #f59e0b",
              borderRadius: "4px",
              background: "#f59e0b",
              color: "white",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Retry All
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: "12px", maxHeight: "300px", overflowY: "auto" }}>
          {records.map((rec) => (
            <div
              key={rec.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px",
                borderBottom: "1px solid #e5e7eb",
                fontSize: "13px",
              }}
            >
              <div>
                <strong>{rec.tableName}</strong> ({rec.operation}) —
                attempts: {rec.attempts},
                <span style={{ color: "#dc2626", marginLeft: "4px" }}>
                  {rec.lastError || "unknown error"}
                </span>
                <span style={{ color: "#6b7280", marginLeft: "8px" }}>
                  {rec.createdAt ? new Date(rec.createdAt).toLocaleTimeString() : ""}
                </span>
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                <button
                  onClick={() => retryOne(rec.id)}
                  style={{
                    padding: "2px 8px",
                    border: "1px solid #d1d5db",
                    borderRadius: "3px",
                    background: "white",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  Retry
                </button>
                <button
                  onClick={() => {
                    if (confirm("Discard this record? It will be marked as synced and not retried.")) {
                      discardOne(rec.id);
                    }
                  }}
                  style={{
                    padding: "2px 8px",
                    border: "1px solid #dc2626",
                    borderRadius: "3px",
                    background: "white",
                    color: "#dc2626",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
