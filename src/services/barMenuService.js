// ─────────────────────────────────────────────────────────────────────────────
// Bar Menu Service — Bar menu data fetching, caching, and image repair
// ─────────────────────────────────────────────────────────────────────────────
// Manages bar menu data on the frontend:
//   - fetchBarMenuFromBackend() — fetch bar menu from API with timeout
//   - readBarMenuCache() / writeBarMenuCache() — localStorage cache (per-restaurant)
//   - repairBarMenuCloudinaryUrls() — migrate old Cloudinary URLs to new CDN
//   - Default food/liquor images for items without images
//
// Cache is scoped per restaurantId to prevent cross-tenant data leakage.
// Cloudinary repair runs once per restaurant (tracked via localStorage flag).
// ─────────────────────────────────────────────────────────────────────────────

import { apiUrl, getAuthHeaders } from "./apiConfig";
import { getBarMenuCacheKey } from "../utils/cacheKeys";
import { getMenuStorageKey } from "./menuService";

// Default placeholder images for items without uploaded images
export const DEFAULT_FOOD_IMG = "/placeholder.svg";

export const DEFAULT_LIQUOR_IMG = "/placeholder.svg";

// localStorage key for tracking Cloudinary URL repair completion (per version)
const REPAIR_STORAGE_KEY = "softshape_bar_menu_cloudinary_repair_v3";

/** Bar menu name → restaurant menu name (Cloudinary source) */
// Maps bar item names to restaurant item names for image lookup from Cloudinary
const BAR_IMAGE_ALIASES = {
  "v grand spl chicken soup": "V-Grand Spl Cream of Chicken Soup",
  "hot & sour soup": "Veg Hot and Sour Soup",
  "hot & sour soup (nv)": "Chicken Hot and Sour Soup",
  "paneer mejestick": "Paneer Majestic",
  "chicken mejestick": "Majestic Chicken",
  "chilli wings": "Chicken Wings (Bones)",
  "today spl tandoori": "V-Grand Special Tandoori Platter",
  "cashewnut curry": "Cashew Nut Curry",
  "cashewnut biryani": "Cashew Nut Biryani",
  "omlet curry": "Omelette Curry",
  "sambhar rice": "Sambar Rice",
  "white rice": "Plain Rice",
  "chilli gobi": "Gobi Chilli",
  "chilli paneer": "Paneer Chilli",
  "chilli mushroom": "Mushroom Chilli",
  "chilli baby corn": "Baby Corn Chilli",
  "chilli mutton": "Mutton Fry",
  "chilli fish": "Fish Chilli",
  "mushroom fry": "Mushroom Curry",
  "dilkush biryani": "Rambo Biryani",
  "egg fry": "Boiled Egg (Starters)",
  "egg roast": "Boiled Egg (Starters)",
  "chilli egg": "Egg Burji Curry",
  "egg manchurian": "Egg Burji Curry",
  "egg 65": "Egg Burji Curry",
  "velvet egg": "Egg Burji Curry",
  "mutton soup": "Mutton Curry",
  "finger chips": "Crispy Corn",
};

function normalizeName(name) {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function stripParens(name) {
  return (name || "").replace(/\s*\([^)]*\)\s*$/g, "").trim();
}

