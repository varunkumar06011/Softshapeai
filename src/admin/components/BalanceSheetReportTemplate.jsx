/**
 * BalanceSheetReportTemplate - HTML template for Daily Balance Sheet PDF export
 * Renders off-screen at fixed width (900px) and captured with html2canvas -> jsPDF
 */

import {
  Store, Calendar, ClipboardList, TrendingUp, ArrowDownCircle, SlidersHorizontal,
  Wallet, Sofa, Wine, Users, ShoppingBag, Banknote, Utensils, Minus, CreditCard,
  Smartphone, Landmark,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────
const inr = (n) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrPlain = (n) => '₹' + Math.round(Number(n)).toLocaleString('en-IN');

const STATUS_STYLES = {
  DRAFT: { background: '#FEF3C7', color: '#B45309' },
  SUBMITTED: { background: '#DCFCE7', color: '#15803D' },
  LOCKED: { background: '#E5E7EB', color: '#4B5563' },
};

// ── Small building blocks ───────────────────────────────────────────────
function MetaItem({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: '#FEF2F2' }}>
        <Icon size={20} style={{ color: '#EF4444' }} />
      </div>
      <div>
        <div className="text-[10px] font-bold tracking-wide" style={{ color: '#9CA3AF' }}>{label}</div>
        <div className="text-sm font-bold" style={{ color: '#1E293B' }}>{children}</div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color, bg }) {
  return (
    <div className="flex-1 rounded-xl border p-3" style={{ background: bg, borderColor: '#E5E7EB' }}>
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.7)' }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#6B7280' }}>{label}</div>
      <div className="mt-0.5 text-lg font-black" style={{ color: '#111827' }}>{inrPlain(value)}</div>
      {sub && <div className="mt-0.5 text-[10px] font-semibold" style={{ color }}>{sub}</div>}
    </div>
  );
}

function SectionBadge({ n, children }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold" style={{ background: '#E63946', color: '#FFFFFF' }}>
        {n}
      </div>
      <h3 className="text-sm font-bold tracking-wide text-[#E63946]">{children}</h3>
    </div>
  );
}

function TableRow({ icon: Icon, iconColor, label, amount, muted }) {
  return (
    <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid #F3F4F6' }}>
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ background: `${iconColor}1A` }}
          >
            <Icon size={14} style={{ color: iconColor }} />
          </div>
        )}
        <span className="text-sm font-semibold" style={{ color: muted ? '#6B7280' : '#334155' }}>{label}</span>
      </div>
      <div className="flex items-center">
        <span className="text-sm font-bold leading-none" style={{ color: '#1E293B' }}>{inr(amount).replace('₹', '')}</span>
      </div>
    </div>
  );
}

function TotalRow({ label, amount, tint = '#E63946' }) {
  return (
    <div className="flex items-center justify-between pt-2.5 mt-1" style={{ borderTop: '2px solid #E2E8F0' }}>
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#334155' }}>{label}</span>
      <div className="flex items-center">
        <span className="text-sm font-black leading-none" style={{ color: tint }}>{inr(amount)}</span>
      </div>
    </div>
  );
}

function PaymentTile({ icon: Icon, label, amount, pct, color }) {
  return (
    <div className="rounded-xl border p-3 text-center" style={{ borderColor: '#E5E7EB', background: '#FFFFFF' }}>
      <div className="mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `${color}1A` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#9CA3AF' }}>{label}</div>
      <div className="text-base font-black" style={{ color: '#111827' }}>{inr(amount)}</div>
      <div className="text-[10px] font-bold" style={{ color }}>{pct}%</div>
    </div>
  );
}

function CalcBox({ label, value, highlight }) {
  return (
    <div
      className="flex flex-1 flex-col items-center rounded-xl border p-3 text-center"
      style={{
        borderColor: highlight ? '#86EFAC' : '#E5E7EB',
        background: highlight ? '#F0FDF4' : '#FFFFFF'
      }}
    >
      <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9CA3AF' }}>{label}</div>
      <div className="text-sm font-black" style={{ color: highlight ? '#15803D' : '#1E293B' }}>
        {inr(value)}
      </div>
    </div>
  );
}

