const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hashCode = (value) =>
  value.split("").reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export async function detectDish(imageUrl) {
  await wait(2000); // Simulate processing
  const detections = [
    "Chicken Dum Biryani",
    "Paneer Butter Masala",
    "Apollo Fish",
    "Mutton Curry",
    "Veg Fried Rice",
    "Chicken Tikka Masala",
    "Dragon Prawns",
    "Cashew Nut Biryani"
  ];
  // Deterministic detection based on imageUrl length (since it's a blob URL)
  const idx = imageUrl.length % detections.length;
  return {
    dishName: detections[idx],
    category: "Main Course",
    confidence: 94
  };
}

export async function generateDishCreative({ dishName, imageUrl }) {
  if (!dishName?.trim()) throw new Error("Dish name is required");
  if (!imageUrl) throw new Error("Dish image is required");

  await wait(1500);

  const seed = Math.abs(hashCode(dishName.toLowerCase()));
  const marketMin = 180 + (seed % 100);
  const marketMax = marketMin + 120 + (seed % 50);
  const competitivePrice = clamp(Math.round((marketMin + marketMax) / 2), marketMin, marketMax);
  const recommendedPrice = competitivePrice + 19;
  const profitFriendlyPrice = competitivePrice + 49;

  // Use the same styles as creativeEngine for consistency
  const styles = [
    { id: 'luxury', name: 'Luxury Fine Dining', type: 'marketing' },
    { id: 'dark', name: 'Cinematic Dark', type: 'marketing' },
    { id: 'street', name: 'Street Food Vibe', type: 'marketing' },
    { id: 'ipl', name: 'IPL Match Night', type: 'marketing' },
    { id: 'neon', name: 'Cyberpunk Neon', type: 'marketing' },
    { id: 'rustic', name: 'Rustic Indian', type: 'marketing' },
    { id: 'delivery', name: 'Zomato/Swiggy Optimized', type: 'menu' },
    { id: 'chef', name: 'Chef Signature', type: 'menu' },
    { id: 'minimal', name: 'Minimal Gallery', type: 'menu' },
    { id: 'modern', name: 'Modern White', type: 'menu' }
  ];

  const creative = styles.map((style, index) => ({
    ...style,
    id: `${style.id}-${index}`,
    styleId: style.id, // Reference to STYLES in creativeEngine
    title: `${dishName} - ${style.name}`,
    tagline: [
      "Royal taste, crafted with precision.",
      "A masterpiece of spice and smoke.",
      "The soul of the streets, on your plate.",
      "Match day essential. Keep the hunger at bay.",
      "Digital flavor for the modern palate.",
      "Authentic heritage in every bite.",
      "Optimized for quick delivery.",
      "Chef's personal favorite.",
      "Focus on the flavor, nothing else.",
      "Clean, fresh, and irresistibly good."
    ][index % 10],
    highlight: [
      "98% Approval Rating",
      "Bestseller this week",
      "Hot and Spicy",
      "IPL Final Special",
      "Trending in Vijayawada",
      "Heritage Recipe",
      "Swiggy/Zomato Ready",
      "Chef Recommended",
      "Clean Aesthetic",
      "Premium Choice"
    ][index % 10]
  }));

  return {
    marketRange: { min: marketMin, max: marketMax },
    pricing: {
      competitivePrice,
      recommendedPrice,
      profitFriendlyPrice,
      combo: `${dishName} + Signature Lassi + Fry`,
      offer: "Exclusive Weekend Dinner Bundle",
      demandImpact: "+24% during evenings",
      eventContext: "IPL Finals tonight may increase demand by 18%",
      confidence: 89,
      engagement: "High (Estimated 1.2k impressions)"
    },
    creative,
  };
}
