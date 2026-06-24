/**
 * Reads the current restaurantId from localStorage.
 */
export function getCurrentRestaurantId() {
  const userRaw = localStorage.getItem('ss_user');
  if (userRaw) {
    try {
      const user = JSON.parse(userRaw);
      if (user?.restaurantId) return user.restaurantId;
    } catch {
      /* ignore parse error */
    }
  }

  return null;
}
