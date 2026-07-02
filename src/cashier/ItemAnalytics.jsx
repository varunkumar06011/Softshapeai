// ─────────────────────────────────────────────────────────────────────────────
// ItemAnalytics — Item-wise sales analytics for cashier dashboard
// ─────────────────────────────────────────────────────────────────────────────
// Displays detailed item-level sales analytics:
//   - Top selling items by quantity and revenue
//   - Date range filtering (Today, 7 days, 30 days, Custom)
//   - Category-wise breakdown
//   - Liquor volume tracking (ml poured per item)
//   - Source filtering (restaurant vs bar)
//   - Search within results
//   - Export to CSV
//
// Calculates liquor volume poured using peg/bottle size heuristics:
//   - Full Bottle = 750ml
//   - 30ml peg = 30ml per unit
//
// Used as a tab within the CashierDashboard for quick item performance review.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Calendar, TrendingUp, Package, DollarSign, ChevronDown, ChevronUp, Filter, Download, Search } from 'lucide-react';
import { API_BASE, getAuthHeaders } from '../services/apiConfig';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';
import { getKolkataDateString, shiftKolkataDate, getKolkataMonthString } from '../shared/utils/dateFormat';

// Standard bar unit sizes in milliliters
const BAR_UNIT_ML = 30;
const FULL_BOTTLE_ML = 750;

// Bar-like venue types — PDR, Conference, Room Service, Banquet are bar outlets too
const BAR_LIKE_VENUE_TYPES = ['BAR', 'PDR', 'CONFERENCE', 'BANQUET', 'ROOM_SERVICE'];
function isBarLikeVenue(venueType) {
  if (!venueType) return false;
  return BAR_LIKE_VENUE_TYPES.includes(venueType.toUpperCase());
}

// Calculate liquor volume poured based on item name and quantity
function getLiquorMlPoured(itemName, quantity) {
  if (itemName.endsWith('Full Bottle')) return FULL_BOTTLE_ML * quantity;
  if (itemName.endsWith('30ml')) return BAR_UNIT_ML * quantity;
  return null;
}


function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function itemNameMatchesSearch(item, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const nameLower = (item.name || '').toLowerCase();
  const typeLower = (item.type || '').toLowerCase();
  const nameWords = nameLower.split(/[\s()&,\-\/\d]+/).filter(Boolean);
  return tokens.every((token) => {
    // Search in name
    if (nameLower.includes(token)) return true;
    // Search in type (food/liquor)
    if (typeLower.includes(token)) return true;
    // Fuzzy match in name words
    for (const word of nameWords) {
      if (levenshtein(token, word) <= 1) return true;
    }
    return false;
  });
}

