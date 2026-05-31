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

  // Filter tables belonging to this section by matching the section name
  const sectionTables = (venueTables || []).filter(t => 
    t.sectionName?.toLowerCase().includes(sectionName.toLowerCase()) || 
    t.section?.name?.toLowerCase().includes(sectionName.toLowerCase())
  );

  if (!sectionTables || sectionTables.length === 0) {
    return <div className="p-8 text-center text-gray-500 font-bold uppercase tracking-widest">No tables found for {sectionName}</div>;
  }

  // If PDR 4-room mode, we need to show room selection tabs
  if (roomMode === 'pdr4') {
    // Group tables by room number (assuming table names are like PDR-1-T1, PDR-1-T2, etc.)
    // For simplicity, since PDR usually has 1 table per room or similar, we can just filter
    // If the database has 4 tables for PDR, we can just treat each table as a room, or use the selectedRoom to filter.
    // Let's assume the user wants to select a room first.
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(roomNum => (
            <button
              key={roomNum}
              onClick={() => onSelectRoom && onSelectRoom(roomNum)}
              className={`px-4 py-2 rounded-xl text-sm font-black border-2 transition-all ${
                selectedRoom === roomNum
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              Room {roomNum}
            </button>
          ))}
        </div>
        
        {selectedRoom && (
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-10 gap-3.5">
            {sectionTables
              .filter(t => t.name?.includes(`${selectedRoom}`) || t.number === selectedRoom)
              .map((table, i) => (
                <VenueTableCard key={table.id || i} table={table} onClick={() => onTableSelect && onTableSelect(table)} />
              ))}
          </div>
        )}
      </div>
    );
  }

  // Single mode (Conference, Parcel)
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-10 gap-3.5">
      {sectionTables.map((table, i) => (
        <VenueTableCard key={table.id || i} table={table} onClick={() => onTableSelect && onTableSelect(table)} />
      ))}
    </div>
  );
}

function getDynamicVenueLabel(table) {
  if (table.displayName) return table.displayName;
  const sectionName = (table.sectionName || table.section?.name || '').toLowerCase();
  const num = table.number || 1;
  if (sectionName.includes('conference hall 1') || sectionName.includes('conf1')) return `C${num}`;
  if (sectionName.includes('conference hall 2') || sectionName.includes('conf2')) return num > 1 ? `C2-${num}` : 'C2';
  if (sectionName.includes('pdr')) return `R${num}`;
  if (sectionName.includes('parcel')) return 'VIJAY';
  return table.name || `T${num}`;
}

function VenueTableCard({ table, onClick }) {
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
  
  const displayLabel = getDynamicVenueLabel(table);
  
  return (
    <div
      onClick={onClick}
      className={`aspect-[4/3] sm:aspect-square border-[3px] rounded-3xl flex flex-col items-center justify-center text-center p-6 sm:p-8 cursor-pointer transition-all hover:scale-105 active:scale-95 relative ${containerClass} min-h-[140px] sm:min-h-[160px]`}
    >
      {table.captainName && (
        <div className="absolute top-3 right-3 bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg text-xs md:text-sm font-black uppercase tracking-widest max-w-[80%] truncate shadow-md">
          {table.captainName.split(' ')[0]}
        </div>
      )}
      <span className="text-5xl sm:text-6xl font-black px-2 leading-none tracking-tight">
        {displayLabel}
      </span>
      <span className="text-sm sm:text-base font-black uppercase tracking-widest leading-tight mt-3 opacity-90">{statusText}</span>
    </div>
  );
}
