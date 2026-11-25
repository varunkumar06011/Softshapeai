// T1ReportSheet — the Head Accountant Master Daily Report drawn exactly like the
// paper form, filled with the saved values. It is captured to PNG / PDF.
// Inline styles with hex colours only (html2canvas cannot read Tailwind v4's oklch colours).
import { forwardRef } from 'react';
import { OFFLINE_CHANNELS, PAYMENT_MODES, PLATFORMS, GOOGLE_ROWS, CHECKS, BRANCHES, money, pctText, fmtDate, dayName, compute } from './t1Schema';

const RED = '#C8102E', PINK = '#FBE3E6', LINE = '#E7B9BF', INK = '#1F1F1F';
const box = { border: `1.5px solid ${LINE}`, borderRadius: 10, overflow: 'hidden', background: '#FFFFFF' };
const td = { borderTop: `1px solid ${LINE}`, padding: '4px 10px 8px', fontSize: 15, lineHeight: '18px', color: INK, height: 26, verticalAlign: 'middle' };
const tdNum = { ...td, borderLeft: `1px solid ${LINE}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'Arial, sans-serif' };
const th = { ...td, borderTop: 'none', background: PINK, fontWeight: 800, fontSize: 15 };
const thNum = { ...th, borderLeft: `1px solid ${LINE}`, textAlign: 'center' };
const strong = { background: PINK, fontWeight: 800 };

function Title({ children }) {
  return (
    <div style={{ background: RED, color: '#FFFFFF', fontWeight: 800, fontSize: 19, lineHeight: '22px', letterSpacing: 0.3, padding: '4px 18px 10px', borderRadius: 8, marginBottom: 6, whiteSpace: 'nowrap' }}>
      {children}
    </div>
  );
}
function Table({ children }) {
  return <div style={box}><table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}><tbody>{children}</tbody></table></div>;
}
const v = (x) => (x === '' || x == null ? '' : x);
const m = (x) => (x === '' || x == null ? '' : money(Number(String(x).replace(/[,₹\s]/g, ''))));
const Tick = ({ on }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, boxSizing: 'border-box', border: `2px solid ${on ? RED : INK}`, background: on ? RED : '#FFFFFF', borderRadius: 3, marginRight: 10, verticalAlign: 'middle', position: 'relative', top: -2 }}>
    {on && <span style={{ display: 'block', width: 5, height: 10, borderRight: '2.5px solid #FFFFFF', borderBottom: '2.5px solid #FFFFFF', transform: 'rotate(45deg)', marginTop: -3 }} />}
  </span>
);
const Blank = ({ children, w }) => (
  <span style={{ display: 'inline-block', minWidth: w, borderBottom: `1.5px solid ${INK}`, padding: '0 6px', fontWeight: 700 }}>{children || ' '}</span>
);

const T1ReportSheet = forwardRef(function T1ReportSheet({ report, date, branch, outletName }, ref) {
  const r = report;
  const c = compute(r);
  const font = '"Arial Narrow", "Roboto Condensed", Arial, sans-serif';

  return (
    <div ref={ref} style={{ width: 1200, background: '#FFFFFF', color: INK, fontFamily: font, paddingBottom: 24, boxSizing: 'border-box', borderColor: LINE }}>
      {/* Header */}
      <div style={{ background: RED, color: '#FFFFFF', display: 'flex', alignItems: 'center', padding: '14px 30px', gap: 28 }}>
        <div style={{ width: 200, textAlign: 'center', borderRight: '2px solid rgba(255,255,255,0.7)', paddingRight: 24 }}>
          <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1 }}>V</div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 1, borderTop: '2px solid #FFFFFF', borderBottom: '2px solid #FFFFFF', margin: '2px 0' }}>GRAND</div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5 }}>{(outletName || 'FAMILY RESTAURANT').toUpperCase()}</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 33, fontWeight: 900, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>HEAD ACCOUNTANT – MASTER DAILY REPORT</div>
          <div style={{ fontSize: 15, letterSpacing: 4, marginTop: 6 }}>DAILY SALES • RECONCILIATION • PLATFORM PERFORMANCE • EXPENSES</div>
        </div>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        {/* Date / branch strip */}
        <div style={{ ...box, borderColor: '#BDBDBD', display: 'flex', alignItems: 'center', gap: 18, padding: '10px 26px', fontSize: 16, fontWeight: 800 }}>
          <span>Date: <Blank w={150}>{fmtDate(date)}</Blank></span>
          <span>|</span>
          <span>Branch: {BRANCHES.map((b) => <span key={b} style={{ fontWeight: 600, marginLeft: 8 }}><Tick on={b === branch} />{b}</span>)}</span>
          <span>|</span>
          <span>Day: <Blank w={130}>{dayName(date)}</Blank></span>
          <span>|</span>
          <span>Prepared by: <Blank w={150}>{r.preparedBy}</Blank></span>
        </div>

        {/* KPI strip */}
        <div style={{ ...box, background: PINK, display: 'flex', marginTop: 12, padding: '14px 10px' }}>
          {[['Total Business Sales', `₹ ${money(c.kpi.sales)}`], ['Total Orders / Bills', String(c.kpi.orders || '')], ['Total Collections', `₹ ${money(c.kpi.collections)}`], ['Online Sales (Swiggy + Zomato)', `₹ ${money(c.kpi.online)}`]].map(([k, val], i) => (
            <div key={k} style={{ flex: 1, padding: '0 20px', borderLeft: i ? `1.5px solid ${LINE}` : 'none' }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{k}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: RED, marginTop: 6, borderBottom: `1.5px solid ${INK}`, paddingBottom: 2 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Offline + Payment */}
        <div style={{ display: 'flex', gap: 22, marginTop: 18 }}>
          <div style={{ flex: 1.42 }}>
            <Title>OFFLINE SALES – CHANNEL WISE BREAKDOWN</Title>
            <Table>
              <tr><td style={{ ...th, width: '35%' }}>Revenue Channel</td><td style={thNum}>Orders / Bills</td><td style={thNum}>Gross Sales (₹)</td><td style={thNum}>Discounts (₹)</td><td style={thNum}>Net Sales (₹)</td></tr>
              {OFFLINE_CHANNELS.map(([k, label]) => {
                const raw = r.offline[k] || {};
                const any = raw.orders !== '' || raw.gross !== '' || raw.discount !== '';
                return (
                  <tr key={k}><td style={td}>{label}</td><td style={tdNum}>{v(raw.orders)}</td><td style={tdNum}>{m(raw.gross)}</td><td style={tdNum}>{m(raw.discount)}</td><td style={tdNum}>{any ? money(c.offline[k].net) : ''}</td></tr>
                );
              })}
              <tr style={strong}><td style={{ ...td, fontWeight: 900, fontSize: 15, whiteSpace: 'nowrap' }}>TOTAL OFFLINE SALES</td><td style={{ ...tdNum, fontWeight: 900 }}>{c.offlineTotal.orders || ''}</td><td style={{ ...tdNum, fontWeight: 900 }}>{money(c.offlineTotal.gross)}</td><td style={{ ...tdNum, fontWeight: 900 }}>{money(c.offlineTotal.discount)}</td><td style={{ ...tdNum, fontWeight: 900 }}>{money(c.offlineTotal.net)}</td></tr>
            </Table>
          </div>
          <div style={{ flex: 1 }}>
            <Title>PAYMENT COLLECTION RECONCILIATION</Title>
            <Table>
              <tr><td style={th}>Payment Mode</td><td style={{ ...thNum, width: '40%' }}>Amount (₹)</td></tr>
              {PAYMENT_MODES.map(([k, label]) => <tr key={k}><td style={td}>{label}</td><td style={tdNum}>{m(r.pay[k])}</td></tr>)}
              <tr style={strong}><td style={{ ...td, fontWeight: 800 }}>Total Collections (A)</td><td style={{ ...tdNum, fontWeight: 800 }}>{money(c.collA)}</td></tr>
              <tr><td style={td}>Expected Collections (B)</td><td style={tdNum}>{m(r.pay.expected)}</td></tr>
              <tr><td style={td}>Actual Collections (C)</td><td style={tdNum}>{m(r.pay.actual === '' ? c.collA : r.pay.actual)}</td></tr>
              <tr style={strong}><td style={{ ...td, fontWeight: 800 }}>Shortage / Excess (C – B)</td><td style={{ ...tdNum, fontWeight: 800, color: c.shortage < 0 ? RED : INK }}>{r.pay.expected === '' ? '' : money(c.shortage)}</td></tr>
            </Table>
          </div>
        </div>

        {/* Online + Google / Food */}
        <div style={{ display: 'flex', gap: 22, marginTop: 18 }}>
          <div style={{ flex: 1.5 }}>
            <Title>ONLINE DELIVERY – SWIGGY &amp; ZOMATO RECONCILIATION</Title>
            <Table>
              <tr><td style={{ ...th, width: '45%' }}>Particulars</td>{PLATFORMS.map(([k, l]) => <td key={k} style={thNum}>{l}</td>)}</tr>
              {[
                ['Total Orders Today', (k) => v(r.online[k].orders)],
                ['Gross Sales (₹)', (k) => m(r.online[k].gross)],
                ['Commission & Other Deductions (₹)', (k) => m(r.online[k].commission)],
                ['Refunds / Cancellations (₹)', (k) => m(r.online[k].refunds)],
                ['Net Payout (₹)', (k) => (r.online[k].gross === '' ? '' : money(c.online[k].payout)), true],
                ['Same Day Last Week – Orders', (k) => v(r.online[k].lwOrders)],
                ['Same Day Last Week – Payout (₹)', (k) => m(r.online[k].lwPayout)],
                ['Orders Growth / Decline (%)', (k) => pctText(c.online[k].ordersGrowth)],
                ['Payout Growth / Decline (%)', (k) => pctText(c.online[k].payoutGrowth)],
                ['Customer Complaints (Count / Details)', (k) => v(r.online[k].complaints)],
                ['Pending Settlements (₹)', (k) => m(r.online[k].pending)],
              ].map(([label, f, s]) => (
                <tr key={label} style={s ? strong : undefined}>
                  <td style={{ ...td, fontWeight: s ? 800 : 400 }}>{label}</td>
                  {PLATFORMS.map(([k]) => <td key={k} style={{ ...tdNum, fontWeight: s ? 800 : 400 }}>{f(k)}</td>)}
                </tr>
              ))}
            </Table>
          </div>
          <div style={{ flex: 1 }}>
            <Title>GOOGLE RATINGS &amp; CUSTOMER FEEDBACK</Title>
            <Table>
              <tr><td style={{ ...th, width: '52%' }}>Particulars</td><td style={thNum}>Ongole</td><td style={thNum}>Kandukur</td></tr>
              {GOOGLE_ROWS.map(([k, label]) => (
                <tr key={k}><td style={{ ...td, fontSize: 14 }}>{label}</td><td style={{ ...tdNum, fontSize: 14 }}>{v(r.google.ongole?.[k])}</td><td style={{ ...tdNum, fontSize: 14 }}>{v(r.google.kandukur?.[k])}</td></tr>
              ))}
            </Table>
            <div style={{ marginTop: 12 }}>
              <Title>FOOD PERFORMANCE SUMMARY</Title>
              <Table>
                <tr><td style={{ ...td, borderTop: 'none' }}>Food Sale with Commission (₹)</td><td style={{ ...tdNum, borderTop: 'none', width: '32%' }}>{m(r.food.withCommission)}</td></tr>
                <tr><td style={td}>Food Sale after Commission (₹)</td><td style={tdNum}>{m(r.food.afterCommission)}</td></tr>
                <tr><td style={td}>Food Consumption (₹)</td><td style={tdNum}>{m(r.food.consumption)}</td></tr>
                <tr style={strong}><td colSpan={2} style={{ ...td, fontWeight: 800, whiteSpace: 'pre-wrap', height: 'auto', minHeight: 30 }}>Narration :- <span style={{ fontWeight: 400 }}>{r.food.narration}</span></td></tr>
              </Table>
            </div>
          </div>
        </div>

        {/* Financial summary + checklist */}
        <div style={{ display: 'flex', gap: 22, marginTop: 18 }}>
          <div style={{ flex: 1 }}>
            <Title>DAILY FINANCIAL SUMMARY</Title>
            <Table>
              <tr><td style={th}>Particulars</td><td style={{ ...thNum, width: '40%' }}>Amount (₹)</td></tr>
              {[
                ['Total Offline Net Sales', c.fin.offlineNet],
                ['Swiggy Net Payout', c.fin.swiggy],
                ['Zomato Net Payout', c.fin.zomato],
                ['Total Business Net Sales', c.fin.businessNet, true],
                ['Total Collections (Cash + Card + UPI)', c.fin.collections],
                ['Total Expenses', c.fin.expenses],
                ['Pending Settlements (Swiggy + Zomato)', c.fin.pending],
                ['Cash Shortage / Excess', r.pay.expected === '' ? null : c.fin.shortage, true],
              ].map(([label, val, s]) => (
                <tr key={label} style={s ? strong : undefined}><td style={{ ...td, fontWeight: s ? 800 : 400 }}>{label}</td><td style={{ ...tdNum, fontWeight: s ? 800 : 400 }}>{val == null ? '' : money(val)}</td></tr>
              ))}
            </Table>
          </div>
          <div style={{ flex: 1.07 }}>
            <Title>VERIFICATION CHECKLIST</Title>
            <div style={{ ...box, display: 'flex', padding: '14px 18px', gap: 14 }}>
              {[CHECKS.slice(0, 4), CHECKS.slice(4)].map((col, i) => (
                <div key={i} style={{ flex: 1, borderLeft: i ? `1.5px solid ${LINE}` : 'none', paddingLeft: i ? 16 : 0 }}>
                  {col.map(([k, label]) => <div key={k} style={{ fontSize: 15, padding: '6px 0' }}><Tick on={!!r.checks[k]} />{label}</div>)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Signatures */}
        <div style={{ borderTop: `2px solid ${RED}`, marginTop: 26, paddingTop: 20, display: 'flex', justifyContent: 'space-around', fontSize: 17, fontWeight: 800 }}>
          <span>Head Accountant: <Blank w={180}>{r.sign.headAccountant}</Blank></span>
          <span>|</span>
          <span>Manager: <Blank w={180}>{r.sign.manager}</Blank></span>
          <span>|</span>
          <span>Verified by: <Blank w={180}>{r.sign.verifiedBy}</Blank></span>
        </div>
      </div>
    </div>
  );
});

export default T1ReportSheet;
