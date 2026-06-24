import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';

export function getVenueId() {
  return getCurrentRestaurantId();
}
export const VENUE_TABLES_CACHE_KEY = "softshape_venue_tables_cache_v1";
export const VENUE_MENU_CACHE_KEY = "softshape_venue_menu_cache_v1";

// Sub-venue IDs used for VenuePrice lookups
export const VENUE_SUB_IDS = {
  // Bar venues
  "Bar Ac Hall": "venue-bar-ac-hall",
  "Conference Hall": "venue-bar-conference",
  "PDR": "venue-bar-pdr",
  "Rooms": "venue-bar-rooms",
  "GoBox": "venue-bar-gobox",
  // Restaurant venues
  "Family Restaurant": "venue-family-restaurant",
  "Parcel(Restaurant)": "venue-restaurant-parcel",
};

export const BAR_VENUE_PRICE_COLUMNS = [
  { id: "venue-bar-ac-hall", label: "Bar Ac Hall" },
  { id: "venue-bar-conference", label: "Conference Hall" },
  { id: "venue-bar-pdr", label: "PDR" },
  { id: "venue-bar-rooms", label: "Rooms" },
  { id: "venue-bar-gobox", label: "GoBox" },
];

export const RESTAURANT_VENUE_PRICE_COLUMNS = [
  { id: "venue-family-restaurant", label: "Family Restaurant" },
  { id: "venue-restaurant-parcel", label: "GoBox" },
];

// Kept for backwards compat with any code still importing VENUE_PRICE_COLUMNS
export const VENUE_PRICE_COLUMNS = BAR_VENUE_PRICE_COLUMNS;

