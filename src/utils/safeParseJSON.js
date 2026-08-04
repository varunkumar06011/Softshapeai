/**
 * Safely parses a JSON string, returning a fallback value if parsing fails.
 * Use this instead of JSON.parse(localStorage.getItem(...)) to prevent
 * component crashes when localStorage data is corrupted.
 *
 * @param {string|null|undefined} raw - The raw JSON string to parse
 * @param {*} fallback - The value to return if parsing fails or raw is null
 * @returns {*} The parsed value or fallback
 */
export function safeParseJSON(raw, fallback = null) {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Reads a localStorage key and safely parses its value as JSON.
 * Returns the fallback if the key doesn't exist or the value is corrupted.
 *
 * @param {string} key - The localStorage key to read
 * @param {*} fallback - The value to return if parsing fails or key is missing
 * @returns {*} The parsed value or fallback
 */
export function safeGetJSON(key, fallback = null) {
  try {
    return safeParseJSON(localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}
