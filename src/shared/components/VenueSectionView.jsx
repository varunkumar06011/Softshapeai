import React from 'react';
import { getTableSectionLabel, getSectionBadgeColor } from '../../utils/tableHelpers';
import { calculateTableBill } from '../utils/billing';

export default function VenueSectionView({
  sectionName,
  restaurantId,
  roomMode,
  selectedRoom,
  onSelectRoom,
  onTableSelect,
  captainId,
  onOrderPlaced,
  venueTables = [],
  isSyncing = false,
  refetch = null,
  extraTables = [],
  onAddExtraTable = null,
  onRemoveExtraTable = null,
}) {

  const targetSectionId = null; // always use sectionName match — actual DB IDs are dynamic UUIDs
  const targetName = (sectionName || '').trim().toLowerCase();

  const recentlyTerminated = (() => {
    try {
      const raw = localStorage.getItem('cashier_recently_terminated');
      const map = raw ? JSON.parse(raw) : {};
      const now = Date.now();
      Object.keys(map).forEach(k => { if (now - map[k] > 30000) delete map[k]; });
      return map;
    } catch { return {}; }
  })();

  const cleanVenueTables = (venueTables || []).filter(Boolean);
  const sectionTables = cleanVenueTables.filter((table) => {
    if (targetSectionId) {
      return table.sectionId === targetSectionId || table.section?.id === targetSectionId;
    }
    
    // Check recently terminated guard — ONLY for occupied tables.
    // Free tables must always show so they can be re-used immediately.
    const tableStatus = (table.status || '').toLowerCase();
    const isFree = tableStatus === 'free' || tableStatus === 'available';
    if (!isFree) {
      const termTs = recentlyTerminated[table.backendId];
      if (termTs && Date.now() - termTs < 30000) return false;
    }

    const currentName = (table.sectionName || table.section?.name || '').trim().toLowerCase();
    const target = targetName;
    
    // Exact name match first (most reliable)
    if (currentName === target) return true;
    
    // sectionTag match: 'venue-bar-gobox' contains 'gobox', 'venue-bar-conference' contains 'conference'
    const tag = (table.sectionTag || '').toLowerCase();
    const targetSlug = target.replace(/\s+/g, '-');
    if (tag.endsWith(`-${targetSlug}`) || tag === `venue-${targetSlug}`) return true;
    
    // Loose includes only if target is long enough to avoid false positives (e.g. avoid 'parcel' matching 'gobox')
    if (target.length > 4 && currentName.includes(target)) return true;
    
    return false;
  });

  // Debug: log available section names when no match
  if ((!sectionTables || sectionTables.length === 0) && cleanVenueTables.length > 0) {
    const availableNames = cleanVenueTables.map(t => (t.sectionName || t.section?.name || 'NO_NAME')).filter(Boolean);
    console.warn('[VenueSectionView] No tables matched for section:', targetName, '| Available section names:', [...new Set(availableNames)]);
  }

  if (!sectionTables || sectionTables.length === 0) {
    // If cleanVenueTables has records but none matched this section, show no-match message.
    // If cleanVenueTables is empty (still loading on slow device), show spinner + auto-retry hint.
    const isStillLoading = cleanVenueTables.length === 0;
    return (
      <div className="p-8 text-center">
        {isStillLoading ? (
          <>
            <div className="inline-block w-8 h-8 border-4 border-gray-200 border-t-[#E53935] rounded-full animate-spin mb-3"></div>
            <p className="text-gray-500 font-bold uppercase tracking-widest text-sm mb-4">
              Loading {sectionName} tables...
            </p>
          </>
        ) : (
          <p className="text-gray-500 font-bold uppercase tracking-widest mb-4">
            NO TABLES FOUND FOR {sectionName.toUpperCase()}
          </p>
        )}
        {refetch && (
          <button
            onClick={refetch}
            className="px-6 py-3 bg-[#E53935] text-white rounded-xl font-black uppercase tracking-widest text-sm hover:bg-red-700 transition-colors"
          >
            Refresh Tables
          </button>
        )}
      </div>
    );
  }

  // If PDR 4-room mode, show the four rooms directly as table cards.
  if (roomMode === 'pdr4') {
    const pdrTables = [...sectionTables].sort((a, b) => (a.number || 0) - (b.number || 0));

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 max-w-[680px]">
        {pdrTables.map((table) => (
          <VenueTableCard key={table.backendId || table.id} table={table} sectionName={sectionName} onClick={() => onTableSelect && onTableSelect(table)} />
        ))}
      </div>
    );
  }

  // Single mode (Conference, GoBox, Rooms, Family Restaurant, Parcel)
  // Include extra tables that belong to this section
  const sectionExtraTables = (extraTables || []).filter(et => {
    const parent = sectionTables.find(st => st.backendId === et.baseBackendId);
    return !!parent;
  });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {sectionTables.map((table) => (
        <div key={table.backendId || table.id} className="relative">
          <VenueTableCard table={table} sectionName={sectionName} onClick={() => onTableSelect && onTableSelect(table)} />
          {/* Add Extra (+) button — only on free regular tables */}
          {onAddExtraTable && (table.status === 'Free' || table.status === 'AVAILABLE' || !table.status) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddExtraTable(table);
              }}
              className="absolute top-1 left-1 w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-[10px] font-black hover:bg-green-600 z-20 shadow"
              title={`Add extra session for table ${table.number}`}
            >+</button>
          )}
        </div>
      ))}
      {sectionExtraTables.map((table) => (
        <div key={`extra-${table.id}`} className="relative">
          <VenueTableCard table={{ ...table, status: table.status || 'Free', isExtra: true }} sectionName={sectionName} onClick={() => onTableSelect && onTableSelect(table)} />
          {/* Remove Extra (−) button */}
          {onRemoveExtraTable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveExtraTable(table);
              }}
              className="absolute top-1 left-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-black hover:bg-red-600 z-20 shadow"
              title="Remove extra session"
            >−</button>
          )}
        </div>
      ))}
    </div>
  );
}

