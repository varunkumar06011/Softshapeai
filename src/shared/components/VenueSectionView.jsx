import React from 'react';
import { useVenueTableSync } from '../../services/venueTableSyncService';

export default function VenueSectionView({
  venueId,
  sectionName,
  restaurantId,
  roomMode,
  selectedRoom,
  onSelectRoom,
  onTableSelect,
  captainId,
  onOrderPlaced
}) {
  const { tables: venueTables, isSyncing: loading } = useVenueTableSync();

  if (loading && (!venueTables || venueTables.length === 0)) {
    return <div className="p-8 text-center text-gray-500 font-bold uppercase tracking-widest animate-pulse">Loading {sectionName}...</div>;
  }

  const sectionIdByVenueId = {
    'venue-conference1': 'section-venue-conf1',
    'venue-pdr': 'section-venue-conf2',
    'venue-rooms': 'section-venue-pdr',
    'venue-parcel': 'section-venue-parcel',
  };
  const targetSectionId = sectionIdByVenueId[venueId];
  const targetName = (sectionName || '').trim().toLowerCase();

  const sectionTables = (venueTables || []).filter((table) => {
    if (targetSectionId) {
      return table.sectionId === targetSectionId || table.section?.id === targetSectionId;
    }
    const currentName = (table.sectionName || table.section?.name || '').trim().toLowerCase();
    return currentName === targetName;
  });

  if (!sectionTables || sectionTables.length === 0) {
    return <div className="p-8 text-center text-gray-500 font-bold uppercase tracking-widest">No tables found for {sectionName}</div>;
  }

  // If PDR 4-room mode, show the four rooms directly as table cards.
  if (roomMode === 'pdr4') {
    const pdrTables = [...sectionTables].sort((a, b) => (a.number || 0) - (b.number || 0));

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 max-w-[680px]">
        {pdrTables.map((table, i) => (
          <VenueTableCard key={table.id || i} table={table} sectionName={sectionName} onClick={() => onTableSelect && onTableSelect(table)} />
        ))}
      </div>
    );
  }

  // Single mode (Conference, Parcel)
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-10 gap-3.5">
      {sectionTables.map((table, i) => (
        <VenueTableCard key={table.id || i} table={table} sectionName={sectionName} onClick={() => onTableSelect && onTableSelect(table)} />
      ))}
    </div>
  );
}

function getDynamicVenueLabel(table, activeSectionName) {
  const sectionName = (activeSectionName || table.sectionName || table.section?.name || '').toLowerCase();
  const num = table.number || 1;
  if (sectionName.includes('conference hall') || sectionName.includes('conf1')) return 'C1';
  if (sectionName.includes('pdr')) return 'PDR';
  if (sectionName.includes('rooms')) return `R${num}`;
  if (sectionName.includes('parcel')) return 'P1';
  if (table.displayName) return table.displayName;
  return table.name || `T${num}`;
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
  
  const displayLabel = getDynamicVenueLabel(table, sectionName);
  
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