export default function ItemAnalytics({ outlet = 'restaurant', sections = [], venueFilter = 'all' }) {
  const [source, setSource] = useState('all');
  // When a venue filter is selected from the parent dashboard, it overrides the internal source
  const effectiveSource = venueFilter !== 'all' ? venueFilter : source;

  const [timeFilter, setTimeFilter] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [itemsData, setItemsData] = useState([]);
  const [summary, setSummary] = useState({ totalItems: 0, totalQuantity: 0, totalRevenue: 0 });
  const [loading, setLoading] = useState(false);
  const [sortField, setSortField] = useState('revenue');
  const [sortDirection, setSortDirection] = useState('desc');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const fetchGenerationRef = useRef(0);

  useEffect(() => {
    setSource('all');
  }, [outlet, venueFilter]);

  const outletSections = useMemo(() => {
    return sections.filter(section => {
      const sectionOutlet = isBarLikeVenue(section.venue?.venueType) ? 'bar' : 'restaurant';
      return outlet === 'both' || sectionOutlet === outlet;
    });
  }, [sections, outlet]);

  const sectionSourceMap = useMemo(() => {
    const map = new Map();
    for (const section of outletSections) {
      // Map both the raw sectionTag and the stripped sourceKey for compatibility
      const sourceKey = section.sectionTag?.startsWith('venue-')
        ? section.sectionTag.slice(6)
        : section.sectionTag || section.name;
      map.set(section.sectionTag || section.name, section.name);
      map.set(sourceKey, section.name);
    }
    return map;
  }, [outletSections]);

  useEffect(() => {
    fetchAnalytics();
  }, [timeFilter, customDate, effectiveSource, outletSections]);

  // Re-fetch analytics when a settlement occurs (custom event dispatched from CashierDashboard)
  useEffect(() => {
    const handler = () => fetchAnalytics();
    window.addEventListener('softshape_order_updated', handler);
    return () => window.removeEventListener('softshape_order_updated', handler);
  }, [timeFilter, customDate, effectiveSource, outletSections]);

  const getDateRange = useCallback(() => {
    const today = getKolkataDateString();

    if (timeFilter === 'custom' && customDate) {
      return { startDate: customDate, endDate: customDate };
    } else if (timeFilter === 'today') {
      return { startDate: today, endDate: today };
    } else if (timeFilter === 'yesterday') {
      const yesterday = shiftKolkataDate(new Date(), -1);
      return { startDate: yesterday, endDate: yesterday };
    } else if (timeFilter === 'month') {
      const monthStr = getKolkataMonthString();
      return { startDate: `${monthStr}-01`, endDate: today };
    } else if (timeFilter === 'all') {
      return { startDate: '2000-01-01', endDate: today };
    }
    return { startDate: today, endDate: today };
  }, [timeFilter, customDate]);

  const fetchAnalytics = async () => {
    const myGeneration = ++fetchGenerationRef.current;
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange();
      const outletType = outlet === 'bar' ? 'bar' : outlet === 'restaurant' ? 'restaurant' : null;

      const outletParam = outletType ? `&outletType=${outletType}` : '';
      const fetchOpts = { headers: getAuthHeaders(), cache: 'no-store' };

      if (effectiveSource === 'all') {
        if (outletSections.length === 0) {
          const url = `${API_BASE}/api/analytics/items-sold?restaurantId=${getCurrentRestaurantId()}&startDate=${startDate}&endDate=${endDate}${outletParam}`;
          const response = await fetch(url, fetchOpts);
          const data = await response.json();
          if (myGeneration !== fetchGenerationRef.current) return;
          if (data.items) { setItemsData(data.items); setSummary(data.summary); }
          return;
        }

        const results = await Promise.all(
          outletSections.map(section => {
            let url = `${API_BASE}/api/analytics/items-sold?restaurantId=${getCurrentRestaurantId()}&startDate=${startDate}&endDate=${endDate}${outletParam}`;
            url += `&sectionName=${encodeURIComponent(section.name)}`;
            return fetch(url, fetchOpts).then(r => r.json()).catch(() => ({ items: [], summary: null }));
          })
        );
        if (myGeneration !== fetchGenerationRef.current) return;

        const mergedMap = new Map();
        for (const result of results) {
          for (const item of (result.items || [])) {
            const key = `${item.name}||${item.type}`;
            if (mergedMap.has(key)) {
              const existing = mergedMap.get(key);
              existing.quantity += item.quantity || 0;
              existing.orderCount = (existing.orderCount || 0) + (item.orderCount || 0);
              existing.revenue += item.revenue || 0;
            } else {
              mergedMap.set(key, { ...item });
            }
          }
        }

        const mergedItems = Array.from(mergedMap.values());
        const mergedSummary = {
          totalItems: mergedItems.length,
          totalQuantity: mergedItems.reduce((s, i) => s + (i.quantity || 0), 0),
          totalRevenue: mergedItems.reduce((s, i) => s + (i.revenue || 0), 0),
        };

        setItemsData(mergedItems);
        setSummary(mergedSummary);
        return;
      }

      const sectionName = sectionSourceMap.get(effectiveSource);
      let url = `${API_BASE}/api/analytics/items-sold?restaurantId=${getCurrentRestaurantId()}&startDate=${startDate}&endDate=${endDate}`;
      if (sectionName) {
        url += `&sectionName=${encodeURIComponent(sectionName)}`;
      }
      if (outletType) {
        url += `&outletType=${outletType}`;
      }
      const response = await fetch(url, fetchOpts);
      const data = await response.json();
      if (myGeneration !== fetchGenerationRef.current) return;
      if (data.items) {
        setItemsData(data.items);
        setSummary(data.summary);
      }
    } catch (error) {
      if (myGeneration !== fetchGenerationRef.current) return;
      console.error('[ItemAnalytics] Failed to fetch:', error);
    } finally {
      if (myGeneration === fetchGenerationRef.current) {
        setLoading(false);
      }
    }
  };

  const filteredAndSortedData = useMemo(() => {
    let filtered = itemsData;
    if (searchQuery.trim()) {
      filtered = filtered.filter(item => itemNameMatchesSearch(item, searchQuery));
    }
    if (typeFilter !== 'all') {
      filtered = filtered.filter(item => item.type === typeFilter);
    }
    const sorted = [...filtered].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (sortField === 'name') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      return sortDirection === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
    return sorted;
  }, [itemsData, sortField, sortDirection, typeFilter, searchQuery]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleExport = () => {
    const { startDate } = getDateRange();
    const csv = [
      ['Item Name', 'Type', 'Quantity Sold', 'Orders', 'ML Poured', 'Revenue (Rs)'],
      ...filteredAndSortedData.map(item => [
        item.name,
        item.type === 'liquor' ? 'Liquor' : 'Food',
        item.quantity,
        item.orderCount ?? 0,
        getLiquorMlPoured(item.name, item.quantity) ?? '',
        item.revenue.toFixed(2),
      ]),
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `item-analytics-${effectiveSource}-${startDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  const sourcePills = useMemo(() => {
    const pills = [{ id: 'all', label: 'All' }];
    for (const section of outletSections) {
      const sourceKey = section.sectionTag?.startsWith('venue-')
        ? section.sectionTag.slice(6)
        : section.sectionTag || section.name;
      pills.push({ id: sourceKey, label: section.name });
    }
    return pills;
  }, [outletSections]);

  return (
    <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-50">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-wider">Item Analytics</h2>
          <p className="text-xs text-gray-500 mt-1">Track sales performance by menu item</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-[#E53935] text-white rounded-xl text-xs font-black uppercase hover:bg-[#B71C1C] transition-colors"
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-[#E53935]" />
          <span className="text-xs font-black uppercase text-gray-700">Source</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {sourcePills.map(pill => (
            <button
              key={pill.id}
              onClick={() => { setSource(pill.id); setTypeFilter('all'); }}
              disabled={venueFilter !== 'all'}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${
                effectiveSource === pill.id
                  ? 'bg-[#E53935] text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${venueFilter !== 'all' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={16} className="text-[#E53935]" />
          <span className="text-xs font-black uppercase text-gray-700">Time Period</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'month', label: 'This Month' },
            { id: 'all', label: 'All Time' },
          ].map(filter => (
            <button
              key={filter.id}
              onClick={() => { setTimeFilter(filter.id); setCustomDate(''); }}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${
                timeFilter === filter.id && !customDate
                  ? 'bg-[#E53935] text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
          <input
            type="date"
            value={customDate}
            max={getKolkataDateString()}
            onChange={e => {
              const val = e.target.value;
              setCustomDate(val);
              if (val) setTimeFilter('custom');
            }}
            className={`px-3 py-2 rounded-lg text-xs font-bold border-2 outline-none transition-colors cursor-pointer ${
              customDate
                ? 'border-[#E53935] text-[#E53935] bg-red-50'
                : 'border-gray-200 text-gray-600 bg-white hover:border-gray-400'
            }`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Package size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Unique Items</p>
              <p className="text-2xl font-black text-gray-900">{summary.totalItems}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
              <TrendingUp size={20} className="text-orange-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Total Quantity</p>
              <p className="text-2xl font-black text-gray-900">{summary.totalQuantity}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <DollarSign size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Total Revenue</p>
              <p className="text-2xl font-black text-gray-900">Rs{summary.totalRevenue.toFixed(0)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Search size={14} className="text-[#E53935]" />
          <span className="text-xs font-black uppercase text-gray-700">Search Items:</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Type item name..."
            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-xs font-bold border-2 border-gray-200 outline-none focus:border-[#E53935] transition-colors bg-gray-50"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Filter size={14} className="text-[#E53935]" />
          <span className="text-xs font-black uppercase text-gray-700">Filter by Type:</span>
          <div className="flex gap-2">
            {[
              { id: 'all', label: 'All' },
              { id: 'food', label: 'Food' },
              { id: 'liquor', label: 'Liquor' },
            ].map(filter => (
              <button
                key={filter.id}
                onClick={() => setTypeFilter(filter.id)}
                className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-all ${
                  typeFilter === filter.id
                    ? 'bg-[#E53935] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1">Item Name <SortIcon field="name" /></div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Type</th>
                <th
                  onClick={() => handleSort('quantity')}
                  className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">Quantity <SortIcon field="quantity" /></div>
                </th>
                <th
                  onClick={() => handleSort('orderCount')}
                  className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">Orders <SortIcon field="orderCount" /></div>
                </th>
                <th
                  onClick={() => handleSort('revenue')}
                  className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">Revenue <SortIcon field="revenue" /></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-gray-400">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#E53935]"></div>
                      <span className="text-xs font-bold uppercase">Loading...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredAndSortedData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-xs font-bold uppercase text-gray-400">
                    {searchQuery.trim() ? 'No items match your search' : 'No items sold in this period'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedData.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-bold text-gray-900">{item.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                        item.type === 'liquor'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {item.type === 'liquor' ? 'Liquor' : 'Food'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-black text-gray-900">{item.quantity}</div>
                      {item.type === 'liquor' && (() => {
                        const ml = getLiquorMlPoured(item.name, item.quantity);
                        return ml !== null && (
                          <div className="text-[10px] font-bold text-gray-500">{ml}ml poured</div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-black text-gray-600">{item.orderCount ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-black text-[#E53935]">Rs{item.revenue.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredAndSortedData.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-sm font-black uppercase text-gray-700">
                    Total ({filteredAndSortedData.length} items)
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-black text-gray-900">
                    {filteredAndSortedData.reduce((sum, item) => sum + item.quantity, 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-black text-gray-500">
                    —
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-black text-[#E53935]">
                    Rs{filteredAndSortedData.reduce((sum, item) => sum + item.revenue, 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
