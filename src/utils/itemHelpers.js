/**
 * Utility functions for menu item operations
 */

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
