/**
 * Table Section Helper Functions
 * Provides consistent table labeling and badge colors across all views
 */

/**
 * Get the section-aware label for a table
 * @param {Object} table - Table object with sectionName/section properties
 * @returns {string} - Section-prefixed table label (e.g., "C1", "PDR2", "R3")
 */
export function getTableSectionLabel(table) {
  if (!table) return 'T?';
  const sectionName = (table.sectionName || table.section?.name || '').toLowerCase();
  const num = table.number || table.id || 1;

  if (sectionName.includes('gobox') || sectionName.includes('bar parcel')) return `GB${num}`;
  if (sectionName.includes('bar')) return `B${num}`;
  if (sectionName.includes('family restaurant')) return `F${num}`;
  if (sectionName.includes('conference')) return `C${num}`;
  if (sectionName.includes('pdr')) return `PDR${num}`;
  if (sectionName.includes('rooms')) return `R${num}`;
  if (sectionName.includes('parcel')) return `P${num}`;
  if (table.displayName) return table.displayName;

  // Default for restaurant/bar main tables
  return `T${num}`;
}

/**
 * Get the badge color classes for a section
 * @param {Object} table - Table object with sectionName/section properties
 * @returns {string} - Tailwind CSS classes for badge styling
 */
export function getSectionBadgeColor(table) {
  if (!table) return 'bg-gray-500 text-white';
  const sectionName = (table.sectionName || table.section?.name || '').toLowerCase();

  if (sectionName.includes('gobox') || sectionName.includes('bar parcel')) return 'bg-orange-500 text-white';
  if (sectionName.includes('bar')) return 'bg-purple-500 text-white';
  if (sectionName.includes('family restaurant')) return 'bg-indigo-500 text-white';
  if (sectionName.includes('conference')) return 'bg-teal-500 text-white';
  if (sectionName.includes('pdr')) return 'bg-pink-500 text-white';
  if (sectionName.includes('rooms')) return 'bg-cyan-500 text-white';
  if (sectionName.includes('parcel')) return 'bg-amber-500 text-white';

  return 'bg-gray-500 text-white'; // default
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
