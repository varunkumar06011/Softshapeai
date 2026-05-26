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

/** True if every whitespace-separated token matches the item in some way. */
export function menuItemMatchesSearch(item, query) {
  const q = normalizeSearchQuery(query);
  if (!q) return true;

  const tokens = q.split(/\s+/).filter(Boolean);

  const nameLower = (item.n || item.name || "").toLowerCase();
  const catLower = (item.c || item.category || "").toLowerCase();
  const isVeg = item.t === "veg" || item.isVeg === true;
  const isSpecial = item.isSpecial === true || item.special === true || item.is_special === true;

  // Split name into words to check prefixes & initials
  const nameWords = nameLower.split(/[\s()&,\-\/\d]+/).filter(Boolean);

  return tokens.every((token) => {
    // 1. Direct contains check (supports partial words like "chick")
    const haystack = getMenuSearchText(item);
    if (haystack.includes(token)) return true;

    // 2. Veg shorthand
    if (token === "vg" || token === "veg") {
      if (isVeg) return true;
    }

    // 3. Non-veg shorthand
    if (token === "nv" || token === "nonveg" || token === "non-veg") {
      if (!isVeg) return true;
    }

    // 4. Special shorthand
    if (token === "spl" || token === "spcl" || token === "special" || token === "specials") {
      if (isSpecial || catLower.includes("special") || nameLower.includes("special")) return true;
    }

    // 5. Initials matching (e.g. "vg" matches "Vieux Grapes", "hss" matches "Hot & Sour Soup")
    if (token.length > 1 && token.length <= nameWords.length) {
      let tokenIndex = 0;
      for (let i = 0; i < nameWords.length; i++) {
        if (nameWords[i][0] === token[tokenIndex]) {
          tokenIndex++;
          if (tokenIndex === token.length) return true;
        }
      }
    }

    // 6. Word prefix matching (any word in name or category starts with the token)
    if (nameWords.some(word => word.startsWith(token))) return true;
    const catWords = catLower.split(/[\s()&,\-\/\d]+/).filter(Boolean);
    if (catWords.some(word => word.startsWith(token))) return true;

    return false;
  });
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
