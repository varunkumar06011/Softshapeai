import React, { useState, useEffect } from 'react';
import { Store, MapPin, Users, Hash, ArrowRight, Loader2, CheckCircle, XCircle, Building2, Calendar } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/apiConfig';

const RESTAURANT_TYPE_LABELS = {
  DINE_IN: 'Dine-in',
  BAR_LOUNGE: 'Bar & Lounge',
  BAR_WITH_DINING: 'Bar with Dining',
  CAFE: 'Cafe',
  CLOUD_KITCHEN: 'Cloud Kitchen',
};

const VENUE_ICONS = {
  DINE_IN: '🏠',
  BAR: '🍺',
  CAFE: '☕',
  TAKEAWAY: '🥡',
  DELIVERY: '🛵',
};

const OutletsOverview = () => {
  const { restaurant, setAuth } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [switching, setSwitching] = useState(null);

  useEffect(() => {
    apiFetch('/api/restaurant/outlets-overview')
      .then((res) => setData(res))
      .catch((err) => setError(err.message || 'Failed to load outlets'))
      .finally(() => setLoading(false));
  }, []);

  const handleSwitch = async (outletId) => {
    setSwitching(outletId);
    try {
      const res = await apiFetch('/api/auth/switch-outlet', {
        method: 'POST',
        body: JSON.stringify({ outletId }),
      });
      if (res.token) {
        setAuth({ token: res.token, user: res.user, restaurant: res.restaurant });
        window.location.reload();
      }
    } catch (err) {
      setError(err.message || 'Failed to switch outlet');
    } finally {
      setSwitching(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-[#E53935]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 mb-2">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-[#E53935] hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data || !data.outlets || data.outlets.length === 0) {
    return (
      <div className="text-center py-20">
        <Store size={48} className="mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">No outlets found.</p>
      </div>
    );
  }

  const currentOutletId = restaurant?.id;
  const orgName = data.outlets[0]?.organizationName || restaurant?.name || 'Your Restaurant';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Your Outlets</h1>
        <p className="text-sm text-gray-500 mt-1">
          {data.outlets.length} outlet{data.outlets.length !== 1 ? 's' : ''} under {orgName}
        </p>
      </div>

      {/* Outlet Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {data.outlets.map((outlet) => {
          const isCurrent = outlet.id === currentOutletId;
          const typeLabel = RESTAURANT_TYPE_LABELS[outlet.restaurantType] || outlet.restaurantType;
          return (
            <div
              key={outlet.id}
              className={`bg-white rounded-2xl p-5 border-l-4 shadow-sm transition-all ${
                outlet.isActive ? 'border-green-500' : 'border-gray-300'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isCurrent ? 'bg-[#E53935]/10' : 'bg-gray-100'
                  }`}>
                    <Store size={20} className={isCurrent ? 'text-[#E53935]' : 'text-gray-500'} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{outlet.name}</h3>
                    <p className="text-xs text-gray-400">Code: {outlet.restaurantCode}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-600">
                    {typeLabel}
                  </span>
                  {outlet.isActive ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-green-50 text-green-700">
                      <CheckCircle size={10} /> Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-500">
                      <XCircle size={10} /> Inactive
                    </span>
                  )}
                </div>
              </div>

              {/* Stats Row */}
              <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                <span className="flex items-center gap-1">
                  <MapPin size={12} /> {outlet.venueCount} venue{outlet.venueCount !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1">
                  <Hash size={12} /> {outlet.totalTables} table{outlet.totalTables !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1">
                  <Users size={12} /> {outlet.staffCount} staff
                </span>
              </div>

              {/* Venue Tree */}
              {outlet.venues && outlet.venues.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 mb-3 text-xs space-y-1">
                  {outlet.venues.map((venue, vi) => (
                    <div key={vi} className="flex items-center gap-1.5 text-gray-600">
                      <span>{VENUE_ICONS[venue.venueType] || '📍'}</span>
                      <span className="font-medium">{venue.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Onboarding Status */}
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                <Calendar size={12} />
                {outlet.onboardingCompletedAt
                  ? `Setup complete · ${new Date(outlet.onboardingCompletedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : 'Setup pending'}
              </div>

              {/* Action */}
              {isCurrent ? (
                <div className="flex items-center gap-2 text-sm font-semibold text-[#E53935] bg-[#E53935]/5 rounded-lg px-3 py-2">
                  <CheckCircle size={16} /> Currently viewing
                </div>
              ) : (
                <button
                  onClick={() => handleSwitch(outlet.id)}
                  disabled={switching === outlet.id || !outlet.isActive}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                    outlet.isActive
                      ? 'bg-[#E53935] hover:bg-[#B71C1C] text-white'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {switching === outlet.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      Switch to this outlet
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Summary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 text-xs">
                <th className="text-left py-3 px-5 font-medium">Outlet Name</th>
                <th className="text-center py-3 px-3 font-medium">Type</th>
                <th className="text-center py-3 px-3 font-medium">Venues</th>
                <th className="text-center py-3 px-3 font-medium">Tables</th>
                <th className="text-center py-3 px-3 font-medium">Staff</th>
                <th className="text-center py-3 px-3 font-medium">Status</th>
                <th className="text-center py-3 px-5 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.outlets.map((outlet) => (
                <tr key={outlet.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 px-5 font-medium text-gray-900">
                    {outlet.name}
                    {outlet.id === currentOutletId && (
                      <span className="ml-2 text-[10px] text-[#E53935] font-bold">CURRENT</span>
                    )}
                  </td>
                  <td className="text-center py-3 px-3 text-gray-600">
                    {RESTAURANT_TYPE_LABELS[outlet.restaurantType] || outlet.restaurantType}
                  </td>
                  <td className="text-center py-3 px-3 text-gray-600">{outlet.venueCount}</td>
                  <td className="text-center py-3 px-3 text-gray-600">{outlet.totalTables}</td>
                  <td className="text-center py-3 px-3 text-gray-600">{outlet.staffCount}</td>
                  <td className="text-center py-3 px-3">
                    {outlet.isActive ? (
                      <span className="text-green-600 text-xs font-medium">Active</span>
                    ) : (
                      <span className="text-gray-400 text-xs font-medium">Inactive</span>
                    )}
                  </td>
                  <td className="text-center py-3 px-5 text-gray-500 text-xs">
                    {new Date(outlet.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OutletsOverview;
