// ─────────────────────────────────────────────────────────────────────────────
// PriceProfilesPage — Price profile management for venue-specific pricing
// ─────────────────────────────────────────────────────────────────────────────
// Allows admins to create and manage price profiles that override base menu
// prices for specific venues or time periods (e.g. happy hour, lunch special):
//   - Create/delete price profiles
//   - Set custom prices per menu item per profile
//   - View which venues are linked to each profile
//   - Link/unlink venues to profiles
//   - Warn when multiple venues share a profile
//   - View all menu items with base price vs profile price
//
// Used when a restaurant has different pricing for different venues (e.g.
// bar prices vs family restaurant prices for the same item).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Save, Tag, Loader2, Link2, Unlink, AlertTriangle, Store } from 'lucide-react';
import { apiFetch } from '../services/apiConfig';

export default function PriceProfilesPage() {
  const [profiles, setProfiles] = useState([]);
  const [venues, setVenues] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [prices, setPrices] = useState({});
  const [linkingVenue, setLinkingVenue] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ppRes, venuesRes, menuRes] = await Promise.all([
        apiFetch('/api/venues/price-profiles'),
        apiFetch('/api/venues'),
        apiFetch('/api/menu'),
      ]);
      setProfiles(ppRes || []);
      setVenues(venuesRes || []);
      setMenuItems(menuRes?.categories?.flatMap(c => c.items) || []);
      if (ppRes?.length > 0 && !activeProfileId) setActiveProfileId(ppRes[0].id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const activeProfile = profiles.find(p => p.id === activeProfileId);

  // Build a map of venueId → profileId for quick lookup
  const venueProfileMap = useMemo(() => {
    const map = {};
    for (const profile of profiles) {
      for (const venue of (profile.venues || [])) {
        map[venue.id] = profile.id;
      }
    }
    return map;
  }, [profiles]);

  // Venues not linked to any profile
  const unlinkedVenues = useMemo(() => {
    return venues.filter(v => !venueProfileMap[v.id]);
  }, [venues, venueProfileMap]);

  // Check if any profile is shared by 2+ venues
  const sharedProfileIds = useMemo(() => {
    const shared = new Set();
    for (const profile of profiles) {
      if ((profile.venues || []).length > 1) {
        shared.add(profile.id);
      }
    }
    return shared;
  }, [profiles]);

  useEffect(() => {
    if (activeProfile) {
      const map = {};
      (activeProfile.items || []).forEach(i => {
        map[i.menuItemId] = Number(i.price);
      });
      setPrices(map);
    } else {
      setPrices({});
    }
  }, [activeProfileId, activeProfile]);

  const handlePriceChange = (menuItemId, value) => {
    setPrices(prev => ({ ...prev, [menuItemId]: value }));
  };

  const handleSave = async () => {
    if (!activeProfileId) return;
    setSaving(true);
    try {
      const items = Object.entries(prices)
        .filter(([_, price]) => price !== '' && price != null)
        .map(([menuItemId, price]) => ({ menuItemId, price: Number(price) }));

      await apiFetch(`/api/venues/price-profiles/${activeProfileId}/items`, {
        method: 'PUT',
        body: JSON.stringify({ items }),
      });
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const createProfile = async () => {
    const name = window.prompt('Enter price profile name:');
    if (!name) return;
    try {
      await apiFetch('/api/venues/price-profiles', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteProfile = async (id) => {
    if (!window.confirm('Delete this price profile?')) return;
    try {
      await apiFetch(`/api/venues/price-profiles/${id}`, { method: 'DELETE' });
      setProfiles(prev => prev.filter(p => p.id !== id));
      if (activeProfileId === id) setActiveProfileId(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const linkVenue = async (venueId, profileId) => {
    setLinkingVenue(true);
    try {
      await apiFetch(`/api/venues/${venueId}`, {
        method: 'PATCH',
        body: JSON.stringify({ priceProfileId: profileId }),
      });
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLinkingVenue(false);
    }
  };

  const unlinkVenue = async (venueId) => {
    setLinkingVenue(true);
    try {
      await apiFetch(`/api/venues/${venueId}`, {
        method: 'PATCH',
        body: JSON.stringify({ priceProfileId: null }),
      });
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLinkingVenue(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#E53935]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Price Profiles</h2>
          <p className="text-sm text-gray-500 mt-1">Manage venue-specific pricing — each venue can have its own price list</p>
        </div>
        <button
          onClick={createProfile}
          className="flex items-center gap-2 px-4 py-2 bg-[#E53935] text-white rounded-lg hover:bg-[#B71C1C]"
        >
          <Plus className="w-4 h-4" /> New Profile
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {/* Profile tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {profiles.map(profile => (
          <button
            key={profile.id}
            onClick={() => setActiveProfileId(profile.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border whitespace-nowrap ${
              activeProfileId === profile.id
                ? 'bg-[#E53935] text-white border-[#E53935]'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
            }`}
          >
            <Tag className="w-4 h-4" />
            {profile.name}
            {profile.isDefault && <span className="text-[10px] uppercase opacity-70">(Default)</span>}
            {(profile.venues || []).length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                activeProfileId === profile.id ? 'bg-white/20' : 'bg-gray-100'
              }`}>
                {(profile.venues || []).length} venue{(profile.venues || []).length > 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); deleteProfile(profile.id); }}
              className="ml-1 text-current opacity-60 hover:opacity-100"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </button>
        ))}
      </div>

      {activeProfile && (
        <>
          {/* Shared profile warning */}
          {sharedProfileIds.has(activeProfile.id) && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Multiple venues share this profile</p>
                <p className="text-xs mt-0.5">Changing a price here affects all linked venues: {(activeProfile.venues || []).map(v => v.name).join(', ')}</p>
              </div>
            </div>
          )}

          {/* Venue linkage section */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-gray-400" />
                <h4 className="text-sm font-semibold text-gray-700">Linked Venues</h4>
              </div>
              {unlinkedVenues.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) linkVenue(e.target.value, activeProfile.id);
                  }}
                  disabled={linkingVenue}
                  className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] disabled:opacity-50"
                >
                  <option value="">+ Link a venue...</option>
                  {unlinkedVenues.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              )}
            </div>

            {(activeProfile.venues || []).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activeProfile.venues.map(venue => (
                  <div
                    key={venue.id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  >
                    <Link2 className="w-3 h-3 text-gray-400" />
                    <span className="text-gray-700">{venue.name}</span>
                    <span className="text-[10px] text-gray-400 uppercase">{venue.venueType}</span>
                    <button
                      onClick={() => unlinkVenue(venue.id)}
                      disabled={linkingVenue}
                      className="ml-1 text-gray-400 hover:text-red-500 disabled:opacity-50"
                      title="Unlink venue"
                    >
                      <Unlink className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No venues linked. Link a venue to apply this profile's prices to it.</p>
            )}
          </div>

          {/* Price editing table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{activeProfile.name}</h3>
                <p className="text-sm text-gray-500">Set per-item prices for this profile</p>
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-[#E53935] text-white rounded-lg hover:bg-[#B71C1C] disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Prices
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Item</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Base Price</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Profile Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {menuItems.map(item => {
                    const profilePrice = prices[item.id];
                    const hasOverride = profilePrice !== undefined && profilePrice !== '' && Number(profilePrice) !== Number(item.basePrice);
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-900">{item.name}</td>
                        <td className="px-6 py-3 text-gray-500">₹{item.basePrice}</td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={profilePrice ?? ''}
                              onChange={(e) => handlePriceChange(item.id, e.target.value)}
                              placeholder={item.basePrice}
                              className={`w-28 px-2 py-1 border rounded-md focus:outline-none focus:border-[#E53935] ${
                                hasOverride ? 'border-[#E53935]/40 bg-red-50/30' : 'border-gray-200'
                              }`}
                            />
                            {hasOverride && (
                              <span className="text-[10px] text-[#E53935] font-medium">override</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!activeProfile && profiles.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <Tag className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium">No price profiles yet</p>
          <p className="text-sm">Create a profile to start setting venue-specific prices</p>
        </div>
      )}
    </div>
  );
}
