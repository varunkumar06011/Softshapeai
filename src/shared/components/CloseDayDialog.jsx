// ─────────────────────────────────────────────────────────────────────────────
// CloseDayDialog — "Close Day" action with sync confirmation
// ─────────────────────────────────────────────────────────────────────────────
// Forces a full sync pass via the edge server, shows the day's summary,
// and only allows closing when all records are synced and confirmed.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Loader2, Lock, RefreshCw } from 'lucide-react';
import { isEdgeAvailable, edgeFetch } from '../../services/edgeHealth';
import { apiUrl, getAuthHeaders } from '../../services/apiConfig';

export default function CloseDayDialog({ open, onClose, onClosed }) {
  const [step, setStep] = useState('idle'); // idle | syncing | summary | done
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  if (!open) return null;

  const handleStartClose = async () => {
    setStep('syncing');
    setError('');
    try {
      if (await isEdgeAvailable()) {
        const result = await edgeFetch('/api/edge/close-day', { method: 'POST' });
        setSummary(result);
        setStep('summary');
      } else {
        // No edge server — try cloud directly
        const res = await fetch(apiUrl('/api/reports/daily-summary'), {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error('Failed to get daily summary');
        const data = await res.json();
        setSummary({
          canClose: true,
          daySummary: data,
          message: 'Online — ready to close day.',
        });
        setStep('summary');
      }
    } catch (err) {
      setError(err.message || 'Failed to sync. Please check your connection and try again.');
      setStep('idle');
    }
  };

  const handleConfirmClose = async () => {
    setConfirming(true);
    try {
      // Mark the day as closed in the cloud
      const res = await fetch(apiUrl('/api/reports/close-day'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ date: summary.daySummary.date }),
      });
      if (!res.ok) throw new Error('Failed to close day on cloud');
      setStep('done');
      if (onClosed) onClosed();
    } catch (err) {
      setError(err.message || 'Failed to close day');
    } finally {
      setConfirming(false);
    }
  };

  const handleRetrySync = async () => {
    setStep('syncing');
    try {
      if (await isEdgeAvailable()) {
        await edgeFetch('/api/edge/sync/retry', { method: 'POST' });
      }
      await handleStartClose();
    } catch (err) {
      setError(err.message);
      setStep('summary');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Lock size={20} className="text-[#E53935]" />
            Close Day
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {step === 'idle' && (
            <>
              <p className="text-sm text-gray-600">
                Closing the day will sync all records to the cloud and lock today's transactions.
                This is the moment daily numbers become final.
              </p>
              {error && (
                <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>
              )}
              <button
                onClick={handleStartClose}
                className="w-full py-3 bg-[#E53935] text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors"
              >
                Start Close Day
              </button>
            </>
          )}

          {step === 'syncing' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 size={32} className="animate-spin text-[#E53935]" />
              <p className="text-sm font-bold text-gray-700">Syncing all records to cloud...</p>
              <p className="text-xs text-gray-400">Please wait — do not close this window</p>
            </div>
          )}

          {step === 'summary' && summary && (
            <>
              {/* Day summary */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium">Date</span>
                  <span className="font-bold text-gray-900">{summary.daySummary.date}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium">Total Orders</span>
                  <span className="font-bold text-gray-900">{summary.daySummary.totalOrders}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium">Settled Orders</span>
                  <span className="font-bold text-gray-900">{summary.daySummary.settledOrders}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium">Total Revenue</span>
                  <span className="font-bold text-gray-900">₹{Number(summary.daySummary.totalRevenue).toFixed(2)}</span>
                </div>
              </div>

              {/* Sync status */}
              {summary.canClose ? (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg p-3">
                  <CheckCircle2 size={16} />
                  <span>{summary.message}</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-orange-700 bg-orange-50 rounded-lg p-3">
                    <AlertTriangle size={16} />
                    <span>{summary.message}</span>
                  </div>
                  <button
                    onClick={handleRetrySync}
                    className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={14} />
                    Retry Sync
                  </button>
                </div>
              )}

              {error && (
                <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>
              )}

              {summary.canClose && (
                <button
                  onClick={handleConfirmClose}
                  disabled={confirming}
                  className="w-full py-3 bg-[#E53935] text-white rounded-xl font-black text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {confirming ? 'Closing...' : 'Confirm & Lock Day'}
                </button>
              )}
            </>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <CheckCircle2 size={40} className="text-green-600" />
              <p className="text-sm font-black text-gray-900">Day Closed Successfully</p>
              <p className="text-xs text-gray-500 text-center">
                All transactions have been synced and locked. Today's numbers are final.
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
