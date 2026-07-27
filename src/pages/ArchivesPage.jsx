// ─────────────────────────────────────────────────────────────────────────────
// ArchivesPage — Public page listing all downloadable Softshape client apps
// ─────────────────────────────────────────────────────────────────────────────
// No login required. Renders the same AppsSection used in Admin → Settings so
// download URLs (GitHub releases) and QR codes stay in one place.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AppsSection from '../admin/settings/AppsSection';

export default function ArchivesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo softshape.ai.png"
              alt="Softshape"
              className="h-9 w-auto rounded-lg"
            />
            <h1 className="text-lg font-black uppercase tracking-tight text-gray-900">
              Archives
            </h1>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:border-[#E53935] hover:text-[#E53935]"
          >
            <ArrowLeft size={16} />
            Back to Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Download Apps</h2>
          <p className="mt-1 text-sm text-gray-500">
            Install SoftShape on your devices — all apps work offline. No login required to download.
          </p>
        </div>
        <AppsSection />
      </main>
    </div>
  );
}
