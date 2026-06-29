// ─────────────────────────────────────────────────────────────────────────────
// AI Recipe Service — Frontend API client for AI recipe generation
// ─────────────────────────────────────────────────────────────────────────────
// Calls the backend endpoint that suggests ingredients from a menu item name.
// All requests are scoped to the current restaurant and include auth headers.
// ─────────────────────────────────────────────────────────────────────────────

import { apiUrl, getAuthHeaders } from "./apiConfig";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";

/**
 * Generate AI-suggested ingredients for a menu item.
 * @param {string} menuItemId
 * @returns {Promise<{ ingredients: Array<{ name: string; unit: string; quantity: number }> }>}
 */
export async function generateRecipe(menuItemId) {
  if (!menuItemId) {
    throw new Error("menuItemId is required");
  }

  const restaurantId = getCurrentRestaurantId();

  const res = await fetch(
    apiUrl(`/api/menu/recipes/${encodeURIComponent(menuItemId)}/generate?restaurantId=${encodeURIComponent(restaurantId)}`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    }
  );

  if (!res.ok) {
    let message = `AI recipe generation failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  return res.json();
}
