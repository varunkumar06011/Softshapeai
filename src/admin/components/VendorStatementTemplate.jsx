const round2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrPlain = (n) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const flex = { display: 'flex' };
const flexCol = { display: 'flex', flexDirection: 'column' };
const flexCenter = { display: 'flex', alignItems: 'center', justifyContent: 'center' };
const flexBetween = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const flexStartBetween = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' };

const PO_STATUS_LABELS = {
  PENDING: 'Pending',
  DELIVERED: 'Delivered',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
};

function MetaItem({ label, children }) {
  return (
    <div style={{ ...flex, alignItems: 'center', gap: '12px' }}>
      <div style={{ ...flexCenter, height: '44px', width: '44px', borderRadius: '50%', background: '#FEF2F2' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }} />
      </div>
      <div style={flexCol}>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#9CA3AF' }}>{label}</div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B' }}>{children}</div>
      </div>
    </div>
  );
}

function CalcBox({ label, value, highlight }) {
  return (
    <div
      style={{
        flex: 1,
        ...flexCol,
        alignItems: 'center',
        borderRadius: '12px',
        border: `1px solid ${highlight ? '#86EFAC' : '#E5E7EB'}`,
        padding: '12px',
        textAlign: 'center',
        background: highlight ? '#F0FDF4' : '#FFFFFF',
      }}
    >
      <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 900, color: highlight ? '#15803D' : '#1E293B' }}>{inr(value)}</div>
    </div>
  );
}

const Op = ({ children }) => (
  <span style={{ fontSize: '18px', fontWeight: 900, color: '#D1D5DB' }}>{children}</span>
);

