// ─────────────────────────────────────────────────────────────────────────────
// PortalSelection — Landing page for selecting which portal to log into
// ─────────────────────────────────────────────────────────────────────────────
// Displays cards for each available portal:
//   - Admin Dashboard (restaurant management, reports, settings)
//   - Cashier POS (billing, table management, order settlement)
//   - Captain POS (order taking, table management)
//   - User Menu (customer-facing QR menu)
//
// Each card navigates to the corresponding login screen with the selected role.
// Shown when the user visits the root URL without being authenticated.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { LayoutDashboard, Smartphone, ShoppingCart, UserCog, QrCode } from 'lucide-react';

const PortalSelection = ({ onSelect }) => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FFF5F5] p-6 relative overflow-hidden font-['Inter',sans-serif]">
      {/* Abstract Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#E53935]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#B71C1C]/5 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="mb-6 text-center z-10 animate-fade-in">
        <div className="flex flex-col items-center justify-center gap-4">
          <img 
            src="/logo softshape.ai.png" 
            alt="softshape.ai" 
            className="h-64 md:h-80 w-auto object-contain" 
          />
        </div>
      </div>

      <div className="grid w-full max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 z-10 px-4">
        {/* Admin Portal */}
        <button 
          onClick={() => onSelect('admin')}
          className="group relative flex flex-col items-start rounded-[32px] border-2 border-white bg-white/80 backdrop-blur-xl p-8 shadow-[0_20px_40px_rgba(183,28,28,0.06)] transition-all duration-500 hover:border-[#E53935] hover:bg-white hover:translate-y-[-8px] text-left"
        >
          <div className="mb-6 rounded-2xl bg-[#FFEBEE] p-4 text-[#E53935] transition-all duration-500 group-hover:scale-110 group-hover:bg-[#E53935] group-hover:text-white shadow-inner">
            <UserCog size={32} strokeWidth={2.5} />
          </div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter">Admin Portal</h2>
          <p className="mt-3 text-[13px] font-semibold leading-relaxed text-gray-500">Management suite for revenue, surveillance, and global analytics.</p>
        </button>

        {/* Cashier Portal */}
        <button 
          onClick={() => onSelect('cashier')}
          className="group relative flex flex-col items-start rounded-[32px] border-2 border-white bg-white/80 backdrop-blur-xl p-8 shadow-[0_20px_40px_rgba(183,28,28,0.06)] transition-all duration-500 hover:border-[#B71C1C] hover:bg-white hover:translate-y-[-8px] text-left"
        >
          <div className="mb-6 rounded-2xl bg-[#FFF5F5] p-4 text-[#B71C1C] transition-all duration-500 group-hover:scale-110 group-hover:bg-[#B71C1C] group-hover:text-white shadow-inner">
            <ShoppingCart size={32} strokeWidth={2.5} />
          </div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter">Cashier Panel</h2>
          <p className="mt-3 text-[13px] font-semibold leading-relaxed text-gray-500">Operational interface for billing, payments, and order fulfillment.</p>
        </button>

        {/* Captain App */}
        <button 
          onClick={() => onSelect('captain')}
          className="group relative flex flex-col items-start rounded-[32px] border-2 border-white bg-white/80 backdrop-blur-xl p-8 shadow-[0_20px_40px_rgba(183,28,28,0.06)] transition-all duration-500 hover:border-[#B71C1C] hover:bg-white hover:translate-y-[-8px] text-left"
        >
          <div className="mb-6 rounded-2xl bg-[#FFF5F5] p-4 text-[#B71C1C] transition-all duration-500 group-hover:scale-110 group-hover:bg-[#B71C1C] group-hover:text-white shadow-inner">
            <Smartphone size={32} strokeWidth={2.5} />
          </div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter">Captain App</h2>
          <p className="mt-3 text-[13px] font-semibold leading-relaxed text-gray-500">Field-ready interface for table orders and service tracking.</p>
        </button>
        
        {/* User Menu View */}
        <button 
          onClick={() => onSelect('user-menu')}
          className="group relative flex flex-col items-start rounded-[32px] border-2 border-white bg-white/80 backdrop-blur-xl p-8 shadow-[0_20px_40px_rgba(183,28,28,0.06)] transition-all duration-500 hover:border-[#B71C1C] hover:bg-white hover:translate-y-[-8px] text-left"
        >
          <div className="mb-6 rounded-2xl bg-[#FFF5F5] p-4 text-[#B71C1C] transition-all duration-500 group-hover:scale-110 group-hover:bg-[#B71C1C] group-hover:text-white shadow-inner">
            <QrCode size={32} strokeWidth={2.5} />
          </div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter">User Menu View</h2>
          <p className="mt-3 text-[13px] font-semibold leading-relaxed text-gray-500">Interactive QR-based dining experience</p>
        </button>
      </div>

      <footer className="mt-16 flex flex-col items-center gap-4 z-10">
        <p className="text-[11px] font-black uppercase tracking-[0.5em] text-[#B71C1C] drop-shadow-sm">Powered by Vtech</p>
        <a
          href="/onboarding"
          className="text-sm font-semibold text-[#E53935] hover:text-[#B71C1C] transition-colors flex items-center gap-2"
        >
          New Restaurant? Get Started →
        </a>
      </footer>
    </div>
  );
};

export default PortalSelection;
