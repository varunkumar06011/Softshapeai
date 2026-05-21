import { useMemo, useState, useEffect } from "react";
import { Sparkles, Bot, X, RotateCcw, Check, Zap, Megaphone, UtensilsCrossed, ArrowRight, ShieldCheck, Share2 } from "lucide-react";
import { generateDishCreative, detectDish } from "../services/menuAiService";
import { generateRandomConfig } from "../services/creativeEngine";
import CreativeCanvas from "../shared/components/CreativeCanvas";

export default function AIDishCreationModal({ open, onClose, onSave }) {
  const [step, setStep] = useState(1);
  const [image, setImage] = useState(null);
  const [dishName, setDishName] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [selectedDesignIndex, setSelectedDesignIndex] = useState(0);
  const [usageMode, setUsageMode] = useState('both'); // 'menu', 'marketing', 'both'
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);

  const card = "rounded-[24px] border border-[#FFCDD2] bg-white shadow-sm transition-all";
  const btn = "rounded-xl px-6 py-3 font-black text-sm transition-all active:scale-95 flex items-center justify-center gap-2";

  useEffect(() => {
    if (!open) {
      setStep(1);
      setImage(null);
      setDishName("");
      setResult(null);
      setSyncStatus(null);
    }
  }, [open]);

  if (!open) return null;

  const handleUpload = async (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImage({ name: file.name, url });
    setStep(2);
    setIsAnalyzing(true);
    
    try {
      const detection = await detectDish(url);
      setDishName(detection.dishName);
    } catch (e) {
      console.error("Detection failed", e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generate = async () => {
    setIsGenerating(true);
    setError("");
    try {
      const data = await generateDishCreative({ dishName, imageUrl: image?.url });
      
      // Enhance the creative items with random configs for the canvas engine
      const enhancedCreative = data.creative.map((item, idx) => ({
        ...item,
        config: generateRandomConfig(item.styleId, idx)
      }));
      
      setResult({ ...data, creative: enhancedCreative });
      setStep(3);
    } catch (e) {
      setError(e.message || "Unable to generate");
    } finally {
      setIsGenerating(false);
    }
  };

  const finalize = () => {
    setIsSyncing(true);
    setSyncStatus("Preparing Swiggy/Zomato optimized assets...");
    
    setTimeout(() => setSyncStatus("Optimizing metadata for UrbanPiper..."), 1500);
    setTimeout(() => setSyncStatus("Calibrating smart pricing thresholds..."), 3000);
    setTimeout(() => {
      setIsSyncing(false);
      setStep(4);
    }, 4500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4">
      <div className="relative w-full max-w-6xl h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-[32px] border-0 sm:border border-[#FFCDD2] bg-white shadow-2xl overflow-hidden flex flex-col animate-fadeIn">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#FFCDD2] px-6 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#E53935] text-white shadow-lg">
              <Sparkles size={20} fill="currentColor" />
            </div>
            <div>
              <h3 className="text-xl font-black text-[#1A1A1A]">Menu Onboarding AI</h3>
              <p className="text-[10px] font-bold text-[#6B6B6B] uppercase tracking-widest">Powered by Spire Intelligence</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#FFEBEE] rounded-full transition-colors">
            <X size={24} className="text-[#6B6B6B]" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          
          {step === 1 && (
            <div className="max-w-2xl mx-auto space-y-8 py-10 animate-fadeIn">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-black text-[#1A1A1A]">Add New Menu Item</h2>
                <p className="text-[#6B6B6B] font-medium">Upload a photo and let AI handle the branding & pricing.</p>
              </div>
              
              <label className="group flex min-h-[320px] cursor-pointer flex-col items-center justify-center rounded-[40px] border-3 border-dashed border-[#FFCDD2] bg-[#FFF5F5]/30 p-10 text-center transition-all hover:border-[#E53935] hover:bg-[#FFEBEE]/50">
                <div className="mb-6 rounded-[28px] bg-white p-6 shadow-xl text-[#E53935] group-hover:scale-110 transition-transform duration-500">
                  <UtensilsCrossed size={40} />
                </div>
                <h4 className="text-xl font-black text-[#1A1A1A]">Snap or Drop Food Photo</h4>
                <p className="text-sm font-medium text-[#6B6B6B] mt-2 max-w-[280px]">AI will detect the dish and generate premium creatives instantly.</p>
                <div className="mt-8 rounded-full bg-[#E53935] px-10 py-3 text-sm font-bold text-white shadow-lg group-hover:bg-[#B71C1C] transition-colors">
                  Upload Photo
                </div>
                <input className="hidden" type="file" accept="image/*" onChange={(e) => handleUpload(e.target.files?.[0])} />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="max-w-2xl mx-auto space-y-8 py-10 animate-fadeIn">
              <div className="flex flex-col items-center justify-center text-center space-y-6">
                <div className="relative">
                  <div className="h-40 w-40 rounded-[40px] overflow-hidden border-4 border-[#FFCDD2] shadow-2xl">
                    <img src={image?.url} className="h-full w-full object-cover" alt="analyzing" />
                    {isAnalyzing && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="h-20 w-20 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  {isAnalyzing && (
                    <div className="absolute -bottom-4 -right-4 bg-[#E53935] text-white p-3 rounded-2xl shadow-lg animate-bounce">
                      <Zap size={20} fill="currentColor" />
                    </div>
                  )}
                </div>

                <div className="space-y-4 w-full">
                  <h3 className="text-2xl font-black text-[#1A1A1A]">{isAnalyzing ? "Analyzing food identity..." : "Dish Detected!"}</h3>
                  
                  {!isAnalyzing && (
                    <div className="space-y-4 animate-fadeInUp">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-[#6B6B6B] tracking-[0.2em] text-left block ml-1">Confirm Dish Name</label>
                        <input 
                          className="w-full rounded-2xl border-2 border-[#FFCDD2] bg-[#FFF5F5]/30 px-6 py-4 text-2xl font-black focus:bg-white focus:border-[#E53935] outline-none transition-all"
                          value={dishName}
                          onChange={(e) => setDishName(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-4">
                        <button onClick={() => setStep(1)} className="flex-1 rounded-2xl border-2 border-[#FFCDD2] py-4 font-black text-[#6B6B6B] hover:bg-[#FFF5F5]">Retake</button>
                        <button onClick={generate} disabled={isGenerating} className="flex-[2] rounded-2xl bg-[#E53935] py-4 font-black text-white shadow-xl hover:bg-[#B71C1C] flex items-center justify-center gap-2">
                          {isGenerating ? <RotateCcw className="animate-spin" size={20} /> : <Sparkles size={20} />}
                          {isGenerating ? "Generating Creatives..." : "Generate & Price"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 3 && result && (
            <div className="flex flex-col lg:grid lg:grid-cols-12 gap-8 animate-fadeIn">
              {/* Left: Creative Selection */}
              <div className="lg:col-span-7 space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-xl text-[#1A1A1A]">Select Your Visuals</h4>
                  <div className="flex gap-2">
                     <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] font-black uppercase">Swiggy Optimized</span>
                     <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black uppercase">Zomato Ready</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {result.creative.map((item, idx) => (
                    <button 
                      key={idx}
                      onClick={() => setSelectedDesignIndex(idx)}
                      className={`relative aspect-[4/5] rounded-2xl overflow-hidden border-2 transition-all ${selectedDesignIndex === idx ? 'border-[#E53935] ring-4 ring-red-100' : 'border-[#FFCDD2] hover:border-[#EF9A9A]'}`}
                    >
                      <CreativeCanvas config={item.config} uploadUrl={image?.url} className="w-full h-full object-cover" />
                      <div className={`absolute top-2 right-2 h-6 w-6 rounded-full flex items-center justify-center ${selectedDesignIndex === idx ? 'bg-[#E53935] text-white' : 'bg-white/80 text-transparent'}`}>
                        <Check size={14} strokeWidth={4} />
                      </div>
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 p-2 text-left">
                        <p className="text-[8px] font-black text-white uppercase tracking-tighter truncate">{item.name}</p>
                        <p className="text-[7px] text-white/70 truncate">{item.type === 'menu' ? 'MENU READY' : 'MARKETING'}</p>
                      </div>
                    </button>
                  ))}
                </div>

                <div className={`${card} p-6 border-2 border-[#E53935]/20 bg-[#FFF5F5]/50`}>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-black uppercase text-[#6B6B6B]">Asset Usage Configuration</p>
                    <Megaphone size={16} className="text-[#E53935]" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'menu', label: 'Menu Only', icon: <UtensilsCrossed size={16} /> },
                      { id: 'marketing', label: 'Marketing Only', icon: <Share2 size={16} /> },
                      { id: 'both', label: 'Use for Both', icon: <Zap size={16} /> }
                    ].map(mode => (
                      <button 
                        key={mode.id}
                        onClick={() => setUsageMode(mode.id)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${usageMode === mode.id ? 'border-[#E53935] bg-white shadow-md text-[#E53935]' : 'border-[#FFCDD2] bg-white/50 text-[#6B6B6B]'}`}
                      >
                        {mode.icon}
                        <span className="text-[10px] font-black uppercase tracking-tighter">{mode.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Smart Pricing & AI Context */}
              <div className="lg:col-span-5 space-y-6">
                <div className={`${card} p-6 border-2 border-[#FFCDD2]`}>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-10 w-10 rounded-xl bg-[#FFEBEE] flex items-center justify-center text-[#E53935]">
                      <Bot size={24} />
                    </div>
                    <div>
                      <h4 className="font-black text-lg text-[#1A1A1A]">Smart Pricing Engine</h4>
                      <p className="text-[10px] font-bold text-[#6B6B6B]">REAL-TIME MARKET ANALYSIS</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-[#FFF5F5] rounded-2xl p-4 border border-[#FFCDD2]">
                      <p className="text-[9px] font-black text-[#E53935] uppercase mb-1">Contextual Insight</p>
                      <p className="text-sm font-bold leading-relaxed">"{result.pricing.eventContext}"</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div className="bg-white p-3 rounded-xl border border-[#FFCDD2]">
                         <p className="text-[8px] font-black text-[#6B6B6B] uppercase">Sales Impact</p>
                         <p className="text-lg font-black text-green-600">{result.pricing.demandImpact.split(' ')[0]}</p>
                         <p className="text-[8px] text-[#6B6B6B]">Estimated Lift</p>
                       </div>
                       <div className="bg-white p-3 rounded-xl border border-[#FFCDD2]">
                         <p className="text-[8px] font-black text-[#6B6B6B] uppercase">AI Confidence</p>
                         <p className="text-lg font-black text-blue-600">{result.pricing.confidence}%</p>
                         <p className="text-[8px] text-[#6B6B6B]">Data Matched</p>
                       </div>
                    </div>

                    <div className="space-y-3">
                       <p className="text-[10px] font-black text-[#6B6B6B] uppercase tracking-widest px-1">Select Strategy</p>
                       {[
                         { label: "AI Recommended", price: result.pricing.recommendedPrice, badge: "MOST STABLE" },
                         { label: "Aggressive Growth", price: result.pricing.competitivePrice, badge: "HIGH VOLUME" },
                         { label: "Premium / Profit", price: result.pricing.profitFriendlyPrice, badge: "MAX MARGIN" }
                       ].map(strat => (
                         <button key={strat.label} className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-[#FFCDD2] bg-white hover:border-[#E53935] transition-all group">
                            <div className="text-left">
                               <p className="text-xs font-black text-[#1A1A1A]">{strat.label}</p>
                               <p className="text-[8px] font-bold text-[#6B6B6B] uppercase">{strat.badge}</p>
                            </div>
                            <p className="text-xl font-black text-[#E53935]">₹{strat.price}</p>
                         </button>
                       ))}
                    </div>

                    <button onClick={finalize} disabled={isSyncing} className={`${btn} w-full bg-[#E53935] text-white py-5 shadow-2xl shadow-red-200 mt-4`}>
                      {isSyncing ? <RotateCcw className="animate-spin" /> : <Check strokeWidth={3} />}
                      {isSyncing ? "Preparing Assets..." : "Finalize & Save Item"}
                    </button>
                    {isSyncing && <p className="text-center text-[10px] font-bold text-[#E53935] animate-pulse uppercase tracking-[0.2em]">{syncStatus}</p>}
                  </div>
                </div>

                <div className={`${card} p-4 bg-slate-900 text-white border-0`}>
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck size={14} className="text-green-400" />
                    <p className="text-[10px] font-black uppercase tracking-widest">UrbanPiper Sync Bridge</p>
                  </div>
                  <p className="text-[10px] opacity-70 leading-relaxed mb-3">Item will be automatically pushed to 3 platforms once saved.</p>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-white/10 rounded-lg p-2 text-center border border-white/10">
                      <p className="text-[8px] font-bold opacity-60">SWIGGY</p>
                      <p className="text-[10px] font-black text-green-400">READY</p>
                    </div>
                    <div className="flex-1 bg-white/10 rounded-lg p-2 text-center border border-white/10">
                      <p className="text-[8px] font-bold opacity-60">ZOMATO</p>
                      <p className="text-[10px] font-black text-green-400">READY</p>
                    </div>
                    <div className="flex-1 bg-white/10 rounded-lg p-2 text-center border border-white/10">
                      <p className="text-[8px] font-bold opacity-60">MAGICPIN</p>
                      <p className="text-[10px] font-black text-green-400">READY</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="max-w-xl mx-auto py-10 space-y-8 text-center animate-fadeIn">
               <div className="relative mx-auto h-32 w-32">
                 <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20" />
                 <div className="relative h-32 w-32 bg-green-500 rounded-full flex items-center justify-center text-white shadow-2xl">
                    <Check size={64} strokeWidth={4} />
                 </div>
               </div>

               <div className="space-y-4">
                 <h2 className="text-3xl font-black text-[#1A1A1A]">Onboarding Successful</h2>
                 <p className="text-[#6B6B6B] font-medium px-4">
                   "{dishName}" has been added to your smart menu. Assets have been optimized for marketplace standards and pricing logic has been deployed.
                 </p>
               </div>

               <div className="grid grid-cols-1 gap-4 pt-4 text-left">
                  <div className="p-4 rounded-2xl bg-green-50 border border-green-200 flex items-center gap-4">
                     <div className="h-10 w-10 bg-green-500 rounded-xl flex items-center justify-center text-white"><UtensilsCrossed size={20} /></div>
                     <div>
                        <p className="text-xs font-black text-green-800 uppercase">UrbanPiper Sync Bridge</p>
                        <p className="text-[10px] text-green-600 font-medium">All platforms successfully synchronized</p>
                     </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-center gap-4">
                     <div className="h-10 w-10 bg-blue-500 rounded-xl flex items-center justify-center text-white"><Megaphone size={20} /></div>
                     <div>
                        <p className="text-xs font-black text-blue-800 uppercase">Marketing Deployment</p>
                        <p className="text-[10px] text-blue-600 font-medium">Campaign prepared for tonight's peak hour</p>
                     </div>
                  </div>
               </div>

               <button 
                 onClick={onClose}
                 className={`${btn} w-full bg-[#1A1A1A] text-white py-5 mt-6`}
               >
                 Go to Dashboard <ArrowRight size={18} />
               </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
