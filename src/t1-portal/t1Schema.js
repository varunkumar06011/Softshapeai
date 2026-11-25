// t1Schema.js — the fields of the Head Accountant Master Daily Report and the
// numbers the report works out by itself (totals, net payout, growth, shortage).
// Values are kept as the strings the accountant typed, so an empty box stays empty.

export const BRANCHES = ['Ongole', 'Kandukur'];

export const OFFLINE_CHANNELS = [
  ['fr_ac', 'Family Restaurant – AC'],
  ['bar_ac', 'Bar – AC'],
  ['parcel', 'Parcel Counter'],
  ['non_ac', 'Non-AC Dining'],
  ['banquets', 'Banquets / PDR'],
];

export const PAYMENT_MODES = [['cash', 'Cash'], ['card', 'Card / POS'], ['upi', 'UPI / QR'], ['other', 'Other Payments']];

export const PLATFORMS = [['swiggy', 'Swiggy'], ['zomato', 'Zomato']];

export const GOOGLE_ROWS = [
  ['rating', 'Current Google Rating'],
  ['newReviews', 'New Reviews Today'],
  ['totalReviews', 'Total Reviews'],
  ['negative', 'Negative Reviews Today'],
  ['complaints', 'Customer Complaints (Count / Key Issue)', 'text'],
];

export const CHECKS = [
  ['pos', 'POS sales verified'],
  ['cash', 'Cash physically counted'],
  ['upiCard', 'UPI & card settlements verified'],
  ['swiggy', 'Swiggy reconciliation completed'],
  ['zomato', 'Zomato reconciliation completed'],
  ['expenses', 'Expenses & bills verified'],
  ['discounts', 'Discounts / voids checked'],
  ['complaints', 'Complaints reported to management'],
  ['prevWeek', 'Previous week comparison completed'],
];

export function emptyReport() {
  const online = {};
  for (const [k] of PLATFORMS) online[k] = { orders: '', gross: '', commission: '', refunds: '', lwOrders: '', lwPayout: '', complaints: '', pending: '' };
  const offline = {};
  for (const [k] of OFFLINE_CHANNELS) offline[k] = { orders: '', gross: '', discount: '' };
  return {
    preparedBy: '',
    offline,
    pay: { cash: '', card: '', upi: '', other: '', expected: '', actual: '' },
    online,
    google: { ongole: {}, kandukur: {} },
    food: { withCommission: '', afterCommission: '', consumption: '', narration: '' },
    fin: { expenses: '' },
    checks: {},
    sign: { headAccountant: '', manager: '', verifiedBy: '' },
  };
}

// Deep-merge saved data over an empty report so new fields always exist.
export function normalize(data) {
  const base = emptyReport();
  const merge = (a, b) => {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return a;
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
      if (k === '_totals') continue;
      out[k] = a && typeof a[k] === 'object' && a[k] !== null && !Array.isArray(a[k]) ? merge(a[k], v) : v;
    }
    return out;
  };
  return merge(base, data);
}

export const n = (v) => {
  if (v === '' || v == null) return 0;
  const x = Number(String(v).replace(/[,₹\s]/g, ''));
  return Number.isFinite(x) ? x : 0;
};
const has = (v) => v !== '' && v != null;
const pct = (now, before) => (before ? ((now - before) / before) * 100 : null);

export function compute(r) {
  const offline = {};
  const tot = { orders: 0, gross: 0, discount: 0, net: 0 };
  for (const [k] of OFFLINE_CHANNELS) {
    const c = r.offline[k] || {};
    const row = { orders: n(c.orders), gross: n(c.gross), discount: n(c.discount) };
    row.net = row.gross - row.discount;
    offline[k] = row;
    tot.orders += row.orders; tot.gross += row.gross; tot.discount += row.discount; tot.net += row.net;
  }

  const p = r.pay;
  const collA = n(p.cash) + n(p.card) + n(p.upi) + n(p.other);
  const actual = has(p.actual) ? n(p.actual) : collA;
  const shortage = actual - n(p.expected);

  const online = {};
  for (const [k] of PLATFORMS) {
    const o = r.online[k] || {};
    const payout = n(o.gross) - n(o.commission) - n(o.refunds);
    online[k] = {
      orders: n(o.orders),
      gross: n(o.gross),
      payout,
      ordersGrowth: has(o.lwOrders) ? pct(n(o.orders), n(o.lwOrders)) : null,
      payoutGrowth: has(o.lwPayout) ? pct(payout, n(o.lwPayout)) : null,
      pending: n(o.pending),
    };
  }

  const businessNet = tot.net + online.swiggy.payout + online.zomato.payout;
  return {
    offline,
    offlineTotal: tot,
    collA,
    actual,
    shortage,
    online,
    fin: {
      offlineNet: tot.net,
      swiggy: online.swiggy.payout,
      zomato: online.zomato.payout,
      businessNet,
      collections: collA,
      expenses: n(r.fin.expenses),
      pending: online.swiggy.pending + online.zomato.pending,
      shortage,
    },
    kpi: {
      sales: businessNet,
      orders: tot.orders + online.swiggy.orders + online.zomato.orders,
      collections: collA,
      online: online.swiggy.gross + online.zomato.gross,
    },
  };
}

// Small summary saved with the report, shown in the date-wise list.
export function totalsFor(c) {
  return { sales: c.kpi.sales, orders: c.kpi.orders, collections: c.kpi.collections, online: c.kpi.online, shortage: c.shortage };
}

// Fill the "same day last week" rows from last week's saved report, but only where still empty.
export function applyLastWeek(r, lastWeek) {
  if (!lastWeek || !lastWeek.data) return r;
  const lw = normalize(lastWeek.data);
  const lc = compute(lw);
  const next = { ...r, online: { ...r.online } };
  for (const [k] of PLATFORMS) {
    const o = { ...next.online[k] };
    if (!has(o.lwOrders) && has(lw.online[k].orders)) o.lwOrders = String(lw.online[k].orders);
    if (!has(o.lwPayout) && (has(lw.online[k].gross))) o.lwPayout = String(round2(lc.online[k].payout));
    next.online[k] = o;
  }
  return next;
}

export const round2 = (x) => Math.round(x * 100) / 100;
export const money = (x) => (x == null || !Number.isFinite(x) ? '' : round2(x).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
export const pctText = (x) => (x == null || !Number.isFinite(x) ? '' : `${x >= 0 ? '+' : ''}${x.toFixed(1)}%`);

export function istToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
export function dayName(date) {
  if (!date) return '';
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long' });
}
export function fmtDate(date) {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return `${d}-${m}-${y}`;
}
export function addDays(date, k) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
}