function slugify(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function tokenSet(name) {
  return new Set(
    normalizeName(stripParens(name))
      .split(" ")
      .filter((t) => t.length > 1)
  );
}

function tokenOverlapScore(a, b) {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.max(ta.size, tb.size);
}

function isUsableImageUrl(url) {
  return typeof url === "string" && url.trim().startsWith("http");
}

function isCloudinaryUrl(url) {
  return isUsableImageUrl(url) && url.includes("res.cloudinary.com");
}

/** Build lookup: normalized name → Cloudinary imageUrl */
export function buildRestaurantImageIndex(restaurantItems) {
  const index = new Map();
  if (!Array.isArray(restaurantItems)) return index;

  for (const item of restaurantItems) {
    const url = item.imageUrl || item.img;
    if (!isCloudinaryUrl(url)) continue;
    const keys = [
      normalizeName(item.name || item.n),
      normalizeName(stripParens(item.name || item.n)),
      slugify(item.name || item.n),
    ];
    for (const key of keys) {
      if (key && !index.has(key)) index.set(key, url.trim());
    }
  }
  return index;
}

/**
 * Match a bar item name to a Cloudinary URL from restaurant / archive sources.
 */
export function findRestaurantImageUrl(barName, restaurantIndex, restaurantItems = []) {
  if (!barName) return null;

  const aliasTarget = BAR_IMAGE_ALIASES[normalizeName(barName)];
  if (aliasTarget) {
    for (const item of restaurantItems) {
      const url = item.imageUrl || item.img;
      if (isCloudinaryUrl(url) && normalizeName(item.name || item.n) === normalizeName(aliasTarget)) {
        return url.trim();
      }
    }
  }

  const n = normalizeName(barName);
  const base = stripParens(barName);
  const baseNorm = normalizeName(base);

  if (restaurantIndex.has(n)) return restaurantIndex.get(n);
  if (restaurantIndex.has(baseNorm)) return restaurantIndex.get(baseNorm);
  if (restaurantIndex.has(slugify(barName))) return restaurantIndex.get(slugify(barName));
  if (restaurantIndex.has(slugify(base))) return restaurantIndex.get(slugify(base));

  const prefixes = [
    "veg ",
    "chicken ",
    "mutton ",
    "prawn ",
    "egg ",
    "paneer ",
    "boiled ",
    "spl ",
    "special ",
    "v grand spl ",
    "v-grand spl ",
  ];
  for (const prefix of prefixes) {
    const key = normalizeName(`${prefix}${base}`);
    if (restaurantIndex.has(key)) return restaurantIndex.get(key);
  }

  if (/\(nv\)/i.test(barName)) {
    for (const prefix of ["chicken ", "mutton ", "prawn ", "egg "]) {
      const key = normalizeName(`${prefix}${base}`);
      if (restaurantIndex.has(key)) return restaurantIndex.get(key);
    }
  }

  let best = null;
  for (const item of restaurantItems) {
    const url = item.imageUrl || item.img;
    if (!isCloudinaryUrl(url)) continue;
    const score = tokenOverlapScore(barName, item.name || item.n);
    if (score >= 0.55 && (!best || score > best.score)) {
      best = { url: url.trim(), score };
    }
  }
  if (best) return best.url;

  for (const item of restaurantItems) {
    const url = item.imageUrl || item.img;
    if (!isCloudinaryUrl(url)) continue;
    const rn = normalizeName(item.name || item.n);
    if (rn.includes(baseNorm) || baseNorm.includes(rn)) return url.trim();
  }

  return null;
}

/** UI-only fallback when no Cloudinary URL exists (never written to DB). */
export function getLiquorImage(name = "") {
  const lower = name.toLowerCase();
  if (
    lower.includes("beer") ||
    lower.includes("corona") ||
    lower.includes("budweiser") ||
    lower.includes("heineken") ||
    lower.includes("brezer") ||
    lower.includes("kf ") ||
    lower.includes("draught")
  ) {
    return "/placeholder.svg";
  }
  if (
    lower.includes("whiskey") ||
    lower.includes("whisky") ||
    lower.includes("scotch") ||
    lower.includes("bourbon") ||
    lower.includes("brandy") ||
    lower.includes("stag") ||
    lower.includes("label")
  ) {
    return "/placeholder.svg";
  }
  if (
    lower.includes("vodka") ||
    lower.includes("absolut") ||
    lower.includes("smirnoff")
  ) {
    return "/placeholder.svg";
  }
  if (
    lower.includes("wine") ||
    lower.includes("champagne") ||
    lower.includes("prosecco") ||
    lower.includes("rum") ||
    lower.includes("monk")
  ) {
    return "/placeholder.svg";
  }
  if (
    lower.includes("cocktail") ||
    lower.includes("gin") ||
    lower.includes("tequila") ||
    lower.includes("martini")
  ) {
    return "/placeholder.svg";
  }
  return DEFAULT_LIQUOR_IMG;
}

export function resolveBarItemImage(
  { name, n, menuType, imageUrl, img },
  restaurantIndex = null,
  restaurantItems = [],
  { allowFallback = true } = {}
) {
  const itemName = name || n || "";
  const isLiquor = (menuType || "LIQUOR").toUpperCase() === "LIQUOR";

  let finalImg = isCloudinaryUrl(imageUrl)
    ? imageUrl.trim()
    : isCloudinaryUrl(img)
      ? img.trim()
      : null;

  if (!finalImg && restaurantIndex) {
    finalImg = findRestaurantImageUrl(itemName, restaurantIndex, restaurantItems);
  }

  if (finalImg) return finalImg;

  if (!allowFallback) return null;

  if (isLiquor) return getLiquorImage(itemName);
  return DEFAULT_FOOD_IMG;
}

export function mapBarMenuItems(items, restaurantItems = []) {
  if (!Array.isArray(items)) return [];
  const restaurantIndex = buildRestaurantImageIndex(restaurantItems);

  return items.map((item) => {
    const menuType = (item.menuType || "LIQUOR").toUpperCase();
    const isLiquor = menuType === "LIQUOR";
    return {
      id: item.id,
      n: item.name,
      p: Math.round(item.price ?? 0),
      c: item.category,
      t: item.isVeg ? "veg" : "non",
      menuType,
      img: resolveBarItemImage(
        {
          name: item.name,
          menuType,
          imageUrl: item.imageUrl,
          img: item.img,
        },
        restaurantIndex,
        restaurantItems
      ),
      isAvailable: item.isAvailable !== false,
      variants: item.variants || [],
      unit: item.unit ?? (isLiquor ? "ml" : null),
      mlPerUnit: isLiquor ? 30 : null,
      fullBottleQty: item.fullBottleQty,
      fullBottlePrice: item.fullBottlePrice,
      isBottleItem: item.isBottleItem,
      printerTarget: item.printerTarget || item.categoryPrinterTarget || null,
      venuePrices: item.venuePrices || {},
      gstEnabled: item.gstEnabled !== false,
    };
  });
}

async function fetchWithRetry(url, options, { retries = 3, timeoutMs = 60000 } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.status === 429) {
      console.warn(`[fetchWithRetry] ${url} returned 429 — not retrying to avoid rate limit cascade`);
      return res;
    }
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (retries > 0 && err.name !== 'AbortError' && !err.message?.includes('aborted')) {
      console.warn(`[fetchWithRetry] Retrying ${url} after error:`, err.message);
      await new Promise(r => setTimeout(r, 1000));
      return fetchWithRetry(url, options, { retries: retries - 1, timeoutMs });
    }
    throw err;
  }
}

