// ─────────────────────────────────────────────────────────────────────────────
// Item Helpers — Utility functions for menu item operations
// ─────────────────────────────────────────────────────────────────────────────
// Provides helper functions for working with POS menu items:
//   - isBeerItem(item): checks if an item is beer based on category or name
//     (used by VariantPicker to show beer-specific size options vs liquor)
//   - Handles both abbreviated ({ c, n }) and full ({ category, name }) formats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Utility functions for menu item operations
 */

/**
 * Gets an item's category as a lowercase string, tolerating non-string values.
 * Menu categories can arrive as numbers or objects (e.g. from live socket
 * updates), so coerce to a string before any string operations.
 * @param {Object} item - Menu item with c (category) or category property
 * @returns {string} Lowercase category string ('' if missing)
 */
export function getItemCategory(item) {
  if (!item) return '';
  return String(item.c || item.category || '').toLowerCase();
}

/**
 * Checks if an item is a beer item based on category or name
 * @param {Object} item - Menu item with properties: n (name), c (category), name, category
 * @returns {boolean} True if item is beer
 */
export function isBeerItem(item) {
  if (!item) return false;

  // Get category (handle both full and abbreviated formats)
  const category = String(item.c || item.category || '').toLowerCase();

  // Check category first
  if (category.includes('beer')) return true;

  // Get name (handle both full and abbreviated formats)
  const name = String(item.n || item.name || '').toLowerCase();

  // Check name for beer keywords
  const beerKeywords = [
    'beer', 'lager', 'ale', 'bira', 'carlsberg', 'budweiser',
    'kingfisher', 'kf', 'coolberg', 'stok', 'draught'
  ];

  return beerKeywords.some(keyword => name.includes(keyword));
}
