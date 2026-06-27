import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';
import { hapticMedium } from '../shared/hooks/useHaptics';

const FOOD_ITEMS = ['🍔', '🍕', '🥟', '🍣', '🍟'];

export default function SliceChallenge({ onComplete, onSkip }) {
  const [round, setRound] = useState(0); // 0, 1, 2
  const [isSliced, setIsSliced] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [totalDiscount, setTotalDiscount] = useState(0);
  
  // Game state
  const [currentItem, setCurrentItem] = useState(FOOD_ITEMS[0]);
  const [slashPos, setSlashPos] = useState(null);

  const rewards = [
    { text: '5% OFF!', value: 5 },
    { text: 'Better Luck Next Time', value: 0 },
    { text: '1% OFF!', value: 1 }
  ];

  // Spawn new item for each round
  useEffect(() => {
    if (round < 3 && !showResult) {
      setCurrentItem(FOOD_ITEMS[Math.floor(Math.random() * FOOD_ITEMS.length)]);
      setIsSliced(false);
      setSlashPos(null);
    }
  }, [round, showResult]);

  const handleSlice = (e) => {
    if (isSliced || round >= 3) return;

    // Haptic feedback
    hapticMedium();

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX || (e.touches && e.touches[0].clientX) || rect.left + rect.width / 2;
    const y = e.clientY || (e.touches && e.touches[0].clientY) || rect.top + rect.height / 2;

    setSlashPos({ x, y });
    setIsSliced(true);

    const reward = rewards[round];
    setTotalDiscount(prev => prev + reward.value);

    // After brief slice animation, proceed to next round
    setTimeout(() => {
      if (round === 2) {
        setShowResult(true);
      } else {
        setRound(prev => prev + 1);
      }
    }, 1500);
  };

  if (showResult) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center p-6 z-[100] font-['Inter',sans-serif]">
        
        {/* Confetti Particles */}
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{ backgroundColor: ['#FF4D4F', '#FFD700', '#4CAF50', '#2196F3'][i % 4] }}
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{ 
              x: (Math.random() - 0.5) * window.innerWidth, 
              y: -window.innerHeight + Math.random() * 500,
              opacity: 0,
              rotate: Math.random() * 360
            }}
            transition={{ duration: 2, ease: "easeOut" }}
          />
        ))}

        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.5 }}
          className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-[40px] p-8 max-w-sm w-full text-center shadow-[0_0_50px_rgba(255,77,79,0.3)] relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#FF4D4F]/20 to-transparent pointer-events-none" />
          
          <div className="w-20 h-20 mx-auto bg-gradient-to-r from-[#FF4D4F] to-[#FF6B6B] rounded-full flex items-center justify-center mb-6 shadow-[0_10px_20px_rgba(255,77,79,0.4)]">
            <Sparkles className="text-white w-10 h-10 animate-pulse" />
          </div>
          
          <h2 className="text-3xl font-black text-white mb-2 tracking-tighter">Awesome!</h2>
          <p className="text-xl font-bold text-gray-300 mb-8">
            🎉 Total <span className="text-[#FF4D4F]">{totalDiscount}% Reward</span> Unlocked
          </p>
          
          <button 
            onClick={() => onComplete(totalDiscount)}
            className="w-full py-4 rounded-full bg-gradient-to-r from-[#FF4D4F] to-[#FF6B6B] text-white font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_15px_30px_rgba(255,77,79,0.3)] flex items-center justify-center gap-2"
          >
            View Menu <ArrowRight size={18} />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900 overflow-hidden z-[100] font-['Inter',sans-serif]">
      {/* Neon Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#FF4D4F]/20 rounded-full blur-[100px] pointer-events-none animate-[pulse_4s_ease-in-out_infinite]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/20 rounded-full blur-[100px] pointer-events-none animate-[pulse_6s_ease-in-out_infinite]" />
      
      {/* Header */}
      <div className="absolute top-10 left-0 w-full px-6 flex justify-between items-start z-10">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
            Slice & Unlock
          </h1>
          <p className="text-[10px] font-black text-[#FF4D4F] uppercase tracking-[0.2em] mt-1">
            {3 - round} chances left
          </p>
        </div>
        <button onClick={onSkip} className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-white transition-colors">
          Skip
        </button>
      </div>

      {/* Dynamic Unlocked Tracker */}
      <div className="absolute top-10 right-6 text-right z-10">
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Unlocked</p>
        <p className="text-2xl font-black text-[#FF4D4F]">{totalDiscount}%</p>
      </div>

      {/* Play Area */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <AnimatePresence mode="wait">
          {!isSliced ? (
            <motion.div
              key={`item-${round}`}
              initial={{ y: window.innerHeight, x: (Math.random() - 0.5) * 100, rotate: 0 }}
              animate={{ 
                y: -100, 
                x: (Math.random() - 0.5) * 200, 
                rotate: 360 
              }}
              transition={{ 
                y: { duration: 2.5, ease: "easeOut", repeat: Infinity, repeatType: "mirror" },
                x: { duration: 3, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" },
                rotate: { duration: 4, ease: "linear", repeat: Infinity }
              }}
              className="text-8xl pointer-events-auto cursor-crosshair select-none relative"
              onPointerDown={handleSlice}
              style={{ touchAction: 'none' }} // prevent scrolling
            >
              {/* Floating Trail */}
              <motion.div 
                className="absolute inset-0 bg-[#FF4D4F] rounded-full blur-xl opacity-30"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              {currentItem}
            </motion.div>
          ) : (
            <motion.div
              key={`sliced-${round}`}
              initial={{ scale: 1 }}
              animate={{ scale: 1.2, opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute pointer-events-none"
              style={{ left: slashPos?.x - 50, top: slashPos?.y - 50 }}
            >
              <div className="text-8xl filter blur-[2px] opacity-50 relative">
                {currentItem}
                
                {/* Slash Effect */}
                <motion.div 
                  initial={{ scaleX: 0, opacity: 1 }}
                  animate={{ scaleX: 2, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute top-1/2 left-1/2 w-48 h-2 bg-white -translate-x-1/2 -translate-y-1/2 shadow-[0_0_20px_#FF4D4F] origin-left rotate-45"
                />

                {/* Splash Particles */}
                {Array.from({ length: 8 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute top-1/2 left-1/2 w-4 h-4 bg-[#FF4D4F] rounded-full blur-[1px]"
                    initial={{ x: 0, y: 0, scale: 1 }}
                    animate={{ 
                      x: (Math.random() - 0.5) * 200, 
                      y: (Math.random() - 0.5) * 200,
                      scale: 0,
                      opacity: 0
                    }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                ))}
              </div>

              {/* Score Popup */}
              <motion.div
                initial={{ y: 50, opacity: 0, scale: 0.5 }}
                animate={{ y: -50, opacity: 1, scale: 1 }}
                transition={{ type: "spring", bounce: 0.6 }}
                className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-2xl font-black ${rewards[round].value > 0 ? 'text-[#FF4D4F]' : 'text-gray-400'} drop-shadow-[0_5px_10px_rgba(0,0,0,0.5)]`}
              >
                {rewards[round].text}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Embers Background */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        {Array.from({ length: 15 }).map((_, i) => (
          <motion.div
            key={`ember-${i}`}
            className="absolute w-1 h-1 bg-[#FF4D4F] rounded-full blur-[1px]"
            initial={{ 
              x: Math.random() * window.innerWidth, 
              y: window.innerHeight + Math.random() * 200 
            }}
            animate={{ 
              y: -100,
              x: `calc(${Math.random() * 100}vw)`,
              opacity: [0, 1, 0]
            }}
            transition={{ 
              duration: 3 + Math.random() * 4, 
              repeat: Infinity, 
              ease: "linear" 
            }}
          />
        ))}
      </div>
    </div>
  );
}
