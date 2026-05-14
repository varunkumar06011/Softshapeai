
export const STYLES = [
  {
    id: 'luxury',
    name: 'Luxury Fine Dining',
    bg: '/luxury_fine_dining_bg_1778323342102.png',
    primary: '#D4AF37',
    secondary: '#000000',
    font: 'serif',
    layout: 'cinematic',
    lighting: 'warm-spotlight'
  },
  {
    id: 'dark',
    name: 'Cinematic Dark',
    bg: '/cinematic_dark_bg_1778323358068.png',
    primary: '#FFFFFF',
    secondary: '#1A1A1A',
    font: 'serif',
    layout: 'centered',
    lighting: 'dramatic-shadows'
  },
  {
    id: 'street',
    name: 'Street Food Vibe',
    bg: '/street_food_bg_1778323377799.png',
    primary: '#FF4500',
    secondary: '#FFD700',
    font: 'sans-serif',
    layout: 'asymmetrical',
    lighting: 'vibrant-glow'
  },
  {
    id: 'ipl',
    name: 'IPL Match Night',
    bg: '/ipl_match_bg_1778323395002.png',
    primary: '#00FFFF',
    secondary: '#000080',
    font: 'sans-serif',
    layout: 'diagonal',
    lighting: 'stadium-lights'
  },
  {
    id: 'neon',
    name: 'Cyberpunk Neon',
    bg: '/neon_cyberpunk_bg_1778323411340.png',
    primary: '#FF00FF',
    secondary: '#00FFFF',
    font: 'monospace',
    layout: 'layered',
    lighting: 'neon-glow'
  },
  {
    id: 'rustic',
    name: 'Rustic Indian',
    bg: '/rustic_dhaba_bg_1778323428909.png',
    primary: '#8B4513',
    secondary: '#F5DEB3',
    font: 'serif',
    layout: 'centered',
    lighting: 'natural-sun'
  },
  {
    id: 'family',
    name: 'Family Dining',
    bg: '/family_dining_bg_1778323445668.png',
    primary: '#E53935',
    secondary: '#FFFFFF',
    font: 'sans-serif',
    layout: 'immersive',
    lighting: 'soft-warm'
  },
  {
    id: 'chef',
    name: 'Chef Kitchen',
    bg: '/chef_kitchen_bg_1778323461967.png',
    primary: '#333333',
    secondary: '#FFFFFF',
    font: 'sans-serif',
    layout: 'cinematic',
    lighting: 'high-key'
  },
  {
    id: 'delivery',
    name: 'Premium Delivery',
    bg: '/zomato_swiggy_bg_1778323477908.png',
    primary: '#FC8019',
    secondary: '#FFFFFF',
    font: 'sans-serif',
    layout: 'centered',
    lighting: 'flat-bright'
  },
  {
    id: 'festival',
    name: 'Festival Celebration',
    bg: '/festival_diwali_bg_1778323495203.png',
    primary: '#FFD700',
    secondary: '#800000',
    font: 'serif',
    layout: 'ornate',
    lighting: 'candle-light'
  },
  {
    id: 'outdoor',
    name: 'Outdoor Patio',
    bg: '/outdoor_night_bg_1778323515340.png',
    primary: '#FFFFFF',
    secondary: '#0C1445',
    font: 'sans-serif',
    layout: 'asymmetrical',
    lighting: 'string-lights'
  },
  {
    id: 'rainy',
    name: 'Rainy Evening',
    bg: '/rainy_scene_bg_1778323530395.png',
    primary: '#00BFFF',
    secondary: '#1C1C1C',
    font: 'serif',
    layout: 'cinematic',
    lighting: 'moody-cool'
  },
  {
    id: 'moody',
    name: 'Moody Table',
    bg: '/moody_table_bg_1778323546753.png',
    primary: '#E53935',
    secondary: '#000000',
    font: 'serif',
    layout: 'intimate',
    lighting: 'low-key'
  },
  {
    id: 'royal',
    name: 'Royal Mughlai',
    bg: '/royal_mughlai_bg_1778323564826.png',
    primary: '#FFD700',
    secondary: '#4B0082',
    font: 'serif',
    layout: 'centered',
    lighting: 'grand-interior'
  },
  {
    id: 'explosion',
    name: 'Spice Explosion',
    bg: '/explosion_abstract_bg_1778323580560.png',
    primary: '#FF0000',
    secondary: '#000000',
    font: 'impact',
    layout: 'diagonal',
    lighting: 'flash-dynamic'
  }
];

