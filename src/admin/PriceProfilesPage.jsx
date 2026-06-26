import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Tag, Loader2 } from 'lucide-react';
import { apiFetch } from '../services/apiConfig';

export default function PriceProfilesPage() {
  const [profiles, setProfiles] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [prices, setPrices] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ppRes, menuRes] = await Promise.all([
        apiFetch('/api/venues/price-profiles'),
        apiFetch('/api/menu'),
      ]);
      setProfiles(ppRes || []);
      setMenuItems(menuRes?.categories?.flatMap(c => c.items) || []);
      if (ppRes?.length > 0) setActiveProfileId(ppRes[0].id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const activeProfile = profiles.find(p => p.id === activeProfileId);

  useEffect(() => {
    if (activeProfile) {
      const map = {};
      (activeProfile.items || []).forEach(i => {
        map[i.menuItemId] = i.price;
      });
      setPrices(map);
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
        method: 'PATCH',
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
        <h2 className="text-2xl font-bold text-gray-900">Price Profiles</h2>
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
                {menuItems.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-900">{item.name}</td>
                    <td className="px-6 py-3 text-gray-500">₹{item.basePrice}</td>
                    <td className="px-6 py-3">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={prices[item.id] ?? ''}
                        onChange={(e) => handlePriceChange(item.id, e.target.value)}
                        placeholder={item.basePrice}
                        className="w-28 px-2 py-1 border rounded-md focus:outline-none focus:border-[#E53935]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
