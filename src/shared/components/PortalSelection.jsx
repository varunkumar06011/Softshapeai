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
import { Link } from 'react-router-dom';
import { LayoutDashboard, Smartphone, ShoppingCart, UserCog, QrCode } from 'lucide-react';

const PortalSelection = ({ onSelect }) => {
  const isDesktopApp = typeof window !== 'undefined' && !!window.__TAURI__;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FFF5F5] p-6 relative overflow-hidden font-['Inter',sans-serif]">
      {/* Abstract Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#E53935]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#B71C1C]/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Manager Login link — top right */}
      <button
        onClick={() => onSelect('manager')}
        className="absolute top-6 right-6 z-20 text-sm font-bold text-[#E53935] hover:text-[#B71C1C] transition-colors"
      >
        Manager Login →
      </button>
      
      <h1 className="sr-only">Softshape.ai — Free AI-Powered POS Billing Software for Restaurants, Cafes & Bars</h1>
      <div className="mb-8 text-center z-10 animate-fade-in">
        <div className="flex flex-col items-center justify-center gap-4">
          <img 
            src="/logo softshape.ai.png" 
            alt="Softshape.ai — Restaurant POS Billing Software Logo" 
            className="h-64 md:h-80 w-auto object-contain" 
          />
        </div>
        <p className="mt-5 text-center text-lg sm:text-xl md:text-2xl font-bold text-[#B71C1C] max-w-2xl mx-auto leading-snug">
          Free POS Billing Software for Restaurants, Cafes & Bars
        </p>
        <p className="mt-3 text-center text-sm md:text-base text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Trusted by restaurants, cafes, and bars across India for all-in-one billing, KOT, inventory, and QR code ordering.
        </p>
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
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter">
            Admin Portal
            <span className="sr-only"> — Restaurant POS Billing & Management</span>
          </h2>
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
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter">
            Cashier Panel
            <span className="sr-only"> — POS Billing & Payments</span>
          </h2>
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
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter">
            Captain App
            <span className="sr-only"> — Restaurant Order Taking App</span>
          </h2>
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
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter">
            User Menu View
            <span className="sr-only"> — QR Code Menu Ordering</span>
          </h2>
          <p className="mt-3 text-[13px] font-semibold leading-relaxed text-gray-500">Interactive QR-based dining experience</p>
        </button>
      </div>

      <footer className="mt-16 flex flex-col items-center gap-4 z-10 text-center">
        <p className="text-[11px] font-black uppercase tracking-[0.5em] text-[#B71C1C] drop-shadow-sm">Powered by Vtech</p>
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
          <Link
            to={isDesktopApp ? '/onboarding' : '/onboarding/legacy'}
            className="text-sm font-semibold text-[#E53935] hover:text-[#B71C1C] transition-colors flex items-center gap-2"
          >
            New Restaurant? Get Started →
          </Link>
          <span className="hidden sm:block text-gray-300">|</span>
          <Link
            to="/edge-setup"
            className="text-sm font-semibold text-gray-500 hover:text-[#E53935] transition-colors flex items-center gap-2"
          >
            Link Existing Restaurant →
          </Link>
        </div>
      </footer>
    </div>
  );
};

export default PortalSelection;
