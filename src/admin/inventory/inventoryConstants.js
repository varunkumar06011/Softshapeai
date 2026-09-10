// ─────────────────────────────────────────────────────────────────────────────
// Inventory UI Constants — labels, colors, movement type mappings
// ─────────────────────────────────────────────────────────────────────────────

// Movement type labels for display
export const MOVEMENT_TYPE_LABELS = {
  // Bar (new ledger types)
  PURCHASE: 'Purchase',
  AC_SALE: 'AC Sale (POS)',
  NON_AC_SALE: 'Non-AC Sale',
  SALE_REVERSAL: 'Sale Reversal',
  WASTAGE: 'Wastage',
  ADJUSTMENT: 'Manual Adjustment',
  OPENING: 'Opening Stock',
  CORRECTION: 'Correction',
  PHYSICAL_COUNT: 'Physical Count',
  // Legacy bar type
  SALE: 'Sale Deduction',
  // Kitchen
  RECIPE_CONSUMPTION: 'Sale Deduction',
  MANUAL_ADJUSTMENT: 'Manual Adjustment',
};

// Movement type colors (tailwind classes)
export const MOVEMENT_TYPE_COLORS = {
  PURCHASE: 'text-green-600',
  AC_SALE: 'text-red-600',
  NON_AC_SALE: 'text-purple-600',
  SALE: 'text-red-600',
  SALE_REVERSAL: 'text-blue-600',
  RECIPE_CONSUMPTION: 'text-red-600',
  WASTAGE: 'text-orange-600',
  ADJUSTMENT: 'text-gray-600',
  MANUAL_ADJUSTMENT: 'text-gray-600',
  OPENING: 'text-purple-600',
  CORRECTION: 'text-amber-600',
  PHYSICAL_COUNT: 'text-teal-600',
};

// Sign convention: positive = stock in, negative = stock out
export const MOVEMENT_TYPE_SIGN = {
  PURCHASE: '+',
  AC_SALE: '-',
  NON_AC_SALE: '-',
  SALE: '-',
  SALE_REVERSAL: '+',
  RECIPE_CONSUMPTION: '-',
  WASTAGE: '-',
  ADJUSTMENT: '±',
  MANUAL_ADJUSTMENT: '±',
  OPENING: '+',
  CORRECTION: '±',
  PHYSICAL_COUNT: '±',
};

// Tab keys
export const TAB_BAR = 'bar';
export const TAB_KITCHEN = 'kitchen';
export const TAB_RECONCILIATION = 'reconciliation';

// Summary card types
export const SUMMARY_CARDS = [
  { key: 'totalItems', label: 'Total Items', color: 'text-gray-900' },
  { key: 'lowStock', label: 'Low Stock', color: 'text-red-600' },
  { key: 'stockValue', label: 'Stock Value', color: 'text-green-600' },
  { key: 'todayUsage', label: "Today's Usage", color: 'text-orange-600' },
];

// Beer/breezer items are served as whole bottles, never poured — display
// pure bottle counts (floor for positives) instead of "bottles + ml".
export const BEER_KEYWORDS = [
  'beer', 'lager', 'ale', 'bira', 'carlsberg', 'budweiser',
  'kingfisher', 'kf', 'coolberg', 'stok', 'draught', 'breezer',
];

export function isBeerItem(item) {
  if (!item) return false;
  const category = String(item.category?.name || item.category || '').toLowerCase();
  if (category.includes('beer') || category.includes('breezer')) return true;
  const name = String(item.name || '').toLowerCase();
  return BEER_KEYWORDS.some((k) => name.includes(k));
}

export function fmtBeerBottles(ml, bottleSizeMl) {
  const size = Number(bottleSizeMl) || 0;
  if (size <= 0) return `${Math.round(Number(ml) || 0)} ml`;
  return `${Math.trunc((Number(ml) || 0) / size)} btl`;
}

// Page sizes
export const PAGE_SIZE = 10;

// Debounce delay for search (ms)
export const SEARCH_DEBOUNCE_MS = 250;

// Mobile breakpoint
export const MOBILE_BREAKPOINT = 768;
