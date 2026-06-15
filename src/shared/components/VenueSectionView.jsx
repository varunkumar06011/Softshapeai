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
  refetch = null
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

  const sectionTables = (venueTables || []).filter((table) => {
    if (targetSectionId) {
      return table.sectionId === targetSectionId || table.section?.id === targetSectionId;
    }
    const currentName = (table.sectionName || table.section?.name || '').trim().toLowerCase();
    const tableName = currentName;
    const target = targetName;
    const nameMatch = tableName === target || tableName.includes(target) || target.includes(tableName);
    if (!nameMatch) return false;
    const termTs = recentlyTerminated[table.backendId];
    return !(termTs && Date.now() - termTs < 30000);
  });

  // Debug: log available section names when no match
  if ((!sectionTables || sectionTables.length === 0) && venueTables.length > 0) {
    const availableNames = venueTables.map(t => (t.sectionName || t.section?.name || 'NO_NAME')).filter(Boolean);
    console.warn('[VenueSectionView] No tables matched for section:', targetName, '| Available section names:', [...new Set(availableNames)]);
  }

  if (isSyncing && (!sectionTables || sectionTables.length === 0)) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block w-8 h-8 border-4 border-gray-200 border-t-[#E53935] rounded-full animate-spin"></div>
        <p className="mt-3 text-gray-500 font-bold uppercase tracking-widest text-sm">Loading {sectionName} tables...</p>
      </div>
    );
  }

  if (!sectionTables || sectionTables.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 font-bold uppercase tracking-widest mb-4">
          No tables found for {sectionName}
        </p>
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

  // Single mode (Conference, Owner, Rooms)
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {sectionTables.map((table) => (
        <VenueTableCard key={table.backendId || table.id} table={table} sectionName={sectionName} onClick={() => onTableSelect && onTableSelect(table)} />
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

  return (
    <button
      onClick={onClick}
      className={`aspect-square p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-2 transition-all flex flex-col items-center justify-between group relative overflow-hidden active:scale-95 w-full ${
        isFree
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
