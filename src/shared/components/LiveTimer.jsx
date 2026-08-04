// ─────────────────────────────────────────────────────────────────────────────
// LiveTimer — Real-time elapsed time counter for order preparation tracking
// ─────────────────────────────────────────────────────────────────────────────
// Displays a live-updating elapsed time since a given start time:
//   - Updates every second
//   - Stops counting when status is 'Ready' (order prepared)
//   - Shows formatted time (HH:MM:SS or MM:SS)
//   - Clock icon with color coding (green=fast, yellow=moderate, red=delayed)
//
// Used in UnifiedOrdersDashboard and order tracking views.
// Props: startTime (timestamp), status (order status)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

const LiveTimer = ({ startTime, status }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime || status === 'Ready') return;

    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);

    // Initial calculation
    setElapsed(Date.now() - startTime);

    return () => clearInterval(interval);
  }, [startTime, status]);

  if (!startTime) return null;

  const seconds = Math.floor((elapsed / 1000) % 60);
  const minutes = Math.floor((elapsed / (1000 * 60)) % 60);
  const hours = Math.floor(elapsed / (1000 * 60 * 60));

  const totalMinutes = Math.floor(elapsed / 60000);

  let textColor = 'text-gray-500';
  let bgColor = 'bg-gray-100';
  let borderColor = 'border-gray-200';
  let animateClass = '';

  if (status === 'Ready') {
    textColor = 'text-green-600';
    bgColor = 'bg-green-100';
    borderColor = 'border-green-200';
  } else if (totalMinutes >= 15) {
    textColor = 'text-[#E53935]';
    bgColor = 'bg-red-50';
    borderColor = 'border-[#E53935]';
    animateClass = 'animate-pulse shadow-sm shadow-red-200';
  } else if (totalMinutes >= 10) {
    textColor = 'text-amber-600';
    bgColor = 'bg-amber-50';
    borderColor = 'border-amber-400';
  }

  const timeString = hours > 0 
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border ${bgColor} ${borderColor} ${textColor} ${animateClass} transition-colors`}>
      <Clock size={10} />
      <span className="text-[10px] font-black tabular-nums tracking-widest">{timeString}</span>
    </div>
  );
};

export default LiveTimer;
