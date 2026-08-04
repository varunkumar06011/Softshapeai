// ─────────────────────────────────────────────────────────────────────────────
// RepresentativeMenuLanding — Customer-facing landing for non-table QR codes
// ─────────────────────────────────────────────────────────────────────────────
// Handles representative QR codes (e.g., bar counter). Verifies the signature with
// the backend, then loads either the food menu or bar menu based on outletType.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import CustomerMenu from './CustomerMenu';
import BarMenu from './BarMenu';
import { apiFetch } from '../services/apiConfig';

export default function RepresentativeMenuLanding() {
  const { slug, entityId, sig } = useParams();
  const [verified, setVerified] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(`/api/public/representative-qr/${encodeURIComponent(slug)}/${encodeURIComponent(entityId)}/${encodeURIComponent(sig)}`);
        if (!cancelled) setVerified(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Invalid or expired QR code');
      }
    })();
    return () => { cancelled = true; };
  }, [slug, entityId, sig]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FFF5F5] p-6 font-['Inter',sans-serif]">
        <div className="bg-white rounded-[32px] p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-black text-gray-900 mb-2">Menu Unavailable</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FFF5F5] p-6 font-['Inter',sans-serif]">
        <div className="w-10 h-10 border-2 border-[#E53935] border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-xs font-bold text-gray-500">Loading menu...</p>
      </div>
    );
  }

  const isMenuOnly = true; // Representative QRs never map to a physical table

  if (verified.outletType === 'BAR') {
    return <BarMenu slug={slug} representativeId={entityId} sig={sig} isMenuOnly={isMenuOnly} />;
  }

  return <CustomerMenu slug={slug} representativeId={entityId} sig={sig} isMenuOnly={isMenuOnly} />;
}
