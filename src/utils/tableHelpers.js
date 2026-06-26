/**
 * Table Section Helper Functions
 * Provides consistent table labeling and badge colors across all views
 */

/**
 * Get the section-aware label for a table
 * @param {Object} table - Table object with sectionName/section properties
 * @returns {string} - Table number label
 */
export function getTableSectionLabel(table) {
  if (!table) return 'T?';
  const num = table.number || table.id || 1;
  return String(num);
}

/**
 * Get the badge color classes for a section
 * @param {Object} table - Table object with sectionName/section properties
 * @returns {string} - Tailwind CSS classes for badge styling
 */
export function getSectionBadgeColor(table) {
  return 'bg-gray-500 text-white';
}

/**
 * Get the section name for display
 * @param {Object} table - Table object with sectionName/section properties
 * @returns {string} - Human-readable section name
 */
export function getSectionDisplayName(table) {
  if (!table) return 'Restaurant';
  return table.sectionName || table.section?.name || 'Restaurant';
}
