// ui.jsx — small Softshape-styled primitives for the Store Stock portal.
// Same look as LoginScreen / KotConfirmModal: brand red #B71C1C / #E53935,
// rounded-2xl inputs on gray-50, black-weight uppercase labels, Plus Jakarta Sans.
import { useEffect } from 'react';
import { X } from 'lucide-react';

export const inputCls =
  'w-full h-14 rounded-2xl border-2 border-gray-50 bg-gray-50 px-4 text-base font-bold text-gray-900 outline-none ' +
  'focus:border-[#E53935] focus:bg-white transition-all placeholder:text-gray-300 placeholder:font-semibold';

export function Label({ children }) {
  return <span className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">{children}</span>;
}

export function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <Label>{label}</Label>
      {children}
    </label>
  );
}

export function Btn({ variant = 'primary', className = '', ...p }) {
  const v = {
    primary: 'bg-[#B71C1C] text-white hover:bg-[#8B0000] shadow-lg shadow-red-100',
    soft: 'bg-white text-gray-900 border-2 border-gray-100 hover:border-[#E53935]',
    dark: 'bg-gray-900 text-white hover:bg-gray-700',
    danger: 'bg-[#E53935] text-white hover:bg-[#B71C1C] shadow-lg shadow-red-100',
    ghost: 'bg-transparent text-[#B71C1C] hover:bg-red-50',
  }[variant];
  return (
    <button
      type="button"
      {...p}
      className={`flex h-14 items-center justify-center gap-2 rounded-[22px] px-5 text-[12px] font-black uppercase tracking-[0.15em] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`}
    />
  );
}

export function Pill({ tone = 'gray', children }) {
  const t = {
    gray: 'bg-gray-100 text-gray-500',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-[#B71C1C]',
    amber: 'bg-amber-50 text-amber-700',
  }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${t}`}>{children}</span>;
}

export function ErrorText({ children }) {
  return children ? <p className="px-1 text-[13px] font-bold text-red-600">{children}</p> : null;
}

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[32px] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[32px] sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-base font-black uppercase tracking-widest text-gray-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-100 text-gray-400 transition-all hover:bg-gray-50 hover:text-gray-900 active:scale-90">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}

export function Kv({ items }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map(([k, v, cls]) => (
        <div key={k} className="rounded-2xl bg-gray-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">{k}</p>
          <p className={`mt-0.5 font-mono text-[17px] font-medium text-gray-900 ${cls || ''}`}>{v}</p>
        </div>
      ))}
    </div>
  );
}

export function Seg({ value, onChange, options }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={`h-10 rounded-full border-2 px-4 text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 ${value === k ? 'border-[#B71C1C] bg-[#B71C1C] text-white' : 'border-gray-100 bg-white text-gray-500 hover:border-[#E53935]'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function TableWrap({ children }) {
  return <div className="overflow-x-auto rounded-3xl border border-gray-100 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.03)]">{children}</div>;
}
export const thCls = 'whitespace-nowrap border-b border-gray-100 px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-gray-400 first:sticky first:left-0 first:bg-white first:text-left';
export const tdCls = 'whitespace-nowrap border-b border-gray-50 px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-gray-800 first:sticky first:left-0 first:bg-white first:text-left first:font-sans first:font-bold';
