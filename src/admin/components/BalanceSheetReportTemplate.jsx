/**
 * BalanceSheetReportTemplate - HTML template for Daily Balance Sheet PDF export
 * Renders off-screen at fixed width (900px) and captured with html2canvas -> jsPDF
 *
 * Layout target: 2 A4-landscape pages.
 *   Page 1 — Header · Meta · KPI · Venue Sales · Expenditure
 *   Page 2 — Calculation Summary · Balance Breakdown · Bank Collection | Bank Balance · Liquor · Final · Footer
 */

import {
  Store, Calendar, TrendingUp, ArrowDownCircle,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────
const inr = (n) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrPlain = (n) => '₹' + Math.round(Number(n)).toLocaleString('en-IN');
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ── Small building blocks ───────────────────────────────────────────────
function MetaItem({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: '#FEF2F2' }}>
        <Icon size={18} style={{ color: '#EF4444' }} />
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
    <div className="flex-1 rounded-xl border p-2.5" style={{ background: bg, borderColor: '#E5E7EB' }}>
      <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.7)' }}>
        <Icon size={14} style={{ color }} />
      </div>
      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#6B7280' }}>{label}</div>
      <div className="mt-0.5 text-base font-black" style={{ color: '#111827' }}>{inrPlain(value)}</div>
      {sub && <div className="mt-0.5 text-[10px] font-semibold" style={{ color }}>{sub}</div>}
    </div>
  );
}

function SectionBadge({ n, children }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <div className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: '#E63946', color: '#FFFFFF' }}>
        {n}
      </div>
      <h3 className="text-xs font-bold tracking-wide" style={{ color: '#E63946' }}>{children}</h3>
    </div>
  );
}

function TableRow({ icon: Icon, iconColor, label, amount, muted }) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid #F3F4F6' }}>
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
    <div className="flex items-center justify-between pt-2 mt-1" style={{ borderTop: '2px solid #E2E8F0' }}>
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#334155' }}>{label}</span>
      <div className="flex items-center">
        <span className="text-sm font-black leading-none" style={{ color: tint }}>{inr(amount)}</span>
      </div>
    </div>
  );
}

function CalcBox({ label, value, highlight }) {
  return (
    <div
      className="flex flex-1 flex-col items-center rounded-lg border p-2 text-center"
      style={{
        borderColor: highlight ? '#86EFAC' : '#E5E7EB',
        background: highlight ? '#F0FDF4' : '#FFFFFF'
      }}
    >
      <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#9CA3AF' }}>{label}</div>
      <div className="text-xs font-black" style={{ color: highlight ? '#15803D' : '#1E293B' }}>
        {inr(value)}
      </div>
    </div>
  );
}

