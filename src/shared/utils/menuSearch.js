/** Build searchable text for a POS menu item ({ n, c, p, t, id, desc, ... }). */
export function getMenuSearchText(item) {
  if (!item) return "";
  return [
    item.n, item.name,
    item.c, item.category,
    item.id,
    item.desc, item.description,
    item.p != null ? String(item.p) : "",
    item.alias || "",
    item.t === "veg" ? "veg vegetarian" : "non non-veg nonveg",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function normalizeSearchQuery(query) {
  return (query || "").trim().toLowerCase();
}

/**
 * Subsequence match — checks whether every character of `needle` appears
 * in `haystack` in order (not necessarily consecutively).
 * e.g. "vgra" matches "v grand spl chicken fried rice" collapsed to "vgrandsplchickenfriedrice"
 */
function isSubsequence(needle, haystack) {
  let ni = 0;
  for (let hi = 0; hi < haystack.length && ni < needle.length; hi++) {
    if (haystack[hi] === needle[ni]) ni++;
  }
  return ni === needle.length;
}

/**
 * Hybrid initials+prefix matching.
 * Each character of the token is matched against the start of successive words.
 * BUT if a word's first letter matches and the next token characters also appear
 * as a prefix of that same word, they are consumed too.
 * e.g. "vgra" against ["v","grand","spl","chicken","fried","rice"]
 *   → v matches "v", g matches "grand", r matches — no, but "gra" is a prefix of "grand"
 * So we try: v→"v"(match v), then gra→"grand"(prefix "gra"), then remaining chars done ✓
 */
function initialsWithPrefixMatch(token, words) {
  // Recursive backtracking with memoisation
  function match(ti, wi) {
    if (ti >= token.length) return true;
    if (wi >= words.length) return false;

    const word = words[wi];
    // Only try if the current token char matches the first letter of this word
    if (token[ti] === word[0]) {
      // Greedily consume as many token chars as the word prefix allows
      let consumed = 1;
      while (
        ti + consumed < token.length &&
        consumed < word.length &&
        token[ti + consumed] === word[consumed]
      ) {
        consumed++;
      }
      // Try from longest prefix down to single-char initial
      for (let c = consumed; c >= 1; c--) {
        if (match(ti + c, wi + 1)) return true;
      }
    }
    // Skip this word (it doesn't match current token char)
    return match(ti, wi + 1);
  }
  return match(0, 0);
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
  // Collapsed name (no spaces, no special chars) for subsequence matching
  const nameCollapsed = nameWords.join("");
  const catWords = catLower.split(/[\s()&,\-\/\d]+/).filter(Boolean);
  const catCollapsed = catWords.join("");

  // Global collapsed checks for spacing and punctuation tolerance (e.g. "veg-burger" or "veg burger" matching "vegburger")
  const qCollapsed = q.replace(/[^a-z0-9]/g, "");
  const nameCollapsedAll = nameLower.replace(/[^a-z0-9]/g, "");
  const catCollapsedAll = catLower.replace(/[^a-z0-9]/g, "");

  if (qCollapsed.length > 1) {
    if (nameCollapsedAll.includes(qCollapsed)) return true;
    if (catCollapsedAll.includes(qCollapsed)) return true;
    if (isSubsequence(qCollapsed, nameCollapsedAll)) return true;
  }

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

    // 5. Collapsed substring match (e.g. "vgrand" in "vgrandsplchickenfriedrice")
    if (nameCollapsed.includes(token)) return true;
    if (catCollapsed.includes(token)) return true;

    // 6. Hybrid initials + prefix matching
    //    e.g. "vgra" → v=V, gra=prefix of Grand → match!
    //    e.g. "vgr"  → v=V, g=Grand, r=Rice → match!
    //    e.g. "hss"  → h=Hot, s=Sour, s=Soup → match!
    if (token.length > 1) {
      if (initialsWithPrefixMatch(token, nameWords)) return true;
      if (initialsWithPrefixMatch(token, catWords)) return true;
    }

    // 7. Subsequence matching against collapsed name
    //    e.g. "vgra" → chars v,g,r,a all appear in order in "vgrandspl..."
    if (token.length > 1 && isSubsequence(token, nameCollapsed)) return true;
    if (token.length > 1 && isSubsequence(token, catCollapsed)) return true;

    // 8. Word prefix matching (any word starts with the token)
    if (nameWords.some(word => word.startsWith(token))) return true;
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
