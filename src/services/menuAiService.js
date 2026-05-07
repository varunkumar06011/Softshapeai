const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hashCode = (value) =>
  value.split("").reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export async function generateDishCreative({ dishName, imageUrl }) {
  if (!dishName?.trim()) throw new Error("Dish name is required");
  if (!imageUrl) throw new Error("Dish image is required");

  await wait(1200);

  const seed = Math.abs(hashCode(dishName.toLowerCase()));
  const marketMin = 220 + (seed % 20);
  const marketMax = marketMin + 80 + (seed % 25);
  const competitivePrice = clamp(Math.round((marketMin + marketMax) / 2), marketMin, marketMax);
  const recommendedPrice = competitivePrice + 9;
  const profitFriendlyPrice = competitivePrice + 29;

  const dishKey = dishName.trim();
  const styles = [
    { id: "premium", name: "Premium Style", filter: "contrast(1.08) saturate(1.2)" },
    { id: "street", name: "Spicy Street-Food", filter: "saturate(1.4) hue-rotate(-8deg)" },
    { id: "luxury", name: "Luxury Restaurant", filter: "brightness(0.92) contrast(1.15)" },
    { id: "dark", name: "Dark Food Theme", filter: "brightness(0.75) contrast(1.2)" },
    { id: "festival", name: "Festival Offer", filter: "sepia(0.22) saturate(1.3)" },
  ];

  const creative = styles.map((style, index) => ({
    ...style,
    title: `${dishKey} - ${style.name}`,
    tagline: [
      "Slow-cooked aroma. Signature taste.",
      "Every bite starts a craving.",
      "Chef-crafted, crowd-approved.",
      "Bold spice, smooth finish.",
      "Festive flavor on every plate.",
    ][index],
    highlight: [
      "Fresh batch available now",
      "Hot and spicy bestseller",
      "Chef's featured recommendation",
      "Perfect for dinner cravings",
      "Limited festive special",
    ][index],
    layout: `Social Poster Layout ${index + 1}`,
  }));

  return {
    marketRange: { min: marketMin, max: marketMax },
    pricing: {
      competitivePrice,
      recommendedPrice,
      profitFriendlyPrice,
      combo: `${dishKey} + Coke`,
      offer: "Flat 10% weekday lunch discount",
    },
    creative,
  };
}
