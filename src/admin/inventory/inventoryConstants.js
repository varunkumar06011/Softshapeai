// ─────────────────────────────────────────────────────────────────────────────
// Inventory UI Constants — labels, colors, movement type mappings
// ─────────────────────────────────────────────────────────────────────────────

// Movement type labels for display
export const MOVEMENT_TYPE_LABELS = {
  // Bar
  PURCHASE: 'Purchase',
  SALE: 'Sale Deduction',
  SALE_REVERSAL: 'Sale Reversal',
  WASTAGE: 'Wastage',
  ADJUSTMENT: 'Manual Adjustment',
  OPENING: 'Opening Stock',
  // Kitchen
  RECIPE_CONSUMPTION: 'Sale Deduction',
  MANUAL_ADJUSTMENT: 'Manual Adjustment',
};

// Movement type colors (tailwind classes)
export const MOVEMENT_TYPE_COLORS = {
  PURCHASE: 'text-green-600',
  SALE: 'text-red-600',
  SALE_REVERSAL: 'text-blue-600',
  RECIPE_CONSUMPTION: 'text-red-600',
  WASTAGE: 'text-orange-600',
  ADJUSTMENT: 'text-gray-600',
  MANUAL_ADJUSTMENT: 'text-gray-600',
  OPENING: 'text-purple-600',
};

// Sign convention: positive = stock in, negative = stock out
export const MOVEMENT_TYPE_SIGN = {
  PURCHASE: '+',
  SALE: '-',
  SALE_REVERSAL: '+',
  RECIPE_CONSUMPTION: '-',
  WASTAGE: '-',
  ADJUSTMENT: '±',
  MANUAL_ADJUSTMENT: '±',
  OPENING: '+',
};

// Tab keys
export const TAB_BAR = 'bar';
export const TAB_KITCHEN = 'kitchen';

// Summary card types
export const SUMMARY_CARDS = [
  { key: 'totalItems', label: 'Total Items', color: 'text-gray-900' },
  { key: 'lowStock', label: 'Low Stock', color: 'text-red-600' },
  { key: 'stockValue', label: 'Stock Value', color: 'text-green-600' },
  { key: 'todayUsage', label: "Today's Usage", color: 'text-orange-600' },
];

// Page sizes
export const PAGE_SIZE = 10;

// Debounce delay for search (ms)
export const SEARCH_DEBOUNCE_MS = 250;

// Mobile breakpoint
export const MOBILE_BREAKPOINT = 768;
