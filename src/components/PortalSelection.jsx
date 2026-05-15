import React from 'react';
import { LayoutDashboard, Smartphone, ShoppingCart, UserCog } from 'lucide-react';

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
            className="h-48 md:h-64 w-auto object-contain mix-blend-multiply drop-shadow-sm brightness-[0.7] contrast-[1.5] saturate-[1.5]" 
          />
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter">
            <span className="text-black">softshape</span>
            <span className="text-[#E53935]">.ai</span>
          </h1>
        </div>
      </div>

      <div className="grid w-full max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3 z-10 px-4">
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
      </div>

      <footer className="mt-16 flex flex-col items-center gap-4 opacity-40 z-10 scale-90">
        <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[#B71C1C]">Restaurant Management System v2.4.0</p>
      </footer>
    </div>
  );
};

export default PortalSelection;
