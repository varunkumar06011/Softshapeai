import React from 'react';
import { Bell, LogOut, Cloud } from 'lucide-react';

export default function TopNavbar({
  restaurant,
  captainName,
  notificationCount = 0,
  onLogout,
  onEdgeSettingsClick,
  edgeStatus,
}) {
  const edgeLabel = 'Cloud';

  return (
    <header
      className="bg-white border-b border-gray-200 h-[72px] px-0 flex items-stretch justify-between shrink-0 z-50"
      role="banner"
    >
      {/* Left: red logo block + venue/captain */}
      <div className="flex items-stretch min-w-0">
        <div className="w-14 sm:w-[72px] md:w-[80px] shrink-0">
          <img
            src="/logo-square.png"
            alt="Softshape"
            className="h-full w-full object-cover"
          />
        </div>

        <div className="flex flex-1 items-center pl-2 pr-2 sm:pl-4 sm:pr-3 min-w-0">
          <button
            className="flex flex-col items-start gap-0.5 rounded-lg hover:bg-gray-50 transition-colors px-1.5 sm:px-2 py-1 -ml-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200 min-w-0 w-full text-left"
            aria-label="Venue switcher"
          >
            <span className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider sm:tracking-widest leading-tight whitespace-nowrap w-full block">
              {restaurant?.name || 'VGRAND LOUNGE'}
            </span>
            <span className="flex items-center min-w-0 w-full">
              <span className="text-xs sm:text-sm font-bold text-gray-900 leading-none truncate flex-1 min-w-0">
                {captainName || 'Ajay kumar'}
              </span>
            </span>
          </button>
        </div>
      </div>

      {/* Right: cloud pill, bell, logout */}
      <div className="flex items-center gap-0.5 sm:gap-1.5 md:gap-2 pr-1 sm:pr-4 md:pr-6 shrink-0">
        <button
          onClick={onEdgeSettingsClick}
          className="flex items-center gap-0.5 px-1.5 py-1 sm:px-3 sm:py-2 rounded-xl border text-[9px] sm:text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 whitespace-nowrap"
          style={{
            background: '#EFF6FF',
            color: '#2563EB',
            borderColor: '#BFDBFE',
          }}
          aria-label={`Connection status: ${edgeLabel}`}
        >
          <Cloud size={12} className="shrink-0" />
          <span className="text-[9px] sm:text-xs">{edgeLabel}</span>
        </button>

        <button
          className="relative p-1.5 sm:p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200 shrink-0"
          aria-label={`Notifications${notificationCount > 0 ? `, ${notificationCount} unread` : ''}`}
        >
          <Bell size={16} className="text-gray-600" />
          {notificationCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#EF4444] text-white text-[9px] font-bold flex items-center justify-center">
              {notificationCount}
            </span>
          )}
        </button>

        <button
          onClick={onLogout}
          className="flex items-center justify-center p-1.5 sm:px-3 sm:py-2 rounded-xl border border-red-200 text-xs font-bold text-[#EF4444] hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200 shrink-0"
          aria-label="Logout"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline ml-1.5">Logout</span>
        </button>
      </div>
    </header>
  );
}
