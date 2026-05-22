/** Build searchable text for a POS menu item ({ n, c, p, t, id, desc, ... }). */
export function getMenuSearchText(item) {
  if (!item) return "";
  return [
    item.n,
    item.c,
    item.id,
    item.desc,
    item.p != null ? String(item.p) : "",
    item.t === "veg" ? "veg vegetarian" : "non non-veg nonveg",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function normalizeSearchQuery(query) {
  return (query || "").trim().toLowerCase();
}

/** True if every whitespace-separated token appears in the item haystack. */
export function menuItemMatchesSearch(item, query) {
  const q = normalizeSearchQuery(query);
  if (!q) return true;
  const haystack = getMenuSearchText(item);
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Filter menu items by search, category, and diet.
 * When the user is searching, category is ignored so results are global.
 */
export function filterMenuItems(
  items,
  { query = "", category = "All", diet = "All" } = {}
) {
  if (!Array.isArray(items)) return [];
  const searchActive = normalizeSearchQuery(query).length > 0;

  return items.filter((item) => {
    if (!menuItemMatchesSearch(item, query)) return false;
    if (!searchActive && category !== "All" && item.c !== category) return false;
    if (diet !== "All" && item.t !== diet) return false;
    return true;
  });
}