async function fetchRestaurantItemsRaw() {
  const res = await fetchWithRetry(apiUrl("/api/menu/items/admin"), {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!res.ok) {
    const fallback = await fetchWithRetry(apiUrl("/api/menu/items"), {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!fallback.ok) return [];
    return fallback.json();
  }
  return res.json();
}

export async function fetchBarMenuFromBackend() {
  const [barRes, restaurantItems] = await Promise.all([
    fetchWithRetry(apiUrl("/api/bar/menu/items"), {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache", ...getAuthHeaders() },
    }),
    fetchRestaurantItemsRaw(),
  ]);

  if (!barRes.ok) throw new Error(`Bar menu fetch failed (${barRes.status})`);
  const items = await barRes.json();
  return mapBarMenuItems(items, restaurantItems);
}

/**
 * Restore missing Cloudinary URLs on bar menu DB records.
 * Prefers backend restore (includes Cloudinary media library scan for liquor).
 */
export async function repairBarMenuCloudinaryUrls(apiBase, { force = false } = {}) {
  if (!force && localStorage.getItem(REPAIR_STORAGE_KEY) === "done") {
    return { repaired: 0, skipped: true };
  }

  try {
    const res = await fetch(`${apiBase}/api/bar/menu/restore-images`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    });
    if (res.ok) {
      const data = await res.json();
      const repaired =
        (data.restoredFromRestaurant ?? 0) +
        (data.restoredFromArchive ?? 0) +
        (data.restoredFromCloudinary ?? 0);
      localStorage.setItem(REPAIR_STORAGE_KEY, "done");
      console.log("[BarMenu] Backend Cloudinary restore:", data);
      return {
        repaired,
        total: data.totalBarItems ?? 0,
        stillMissing: data.stillMissing ?? 0,
        liquorStillMissing: data.liquorStillMissing ?? 0,
        skipped: false,
        source: "backend",
      };
    }
    console.warn("[BarMenu] Backend restore unavailable — skipping client-side repair to avoid 429 rate limits");
  } catch (err) {
    console.warn("[BarMenu] Backend restore failed — skipping client-side repair to avoid 429 rate limits:", err);
  }

  localStorage.setItem(REPAIR_STORAGE_KEY, "done");
  return { repaired: 0, total: 0, skipped: true, source: "skipped" };
}

export function readBarMenuCache(barId) {
  try {
    const raw = localStorage.getItem(getBarMenuCacheKey(barId));
    if (!raw) return [];
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return [];

    let restaurantItems = [];
    try {
      const savedMenu = localStorage.getItem(getMenuStorageKey());
      if (savedMenu) restaurantItems = JSON.parse(savedMenu);
    } catch {
      /* ignore */
    }
    const restaurantIndex = buildRestaurantImageIndex(restaurantItems);

    return items.map((item) => {
      const menuType = (item.menuType || "LIQUOR").toUpperCase();
      const isLiquor = menuType === "LIQUOR";
      return {
        ...item,
        img: resolveBarItemImage(
          {
            n: item.n,
            menuType,
            imageUrl: item.img,
          },
          restaurantIndex,
          restaurantItems
        ),
        unit: item.unit ?? (isLiquor ? "ml" : null),
        mlPerUnit: item.mlPerUnit ?? (isLiquor ? 30 : null),
        printerTarget: item.printerTarget || item.categoryPrinterTarget || null,
      };
    });
  } catch {
    return [];
  }
}

export function writeBarMenuCache(items, barId) {
  try {
    localStorage.setItem(getBarMenuCacheKey(barId), JSON.stringify(items));
  } catch {}
}

export function clearBarMenuRepairFlag() {
  localStorage.removeItem(REPAIR_STORAGE_KEY);
}
