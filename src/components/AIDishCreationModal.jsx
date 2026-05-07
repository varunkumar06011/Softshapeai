import { useMemo, useState } from "react";
import { Sparkles, Bot, X, RotateCcw, Check } from "lucide-react";
import { generateDishCreative } from "../services/menuAiService";

export default function AIDishCreationModal({ open, onClose, onSave }) {
  const [step, setStep] = useState(1);
  const [image, setImage] = useState(null);
  const [dishName, setDishName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const selectedPreview = useMemo(() => result?.creative?.[0], [result]);

  if (!open) return null;

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await generateDishCreative({ dishName, imageUrl: image?.url });
      setResult(data);
      setStep(3);
    } catch (e) {
      setError(e.message || "Unable to generate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 md:p-6">
      {/* Modal Container */}
      <div className="relative w-full max-w-5xl h-full sm:h-auto sm:max-h-[95vh] rounded-none sm:rounded-[32px] border-0 sm:border border-[#FFCDD2] bg-white shadow-2xl overflow-hidden flex flex-col animate-fadeIn">
        
        {/* Header - Fixed at top */}
        <div className="flex items-center justify-between border-b border-[#FFCDD2] bg-white/95 backdrop-blur-md px-4 py-4 md:px-8 md:py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E53935] to-[#B71C1C] text-white shadow-lg shadow-red-100">
              <Sparkles size={22} fill="currentColor" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-black text-[#B71C1C] leading-none">
                AI Creative Suite
              </h3>
              <p className="text-[10px] md:text-xs font-bold text-[#6B6B6B] uppercase tracking-[0.2em] mt-1">Spire.ai Intelligence</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="group rounded-full p-2.5 hover:bg-[#FFEBEE] transition-all active:scale-90"
          >
            <X size={24} className="text-[#6B6B6B] group-hover:text-[#B71C1C] group-hover:rotate-90 transition-all duration-300" />
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 custom-scrollbar">
          
          {/* Progress Indicator */}
          <div className="mb-8 flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
            {["Upload Source", "Dish Identity", "AI Generation"].map((label, idx) => {
              const isActive = step === idx + 1;
              const isDone = step > idx + 1;
              return (
                <div key={label} className="flex items-center gap-2 min-w-fit">
                  <span
                    className={`flex items-center gap-2 rounded-2xl border px-5 py-2.5 text-[11px] font-black uppercase tracking-wider transition-all duration-300 ${
                      isActive 
                        ? "border-[#E53935] bg-[#E53935] text-white shadow-lg shadow-red-100" 
                        : isDone
                          ? "border-[#2E7D32] bg-[#E8F5E9] text-[#2E7D32]"
                          : "border-[#FFCDD2] bg-white text-[#6B6B6B]"
                    }`}
                  >
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${isActive ? "bg-white text-[#E53935]" : isDone ? "bg-[#2E7D32] text-white" : "bg-[#FFEBEE] text-[#B71C1C]"}`}>
                      {isDone ? <Check size={12} strokeWidth={4} /> : idx + 1}
                    </span>
                    {label}
                  </span>
                  {idx < 2 && <div className="h-px w-4 bg-[#FFCDD2]" />}
                </div>
              );
            })}
          </div>

          <div className="relative">
            {step === 1 && (
              <div className="space-y-6 animate-fadeIn">
                <label className="group flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-[32px] border-3 border-dashed border-[#FFCDD2] bg-[#FFF5F5]/30 p-10 text-center transition-all hover:border-[#E53935] hover:bg-[#FFEBEE]/50">
                  <div className="mb-4 rounded-[24px] bg-white p-5 shadow-xl shadow-red-50 text-[#E53935] group-hover:scale-110 transition-transform duration-500">
                    <Sparkles size={32} />
                  </div>
                  <h4 className="text-xl font-black text-[#1A1A1A]">Drop your dish photo</h4>
                  <p className="text-sm font-medium text-[#6B6B6B] mt-2 max-w-[240px]">We'll use AI to transform it into premium promotional content.</p>
                  <div className="mt-6 rounded-full bg-[#E53935] px-8 py-2.5 text-xs font-bold text-white shadow-lg group-hover:bg-[#B71C1C] transition-colors">
                    Browse Files
                  </div>
                  <input
                    className="hidden"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setImage({ name: file.name, url: URL.createObjectURL(file) });
                    }}
                  />
                </label>
                
                {image && (
                  <div className="flex items-center gap-5 rounded-[24px] border border-[#FFCDD2] p-4 bg-white shadow-xl shadow-red-50/50 animate-fadeInUp">
                    <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl shadow-md">
                      <img className="h-full w-full object-cover" src={image.url} alt="dish" />
                    </div>
                    <div className="flex-grow min-w-0">
                      <p className="text-base font-black text-[#1A1A1A] truncate">{image.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        <p className="text-[10px] text-green-600 font-black uppercase tracking-widest">Image Optimized</p>
                      </div>
                    </div>
                    <button onClick={() => setImage(null)} className="rounded-full p-3 text-[#6B6B6B] hover:bg-red-50 hover:text-[#E53935] transition-all">
                      <X size={20} />
                    </button>
                  </div>
                )}
                
                <button 
                  disabled={!image} 
                  onClick={() => setStep(2)} 
                  className="w-full rounded-2xl bg-[#E53935] py-4 text-sm font-black text-white shadow-2xl shadow-red-200 disabled:opacity-20 transition-all hover:bg-[#B71C1C] active:scale-[0.98] mt-4"
                >
                  Continue to Branding
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs font-black text-[#6B6B6B] uppercase tracking-[0.2em]">Dish Identity</p>
                    <span className="text-[10px] font-bold text-[#B71C1C] bg-[#FFEBEE] px-2 py-0.5 rounded">Required</span>
                  </div>
                  <input
                    className="w-full rounded-2xl border-2 border-[#FFCDD2] bg-[#FFF5F5]/30 px-6 py-4 text-xl font-black placeholder:font-bold placeholder:text-[#FFCDD2] focus:bg-white focus:border-[#E53935] focus:ring-4 focus:ring-red-50 outline-none transition-all shadow-sm"
                    placeholder="e.g. Signature Truffle Mushroom Pasta"
                    value={dishName}
                    onChange={(e) => setDishName(e.target.value)}
                    autoFocus
                  />
                  <p className="text-[10px] font-medium text-[#6B6B6B] leading-relaxed">
                    Tip: Use descriptive names like "Spicy Garlic Prawns" instead of just "Prawns" for better AI results.
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <button onClick={() => setStep(1)} className="flex-1 rounded-2xl border-2 border-[#FFCDD2] py-4 text-sm font-black text-[#6B6B6B] hover:bg-[#FFF5F5] transition-all">Back</button>
                  <button 
                    disabled={!dishName.trim() || loading} 
                    onClick={generate} 
                    className="flex-[2] rounded-2xl bg-[#E53935] py-4 text-sm font-black text-white shadow-2xl shadow-red-200 disabled:opacity-20 flex items-center justify-center gap-3 hover:bg-[#B71C1C] transition-all"
                  >
                    {loading ? (
                      <>
                        <RotateCcw size={18} className="animate-spin" />
                        Analyzing Dish Patterns...
                      </>
                    ) : (
                      <>
                        <Sparkles size={18} />
                        Generate AI Assets
                      </>
                    )}
                  </button>
                </div>
                
                {loading && (
                  <div className="space-y-4 pt-6 animate-pulse">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#FFEBEE]">
                      <div className="h-full w-1/3 rounded-full bg-[#E53935] animate-[shimmer_1.5s_infinite]" />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-[10px] font-black text-[#B71C1C] uppercase tracking-widest">Spire.ai Engine Processing</p>
                      <p className="text-xs text-[#6B6B6B] font-medium italic">"Optimizing shadows, applying studio filters, and calculating market metrics..."</p>
                    </div>
                  </div>
                )}
                {error && <p className="text-sm font-bold text-[#B71C1C] bg-[#FFEBEE] p-4 rounded-2xl border-2 border-[#EF9A9A] animate-shake">{error}</p>}
              </div>
            )}

            {step === 3 && result && (
              <div className="flex flex-col lg:grid lg:grid-cols-12 gap-8 lg:gap-12 animate-fadeIn">
                {/* Left Column: Variations */}
                <div className="lg:col-span-7 space-y-8 order-2 lg:order-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-black text-2xl text-[#1A1A1A]">Ready-to-Post Creatives</h4>
                      <p className="text-sm font-medium text-[#6B6B6B]">AI transformed your photo into studio-grade marketing assets.</p>
                    </div>
                    <div className="flex h-fit items-center gap-2 rounded-full bg-[#FFEBEE] px-4 py-2 border border-[#EF9A9A]">
                      <span className="flex h-2 w-2 rounded-full bg-[#E53935] animate-pulse" />
                      <span className="text-[10px] font-black text-[#B71C1C] uppercase whitespace-nowrap">
                        {result.creative.length} Variations
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {result.creative.map((item) => (
                      <div key={item.id} className="group flex flex-col rounded-[28px] border-2 border-[#FFCDD2] p-4 bg-white shadow-lg hover:border-[#E53935] hover:shadow-2xl hover:shadow-red-50 transition-all duration-500">
                        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[20px] bg-[#FFF5F5]">
                          <img 
                            src={image.url} 
                            alt={item.name} 
                            className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-110" 
                            style={{ filter: item.filter }} 
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                          <div className="absolute top-4 left-4 rounded-full bg-white/90 backdrop-blur-md px-4 py-1.5 text-[9px] font-black text-[#B71C1C] uppercase shadow-sm border border-white">
                            {item.highlight}
                          </div>
                          <div className="absolute bottom-4 left-4 right-4 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                            <button className="w-full rounded-xl bg-white/20 backdrop-blur-md border border-white/30 py-2.5 text-[10px] font-black text-white uppercase hover:bg-white hover:text-[#B71C1C] transition-all">
                              Preview Full HD
                            </button>
                          </div>
                        </div>
                        <div className="mt-5 px-1 flex-1 flex flex-col">
                          <p className="font-black text-lg text-[#1A1A1A] leading-tight group-hover:text-[#E53935] transition-colors">{item.name}</p>
                          <p className="text-sm text-[#6B6B6B] mt-2 line-clamp-2 font-medium italic leading-relaxed opacity-90">"{item.tagline}"</p>
                          <div className="mt-auto pt-4 flex items-center justify-between border-t border-dashed border-[#FFCDD2]/50 mt-4">
                            <span className="text-[9px] font-black text-[#B71C1C] uppercase tracking-widest bg-[#FFEBEE] px-2 py-1 rounded">Optimized for Instagram</span>
                            <Sparkles size={14} className="text-[#E53935]" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Right Column: Pricing & Controls */}
                <div className="lg:col-span-5 order-1 lg:order-2">
                  <div className="lg:sticky lg:top-0 space-y-6 rounded-[32px] border-2 border-[#FFCDD2] bg-gradient-to-b from-[#FFF5F5] to-white p-6 md:p-8 shadow-xl shadow-red-50/30">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-md border border-[#FFCDD2] text-[#B71C1C]">
                        <Bot size={28} />
                      </div>
                      <div>
                        <h4 className="font-black text-xl text-[#1A1A1A]">Smart Pricing</h4>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                          <p className="text-[10px] font-bold text-[#6B6B6B] uppercase tracking-widest">Market Context Active</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white p-5 border-2 border-[#FFCDD2] shadow-sm relative overflow-hidden group">
                      <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-[#E53935] to-[#B71C1C]" />
                      <p className="text-[10px] font-black text-[#6B6B6B] uppercase tracking-[0.2em]">Market Standard Range</p>
                      <div className="flex items-baseline gap-2 mt-1">
                        <p className="text-2xl font-black text-[#1A1A1A]">₹{result.marketRange.min} — ₹{result.marketRange.max}</p>
                        <span className="text-[10px] font-bold text-[#2E7D32]">Competitive</span>
                      </div>
                      <p className="text-[10px] font-medium text-[#6B6B6B] mt-2 flex items-center gap-2">
                        <Check size={10} className="text-green-600" strokeWidth={4} />
                        Analyzed 12 regional benchmarks
                      </p>
                    </div>
                    
                    <div className="space-y-5">
                      {[
                        { label: "AI Recommended", value: result.pricing.recommendedPrice, icon: "💎", desc: "Best for overall balance", color: "border-[#E53935] ring-4 ring-red-50 bg-white" },
                        { label: "Profit Focused", value: result.pricing.profitFriendlyPrice, icon: "📈", desc: "Higher margins, lower volume", color: "border-[#FFCDD2] bg-white/50" },
                        { label: "Competitive", value: result.pricing.competitivePrice, icon: "⚔️", desc: "Best for high-traffic days", color: "border-[#FFCDD2] bg-white/50" },
                      ].map((p) => (
                        <div key={p.label} className="space-y-2">
                          <div className="flex items-center justify-between px-1">
                            <div>
                              <label className="text-[11px] font-black uppercase text-[#1A1A1A] tracking-wider">{p.label}</label>
                              <p className="text-[9px] font-medium text-[#6B6B6B]">{p.desc}</p>
                            </div>
                            <span className="text-sm grayscale group-hover:grayscale-0 transition-all">{p.icon}</span>
                          </div>
                          <div className="relative">
                            <span className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-base sm:text-lg font-black text-[#B71C1C]">₹</span>
                            <input 
                              className={`w-full rounded-2xl border-2 px-8 sm:px-10 py-3 sm:py-4 text-lg sm:text-xl font-black text-[#1A1A1A] focus:border-[#E53935] focus:ring-4 focus:ring-red-50 outline-none transition-all ${p.color}`} 
                              defaultValue={p.value} 
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4 pt-2">
                      <div className="rounded-2xl bg-white p-4 border-l-4 border-l-[#F57F17] shadow-sm">
                        <p className="text-[9px] font-black text-[#F57F17] uppercase tracking-widest mb-1">Bundle Strategy</p>
                        <p className="text-xs font-bold text-[#1A1A1A] leading-relaxed italic">"{result.pricing.combo}"</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4 border-l-4 border-l-[#E53935] shadow-sm">
                        <p className="text-[9px] font-black text-[#E53935] uppercase tracking-widest mb-1">Marketing Hook</p>
                        <p className="text-xs font-bold text-[#1A1A1A] leading-relaxed italic">"{result.pricing.offer}"</p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 pt-4">
                      <button 
                        onClick={generate} 
                        className="group flex-1 rounded-2xl border-2 border-[#E53935] py-4 text-xs font-black text-[#B71C1C] hover:bg-white transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <RotateCcw size={16} className="group-hover:rotate-[-45deg] transition-transform" />
                        Regenerate
                      </button>
                      <button 
                        onClick={() => onSave({ dishName, creative: selectedPreview, pricing: result.pricing })} 
                        className="flex-[1.5] rounded-2xl bg-[#E53935] py-4 text-xs font-black text-white shadow-2xl shadow-red-100 hover:bg-[#c62828] transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Check size={16} strokeWidth={3} />
                        Finalize & Save
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
