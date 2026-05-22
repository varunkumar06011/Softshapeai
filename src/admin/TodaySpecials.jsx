import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, Save, X, Star, Target, Zap, CheckCircle2, ChevronRight, Image as ImageIcon, Users, Flame
} from 'lucide-react';

const CAPTAINS = [
  { id: 'C1', name: 'Ajay Kumar', initials: 'AK', color: 'bg-[#EFF6FF] text-[#1D4ED8]' },
  { id: 'C2', name: 'Ravi Behar', initials: 'RB', color: 'bg-[#EEF2FF] text-[#4338CA]' },
  { id: 'C3', name: 'Sagar', initials: 'S', color: 'bg-[#ECFDF5] text-[#047857]' },
  { id: 'C4', name: 'Durga Prasad', initials: 'DP', color: 'bg-[#FFF1F2] text-[#BE123C]' },
  { id: 'C5', name: 'Subbaiah', initials: 'SU', color: 'bg-[#FEF3C7] text-[#D97706]' },
  { id: 'C6', name: 'Happy', initials: 'H', color: 'bg-[#F3E8FF] text-[#7E22CE]' },
];

export default function TodaySpecials() {
  const [specials, setSpecials] = useState(() => {
    const saved = localStorage.getItem('softshape_specials');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [targets, setTargets] = useState(() => {
    const saved = localStorage.getItem('softshape_captain_targets');
    return saved ? JSON.parse(saved) : {};
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [selectedCaptain, setSelectedCaptain] = useState(null);
  const [pushStatus, setPushStatus] = useState(null);

  // Target assignment states
  const [revenueTarget, setRevenueTarget] = useState(5000);
  const [discountLimit, setDiscountLimit] = useState(5);

  const [formData, setFormData] = useState({
    id: null,
    n: '', // name
    c: 'Main Course', // category
    p: '', // price
    t: 'veg', // type
    img: '',
    available: true,
    isCombo: false,
  });

  useEffect(() => {
    localStorage.setItem('softshape_specials', JSON.stringify(specials));
    window.dispatchEvent(new Event('storage')); // trigger sync for other tabs
  }, [specials]);

  useEffect(() => {
    localStorage.setItem('softshape_captain_targets', JSON.stringify(targets));
    // Could dispatch event here if needed
  }, [targets]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        setFormData({ ...formData, img: canvas.toDataURL('image/jpeg', 0.8) });
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!formData.n || !formData.p) return;
    
    setSpecials(prev => {
      if (formData.id) {
        return prev.map(s => s.id === formData.id ? { ...formData } : s);
      }
      return [...prev, { ...formData, id: Date.now().toString() }];
    });
    
    setFormData({
      id: null, n: '', c: 'Main Course', p: '', t: 'veg', img: '', available: true, isCombo: false
    });
    setIsModalOpen(false);
  };

  const handleDelete = (id) => {
    setSpecials(prev => prev.filter(s => s.id !== id));
  };

  const simulatePush = () => {
    setPushStatus('pushing');
    setTimeout(() => {
      setPushStatus('success');
      setTimeout(() => setPushStatus(null), 3000);
    }, 1500);
  };

  const handleAssignTarget = () => {
    if (!selectedCaptain) return;
    
    setTargets(prev => ({
      ...prev,
      [selectedCaptain.id]: {
        revenueTarget,
        discountLimit,
        timestamp: new Date().toISOString()
      }
    }));
    
    setIsTargetModalOpen(false);
    setSelectedCaptain(null);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Star className="text-amber-500 fill-amber-500" /> Today Specials
          </h2>
          <p className="text-xs font-bold text-gray-500 mt-1">Manage daily recommendations & captain targets</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={() => setIsTargetModalOpen(true)}
            className="flex-1 md:flex-none px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-black uppercase tracking-widest hover:border-gray-300 hover:shadow-sm transition-all flex items-center justify-center gap-2"
          >
            <Target size={16} className="text-[#E53935]" /> Assign Targets
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex-1 md:flex-none px-5 py-2.5 bg-[#E53935] text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-md shadow-red-100 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={16} /> New Special
          </button>
        </div>
      </div>

      {/* SPECIALS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {specials.map(special => (
          <div key={special.id} className={`bg-white rounded-2xl border ${special.available ? 'border-amber-200 shadow-lg shadow-amber-50' : 'border-gray-200 opacity-60'} overflow-hidden flex flex-col group`}>
            <div className="h-40 w-full bg-gray-100 relative overflow-hidden flex-shrink-0">
              {special.img ? (
                <img src={special.img} alt={special.n} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <ImageIcon size={32} />
                </div>
              )}
              
              <div className="absolute top-3 right-3 flex gap-2">
                {special.isCombo && (
                  <span className="bg-amber-500 text-white px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">Combo</span>
                )}
                <div className={`w-5 h-5 rounded-md flex items-center justify-center bg-white shadow-sm border ${special.t === 'veg' ? 'border-green-500 text-green-500' : 'border-red-500 text-red-500'}`}>
                  <div className={`w-2 h-2 rounded-full ${special.t === 'veg' ? 'bg-green-500' : 'bg-red-500'}`} />
                </div>
              </div>
            </div>
            
            <div className="p-4 flex flex-col flex-grow">
              <div className="flex justify-between items-start mb-1">
                <h3 className="text-sm font-black text-gray-900 leading-tight">{special.n}</h3>
                <span className="text-sm font-black text-[#E53935]">₹{special.p}</span>
              </div>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{special.c}</span>
              
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${special.available ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    {special.available ? 'Active' : 'Hidden'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => { setFormData(special); setIsModalOpen(true); }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => handleDelete(special.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {specials.length === 0 && (
          <div className="col-span-full py-16 bg-white rounded-3xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center">
            <Star size={40} className="text-gray-300 mb-4" />
            <h3 className="text-lg font-black text-gray-900 mb-2">No Specials Added</h3>
            <p className="text-xs font-bold text-gray-500 max-w-sm">Create today's specials to instantly push recommendations to the Captain App.</p>
          </div>
        )}
      </div>

      {/* SWIGGY/ZOMATO SYNC ACTIONS */}
      <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#FFF4F4] text-[#E53935] rounded-2xl flex items-center justify-center">
            <Zap size={24} />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-900">Sync Aggregators</h3>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Push specials to Swiggy & Zomato</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {pushStatus === 'success' && (
            <span className="text-[10px] font-black uppercase tracking-widest text-green-600 flex items-center gap-1 animate-in fade-in zoom-in">
              <CheckCircle2 size={14} /> Synced Successfully
            </span>
          )}
          <button 
            onClick={simulatePush}
            disabled={pushStatus === 'pushing'}
            className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {pushStatus === 'pushing' ? 'Syncing...' : 'Push Updates'}
          </button>
        </div>
      </div>

      {/* CREATE SPECIAL MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">
                {formData.id ? 'Edit Special' : 'New Special'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100"><X size={18} /></button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Item Name</label>
                  <input 
                    type="text" 
                    value={formData.n} 
                    onChange={e => setFormData({...formData, n: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[#E53935]/20 focus:border-[#E53935] outline-none transition-all"
                    placeholder="e.g. Special Chicken Biryani"
                  />
                </div>
                
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Category</label>
                  <select 
                    value={formData.c} 
                    onChange={e => setFormData({...formData, c: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
                  >
                    <option>Starters</option>
                    <option>Main Course</option>
                    <option>Desserts</option>
                    <option>Drinks</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Price (₹)</label>
                  <input 
                    type="number" 
                    value={formData.p} 
                    onChange={e => setFormData({...formData, p: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
                    placeholder="e.g. 450"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Diet Type</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setFormData({...formData, t: 'veg'})}
                    className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${formData.t === 'veg' ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <div className="w-2 h-2 rounded-full bg-green-500" /> Veg
                  </button>
                  <button 
                    onClick={() => setFormData({...formData, t: 'non-veg'})}
                    className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${formData.t === 'non-veg' ? 'bg-red-50 border-red-200 text-red-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <div className="w-2 h-2 rounded-full bg-red-500" /> Non-Veg
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Image</label>
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center relative bg-gray-50 hover:bg-gray-100 transition-colors group overflow-hidden">
                  {formData.img ? (
                    <>
                       <img src={formData.img} alt="Preview" className="h-32 object-contain mb-2" />
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-white text-[10px] font-black uppercase tracking-widest bg-black/50 px-3 py-1.5 rounded-lg">Change Image</span>
                       </div>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="text-gray-400 mb-2" />
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Upload Image</span>
                    </>
                  )}
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.available}
                    onChange={e => setFormData({...formData, available: e.target.checked})}
                    className="w-4 h-4 rounded border-gray-300 text-[#E53935] focus:ring-[#E53935]"
                  />
                  <span className="text-sm font-bold text-gray-700">Currently Available</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.isCombo}
                    onChange={e => setFormData({...formData, isCombo: e.target.checked})}
                    className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-sm font-bold text-gray-700">Combo Special</span>
                </label>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3 mt-auto">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-3 bg-white text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-widest border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={!formData.n || !formData.p}
                className="flex-1 py-3 bg-[#E53935] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md shadow-red-100 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Save size={14} /> Save Special
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN TARGETS MODAL */}
      {isTargetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-[420px] rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col">
            {!selectedCaptain ? (
              // Step 1: Select Captain
              <>
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-900 flex items-center gap-2">
                    <Users size={16} className="text-[#E53935]" /> Select Captain
                  </h3>
                  <button onClick={() => setIsTargetModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100"><X size={18} /></button>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
                  {CAPTAINS.map(cap => {
                     const currentTarget = targets[cap.id]?.revenueTarget;
                     return (
                      <button 
                        key={cap.id}
                        onClick={() => {
                          setSelectedCaptain(cap);
                          setRevenueTarget(currentTarget || 5000);
                          setDiscountLimit(targets[cap.id]?.discountLimit || 5);
                        }}
                        className="p-4 rounded-2xl border border-gray-100 bg-white hover:border-gray-300 hover:shadow-md transition-all text-left group"
                      >
                        <div className={`w-10 h-10 rounded-xl ${cap.color} flex items-center justify-center text-sm font-black mb-3 group-hover:scale-110 transition-transform`}>
                          {cap.initials}
                        </div>
                        <h4 className="text-xs font-black text-gray-900 truncate">{cap.name}</h4>
                        <p className="text-[9px] font-bold text-gray-400 uppercase mt-1">
                          {currentTarget ? `Target: ₹${currentTarget}` : 'No Target Set'}
                        </p>
                      </button>
                     );
                  })}
                </div>
              </>
            ) : (
              // Step 2: Assign Target Settings
              <>
                <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-gray-50 to-white">
                  <button onClick={() => setSelectedCaptain(null)} className="p-1.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"><ChevronRight size={16} className="rotate-180" /></button>
                  <div className={`w-8 h-8 rounded-lg ${selectedCaptain.color} flex items-center justify-center text-xs font-black`}>
                    {selectedCaptain.initials}
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-gray-900 leading-tight">Assign Targets</h3>
                    <p className="text-[10px] font-bold text-gray-500">{selectedCaptain.name}</p>
                  </div>
                </div>
                
                <div className="p-8 space-y-8 bg-[#FFF9F9]">
                  {/* Revenue Target Slider */}
                  <div>
                    <div className="flex justify-between items-end mb-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
                        <Flame size={12} className="text-[#E53935]" /> Daily Revenue Target
                      </label>
                      <span className="text-2xl font-black text-gray-900 tracking-tighter">₹{revenueTarget}</span>
                    </div>
                    
                    <input 
                      type="range" 
                      min="3000" 
                      max="15000" 
                      step="500"
                      value={revenueTarget}
                      onChange={(e) => setRevenueTarget(parseInt(e.target.value))}
                      className="w-full h-2 bg-red-100 rounded-lg appearance-none cursor-pointer accent-[#E53935]"
                    />
                    <div className="flex justify-between mt-2 text-[9px] font-black text-gray-400">
                      <span>₹3000</span>
                      <span>₹15000+</span>
                    </div>
                  </div>

                  {/* Discount Limit Slider */}
                  <div>
                    <div className="flex justify-between items-end mb-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                        Max Discount Auth
                      </label>
                      <span className="text-xl font-black text-gray-900 tracking-tighter">{discountLimit}%</span>
                    </div>
                    
                    <input 
                      type="range" 
                      min="0" 
                      max="20" 
                      step="1"
                      value={discountLimit}
                      onChange={(e) => setDiscountLimit(parseInt(e.target.value))}
                      className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between mt-2 text-[9px] font-black text-gray-400">
                      <span>0%</span>
                      <span>20%</span>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 bg-white border-t border-gray-100">
                  <button 
                    onClick={handleAssignTarget}
                    className="w-full py-3.5 bg-[#E53935] text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-red-100 hover:scale-105 active:scale-95 transition-all"
                  >
                    Confirm Assignment
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