const TAGLINES = {
  luxury: ["Exquisite Flavors", "Fine Dining Redefined", "The Art of Taste", "Premium Selection"],
  dark: ["Tonight's Masterpiece", "Shadows of Flavor", "Simply Cinematic", "Deeply Delicious"],
  street: ["Street Style Magic", "Flavor Explosion", "Authentic Cravings", "Chaos of Taste"],
  ipl: ["Match Night Special", "The Winning Combo", "Sixer of Flavors", "Game Day Feast"],
  neon: ["Cyber Cravings", "Future of Flavor", "Electric Taste", "Neon Night Bites"],
  rustic: ["Dhaba Delights", "Roots of Flavor", "Village Magic", "Rustic Soul Food"],
  family: ["Made for Sharing", "A Family Feast", "Gather Around", "Home Style Love"],
  chef: ["Crafted by Masters", "Kitchen Secrets", "Chef's Special", "Culinary Excellence"],
  delivery: ["Fast & Fresh", "Doorstep Delight", "Craving Satisfied", "Direct to You"],
  festival: ["Festive Treats", "Joy of Flavor", "Celebration Special", "Tradition in Every Bite"],
  outdoor: ["Weekend Vibes", "Patio Special", "Starry Night Bites", "Breezy Flavors"],
  rainy: ["Rainy Day Comfort", "Monsoon Magic", "Warm the Soul", "Cloudy with a Chance of Spicy"],
  moody: ["Intimate Dining", "Atmospheric Taste", "Evening Elegance", "Candlelit Flavors"],
  royal: ["A Royal Feast", "Mughlai Heritage", "Empire of Taste", "Fit for Kings"],
  explosion: ["Spice Surge", "Intense Aroma", "Flavor Blast", "Dynamic Taste"]
};

export const generateRandomConfig = (styleId, index) => {
  const style = STYLES.find(s => s.id === styleId) || STYLES[0];
  const seed = Math.random();
  const tagline = TAGLINES[styleId] ? TAGLINES[styleId][Math.floor(seed * TAGLINES[styleId].length)] : "Deliciousness Awaits";

  return {
    style: styleId,
    styleName: style.name,
    bgAsset: style.bg,
    seed,
    composition: style.layout,
    food: {
      x: style.layout === 'asymmetrical' ? 0.65 : style.layout === 'diagonal' ? 0.35 : 0.5,
      y: style.layout === 'diagonal' ? 0.65 : 0.55,
      scale: 0.6 + Math.random() * 0.25,
      rotate: (Math.random() - 0.5) * 15,
      shadowBlur: 40,
      shadowColor: 'rgba(0,0,0,0.7)',
      glow: styleId === 'neon' ? 30 : 0,
      steam: styleId === 'dark' || styleId === 'chef' || styleId === 'rainy',
      shine: styleId === 'luxury' || styleId === 'royal'
    },
    text: {
      main: {
        x: style.layout === 'asymmetrical' ? 0.25 : 0.5,
        y: style.layout === 'diagonal' ? 0.25 : style.layout === 'centered' ? 0.15 : 0.85,
        content: tagline.toUpperCase(),
        fontSize: 32 + Math.random() * 12,
        color: style.primary,
        align: style.layout === 'asymmetrical' ? 'left' : 'center'
      },
      secondary: {
        content: style.id === 'ipl' ? 'IPL COMBO ACTIVE' : 'CRAFTED WITH LOVE',
        fontSize: 14,
        opacity: 0.8
      }
    },
    effects: {
      vignette: 0.3 + Math.random() * 0.4,
      particles: styleId === 'explosion' ? 'spices' : styleId === 'festival' ? 'gold-dust' : 'none',
      blur: styleId === 'dark' || styleId === 'luxury' ? 5 : 0
    }
  };
};

