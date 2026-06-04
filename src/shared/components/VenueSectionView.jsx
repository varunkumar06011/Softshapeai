import React from 'react';
import { getTableSectionLabel } from '../../utils/tableHelpers';

export default function VenueSectionView({
  venueId,
  sectionName,
  restaurantId,
  roomMode,
  selectedRoom,
  onSelectRoom,
  onTableSelect,
  captainId,
  onOrderPlaced,
  venueTables = [],
  isSyncing = false
}) {

  const targetSectionId = null; // always use sectionName match — actual DB IDs are dynamic UUIDs
  const targetName = (sectionName || '').trim().toLowerCase();

  const sectionTables = (venueTables || []).filter((table) => {
    if (targetSectionId) {
      return table.sectionId === targetSectionId || table.section?.id === targetSectionId;
    }
    const currentName = (table.sectionName || table.section?.name || '').trim().toLowerCase();
    // Primary match: section name must match
    if (currentName !== targetName) return false;
    // Secondary discriminator: if venueId is provided and the table has a sectionTag,
    // use it to disambiguate same-named sections across bar/restaurant outlets.
    // sectionTag is set by the backend on venue tables to identify their sub-venue.
    if (venueId && table.sectionTag) {
      return table.sectionTag === venueId;
    }
    return true;
  });

  // DEBUG logging — remove once fixed
  React.useEffect(() => {
    console.log(`[VenueSectionView] sectionName="${sectionName}" targetName="${targetName}" isSyncing=${isSyncing} venueTables.length=${venueTables.length} sectionTables.length=${sectionTables.length}`);
    if (venueTables.length > 0) {
      const sample = venueTables.slice(0, 3).map(t => ({
        id: t.id,
        backendId: t.backendId,
        number: t.number,
        sectionName: t.sectionName,
        sectionNameFromSection: t.section?.name,
      }));
      console.log(`[VenueSectionView] sample tables:`, sample);
    }
  }, [sectionName, targetName, isSyncing, venueTables, sectionTables.length]);

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
      <div className="p-8 text-center text-gray-500 font-bold uppercase tracking-widest">
        No tables found for {sectionName} (check browser console for debug info)
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

  // Single mode (Conference, Parcel)
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-10 gap-3.5">
      {sectionTables.map((table) => (
        <VenueTableCard key={table.backendId || table.id} table={table} sectionName={sectionName} onClick={() => onTableSelect && onTableSelect(table)} />
      ))}
    </div>
  );
}

function VenueTableCard({ table, sectionName, onClick }) {
  const isFree = table.status === 'Free' || table.status === 'AVAILABLE' || !table.status;
  const isWaitingBill = table.status === 'Waiting Bill' || table.status === 'BILLING_REQUESTED';
  const isBusy = !isFree && !isWaitingBill;

  let containerClass = 'bg-white border-gray-150 text-gray-500 hover:border-gray-300 shadow-md';
  let statusText = 'Open';

  if (isWaitingBill) {
    containerClass = 'bg-amber-50 border-amber-400 text-amber-600 shadow-xl shadow-amber-50 animate-pulse';
    statusText = 'Billing Requested';
  } else if (isBusy) {
    containerClass = 'bg-red-50 border-[#E53935] text-[#E53935] shadow-xl shadow-red-55';
    statusText = 'Busy';
  }

  const displayLabel = getTableSectionLabel(table);
  
  return (
    <div
      onClick={onClick}
      className={`aspect-[4/3] sm:aspect-square border-[3px] rounded-3xl flex flex-col items-center justify-center text-center p-4 sm:p-5 cursor-pointer transition-all hover:scale-105 active:scale-95 relative ${containerClass} min-h-[140px] sm:min-h-[160px] overflow-hidden`}
    >
      {table.captainName && (
        <div className="absolute top-3 right-3 bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg text-xs md:text-sm font-black uppercase tracking-widest max-w-[80%] truncate shadow-md">
          {table.captainName.split(' ')[0]}
        </div>
      )}
      <span className="text-4xl sm:text-5xl font-black px-2 leading-none tracking-tight max-w-full truncate">
        {displayLabel}
      </span>
      <span className="text-sm sm:text-base font-black uppercase tracking-widest leading-tight mt-3 opacity-90">{statusText}</span>
    </div>
  );
}
