/**
 * Reads the current restaurantId from localStorage.
 */
export function getCurrentRestaurantId() {
  const userRaw = localStorage.getItem('ss_user');
  if (userRaw) {
    try {
      const user = JSON.parse(userRaw);
      return user.activeRestaurantId ?? user.restaurantId;
    } catch {
      /* ignore parse error */
    }
  }

  return null;
}
