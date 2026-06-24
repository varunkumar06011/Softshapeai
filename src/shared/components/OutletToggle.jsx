import React, { useState } from 'react';
import { useOutlet } from '../../context/OutletContext';
import { X, Lock } from 'lucide-react';

export default function OutletToggle({ className = '', requireAuth = false }) {
  const { outlet, switchOutlet, enabledModules } = useOutlet();
  const [showModal, setShowModal] = useState(false);
  const [pendingOutlet, setPendingOutlet] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleToggle = (target) => {
    if (target === outlet) return;
    if (requireAuth) {
      setPendingOutlet(target);
      setShowModal(true);
      setPassword('');
      setError('');
    } else {
      switchOutlet(target);
    }
  };

  const handleConfirm = () => {
    if (password === '1001') {
      switchOutlet(pendingOutlet);
      setShowModal(false);
      setPendingOutlet(null);
    } else {
      setError('Incorrect password.');
    }
  };

  return (
    <>
      <div className={`flex items-center bg-gray-100 rounded-full p-1 gap-1 shrink-0 ${className}`}>
        <button
          onClick={() => handleToggle('restaurant')}
          className={`px-2.5 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
            outlet === 'restaurant'
              ? 'bg-[#E53935] text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="text-base sm:text-lg">🍽</span>
          <span className="hidden xs:inline">Restaurant</span>
        </button>
        {enabledModules?.bar !== false && (
        <button
          onClick={() => handleToggle('bar')}
          className={`px-2.5 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
            outlet === 'bar'
              ? 'bg-[#B71C1C] text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="text-base sm:text-lg">🍺</span>
          <span className="hidden xs:inline">Bar</span>
        </button>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[24px] p-6 sm:p-8 w-full max-w-sm shadow-[0_20px_50px_rgba(0,0,0,0.3)] animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-[#B71C1C]">
                  <Lock size={20} />
                </div>
                <h3 className="text-lg font-black text-gray-900 uppercase tracking-widest">Security Check</h3>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full p-2 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <p className="text-sm font-bold text-gray-600 mb-6">
              Enter password to switch to{' '}
              {pendingOutlet === 'bar' ? 'Bar' : 'Restaurant'} mode.
            </p>
            
            <div className="space-y-4">
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirm();
                  }}
                  placeholder="Enter Password"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-center font-black tracking-widest focus:outline-none focus:ring-2 focus:ring-[#B71C1C]/20 focus:border-[#B71C1C] transition-all"
                  autoFocus
                />
                {error && <p className="text-[10px] font-black text-[#B71C1C] mt-2 text-center uppercase tracking-widest">{error}</p>}
              </div>
              
              <button
                onClick={handleConfirm}
                className="w-full py-4 bg-[#B71C1C] text-white rounded-xl font-black uppercase tracking-widest hover:bg-[#E53935] active:scale-[0.98] transition-all shadow-md"
              >
                Confirm Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
