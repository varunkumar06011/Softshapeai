// ─────────────────────────────────────────────────────────────────────────────
// useVenueSections — Shared hook for venue/section/table resolution
// ─────────────────────────────────────────────────────────────────────────────
// Fetches venues with their floors, sections, and tables from the backend,
// then flattens them into a unified structure for the UI. Handles both
// venue-based restaurants (BAR, Family Restaurant, Parcel) and legacy
// restaurants without venues.
//
// Venue type routing:
//   - BAR venue types → 'bar' outlet (separate kitchen/menu/printer path)
//   - All other venue types → 'restaurant' outlet (shared kitchen path)
//
// Returns:
//   venues — array of venue objects with nested floors/sections/tables
//   sections — flattened array of all sections across venues
//   tables — flattened array of all tables across sections
//   loading — true while fetching
//   error — error message if fetch failed
//   refresh — function to re-fetch venues
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react';
import { fetchVenues } from '../services/tableApi';

// Bar-like venue types — expanded to include all bar-related venue types
const BAR_LIKE_VENUE_TYPES = ['BAR', 'PDR', 'CONFERENCE', 'BANQUET', 'ROOM_SERVICE', 'BAR_LOUNGE', 'BREWERY', 'PUB', 'LOUNGE', 'NIGHTCLUB', 'WINE_BAR', 'COCKTAIL_BAR'];

// Maps a venue type to the outlet type for routing purposes
function getOutletForVenueType(venueType) {
  if (!venueType) return 'restaurant';
  return BAR_LIKE_VENUE_TYPES.includes(venueType.toUpperCase()) ? 'bar' : 'restaurant';
}

/**
 * Shared hook for venue/section resolution.
 *
 * @param {string} outlet - 'restaurant' | 'bar'
 * @returns {{
 *   venues: Array,
 *   outlets: Array<string>,
 *   sections: Array,
 *   venueColumns: Array<{id:string, label:string}>,
 *   loading: boolean,
 *   error: string|null
 * }}
 */
export function useVenueSections(outlet) {
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchVenues()
      .then((data) => {
        if (!cancelled) {
          setVenues(Array.isArray(data) ? data : []);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          console.warn('[useVenueSections] fetchVenues failed:', err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Distinct outlets present for this tenant, in stable order of first appearance
  const outlets = useMemo(() => {
    const seen = [];
    const set = new Set();
    for (const v of venues) {
      const o = getOutletForVenueType(v.venueType);
      if (!set.has(o)) {
        set.add(o);
        seen.push(o);
      }
    }
    return seen;
  }, [venues]);

  // Venues matching the requested outlet
  const filteredVenues = useMemo(
    () => venues.filter((v) => getOutletForVenueType(v.venueType) === outlet),
    [venues, outlet]
  );

  // Flatten sections from matching venues (direct + via floors)
  const sections = useMemo(() => {
    const all = [];
    for (const venue of filteredVenues) {
      if (venue.sections) {
        for (const s of venue.sections) {
          all.push({ ...s, venueId: venue.id });
        }
      }
      if (venue.floors) {
        for (const floor of venue.floors) {
          if (floor.sections) {
            for (const s of floor.sections) {
              all.push({ ...s, venueId: venue.id });
            }
          }
        }
      }
    }
    return all;
  }, [filteredVenues]);

  const venueColumns = useMemo(() => {
    // Key by venueId (not section id) — the backend PriceProfile system
    // stores and looks up prices by venue ID.  Using section ids here would
    // silently break venue-price saves and lookups.
    const seen = new Map();
    for (const v of filteredVenues) {
      if (!seen.has(v.id)) {
        seen.set(v.id, { id: v.id, label: v.name || 'Price' });
      }
    }
    const cols = Array.from(seen.values());
    return cols.length > 0 ? cols : [{ id: 'default', label: 'Price' }];
  }, [filteredVenues]);

  return { venues, outlets, sections, venueColumns, loading, error };
}
