import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';

export function getBarId() {
  return getCurrentRestaurantId();
}
export const BAR_TABLES_CACHE_KEY = "softshape_bar_tables_cache_v1";
export const BAR_MENU_CACHE_KEY = "softshape_bar_menu_cache_v3";
