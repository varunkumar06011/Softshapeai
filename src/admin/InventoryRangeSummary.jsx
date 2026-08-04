import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Search, AlertTriangle, RefreshCw } from 'lucide-react';
import { API_BASE, getAuthHeaders } from '../services/apiConfig';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';

const COLORS = ['#B71C1C', '#E53935', '#EF9A9A', '#FFCDD2'];

function formatMoney(value) {
  if (value == null || isNaN(value)) return '—';
  return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatDateDMY(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}-${m}-${y}`;
}

export default function InventoryRangeSummary({ restaurantId, startDate, endDate, kind }) {
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState(null);
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [summaryError, setSummaryError] = useState(null);

  const rid = restaurantId || getCurrentRestaurantId();
  const basePath = kind === 'bar' ? '/api/bar/inventory' : '/api/inventory/kitchen';

  useEffect(() => {
    let cancelled = false;
    async function fetchItems() {
      if (!rid || !startDate || !endDate) return;
      setLoadingItems(true);
      setItemsError(null);
      setSummaryError(null);
      try {
        const res = await fetch(
          `${API_BASE}${basePath}/range-summary?restaurantId=${rid}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&detailed=true`,
          { headers: getAuthHeaders() }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to load items');
        }
        const data = await res.json();
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setItemsError(err.message);
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    }
    fetchItems();
    return () => { cancelled = true; };
  }, [rid, startDate, endDate, basePath]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }

    function handleEscape(e) {
      if (e.key === 'Escape') setDropdownOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const summary = useMemo(() => {
    if (!selectedItemId) return null;
    return items.find((item) => item.id === selectedItemId) || null;
  }, [selectedItemId, items]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => (i.name || '').toLowerCase().includes(q));
  }, [items, search]);

  const chartData = useMemo(() => {
    if (!summary) return [];
    if (kind === 'bar') {
      return [
        { name: 'Purchase Amount', value: Number(summary.totalPurchaseAmount) || 0 },
        { name: 'Revenue', value: Number(summary.revenue) || 0 },
      ];
    }
    return [
      { name: 'Purchase Amount', value: Number(summary.totalPurchaseAmount) || 0 },
      { name: 'Consumption Value', value: Number(summary.consumptionValue) || 0 },
    ];
  }, [summary, kind]);

  const netPositive = summary ? Number(summary.net) >= 0 : false;

  if (loadingItems) {
    return (
      <div className="bg-white rounded-3xl border border-[#FFCDD2] shadow-sm p-12 text-center">
        <RefreshCw className="animate-spin mx-auto text-[#B71C1C] mb-3" size={28} />
        <p className="text-sm text-gray-500">Loading items...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-[#FFCDD2] shadow-sm p-6">
        <div className="max-w-md relative" ref={searchRef}>
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-[#E53935]">
            <Search size={16} className="text-gray-400" />
            <input
              type="text"
              placeholder={kind === 'bar' ? 'Search item...' : 'Search ingredient...'}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setDropdownOpen(true);
                if (selectedItemId) {
                  setSelectedItemId(null);
                  setSummary(null);
                }
              }}
              className="flex-1 outline-none text-sm bg-transparent"
            />
          </div>
          {dropdownOpen && search.trim() && filteredItems.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-auto">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedItemId(item.id);
                    setSearch(item.name);
                    setDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl"
                >
                  {item.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {itemsError && (
          <p className="mt-3 text-xs text-red-600 font-bold">{itemsError}</p>
        )}
      </div>

      {!selectedItemId && (
        <div className="bg-white rounded-3xl border border-[#FFCDD2] shadow-sm p-12 text-center">
          <Search size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-bold text-gray-500">No item selected yet</p>
          <p className="text-xs text-gray-400 mt-1">Search and select an item to view its range summary.</p>
        </div>
      )}

      {summaryError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle className="text-red-600" size={20} />
          <p className="text-sm text-red-700">{summaryError}</p>
        </div>
      )}

      {selectedItemId && summary && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-[#FFCDD2] shadow-sm p-6">
            <h3 className="text-xl font-black text-gray-900">{summary.name}</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">
              {summary.unit} • {formatDateDMY(summary.startDate)} to {formatDateDMY(summary.endDate)}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#FFCDD2] shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1">Avg Price</p>
              <p className="text-2xl font-black text-gray-900">{formatMoney(summary.avgPrice)}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-[#FFCDD2] shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1">Total Purchase Amount</p>
              <p className="text-2xl font-black text-gray-900">{formatMoney(summary.totalPurchaseAmount)}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-[#FFCDD2] shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1">
                {kind === 'bar' ? 'Revenue' : 'Total Consumption Value'}
              </p>
              <p className="text-2xl font-black text-gray-900">
                {formatMoney(kind === 'bar' ? summary.revenue : summary.consumptionValue)}
              </p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-[#FFCDD2] shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1">Net</p>
              <p className={`text-2xl font-black ${netPositive ? 'text-green-600' : 'text-red-600'}`}>
                {formatMoney(summary.net)}
              </p>
              <span
                className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  netPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {summary.status}
              </span>
            </div>
          </div>

          {kind !== 'bar' && summary.note && (
            <p className="text-xs text-gray-500">{summary.note}</p>
          )}

          <div className="bg-white rounded-3xl border border-[#FFCDD2] shadow-sm p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-900 mb-4">Breakdown</h3>
            {chartData.every((d) => d.value === 0) ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-sm font-bold">No data in this range</p>
              </div>
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={4}
                      isAnimationActive={false}
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatMoney(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
