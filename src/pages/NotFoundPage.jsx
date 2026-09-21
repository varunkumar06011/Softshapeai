// ─────────────────────────────────────────────────────────────────────────────
// NotFoundPage.jsx — 404 page for unmatched routes
// ─────────────────────────────────────────────────────────────────────────────
// Shown by the catch-all "*" route. Plays the dance-cat Lottie animation and
// offers a way back to the portal selection page.
// ─────────────────────────────────────────────────────────────────────────────

import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import LottieAnimation from '../shared/components/LottieAnimation';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#FFF5F5] p-6 text-center">
      <LottieAnimation src="/lottie/dance-cat.json" size={260} />
      <h2 className="mt-2 text-4xl font-black text-gray-900">404</h2>
      <p className="mt-2 max-w-sm text-sm font-bold text-gray-400">
        This page wandered off the menu. Let's get you back.
      </p>
      <button
        onClick={() => navigate('/')}
        className="mt-6 flex items-center justify-center gap-2 px-6 py-3 bg-[#E53935] text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-[#B71C1C] transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Home
      </button>
    </div>
  );
}