export const renderToCanvas = (canvas, config, foodImage, bgImage) => {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // 1. Draw Background
  if (bgImage) {
    const bgScale = Math.max(w / bgImage.width, h / bgImage.height);
    const bgW = bgImage.width * bgScale;
    const bgH = bgImage.height * bgScale;
    ctx.drawImage(bgImage, (w - bgW) / 2, (h - bgH) / 2, bgW, bgH);
  } else {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);
  }

  // 2. Apply Atmospheric Lighting & Vignette
  const vignette = ctx.createRadialGradient(w / 2, h / 2, w / 4, w / 2, h / 2, w);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, `rgba(0,0,0,${config.effects.vignette})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // 3. Draw Particles (Spices/Gold Dust)
  if (config.effects.particles !== 'none') {
    ctx.save();
    for (let i = 0; i < 40; i++) {
      const px = Math.random() * w;
      const py = Math.random() * h;
      const size = Math.random() * 3;
      ctx.fillStyle = config.effects.particles === 'spices' ? '#8B0000' : '#FFD700';
      ctx.globalAlpha = 0.4 + Math.random() * 0.4;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 4. Draw Food Image
  if (foodImage) {
    ctx.save();
    const foodW = w * config.food.scale;
    const foodH = (foodImage.height / foodImage.width) * foodW;
    const foodX = w * config.food.x;
    const foodY = h * config.food.y;

    ctx.translate(foodX, foodY);
    ctx.rotate(config.food.rotate * Math.PI / 180);

    // Dynamic Shadow based on lighting
    ctx.shadowBlur = config.food.shadowBlur;
    ctx.shadowColor = config.food.shadowColor;
    ctx.shadowOffsetX = 10;
    ctx.shadowOffsetY = 15;

    if (config.food.glow > 0) {
      ctx.shadowBlur = config.food.glow;
      ctx.shadowColor = STYLES.find(s => s.id === config.style).primary;
    }

    ctx.drawImage(foodImage, -foodW / 2, -foodH / 2, foodW, foodH);

    // Food Shine / Highlights
    if (config.food.shine) {
      ctx.globalCompositeOperation = 'screen';
      const shine = ctx.createLinearGradient(-foodW / 2, -foodH / 2, foodW / 2, foodH / 2);
      shine.addColorStop(0, 'rgba(255,255,255,0)');
      shine.addColorStop(0.5, 'rgba(255,255,255,0.2)');
      shine.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shine;
      ctx.fillRect(-foodW / 2, -foodH / 2, foodW, foodH);
    }

    ctx.restore();
  }

  // 5. Draw Typography
  ctx.save();
  const style = STYLES.find(s => s.id === config.style);
  ctx.font = `black ${config.text.main.fontSize}px ${style.font === 'serif' ? 'Playfair Display, serif' : 'Montserrat, sans-serif'}`;
  ctx.fillStyle = '#fff'; // Usually white for premium cinematic look
  ctx.textAlign = config.text.main.align;
  ctx.textBaseline = 'middle';

  const textX = w * config.text.main.x;
  const textY = h * config.text.main.y;

  // Text Shadow/Glow
  ctx.shadowBlur = 10;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';

  if (config.style === 'neon') {
    ctx.shadowBlur = 20;
    ctx.shadowColor = style.primary;
    ctx.strokeStyle = style.secondary;
    ctx.lineWidth = 1;
    ctx.strokeText(config.text.main.content, textX, textY);
  }

  ctx.fillText(config.text.main.content, textX, textY);

  // Secondary Text
  ctx.font = `bold 10px Montserrat, sans-serif`;
  ctx.globalAlpha = 0.7;
  ctx.letterSpacing = '2px';
  ctx.fillText(config.text.secondary.content, textX, textY + (config.text.main.y > 0.5 ? -30 : 35));

  ctx.restore();

  // 6. Final Polish Color Overlay
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = style.primary;
  ctx.globalAlpha = 0.05;
  ctx.fillRect(0, 0, w, h);
};
