import { useMemo, useState } from "react";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-4xl rounded-[10px] border border-[#FFCDD2] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">AI Dish Creation Flow</h3>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="mb-4 flex gap-2 text-sm">
          {["Upload", "Dish Name", "AI Creative + Pricing"].map((label, idx) => (
            <span
              key={label}
              className={`rounded-full border px-3 py-1 ${step === idx + 1 ? "border-[#E53935] bg-[#FFEBEE] text-[#B71C1C]" : "border-[#FFCDD2]"}`}
            >
              {label}
            </span>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <label className="block rounded-[10px] border-2 border-dashed border-[#E53935] bg-[#FFF5F5] p-8 text-center text-sm">
              Upload Dish Image
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
              <div className="flex items-center gap-3 rounded-md border border-[#FFCDD2] p-2">
                <img className="h-16 w-16 rounded object-cover" src={image.url} alt="dish" />
                <p className="text-sm">{image.name}</p>
              </div>
            )}
            <button disabled={!image} onClick={() => setStep(2)} className="rounded-md bg-[#E53935] px-4 py-2 text-white disabled:opacity-40">
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">What dish is this?</p>
            <input
              className="w-full rounded-[4px] border border-[#FFCDD2] px-3 py-2"
              placeholder="Chicken Biryani"
              value={dishName}
              onChange={(e) => setDishName(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="rounded-md border border-[#FFCDD2] px-4 py-2">Back</button>
              <button disabled={!dishName.trim() || loading} onClick={generate} className="rounded-md bg-[#E53935] px-4 py-2 text-white disabled:opacity-40">
                {loading ? "Generating..." : "Generate AI Variations"}
              </button>
            </div>
            {loading && <div className="h-2 w-full animate-pulse rounded bg-[#FFEBEE]" />}
            {error && <p className="text-sm text-[#B71C1C]">{error}</p>}
          </div>
        )}

        {step === 3 && result && (
          <div className="grid grid-cols-5 gap-4">
            <div className="col-span-3 space-y-3">
              <h4 className="font-semibold">Promotional Design Variations</h4>
              <div className="grid grid-cols-2 gap-3">
                {result.creative.map((item) => (
                  <div key={item.id} className="rounded-[10px] border border-[#FFCDD2] p-2">
                    <img src={image.url} alt={item.name} className="h-28 w-full rounded object-cover" style={{ filter: item.filter }} />
                    <p className="mt-2 text-sm font-semibold">{item.name}</p>
                    <p className="text-xs text-[#6B6B6B]">{item.tagline}</p>
                    <p className="text-xs text-[#B71C1C]">{item.highlight}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="col-span-2 space-y-3 rounded-[10px] border border-[#FFCDD2] bg-[#FFF5F5] p-3">
              <h4 className="font-semibold">Smart Price Suggestion Engine</h4>
              <p className="text-sm">Nearby restaurants are selling {dishName} between ₹{result.marketRange.min}-₹{result.marketRange.max}</p>
              <input className="w-full rounded border border-[#FFCDD2] px-2 py-1 text-sm" defaultValue={`Suggested selling price: ₹${result.pricing.recommendedPrice}`} />
              <input className="w-full rounded border border-[#FFCDD2] px-2 py-1 text-sm" defaultValue={`Profit-friendly price: ₹${result.pricing.profitFriendlyPrice}`} />
              <input className="w-full rounded border border-[#FFCDD2] px-2 py-1 text-sm" defaultValue={`Competitive market price: ₹${result.pricing.competitivePrice}`} />
              <input className="w-full rounded border border-[#FFCDD2] px-2 py-1 text-sm" defaultValue={`Combo recommendation: ${result.pricing.combo}`} />
              <input className="w-full rounded border border-[#FFCDD2] px-2 py-1 text-sm" defaultValue={`Suggested offer: ${result.pricing.offer}`} />
              <div className="flex gap-2">
                <button onClick={generate} className="rounded-md border border-[#E53935] px-3 py-2 text-sm text-[#B71C1C]">Regenerate</button>
                <button onClick={() => onSave({ dishName, creative: selectedPreview, pricing: result.pricing })} className="rounded-md bg-[#E53935] px-3 py-2 text-sm text-white">Save Draft</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
