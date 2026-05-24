import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CustomerMenu from './CustomerMenu';
import SliceChallenge from './SliceChallenge';
import BarMenu from './BarMenu';
import { motion } from 'framer-motion';
import { UtensilsCrossed, GlassWater, Sparkles, ArrowRight } from 'lucide-react';

export default function UserMenuApp() {
  const { tableId } = useParams();
  const navigate = useNavigate();
  
  // 'selection', 'engagement', 'menu', 'bar-menu'
  const [view, setView] = useState('selection');
  const [discountAmount, setDiscountAmount] = useState(0);

  useEffect(() => {
    if (!tableId) {
      navigate('/user-menu/table-1', { replace: true });
    }
  }, [tableId, navigate]);

  if (!tableId) return null;

  if (view === 'selection') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FFF5F5] p-6 relative overflow-hidden font-['Inter',sans-serif]">
        {/* Abstract Background Blurs */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#FF4D4F]/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#B71C1C]/5 rounded-full blur-[120px] pointer-events-none" />
        
        {/* Top Header/Logo */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 text-center z-10"
        >
          <img 
            src="/logo softshape.ai.png" 
            alt="softshape.ai" 
            className="h-44 md:h-52 w-auto object-contain mx-auto" 
          />
          <h1 className="text-xl font-black text-gray-500 uppercase tracking-[0.2em] mt-2">
            Welcome to Table {tableId.replace('table-', '')}
          </h1>
        </motion.div>

        {/* Experience Cards */}
        <div className="grid w-full max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2 z-10 px-4">
          
          {/* Restaurant Experience */}
          <motion.button 
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            onClick={() => setView('engagement')}
            className="group relative flex flex-col items-start rounded-[32px] border-2 border-white bg-white/80 backdrop-blur-xl p-8 shadow-[0_20px_40px_rgba(255,77,79,0.04)] transition-all duration-500 hover:border-[#FF4D4F] hover:bg-white hover:translate-y-[-8px] text-left cursor-pointer"
          >
            <div className="absolute top-6 right-6 bg-red-50 text-[#FF4D4F] px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
              <Sparkles size={10} className="animate-pulse" /> Play & Win
            </div>
            
            <div className="mb-6 rounded-2xl bg-red-50 p-4 text-[#FF4D4F] transition-all duration-500 group-hover:scale-110 group-hover:bg-[#FF4D4F] group-hover:text-white shadow-inner">
              <UtensilsCrossed size={32} strokeWidth={2.5} />
            </div>
            
            <h2 className="text-2xl font-black text-gray-900 tracking-tighter uppercase">Dining Room</h2>
            <p className="mt-3 text-[13px] font-semibold leading-relaxed text-gray-500">
              Play our quick table game to win exclusive food discounts, then browse our full range of starters, mains, and desserts.
            </p>
            
            <div className="mt-6 flex items-center gap-2 text-[#FF4D4F] text-[11px] font-black uppercase tracking-widest group-hover:translate-x-1 transition-transform">
              Proceed <ArrowRight size={14} />
            </div>
          </motion.button>

          {/* Bar Experience */}
          <motion.button 
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            onClick={() => setView('bar-menu')}
            className="group relative flex flex-col items-start rounded-[32px] border-2 border-white bg-white/80 backdrop-blur-xl p-8 shadow-[0_20px_40px_rgba(183,28,28,0.04)] transition-all duration-500 hover:border-[#B71C1C] hover:bg-white hover:translate-y-[-8px] text-left cursor-pointer"
          >
            <div className="absolute top-6 right-6 bg-red-50/50 text-[#B71C1C] px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm">
              ⚡ Direct Entry
            </div>

            <div className="mb-6 rounded-2xl bg-[#FFF5F5] p-4 text-[#B71C1C] transition-all duration-500 group-hover:scale-110 group-hover:bg-[#B71C1C] group-hover:text-white shadow-inner">
              <GlassWater size={32} strokeWidth={2.5} />
            </div>
            
            <h2 className="text-2xl font-black text-gray-900 tracking-tighter uppercase">Bar & Lounge</h2>
            <p className="mt-3 text-[13px] font-semibold leading-relaxed text-gray-500">
              Skip the game. Browse our premium craft beers, imported liquor, signature cocktails, and gourmet lounge pairings immediately.
            </p>
            
            <div className="mt-6 flex items-center gap-2 text-[#B71C1C] text-[11px] font-black uppercase tracking-widest group-hover:translate-x-1 transition-transform">
              Proceed <ArrowRight size={14} />
            </div>
          </motion.button>

        </div>

        <footer className="mt-16 flex flex-col items-center gap-4 z-10">
          <p className="text-[11px] font-black uppercase tracking-[0.5em] text-[#B71C1C]/40 drop-shadow-sm">
            Powered by softshape.ai
          </p>
        </footer>
      </div>
    );
  }

  if (view === 'engagement') {
    return (
      <SliceChallenge 
        onComplete={(totalDiscount) => {
          setDiscountAmount(totalDiscount);
          setView('menu');
        }}
        onSkip={() => setView('menu')}
      />
    );
  }

  if (view === 'bar-menu') {
    return <BarMenu tableId={tableId} />;
  }

  return <CustomerMenu tableId={tableId} discountPercentage={discountAmount} />;
}