export default function VendorStatementTemplate({ data, logoSrc }) {
  const { outletName, vendor, date, weekday, generatedOn, generatedBy, opening, purchases, payments, closing } = data;

  const thBase = {
    padding: '10px 14px',
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#6B7280',
  };

  const tdBase = {
    padding: '10px 14px',
    fontSize: '13px',
  };

  const pos = (vendor.purchaseOrders || []).filter((p) => p.status !== 'CANCELLED');
  const cancelledCount = (vendor.purchaseOrders || []).length - pos.length;

  return (
    <div
      id="vendor-statement-report"
      style={{
        width: '900px',
        margin: '0 auto',
        padding: '32px',
        boxSizing: 'border-box',
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        background: '#FFFFFF',
        color: '#1E293B',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div data-bp style={flexStartBetween}>
        <div style={{ ...flex, alignItems: 'center', gap: '12px' }}>
          <div style={{ ...flexCenter, height: '56px', width: '56px', borderRadius: '12px', background: '#E63946' }}>
            <img src={logoSrc} alt="Softshape" style={{ height: '32px', width: '32px', objectFit: 'contain' }} />
          </div>
          <div style={flexCol}>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A' }}>Softshape</div>
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', color: '#9CA3AF' }}>
              THE AI OPERATING SYSTEM FOR RESTAURANTS
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h1 style={{ fontSize: '30px', fontWeight: 900, margin: 0 }}>
            <span style={{ color: '#0F172A' }}>VENDOR </span>
            <span style={{ color: '#E63946' }}>STATEMENT</span>
          </h1>
        </div>
      </div>
      <div style={{ marginTop: '16px', height: '3px', width: '100%', background: '#E63946' }} />

      {/* ── Meta row ───────────────────────────────────────────────── */}
      <div data-bp style={{ marginTop: '20px', ...flexStartBetween }}>
        <div style={{ ...flex, gap: '32px' }}>
          <MetaItem label="OUTLET">{outletName}</MetaItem>
          <MetaItem label="AS OF DATE">
            {date}
            {weekday && <div style={{ fontSize: '12px', fontWeight: 500, color: '#9CA3AF' }}>{weekday}</div>}
          </MetaItem>
        </div>
        <div style={{ textAlign: 'right', fontSize: '11px', lineHeight: '20px', color: '#6B7280' }}>
          <div><span style={{ fontWeight: 700, color: '#9CA3AF' }}>GENERATED ON: </span>{generatedOn}</div>
          <div><span style={{ fontWeight: 700, color: '#9CA3AF' }}>GENERATED BY: </span>{generatedBy}</div>
        </div>
      </div>

      {/* ── Vendor info card ───────────────────────────────────────── */}
      <div data-bp style={{ marginTop: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', padding: '16px', background: '#F9FAFB' }}>
        <div style={{ ...flexBetween }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF' }}>Vendor</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>
              {vendor.name}
              {vendor.isActive === false && (
                <span style={{ marginLeft: '8px', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: '#E5E7EB', color: '#9CA3AF' }}>Retired</span>
              )}
            </div>
          </div>
        </div>
        <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', fontSize: '12px' }}>
          {vendor.contactPerson && <div><span style={{ fontWeight: 700, color: '#9CA3AF' }}>Contact: </span><span style={{ fontWeight: 700, color: '#334155' }}>{vendor.contactPerson}</span></div>}
          {vendor.phone && <div><span style={{ fontWeight: 700, color: '#9CA3AF' }}>Phone: </span><span style={{ fontWeight: 700, color: '#334155' }}>{vendor.phone}</span></div>}
          {vendor.email && <div><span style={{ fontWeight: 700, color: '#9CA3AF' }}>Email: </span><span style={{ fontWeight: 700, color: '#334155' }}>{vendor.email}</span></div>}
          {vendor.address && <div><span style={{ fontWeight: 700, color: '#9CA3AF' }}>Address: </span><span style={{ fontWeight: 700, color: '#334155' }}>{vendor.address}</span></div>}
        </div>
      </div>

      {/* ── Account summary (equation strip) ───────────────────────── */}
      <div data-bp style={{ marginTop: '20px' }}>
        <div style={{ marginBottom: '8px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>
          Account Summary — {date}
        </div>
        <div style={{ ...flex, alignItems: 'center', gap: '8px' }}>
          <CalcBox label="Opening Balance" value={opening || 0} />
          <Op>+</Op>
          <CalcBox label="Purchases" value={purchases || 0} />
          <Op>−</Op>
          <CalcBox label="Payments" value={payments || 0} />
          <Op>=</Op>
          <CalcBox label="Closing Balance" value={closing || 0} highlight />
        </div>
        <div style={{ marginTop: '4px', textAlign: 'center', fontSize: '9px', color: '#9CA3AF' }}>All amounts are in Indian Rupees (₹)</div>
      </div>

      {/* ── Purchase Order History ─────────────────────────────────── */}
      <div data-bp style={{ marginTop: '20px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
        <div style={{ ...flex, alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#0F172A' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', color: '#FFFFFF' }}>PURCHASE ORDER HISTORY</span>
          {cancelledCount > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 600, color: '#9CA3AF' }}>
              {cancelledCount} cancelled excluded
            </span>
          )}
        </div>
        {pos.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#9CA3AF' }}>
            No purchase orders recorded for this vendor.
          </div>
        ) : (
          <table style={{ width: '100%', textAlign: 'left', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                <th style={{ ...thBase, textAlign: 'left' }}>PO #</th>
                <th style={{ ...thBase, textAlign: 'left', width: '100px' }}>Date</th>
                <th style={{ ...thBase, textAlign: 'center', width: '110px' }}>Status</th>
                <th style={{ ...thBase, textAlign: 'right', width: '120px' }}>Total (₹)</th>
                <th style={{ ...thBase, textAlign: 'right', width: '110px' }}>Paid (₹)</th>
                <th style={{ ...thBase, textAlign: 'right', width: '110px' }}>Due (₹)</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po, idx) => {
                const total = round2(po.totalAmount);
                const paid = round2(po.amountPaid);
                const due = round2(total - paid);
                return (
                  <tr data-bp key={po.id || idx} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ ...tdBase, fontWeight: 700, color: '#1E293B' }}>{po.poNumber}</td>
                    <td style={{ ...tdBase, fontWeight: 600, color: '#6B7280' }}>{po.orderDate}</td>
                    <td style={{ ...tdBase, textAlign: 'center' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', background: po.status === 'PAID' ? '#DCFCE7' : po.status === 'PARTIALLY_PAID' ? '#FEF3C7' : '#EFF6FF', color: po.status === 'PAID' ? '#15803D' : po.status === 'PARTIALLY_PAID' ? '#B45309' : '#1E40AF' }}>
                        {PO_STATUS_LABELS[po.status] || po.status}
                      </span>
                    </td>
                    <td style={{ ...tdBase, textAlign: 'right', fontWeight: 600, color: '#334155' }}>{inrPlain(total)}</td>
                    <td style={{ ...tdBase, textAlign: 'right', fontWeight: 600, color: '#16A34A' }}>{inrPlain(paid)}</td>
                    <td style={{ ...tdBase, textAlign: 'right', fontWeight: 900, color: due > 0 ? '#E63946' : '#9CA3AF' }}>{inrPlain(due)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer band ────────────────────────────────────────────── */}
      <div data-bp style={{ marginTop: '24px', ...flexBetween, borderRadius: '12px', padding: '20px', background: '#0F172A' }}>
        <div style={flexCol}>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF' }}>Outstanding Balance Payable</div>
          <div style={{ fontSize: '30px', fontWeight: 900, color: closing > 0 ? '#FCA5A5' : '#4ADE80' }}>{inr(closing)}</div>
          <div style={{ marginTop: '4px', fontSize: '10px', color: '#9CA3AF' }}>{vendor.name} · as of {date}</div>
        </div>
        <div style={{ ...flex, gap: '32px', textAlign: 'center', fontSize: '10px', color: '#D1D5DB' }}>
          <div style={flexCol}>
            <div style={{ marginBottom: '16px', width: '96px', borderBottom: '1px solid #6B7280' }} />
            PREPARED BY<br /><span style={{ color: '#6B7280' }}>(Signature)</span>
          </div>
          <div style={flexCol}>
            <div style={{ marginBottom: '16px', width: '96px', borderBottom: '1px solid #6B7280' }} />
            VERIFIED BY<br /><span style={{ color: '#6B7280' }}>(Signature)</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '12px', textAlign: 'center', fontSize: '10px', color: '#9CA3AF' }}>
        Softshape AI - software that shapes your business
      </div>
    </div>
  );
}
