import { useState, useEffect, useMemo } from 'react';
import { fetchVenues } from '../services/tableApi';

// All non-BAR venueTypes route through the same kitchen/menu/printer path as "restaurant"
const BAR_TYPES = ['BAR'];

function getOutletForVenueType(venueType) {
  return venueType === 'BAR' ? 'bar' : 'restaurant';
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
    const cols = sections.map((s) => ({ id: s.id || s.name, label: s.name || 'Price' }));
    return cols.length > 0 ? cols : [{ id: 'default', label: 'Price' }];
  }, [sections]);

  return { venues, outlets, sections, venueColumns, loading, error };
}
