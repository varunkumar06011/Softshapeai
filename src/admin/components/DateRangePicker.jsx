import { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';

const inputCls =
  'px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-[#E53935] outline-none';

function getISTDateString() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = now.getTime() + istOffset;
  const ist = new Date(istTime);
  return ist.toISOString().split('T')[0];
}

function formatDateDMY(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}-${m}-${y}`;
}

function getPresetDates(key) {
  const today = getISTDateString();
  const d = new Date();

  const pad = (n) => String(n).padStart(2, '0');
  const toISODate = (date) => {
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    return `${y}-${m}-${dd}`;
  };

  switch (key) {
    case 'Today':
      return { from: today, to: today };
    case 'Yesterday': {
      const yest = new Date(d);
      yest.setDate(yest.getDate() - 1);
      const iso = toISODate(yest);
      return { from: iso, to: iso };
    }
    case 'Last 7 Days': {
      const start = new Date(d);
      start.setDate(start.getDate() - 6);
      return { from: toISODate(start), to: today };
    }
    case 'This Month': {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      return { from: toISODate(start), to: today };
    }
    default:
      return { from: today, to: today };
  }
}

export default function DateRangePicker({ fromDate, toDate, onChange, label = 'Date' }) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(fromDate);
  const [draftTo, setDraftTo] = useState(toDate);
  const popoverRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (open) {
      setDraftFrom(fromDate);
      setDraftTo(toDate);
    }
  }, [open, fromDate, toDate]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        boxRef.current &&
        !boxRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false);
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const displayValue =
    fromDate && toDate ? `${formatDateDMY(fromDate)} to ${formatDateDMY(toDate)}` : 'Select date range';

  const isInvalid = draftTo < draftFrom;

  const handleApply = () => {
    if (isInvalid || !draftFrom || !draftTo) return;
    onChange(draftFrom, draftTo);
    setOpen(false);
  };

  const handlePreset = (key) => {
    const { from, to } = getPresetDates(key);
    setDraftFrom(from);
    setDraftTo(to);
  };

  const presets = ['Today', 'Yesterday', 'Last 7 Days', 'This Month'];

  return (
    <div className="relative inline-block" ref={boxRef}>
      <div
        onClick={() => setOpen((p) => !p)}
        className={`${inputCls} flex items-center justify-between gap-3 cursor-pointer bg-white min-w-[220px]`}
      >
        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{label}</span>
        <span className="text-sm font-semibold text-gray-800">{displayValue}</span>
        <Calendar size={16} className="text-gray-400" />
      </div>

      {open && (
        <div
          ref={popoverRef}
          className="absolute z-50 mt-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl p-4 space-y-4"
        >
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Start</label>
              <input
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">End</label>
              <input
                type="date"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {isInvalid && (
            <p className="text-xs font-bold text-red-600">End date must be on or after start date</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {presets.map((preset) => (
              <button
                key={preset}
                onClick={() => handlePreset(preset)}
                className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-700 transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setOpen(false)}
              className="flex-1 py-2 bg-gray-100 text-gray-800 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={isInvalid || !draftFrom || !draftTo}
              className="flex-1 py-2 bg-[#B71C1C] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-[#8E1414] disabled:opacity-50 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
