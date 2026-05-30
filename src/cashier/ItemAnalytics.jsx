import { useState, useEffect, useMemo } from 'react';
import { Calendar, TrendingUp, Package, DollarSign, ChevronDown, ChevronUp, Filter, Download } from 'lucide-react';
import { API_BASE } from '../services/apiConfig';

const RESTAURANT_ID = 'restaurant-001';
const BAR_ID = 'bar-001';
const BAR_UNIT_ML = 30;
const FULL_BOTTLE_ML = 750;

// Helper function to determine ml poured for liquor items
function getLiquorMlPoured(itemName, quantity) {
  if (itemName.endsWith('Full Bottle')) return FULL_BOTTLE_ML * quantity;
  if (itemName.endsWith('30ml')) return BAR_UNIT_ML * quantity;
  return null; // bottle items or food — no ml display
}

export default function ItemAnalytics({ outlet = 'restaurant' }) {
  const [timeFilter, setTimeFilter] = useState('today'); // today, yesterday, month, custom
  const [customDate, setCustomDate] = useState('');
  const [itemsData, setItemsData] = useState([]);
  const [summary, setSummary] = useState({ totalItems: 0, totalQuantity: 0, totalRevenue: 0 });
  const [loading, setLoading] = useState(false);
  const [sortField, setSortField] = useState('revenue'); // revenue, quantity, name
  const [sortDirection, setSortDirection] = useState('desc');
  const [typeFilter, setTypeFilter] = useState('all'); // all, food, liquor

  const restaurantId = outlet === 'bar' ? BAR_ID : RESTAURANT_ID;

  useEffect(() => {
    fetchAnalytics();
  }, [timeFilter, customDate, outlet]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange();

      const url = `${API_BASE}/api/analytics/items-sold?restaurantId=${restaurantId}&startDate=${startDate}&endDate=${endDate}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.items) {
        setItemsData(data.items);
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('[ItemAnalytics] Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDateRange = () => {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const now = new Date(Date.now() + IST_OFFSET_MS);
    const today = now.toISOString().slice(0, 10);

    if (timeFilter === 'today') {
      return { startDate: today, endDate: today };
    } else if (timeFilter === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      return { startDate: yesterdayStr, endDate: yesterdayStr };
    } else if (timeFilter === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      return { startDate: firstDay, endDate: today };
    } else if (timeFilter === 'custom' && customDate) {
      return { startDate: customDate, endDate: customDate };
    }
    return { startDate: today, endDate: today };
  };

  const filteredAndSortedData = useMemo(() => {
    let filtered = itemsData;

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(item => item.type === typeFilter);
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (sortField === 'name') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return sorted;
  }, [itemsData, sortField, sortDirection, typeFilter]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleExport = () => {
    const csv = [
      ['Item Name', 'Type', 'Quantity Sold', 'ML Poured', 'Revenue (₹)'],
      ...filteredAndSortedData.map(item => [
        item.name,
        item.type === 'liquor' ? 'Liquor' : 'Food',
        item.quantity,
        getLiquorMlPoured(item.name, item.quantity) ?? '',
        item.revenue.toFixed(2)
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `item-analytics-${getDateRange().startDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  return (
    <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-50">
      {/* Header */}
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

      {/* Time Filter Buttons */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={16} className="text-[#E53935]" />
          <span className="text-xs font-black uppercase text-gray-700">Time Period</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'month', label: 'This Month' },
            { id: 'custom', label: 'Custom Date' }
          ].map(filter => (
            <button
              key={filter.id}
              onClick={() => setTimeFilter(filter.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${
                timeFilter === filter.id
                  ? 'bg-[#E53935] text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Custom Date Picker */}
        {timeFilter === 'custom' && (
          <div className="mt-3">
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="w-full sm:w-auto px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-[#E53935] outline-none text-sm"
            />
          </div>
        )}
      </div>

      {/* Summary Cards */}
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
              <p className="text-2xl font-black text-gray-900">₹{summary.totalRevenue.toFixed(0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Type Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Filter size={14} className="text-[#E53935]" />
          <span className="text-xs font-black uppercase text-gray-700">Filter by Type:</span>
          <div className="flex gap-2">
            {[
              { id: 'all', label: 'All' },
              { id: 'food', label: 'Food' },
              { id: 'liquor', label: 'Liquor' }
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

      {/* Items Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    Item Name
                    <SortIcon field="name" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">
                  Type
                </th>
                <th
                  onClick={() => handleSort('quantity')}
                  className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    Quantity
                    <SortIcon field="quantity" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('revenue')}
                  className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    Revenue
                    <SortIcon field="revenue" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-gray-400">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#E53935]"></div>
                      <span className="text-xs font-bold uppercase">Loading...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredAndSortedData.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-xs font-bold uppercase text-gray-400">
                    No items sold in this period
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
                        const mlPoured = getLiquorMlPoured(item.name, item.quantity);
                        return mlPoured !== null && (
                          <div className="text-[10px] font-bold text-gray-500">{mlPoured}ml poured</div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-black text-[#E53935]">₹{item.revenue.toFixed(2)}</td>
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
                  <td className="px-4 py-3 text-right text-sm font-black text-[#E53935]">
                    ₹{filteredAndSortedData.reduce((sum, item) => sum + item.revenue, 0).toFixed(2)}
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