function VenueTableCard({ table, sectionName, onClick }) {
  const status = table.status || 'Free';
  const isFree = status === 'Free' || status === 'AVAILABLE';
  const isBilling = status === 'Waiting Bill' || status === 'BILLING_REQUESTED';
  const isReady = status === 'Ready';
  const isBusy = !isFree && !isBilling && !isReady;
  const isExtra = table.isExtra;

  return (
    <button
      onClick={onClick}
      className={`aspect-square p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-2 transition-all flex flex-col items-center justify-between group relative overflow-hidden active:scale-95 w-full ${
        isExtra
          ? 'bg-blue-50 border-dashed border-blue-300 text-blue-600 hover:border-blue-400 shadow-sm'
          : isFree
            ? 'bg-white border-gray-100 hover:border-gray-300'
            : isBilling
              ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-lg shadow-amber-100'
              : isReady
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-100 text-red-600'
      }`}
    >
      {/* Section Badge - Top Left */}
      {(table.sectionName || table.section?.name) && (
        <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shadow-sm z-10 ${getSectionBadgeColor(table)}`}>
          {getTableSectionLabel(table)}
        </div>
      )}

      {/* Captain Name Badge - Top Left below section badge, or Top Right if no section */}
      {table.captainName && (
        <div className={`absolute ${table.sectionName || table.section?.name ? 'top-6 left-2' : 'top-2 right-2'} text-[7px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-1 py-0.5 rounded leading-none shadow-sm z-10 max-w-[80%] truncate`}>
          {table.captainName.split(' ')[0]}
        </div>
      )}

      {/* Big centered number */}
      <span className="text-3xl sm:text-4xl font-black leading-none mt-1">
        {table.number ?? table.id}
      </span>

      {/* Bottom status strip */}
      <div className="w-full flex flex-col items-center gap-1">
        <div className={`w-full py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1 ${
          isFree
            ? 'bg-gray-100 text-gray-400'
            : isBilling
              ? 'bg-amber-500 text-white animate-pulse'
              : isReady
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'
        }`}>
          {status}
        </div>
        {!isFree && (
          <span className="text-[10px] font-black opacity-60">₹{calculateTableBill(table).grandTotal}</span>
        )}
      </div>
    </button>
  );
}
