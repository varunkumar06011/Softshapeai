import React, { memo, useState, useMemo } from 'react';
import { Search, LayoutGrid, List, Wine, Users, Bed, UserCircle, Clock, ChefHat, UtensilsCrossed } from 'lucide-react';
import TableCard from './TableCard';

const AREA_ICONS = {
  'Bar AC Hall': Wine,
  'Conference Hall': Users,
  'PDR': UserCircle,
  'Rooms': Bed,
};

const STATUS_LEGEND = [
  { color: '#22C55E', label: 'Free' },
  { color: '#EF4444', label: 'Occupied' },
];

export default function FloorOverview({
  tables,
  sections,
  tableSubCategory,
  setTableSubCategory,
  tableFilter,
  setTableFilter,
  freeCount,
  busyCount,
  myTablesCount,
  allTablesCount,
  onTableSelect,
  selectedPDRRoom,
  setSelectedPDRRoom,
  captainId,
  tablesLoading,
  refetchTables,
  enabledModules,
  // Assignment sub-view props
  assignment,
  todayRevenue,
  currentCaptain,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [subTab, setSubTab] = useState('floor'); // 'floor' | 'assignment'

  const filteredTables = useMemo(() => {
    if (!searchTerm.trim()) return tables;
    const q = searchTerm.toLowerCase();
    return tables.filter(t =>
      String(t.number || t.id).toLowerCase().includes(q)
    );
  }, [tables, searchTerm]);

  const displayTables = tableFilter === 'my'
    ? filteredTables.filter(t => t.captainId === captainId)
    : filteredTables;

  return (
    <div className="flex-grow overflow-y-auto bg-[#F8FAFC] scroll-smooth">
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-gray-900 leading-none">
              Floor Overview
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs font-bold text-gray-600">Active Operations</span>
              <span className="text-gray-300">·</span>
              <span className="text-xs font-bold text-gray-400">Floor Rank #1</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Free / Busy pills */}
            <div className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-xl border border-gray-200">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-xs font-bold text-gray-700">{freeCount} Free</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-xl border border-gray-200">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
              <span className="text-xs font-bold text-gray-700">{busyCount} Busy</span>
            </div>
          </div>
        </div>

        {/* Sub-tab: Floor / Assignment */}
        {assignment && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setSubTab('floor')}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
                subTab === 'floor' ? 'bg-[#EF4444] text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
              }`}
            >
              Floor
            </button>
            <button
              onClick={() => setSubTab('assignment')}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
                subTab === 'assignment' ? 'bg-[#EF4444] text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
              }`}
            >
              Today's Target
            </button>
          </div>
        )}

        {/* Assignment sub-view */}
        {subTab === 'assignment' && assignment && (
          <div className="max-w-lg mx-auto space-y-4 mb-6">
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Daily Revenue Target</span>
                <span className="text-sm font-bold text-[#EF4444] bg-red-50 px-2.5 py-1 rounded-xl">
                  ₹{(assignment.revenueTarget || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="mb-4">
                <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                  <span>Progress</span>
                  <span>{Math.min(100, Math.round((todayRevenue / (assignment.revenueTarget || 1)) * 100))}%</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 bg-[#EF4444]"
                    style={{ width: `${Math.min(100, (todayRevenue / (assignment.revenueTarget || 1)) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Earned Today</p>
                  <p className="text-2xl font-black text-gray-900 tabular-nums">₹{todayRevenue.toLocaleString('en-IN')}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Remaining</p>
                  <p className="text-2xl font-black text-gray-900 tabular-nums">
                    ₹{Math.max(0, (assignment.revenueTarget || 0) - todayRevenue).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Area selector row */}
        {enabledModules?.tables !== false && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
            {sections.length > 0 ? (
              sections.map(section => {
                const sourceKey = section.sectionTag || section.name;
                const isActive = tableSubCategory === sourceKey;
                const Icon = AREA_ICONS[section.name] || LayoutGrid;
                return (
                  <button
                    key={sourceKey}
                    onClick={() => { setTableSubCategory(sourceKey); setSelectedPDRRoom(null); }}
                    className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold border whitespace-nowrap transition-all shrink-0 ${
                      isActive
                        ? 'bg-[#EF4444] text-white border-[#EF4444] shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon size={16} />
                    {section.name}
                  </button>
                );
              })
            ) : (
              <div className="flex items-center gap-3 py-4">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-[#EF4444] rounded-full animate-spin" />
                <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Loading sections…</p>
              </div>
            )}
          </div>
        )}

        {/* Table filter row */}
        {enabledModules?.tables !== false && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
            <div className="flex gap-2">
              <button
                onClick={() => setTableFilter('all')}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all border ${
                  tableFilter === 'all'
                    ? 'bg-red-50 text-[#EF4444] border-[#EF4444]'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                All Tables {allTablesCount}
              </button>
              <button
                onClick={() => setTableFilter('my')}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all border ${
                  tableFilter === 'my'
                    ? 'bg-red-50 text-[#EF4444] border-[#EF4444]'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                My Tables {myTablesCount}
              </button>
            </div>

            {/* Status legend */}
            <div className="flex items-center gap-3 text-xs font-medium text-gray-400">
              {STATUS_LEGEND.map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Table grid */}
        {enabledModules?.tables === false ? (
          <div className="text-center p-10 text-gray-500">
            <p className="text-lg font-semibold">Table management is not enabled for this restaurant type.</p>
          </div>
        ) : (
          <div className={`grid gap-2 sm:gap-3 md:gap-4 ${
            viewMode === 'grid'
              ? 'grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          }`}>
            {tablesLoading ? (
              Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-square bg-gray-100 rounded-2xl animate-pulse" />
              ))
            ) : displayTables.length === 0 ? (
              <div className="col-span-full text-center py-12 text-gray-400">
                <p className="text-sm font-bold uppercase tracking-widest">No tables found</p>
              </div>
            ) : (
              displayTables.map(table => (
                <TableCard
                  key={table.backendId || table.id}
                  table={table}
                  onSelect={onTableSelect}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