// ── Main template ────────────────────────────────────────────────────────
export default function BalanceSheetReportTemplate({ data, logoSrc }) {
  const totalReceipts = (data.payment?.cash || 0) + (data.payment?.upi || 0) + (data.payment?.card || 0) + (data.payment?.credit || 0);
  const pct = (n) => totalReceipts > 0 ? ((n / totalReceipts) * 100).toFixed(2) : '0.00';

  return (
    <div
      id="balance-sheet-report"
      className="mx-auto w-[900px] p-8 font-sans"
      style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", background: '#FFFFFF', color: '#1E293B' }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl" style={{ background: '#E63946' }}>
            <img src={logoSrc} alt="softshape.ai" className="h-8 w-8 object-contain" />
          </div>
          <div>
            <div className="text-xl font-black">
              <span style={{ color: '#0F172A' }}>softshape</span>
              <span style={{ color: '#E63946' }}>.ai</span>
            </div>
            <div className="text-[9px] font-bold tracking-widest" style={{ color: '#9CA3AF' }}>
              THE AI OPERATING SYSTEM FOR RESTAURANTS
            </div>
          </div>
        </div>
        <div className="text-right">
          <h1 className="text-3xl font-black">
            <span style={{ color: '#0F172A' }}>DAILY </span>
            <span style={{ color: '#E63946' }}>BALANCE SHEET</span>
          </h1>
        </div>
      </div>
      <div className="mt-4 h-[3px] w-full" style={{ background: '#E63946' }} />

      {/* ── Meta row ───────────────────────────────────────────────── */}
      <div className="mt-6 flex items-start justify-between">
        <div className="flex gap-8">
          <MetaItem icon={Store} label="OUTLET">{data.outletName}</MetaItem>
          <MetaItem icon={Calendar} label="DATE">
            {data.date}
            <div className="text-xs font-medium" style={{ color: '#9CA3AF' }}>{data.weekday}</div>
          </MetaItem>
          <MetaItem icon={ClipboardList} label="STATUS">
            <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: STATUS_STYLES[data.status]?.background, color: STATUS_STYLES[data.status]?.color }}>
              {data.status}
            </span>
          </MetaItem>
        </div>
        <div className="text-right text-[11px] leading-5" style={{ color: '#6B7280' }}>
          <div><span className="font-bold" style={{ color: '#9CA3AF' }}>GENERATED ON: </span>{data.generatedOn}</div>
          <div><span className="font-bold" style={{ color: '#9CA3AF' }}>GENERATED BY: </span>{data.generatedBy}</div>
        </div>
      </div>

      {/* ── KPI cards (4 cards) ──────────────────────────────────────────────── */}
      <div className="mt-6 flex gap-3">
        <KpiCard icon={TrendingUp} label="Total Sales" value={data.totalSales}
          sub={`from ${data.totalSalesSourcesCount} sources`} color="#16A34A" bg="#F0FDF4" />
        <KpiCard icon={TrendingUp} label="Net Sales" value={data.netSales}
          sub="After Aggregator Deduction" color="#0EA5E9" bg="#F0F9FF" />
        <KpiCard icon={ArrowDownCircle} label="Total Expenditure" value={data.totalExpenditure}
          sub={`from ${data.totalExpenditureCategoriesCount} categories`} color="#3B82F6" bg="#EFF6FF" />
        <KpiCard icon={SlidersHorizontal} label="Total Adjustments" value={data.totalAdjustments}
          sub={`from ${data.totalAdjustmentsEntriesCount} entries`} color="#7C3AED" bg="#F5F3FF" />
        <KpiCard icon={TrendingUp} label="Net Closing Balance" value={data.netClosingBalance}
          sub="After Adjustments" color="#16A34A" bg="#F0FDF4" />
      </div>

      {/* ── Two-column: Venue Sales | Expenditures + Adjustments ─────── */}
      <div className="mt-6 grid grid-cols-2 gap-5">
        {/* LEFT: Venue Sales Breakdown */}
        <div className="rounded-xl border p-4" style={{ borderColor: '#E5E7EB' }}>
          <SectionBadge n={1}>VENUE SALES BREAKDOWN</SectionBadge>
          <div className="flex justify-between pb-1 text-[10px] font-bold uppercase" style={{ color: '#9CA3AF' }}>
            <span>Venue</span><span>Amount (₹)</span>
          </div>
          {data.venueSales.map((row, idx) => (
            <TableRow key={idx} icon={row.icon} iconColor={row.color} label={row.label} amount={row.amount} />
          ))}
          <TotalRow label="Net Sales (after Swiggy + Zomato deduction)" amount={data.netSales} />
        </div>

        {/* RIGHT: Expenditures + Adjustments stacked */}
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border p-4" style={{ borderColor: '#E5E7EB' }}>
            <SectionBadge n={2}>EXPENDITURES</SectionBadge>
            {data.expenditures.map((row, idx) => (
              <TableRow key={idx} label={row.label} amount={row.amount} muted />
            ))}
            <TotalRow label="Total Expenditure" amount={data.totalExpenditure} />
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: '#E5E7EB' }}>
            <SectionBadge n={3}>ADJUSTMENTS</SectionBadge>
            {data.adjustments.map((row, idx) => (
              <TableRow key={idx} icon={Minus} iconColor="#E63946" label={row.label} amount={row.amount} />
            ))}
            <TotalRow label="Total Adjustments" amount={data.totalAdjustments} />
          </div>
        </div>
      </div>

      {/* ── Payment Mode Summary ───────────────────────────────────── */}
      <div className="mt-6 overflow-hidden rounded-xl border" style={{ borderColor: '#E5E7EB' }}>
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: '#0F172A' }}>
          <Wallet size={16} style={{ color: '#FFFFFF' }} />
          <span className="text-xs font-bold tracking-wide" style={{ color: '#FFFFFF' }}>PAYMENT MODE SUMMARY</span>
        </div>
        <div className="grid grid-cols-4 gap-3 p-4">
          <PaymentTile icon={Banknote} label="Cash" amount={data.payment?.cash || 0} pct={pct(data.payment?.cash || 0)} color="#16A34A" />
          <PaymentTile icon={Smartphone} label="UPI" amount={data.payment?.upi || 0} pct={pct(data.payment?.upi || 0)} color="#3B82F6" />
          <PaymentTile icon={CreditCard} label="Card" amount={data.payment?.card || 0} pct={pct(data.payment?.card || 0)} color="#7C3AED" />
          <PaymentTile icon={Landmark} label="Credit" amount={data.payment?.credit || 0} pct={pct(data.payment?.credit || 0)} color="#F59E0B" />
        </div>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid #E5E7EB' }}>
          <span className="text-xs font-bold uppercase" style={{ color: '#334155' }}>Total Receipts</span>
          <span className="text-sm font-black" style={{ color: '#111827' }}>{inr(totalReceipts)}</span>
        </div>
      </div>

      {/* ── Calculation Summary ────────────────────────────────────── */}
      <div className="mt-6">
        <SectionBadge n={4}>CALCULATION SUMMARY</SectionBadge>
        <div className="flex items-center gap-2">
          <CalcBox label="Net Sales" value={data.netSales} />
          <span className="text-lg font-black" style={{ color: '#D1D5DB' }}>+</span>
          <CalcBox label="Other Income" value={data.otherIncome || 0} />
          <span className="text-lg font-black" style={{ color: '#D1D5DB' }}>−</span>
          <CalcBox label="Total Expenditure" value={data.totalExpenditure} />
          <span className="text-lg font-black" style={{ color: '#D1D5DB' }}>−</span>
          <CalcBox label="Total Adjustments" value={data.totalAdjustments} />
          <span className="text-lg font-black" style={{ color: '#D1D5DB' }}>=</span>
          <CalcBox label="Net Closing Balance" value={data.netClosingBalance} highlight />
        </div>
        <div className="mt-2 text-center text-[10px]" style={{ color: '#9CA3AF' }}>All amounts are in Indian Rupees (₹)</div>
      </div>

      {/* ── Footer band ────────────────────────────────────────────── */}
      <div className="mt-6 flex items-center justify-between rounded-xl p-5" style={{ background: '#0F172A' }}>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#9CA3AF' }}>Net Closing Balance</div>
          <div className="text-3xl font-black" style={{ color: '#4ADE80' }}>{inr(data.netClosingBalance)}</div>
          <div className="mt-2 text-[10px]" style={{ color: '#9CA3AF' }}>{data.amountInWords}</div>
        </div>
        <div className="flex gap-8 text-center text-[10px]" style={{ color: '#D1D5DB' }}>
          <div>
            <div className="mb-4 w-24 border-b" style={{ borderColor: '#6B7280' }} />
            PREPARED BY<br /><span style={{ color: '#6B7280' }}>(Signature)</span>
          </div>
          <div>
            <div className="mb-4 w-24 border-b" style={{ borderColor: '#6B7280' }} />
            VERIFIED BY<br /><span style={{ color: '#6B7280' }}>(Signature)</span>
          </div>
        </div>
      </div>

      <div className="mt-3 text-center text-[10px]" style={{ color: '#9CA3AF' }}>
        Softshape AI - software that shapes your business
      </div>
    </div>
  );
}