// ── Main template ────────────────────────────────────────────────────────
export default function BalanceSheetReportTemplate({ data, logoSrc }) {
  // Combined expenditure + minus-adjustment rows rendered in the Expenditure
  // section. Count drives progressive row tightening so a variable number of
  // entries still fits on page 1.
  const expenditureRows = [...(data.expenditures || []), ...(data.adjustments || [])];
  const expCount = expenditureRows.length;
  // density tiers: normal (<=8), mid (9-20), tight (>20)
  const expRowPy = expCount > 20 ? 'py-0.5' : expCount > 8 ? 'py-1' : 'py-1.5';
  const expLabelClass = expCount > 20 ? 'text-[11px]' : 'text-xs';
  const expAmountClass = expCount > 20 ? 'text-[11px]' : 'text-xs';
  const expNarrationClass = expCount > 20 ? 'text-[8px]' : 'text-[10px]';

  return (
    <div
      id="balance-sheet-report"
      className="mx-auto w-[900px] p-6 font-sans"
      style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", background: '#FFFFFF', color: '#1E293B' }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: '#E63946' }}>
            <img src={logoSrc} alt="Softshape" className="h-7 w-7 object-contain" />
          </div>
          <div>
            <div className="text-xl font-black">
              <span style={{ color: '#0F172A' }}>Softshape</span>
            </div>
            <div className="text-[9px] font-bold tracking-widest" style={{ color: '#9CA3AF' }}>
              THE AI OPERATING SYSTEM FOR RESTAURANTS
            </div>
          </div>
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-black">
            <span style={{ color: '#0F172A' }}>DAILY </span>
            <span style={{ color: '#E63946' }}>BALANCE SHEET</span>
          </h1>
        </div>
      </div>
      <div className="mt-3 h-[3px] w-full" style={{ background: '#E63946' }} />

      {/* ── Meta row ───────────────────────────────────────────────── */}
      <div className="mt-4 flex items-start justify-between">
        <div className="flex gap-8">
          <MetaItem icon={Store} label="OUTLET">{data.outletName}</MetaItem>
          <MetaItem icon={Calendar} label="DATE">
            {data.date}
            <div className="text-xs font-medium" style={{ color: '#9CA3AF' }}>{data.weekday}</div>
          </MetaItem>
        </div>
        <div className="text-right text-[11px] leading-5" style={{ color: '#6B7280' }}>
          <div><span className="font-bold" style={{ color: '#9CA3AF' }}>GENERATED ON: </span>{data.generatedOn}</div>
          <div><span className="font-bold" style={{ color: '#9CA3AF' }}>GENERATED BY: </span>{data.generatedBy}</div>
        </div>
      </div>

      {/* ── KPI cards (4 cards) ──────────────────────────────────────────────── */}
      <div className="mt-4 flex gap-3">
        <KpiCard icon={TrendingUp} label="Gross Sales" value={data.totalSales}
          sub={`from ${data.totalSalesSourcesCount} sources`} color="#16A34A" bg="#F0FDF4" />
        <KpiCard icon={TrendingUp} label="Net Sales" value={data.netSales}
          sub="After Aggregator Deduction" color="#0EA5E9" bg="#F0F9FF" />
        <KpiCard icon={ArrowDownCircle} label="Total Expenditure" value={data.totalExpenditure}
          sub={`from ${data.totalExpenditureEntriesCount} entries`} color="#3B82F6" bg="#EFF6FF" />
        <KpiCard icon={TrendingUp} label="Net Closing Balance" value={data.netClosingBalance}
          sub="After Expenditure" color="#16A34A" bg="#F0FDF4" />
      </div>

      {/* ── Two-column: Venue Sales | Expenditure ─────── */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        {/* LEFT: Venue Sales Breakdown */}
        <div className="rounded-xl border p-3" style={{ borderColor: '#E5E7EB' }}>
          <SectionBadge n={1}>VENUE SALES BREAKDOWN</SectionBadge>
          <div className="flex justify-between pb-1 text-[10px] font-bold uppercase" style={{ color: '#9CA3AF' }}>
            <span>Venue</span><span>Amount (₹)</span>
          </div>
          {data.venueSales.map((row, idx) => (
            <TableRow key={idx} icon={row.icon} iconColor={row.color} label={row.label} amount={row.amount} />
          ))}
          <TableRow label="Swiggy + Zomato" amount={data.aggregatorSales} muted />
          <TotalRow label="Gross Sales" amount={data.grossSales} />
          <TotalRow label="Net Sales (after Swiggy + Zomato deduction)" amount={data.netSales} />
        </div>

        {/* RIGHT: Expenditure (auto expenditures + manual minus-adjustments combined) */}
        <div className="rounded-xl border p-3" style={{ borderColor: '#E5E7EB' }}>
          <SectionBadge n={2}>EXPENDITURE</SectionBadge>
          <div className="flex justify-between pb-1 text-[10px] font-bold uppercase" style={{ color: '#9CA3AF' }}>
            <span>Description</span><span>Amount (₹)</span>
          </div>
          {expenditureRows.map((row, idx) => (
            <div key={idx} className={`flex items-start justify-between ${expRowPy}`} style={{ borderBottom: '1px solid #F3F4F6' }}>
              <div className="flex-1">
                <span className={`${expLabelClass} font-semibold`} style={{ color: '#334155' }}>{row.label}</span>
                {row.narration && (
                  <div className={`${expNarrationClass} font-medium`} style={{ color: '#9CA3AF' }}>{row.narration}</div>
                )}
              </div>
              <span className={`${expAmountClass} font-bold leading-none`} style={{ color: '#1E293B' }}>{inr(row.amount).replace('₹', '')}</span>
            </div>
          ))}
          <TotalRow label="Total Expenditure" amount={data.totalExpenditure} />
          <div className="mt-1 text-[10px] font-bold" style={{ color: '#3B82F6' }}>
            from {data.totalExpenditureEntriesCount} entries
          </div>
        </div>
      </div>

      {/* ── Calculation Summary ────────────────────────────────────── */}
      <div className="mt-4">
        <SectionBadge n={3}>CALCULATION SUMMARY</SectionBadge>
        <div className="flex flex-wrap items-center gap-2">
          <CalcBox label="Opening Balance" value={data.openingBalance || 0} />
          <span className="text-base font-black" style={{ color: '#D1D5DB' }}>+</span>
          <CalcBox label="Net Sales" value={data.netSales} />
          <span className="text-base font-black" style={{ color: '#D1D5DB' }}>+</span>
          <CalcBox label="Other Income" value={data.otherIncome || 0} />
          <span className="text-base font-black" style={{ color: '#D1D5DB' }}>−</span>
          <CalcBox label="Total Expenditure" value={data.totalExpenditure} />
          {(data.nonCashAddBack || 0) > 0 && (
            <>
              <span className="text-base font-black" style={{ color: '#D1D5DB' }}>+</span>
              <CalcBox label="Non-Cash Add-Back" value={data.nonCashAddBack} />
            </>
          )}
          <span className="text-base font-black" style={{ color: '#D1D5DB' }}>=</span>
          <CalcBox label="Net Closing Balance" value={data.netClosingBalance} highlight />
        </div>
        <div className="mt-1 text-center text-[10px]" style={{ color: '#9CA3AF' }}>All amounts are in Indian Rupees (₹)</div>

        {/* ── Detailed Balance Calculation Breakdown ── */}
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: '#E5E7EB', background: '#F9FAFB' }}>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: '#6B7280' }}>
            Balance Calculation Breakdown
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between py-0.5">
              <span className="text-xs font-semibold" style={{ color: '#334155' }}>Opening Balance</span>
              <span className="text-xs font-black" style={{ color: '#1E293B' }}>{inr(data.openingBalance || 0)}</span>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-xs font-semibold" style={{ color: '#334155' }}>+ Gross Sales</span>
              <span className="text-xs font-black" style={{ color: '#1E293B' }}>{inr(data.grossSales || data.totalSales || 0)}</span>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-xs font-semibold" style={{ color: '#334155' }}>− Swiggy</span>
              <span className="text-xs font-bold" style={{ color: '#EF4444' }}>{inr(data.swiggySale || 0)}</span>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-xs font-semibold" style={{ color: '#334155' }}>− Zomato</span>
              <span className="text-xs font-bold" style={{ color: '#EF4444' }}>{inr(data.zomatoSale || 0)}</span>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-xs font-semibold" style={{ color: '#334155' }}>− Expenditure</span>
              <span className="text-xs font-bold" style={{ color: '#EF4444' }}>{inr(data.totalExpenditure || 0)}</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 mt-0.5" style={{ borderTop: '2px solid #E2E8F0' }}>
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#15803D' }}>= Final Closing Balance</span>
              <span className="text-sm font-black" style={{ color: '#15803D' }}>{inr(data.netClosingBalance || 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bank-wise Collection | Bank-wise Balance (side-by-side) ─── */}
      {(data.bankCollections?.length > 0 || data.bankBalances?.length > 0) && (
        <div className="mt-3 grid grid-cols-2 gap-4">
          {/* LEFT: Bank-wise Collection */}
          {data.bankCollections && data.bankCollections.length > 0 && (
            <div className="rounded-xl border p-3" style={{ borderColor: '#E5E7EB', background: '#F9FAFB' }}>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: '#6B7280' }}>
                Bank-wise Collection
              </div>
              <div className="space-y-1">
                {data.bankCollections.map((bank, i) => (
                  <div key={i} className="flex items-center justify-between py-0.5">
                    <span className="text-xs font-semibold" style={{ color: '#334155' }}>{bank.bankName}</span>
                    <span className="text-xs font-black" style={{ color: '#1E293B' }}>{inr(bank.amount || 0)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1.5 mt-0.5" style={{ borderTop: '2px solid #E2E8F0' }}>
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#1E40AF' }}>Total Bank Collection</span>
                  <span className="text-xs font-black" style={{ color: '#1E40AF' }}>
                    {inr(round2(data.bankCollections.reduce((s, b) => s + (Number(b.amount) || 0), 0)))}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* RIGHT: Bank-wise Balance / Minimum Balance */}
          {data.bankBalances && data.bankBalances.length > 0 && (
            <div className="rounded-xl border p-3" style={{ borderColor: '#E5E7EB', background: '#F9FAFB' }}>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: '#6B7280' }}>
                Bank-wise Balance
              </div>
              {/* Header */}
              <div className="flex justify-between pb-1 text-[10px] font-bold uppercase" style={{ color: '#9CA3AF' }}>
                <span className="flex-1">Bank / Account</span>
                <span className="w-24 text-right">Account Bal</span>
                <span className="w-24 text-right">Min Bal</span>
                <span className="w-24 text-right">Can Use</span>
              </div>
              {/* Rows */}
              <div className="space-y-0.5">
                {data.bankBalances.map((bank, i) => (
                  <div key={i} className="flex items-center justify-between py-0.5" style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <span className="flex-1 text-xs font-semibold" style={{ color: '#334155' }}>{bank.bankName}</span>
                    <span className="w-24 text-right text-xs font-bold" style={{ color: '#1E293B' }}>{inr(bank.accountBalance || 0).replace('₹', '')}</span>
                    <span className="w-24 text-right text-xs font-bold" style={{ color: bank.minimumBalance != null ? '#1E293B' : '#9CA3AF' }}>
                      {bank.minimumBalance != null ? inr(bank.minimumBalance).replace('₹', '') : '—'}
                    </span>
                    <span className="w-24 text-right text-xs font-black" style={{ color: '#15803D' }}>{inr(bank.canUse || 0).replace('₹', '')}</span>
                  </div>
                ))}
              </div>
              {/* Totals */}
              {data.bankBalanceTotals && (
                <div className="flex items-center justify-between pt-1.5 mt-0.5" style={{ borderTop: '2px solid #E2E8F0' }}>
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#334155' }}>TOTALS</span>
                  <span className="w-24 text-right text-xs font-black" style={{ color: '#1E293B' }}>
                    {inr(data.bankBalanceTotals.totalAccountBalance || 0).replace('₹', '')}
                  </span>
                  <span className="w-24 text-right text-xs font-black" style={{ color: '#1E293B' }}>
                    {inr(data.bankBalanceTotals.totalMinimumBalance || 0).replace('₹', '')}
                  </span>
                  <span className="w-24 text-right text-xs font-black" style={{ color: '#15803D' }}>
                    {inr(data.bankBalanceTotals.totalCanUse || 0).replace('₹', '')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Liquor Consumption ─────────────────────────────────────────── */}
      {(data.liquorConsumption != null && data.liquorConsumption > 0) && (
        <div className="mt-3 rounded-xl border p-2.5" style={{ borderColor: '#E5E7EB', background: '#FEF3C7' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#B45309' }}>
              {data.date} LIQUOR CONSUMPTION
            </span>
            <span className="text-sm font-black" style={{ color: '#B45309' }}>
              {inr(data.liquorConsumption)}
            </span>
          </div>
        </div>
      )}

      {/* ── Final Balance ────────────────────────────────────────────── */}
      {(data.finalBalance != null) && (
        <div className="mt-3 rounded-xl p-3" style={{ background: '#0F172A' }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#9CA3AF' }}>Final Balance</div>
              <div className="text-xs" style={{ color: '#9CA3AF' }}>TOTAL CAN USE − LIQUOR CONSUMPTION</div>
            </div>
            <span className="text-lg font-black" style={{ color: '#4ADE80' }}>
              {inr(data.finalBalance)}
            </span>
          </div>
        </div>
      )}

      {/* ── Footer band ────────────────────────────────────────────── */}
      <div className="mt-3 flex items-center justify-between rounded-xl p-3" style={{ background: '#0F172A' }}>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#9CA3AF' }}>Net Closing Balance</div>
          <div className="text-2xl font-black" style={{ color: '#4ADE80' }}>{inr(data.netClosingBalance)}</div>
          <div className="mt-1 text-[10px]" style={{ color: '#9CA3AF' }}>{data.amountInWords}</div>
        </div>
        <div className="flex gap-8 text-center text-[10px]" style={{ color: '#D1D5DB' }}>
          <div>
            <div className="mb-3 w-24 border-b" style={{ borderColor: '#6B7280' }} />
            PREPARED BY<br /><span style={{ color: '#6B7280' }}>(Signature)</span>
          </div>
          <div>
            <div className="mb-3 w-24 border-b" style={{ borderColor: '#6B7280' }} />
            VERIFIED BY<br /><span style={{ color: '#6B7280' }}>(Signature)</span>
          </div>
        </div>
      </div>

      <div className="mt-2 text-center text-[10px]" style={{ color: '#9CA3AF' }}>
        Softshape AI - software that shapes your business
      </div>
    </div>
  );
}
