/**
 * ShadowDashboard.jsx — Runtime Shadow Integration Dashboard (M2.6A)
 *
 * Two sections:
 *   1. Live Runtime Health — from /runtime/v2/shadow/stats + /runtime/v2/release-status
 *   2. Release Gates — from /runtime/v2/release-status (runtime facts) +
 *      external release metadata (CI-verified gates show "External")
 *
 * All data lives in the Runtime's SQLite — no local state storage.
 *
 * Route: /shadow-dashboard (accessed by direct URL, not linked from main UI)
 *
 * Temporary: remove after V1 cutover.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  getComparisonStats,
  getMismatches,
  getReleaseStatus,
  exportMismatches,
} from '../services/v1Compatibility/comparisonLogger.js';
import {
  isShadowEnabled,
  setShadowEnabled,
  getMigrationMode,
  setMigrationMode,
} from '../services/v1Compatibility/index.js';

export default function ShadowDashboard() {
  const [stats, setStats] = useState(null);
  const [releaseStatus, setReleaseStatus] = useState(null);
  const [mismatches, setMismatches] = useState([]);
  const [shadowOn, setShadowOn] = useState(isShadowEnabled());
  const [migrationMode, setMigrationModeState] = useState(getMigrationMode());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, releaseRes, mismatchRes] = await Promise.all([
        getComparisonStats(),
        getReleaseStatus().catch(() => null),
        getMismatches(20),
      ]);
      setStats(statsRes);
      setReleaseStatus(releaseRes);
      setMismatches(mismatchRes.mismatches || []);
    } catch (err) {
      setError(err?.message || 'Failed to load shadow data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const toggleShadow = () => {
    const newValue = !shadowOn;
    setShadowEnabled(newValue);
    setShadowOn(newValue);
  };

  const handleExport = async () => {
    try {
      const data = await exportMismatches(10000);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shadow-mismatches-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[shadow] Export failed:', err?.message || err);
    }
  };

  if (loading && !stats) {
    return <div style={styles.container}><p>Loading shadow data...</p></div>;
  }

  if (error) {
    return (
      <div style={styles.container}>
        <h1>Runtime Shadow Dashboard</h1>
        <p style={styles.error}>Error: {error}</p>
        <p>Ensure the edge server is running and the runtime token is configured.</p>
        <button onClick={refresh} style={styles.button}>Retry</button>
      </div>
    );
  }

  const matchRate = stats?.matchRate ?? 100;
  const matchRateColor = matchRate === 100 ? '#22c55e' : matchRate >= 99 ? '#eab308' : '#ef4444';
  const runtime = releaseStatus?.runtime;
  const release = releaseStatus?.release;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Runtime Shadow Dashboard</h1>

      {/* ── Section 1: Live Runtime Health ─────────────────────────────── */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Live Runtime Health</h2>
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Match Rate</div>
            <div style={{ ...styles.statValue, color: matchRateColor }}>
              {matchRate}%
            </div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Operations</div>
            <div style={styles.statValue}>{stats?.total ?? 0}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Mismatches</div>
            <div style={{ ...styles.statValue, color: (stats?.mismatches ?? 0) > 0 ? '#ef4444' : '#22c55e' }}>
              {stats?.mismatches ?? 0}
            </div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Oldest Mismatch</div>
            <div style={styles.statValue}>
              {stats?.oldestMismatchAge !== null && stats?.oldestMismatchAge !== undefined
                ? formatAge(stats.oldestMismatchAge)
                : 'None'}
            </div>
          </div>
        </div>

        <div style={{ ...styles.statsGrid, marginTop: '12px' }}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Current Streak</div>
            <div style={styles.statValue}>{stats?.currentMatchStreak ?? 0}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Longest Verified Streak</div>
            <div style={styles.statValue}>{stats?.longestVerifiedMatchStreak ?? 0}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Last Match</div>
            <div style={{ ...styles.statValue, fontSize: '16px' }}>
              {stats?.lastMatchTimestamp
                ? new Date(stats.lastMatchTimestamp).toLocaleTimeString()
                : 'Never'}
            </div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>First Mismatch After Startup</div>
            <div style={styles.statValue}>
              {stats?.firstMismatchAfterStartup !== null && stats?.firstMismatchAfterStartup !== undefined
                ? formatAge(stats.firstMismatchAfterStartup)
                : 'N/A'}
            </div>
          </div>
        </div>

        <div style={{ ...styles.statsGrid, marginTop: '12px' }}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Runtime Version</div>
            <div style={{ ...styles.statValue, fontSize: '16px' }}>
              {runtime?.runtimeVersion ?? 'unknown'}
            </div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Primary Engine</div>
            <div style={{ ...styles.statValue, fontSize: '16px' }}>
              {runtime?.primaryEngine?.toUpperCase() ?? 'V1'}
            </div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Migration Mode</div>
            <div style={{ ...styles.statValue, fontSize: '16px' }}>
              {runtime?.migrationMode ?? 'shadow'}
            </div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Shadow Session</div>
            <div style={{ ...styles.statValue, fontSize: '12px', fontFamily: 'monospace' }}>
              {runtime?.shadowSessionId
                ? `${runtime.shadowSessionId.slice(0, 16)}...`
                : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* ── By Operation ────────────────────────────────────────────────── */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>By Operation</h2>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Operation</th>
              <th style={styles.th}>Total</th>
              <th style={styles.th}>Matches</th>
              <th style={styles.th}>Mismatches</th>
              <th style={styles.th}>Match Rate</th>
            </tr>
          </thead>
          <tbody>
            {(stats?.operations || []).map((op) => (
              <tr key={op.operation}>
                <td style={styles.td}>{op.operation}</td>
                <td style={styles.td}>{op.total}</td>
                <td style={styles.td}>{op.matches}</td>
                <td style={{ ...styles.td, color: op.mismatches > 0 ? '#ef4444' : 'inherit' }}>
                  {op.mismatches}
                </td>
                <td style={{ ...styles.td, color: op.matchRate === 100 ? '#22c55e' : '#eab308' }}>
                  {op.matchRate}%
                </td>
              </tr>
            ))}
            {(stats?.operations || []).length === 0 && (
              <tr>
                <td style={styles.td} colSpan={5}>No operations recorded yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── By Build Version ────────────────────────────────────────────── */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>By Build Version</h2>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Runtime Version</th>
              <th style={styles.th}>Operations</th>
              <th style={styles.th}>Matches</th>
              <th style={styles.th}>Mismatches</th>
              <th style={styles.th}>Match Rate</th>
            </tr>
          </thead>
          <tbody>
            {(stats?.byBuildVersion || []).map((bv) => (
              <tr key={bv.runtimeVersion}>
                <td style={{ ...styles.td, fontFamily: 'monospace' }}>{bv.runtimeVersion}</td>
                <td style={styles.td}>{bv.total}</td>
                <td style={styles.td}>{bv.matches}</td>
                <td style={{ ...styles.td, color: bv.mismatches > 0 ? '#ef4444' : 'inherit' }}>
                  {bv.mismatches}
                </td>
                <td style={{ ...styles.td, color: bv.matchRate === 100 ? '#22c55e' : '#eab308' }}>
                  {bv.matchRate}%
                </td>
              </tr>
            ))}
            {(stats?.byBuildVersion || []).length === 0 && (
              <tr>
                <td style={styles.td} colSpan={5}>No build version data yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Recent Mismatches ───────────────────────────────────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={{ ...styles.sectionTitle, marginBottom: 0, borderBottom: 'none' }}>
            Recent Mismatches
          </h2>
          <button
            onClick={handleExport}
            style={{ ...styles.button, backgroundColor: '#6366f1' }}
          >
            Export as JSON
          </button>
        </div>
        {mismatches.length === 0 ? (
          <p style={styles.empty}>No mismatches recorded</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Time</th>
                <th style={styles.th}>Operation</th>
                <th style={styles.th}>V1 Entity</th>
                <th style={styles.th}>V2 Entity</th>
                <th style={styles.th}>Mismatches</th>
              </tr>
            </thead>
            <tbody>
              {mismatches.map((m, idx) => (
                <tr key={m.id || idx}>
                  <td style={styles.td}>{new Date(m.created_at).toLocaleString()}</td>
                  <td style={styles.td}>{m.operation}</td>
                  <td style={styles.td}>{m.v1_entity_id || '-'}</td>
                  <td style={styles.td}>{m.v2_entity_id || '-'}</td>
                  <td style={styles.td}>
                    {Array.isArray(m.mismatches) ? m.mismatches.join('; ') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Section 2: Release Gates ────────────────────────────────────── */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Release Gates</h2>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Gate</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Source</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={styles.td}>Platform (P1-P9)</td>
              <td style={{ ...styles.td, color: '#6b7280' }}>External</td>
              <td style={styles.td}>CI / release metadata</td>
            </tr>
            <tr>
              <td style={styles.td}>Chaos (C1-C8)</td>
              <td style={{ ...styles.td, color: '#6b7280' }}>External</td>
              <td style={styles.td}>CI / release metadata</td>
            </tr>
            <tr>
              <td style={styles.td}>Workflow (W1-W9)</td>
              <td style={{ ...styles.td, color: '#6b7280' }}>External</td>
              <td style={styles.td}>CI / release metadata</td>
            </tr>
            <tr>
              <td style={styles.td}>Restaurant Simulation</td>
              <td style={{ ...styles.td, color: '#6b7280' }}>External</td>
              <td style={styles.td}>CI / release metadata</td>
            </tr>
            <tr>
              <td style={styles.td}>Shadow Validation</td>
              <td style={{ ...styles.td, ...gateColor(release?.shadowValidationStatus) }}>
                {gateLabel(release?.shadowValidationStatus)}
              </td>
              <td style={styles.td}>Runtime</td>
            </tr>
            <tr>
              <td style={styles.td}>7-Day Soak</td>
              <td style={{ ...styles.td, ...gateColor('PENDING') }}>PENDING</td>
              <td style={styles.td}>Operational validation</td>
            </tr>
            <tr>
              <td style={styles.td}>Cutover</td>
              <td style={{ ...styles.td, ...gateColor('BLOCKED') }}>BLOCKED</td>
              <td style={styles.td}>Manual release decision</td>
            </tr>
            <tr>
              <td style={styles.td}>V1 Retirement</td>
              <td style={{ ...styles.td, ...gateColor('PENDING') }}>PENDING</td>
              <td style={styles.td}>Manual release decision</td>
            </tr>
          </tbody>
        </table>
        <div style={styles.overallRow}>
          <strong>Overall Release Status: </strong>
          <span style={styles.overallValue}>
            {computeOverall(release?.shadowValidationStatus)}
          </span>
        </div>
      </div>

      {/* ── Shadow Mode Controls ────────────────────────────────────────── */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Shadow Mode</h2>
        <div style={styles.toggleRow}>
          <span style={styles.toggleLabel}>
            Shadow execution: {shadowOn ? 'ON' : 'OFF'}
          </span>
          <button
            onClick={toggleShadow}
            style={{
              ...styles.button,
              backgroundColor: shadowOn ? '#ef4444' : '#22c55e',
            }}
          >
            {shadowOn ? 'Disable Shadow' : 'Enable Shadow'}
          </button>
          <button onClick={refresh} style={{ ...styles.button, backgroundColor: '#3b82f6' }}>
            Refresh
          </button>
        </div>
        <div style={{ ...styles.toggleRow, marginTop: '12px' }}>
          <span style={styles.toggleLabel}>
            Migration mode: {migrationMode}
          </span>
          <button
            onClick={() => {
              const newMode = migrationMode === 'shadow' ? 'cutover' : 'shadow';
              setMigrationMode(newMode);
              setMigrationModeState(newMode);
            }}
            style={{
              ...styles.button,
              backgroundColor: migrationMode === 'shadow' ? '#f59e0b' : '#8b5cf6',
            }}
          >
            Switch to {migrationMode === 'shadow' ? 'Cutover' : 'Shadow'} Mode
          </button>
        </div>
        <p style={styles.note}>
          When shadow mode is ON, V2 executes independently alongside V1.
          V1 remains the operational authority. V2 never affects the cashier.
        </p>
        <p style={styles.note}>
          Migration mode controls which engine is primary. "shadow" = V1 primary,
          V2 shadow. "cutover" = V2 primary, V1 shadow. Changing this is a
          conscious deployment decision — no automatic rollback.
        </p>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatAge(seconds) {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function gateColor(status) {
  switch (status) {
    case 'PASS': return { color: '#22c55e' };
    case 'IN_PROGRESS': return { color: '#eab308' };
    case 'BLOCKED': return { color: '#ef4444' };
    case 'PENDING': return { color: '#ef4444' };
    default: return { color: '#6b7280' };
  }
}

function gateLabel(status) {
  switch (status) {
    case 'PASS': return 'PASS';
    case 'IN_PROGRESS': return 'IN PROGRESS';
    case 'BLOCKED': return 'BLOCKED';
    case 'PENDING': return 'PENDING';
    default: return 'PENDING';
  }
}

function computeOverall(shadowValidationStatus) {
  if (shadowValidationStatus === 'PASS') return 'READY FOR FIRST CUTOVER (pending 7-day soak)';
  if (shadowValidationStatus === 'IN_PROGRESS') return 'NOT READY — shadow validation in progress';
  return 'NOT READY';
}

// ── Inline styles (no external CSS dependency) ───────────────────────────────

const styles = {
  container: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxWidth: '900px',
    margin: '0 auto',
    padding: '24px',
    color: '#1f2937',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    marginBottom: '24px',
  },
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '12px',
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: '8px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
  },
  statCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '16px',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '4px',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    borderBottom: '2px solid #e5e7eb',
    fontWeight: 600,
    color: '#374151',
  },
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #f3f4f6',
  },
  error: {
    color: '#ef4444',
    fontWeight: 500,
  },
  empty: {
    color: '#6b7280',
    fontStyle: 'italic',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  toggleLabel: {
    fontSize: '16px',
    fontWeight: 500,
  },
  button: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  note: {
    marginTop: '12px',
    fontSize: '13px',
    color: '#6b7280',
  },
  overallRow: {
    marginTop: '16px',
    padding: '12px 16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    fontSize: '16px',
  },
  overallValue: {
    fontWeight: 700,
    marginLeft: '8px',
  },
};
