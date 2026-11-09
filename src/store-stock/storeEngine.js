// ─────────────────────────────────────────────────────────────────────────────
// storeEngine.js — pure ledger maths for the Store Stock portal (/store)
// ─────────────────────────────────────────────────────────────────────────────
// No React, no network, no imports from the rest of the app.
//
// The book is an append-only list of entries per item. Quantities are signed in
// the item's own unit (+ in, − out). Stock is valued at weighted-average cost,
// replayed from the ledger. Today's closing is always tomorrow's opening, because
// opening for any period is simply the balance before that period.
//
// Entry types: OPENING | PURCHASE | ISSUE | ADJUST | REVERSAL
// A REVERSAL carries `reverses` (id of the entry it undoes). Reports attribute a
// reversal to the category of the entry it reverses.
// ─────────────────────────────────────────────────────────────────────────────

export const UNITS = {
  kg: { fam: 'm', f: 1, s: 'KG', l: 'Kilogram (KG)' },
  g: { fam: 'm', f: 0.001, s: 'g', l: 'Gram (g)' },
  ton: { fam: 'm', f: 1000, s: 'Ton', l: 'Ton' },
  litre: { fam: 'v', f: 1, s: 'L', l: 'Litre (L)' },
  ml: { fam: 'v', f: 0.001, s: 'ml', l: 'Millilitre (ml)' },
  piece: { fam: 'p', f: 1, s: 'pcs', l: 'Piece' },
  dozen: { fam: 'p', f: 12, s: 'doz', l: 'Dozen' },
  packet: { fam: 'k', f: 1, s: 'pkt', l: 'Packet' },
  box: { fam: 'b', f: 1, s: 'box', l: 'Box' },
};
export const UNIT_ORDER = ['kg', 'g', 'ton', 'litre', 'ml', 'piece', 'packet', 'box', 'dozen'];
export const compatUnits = (u) => UNIT_ORDER.filter((k) => UNITS[k].fam === UNITS[u].fam);
export const unitSym = (item) => UNITS[item.unit]?.s || item.unit;
/** ratio to multiply a quantity typed in `entered` unit to get the item's own unit */
export const unitRatio = (entered, itemUnit) => UNITS[entered].f / UNITS[itemUnit].f;

export const TYPE_LABEL = { OPENING: 'Opening', PURCHASE: 'Purchase', ISSUE: 'Issue', ADJUST: 'Adjust', REVERSAL: 'Correction' };

// ── formatting ───────────────────────────────────────────────────────────────
export const r6 = (x) => Math.round(x * 1e6) / 1e6;
export const fq = (n) => (Math.round(n * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 });
export const fm = (n) => (n < 0 ? '−₹' : '₹') + (Math.round(Math.abs(n) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** rate that can be tiny (per gram / per ml) */
export const fr = (n) => (n < 1 && n > 0 ? '₹' + n.toFixed(3) : fm(n));
export const fp = (n) => (n == null ? '—' : (n > 0 ? '+' : '') + Math.round(n * 10) / 10 + '%');

// ── dates (all 'YYYY-MM-DD' strings; the server decides what "today" is, IST) ──
export const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const pd = (s) => { const a = s.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); };
export const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const daysBetween = (a, b) => Math.round((pd(b) - pd(a)) / 86400000);
export const fd = (s) => pd(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export const ft = (ts) => new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
export const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const pctChange = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);
const byName = (a, b) => a.name.localeCompare(b.name);

export function rangeFor(mode, anchor) {
  if (mode === 'day') return { from: anchor, to: anchor, label: fd(anchor) };
  if (mode === 'week') {
    const d = pd(anchor), off = (d.getDay() + 6) % 7, f = addDays(anchor, -off), t = addDays(f, 6);
    return { from: f, to: t, label: fd(f).slice(0, 6) + ' – ' + fd(t) };
  }
  const a = pd(anchor);
  return {
    from: ymd(new Date(a.getFullYear(), a.getMonth(), 1)),
    to: ymd(new Date(a.getFullYear(), a.getMonth() + 1, 0)),
    label: a.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
  };
}

/** Replay one item's entries: running qty / value, with the unit cost each entry moved at. */
export function replay(entries) {
  let q = 0, v = 0;
  const out = [], uc = {};
  for (const e of entries) {
    let unit = 0;
    if (e.type === 'OPENING' || e.type === 'PURCHASE') unit = e.rate || 0;
    else if (e.type === 'ADJUST' && e.qty >= 0) unit = e.rate != null ? e.rate : q > 0 ? v / q : 0;
    else if (e.type === 'ADJUST' || e.type === 'ISSUE') unit = q > 0 ? v / q : 0;
    else if (e.type === 'REVERSAL') unit = uc[e.reverses] != null ? uc[e.reverses] : 0;
    const cost = e.qty * unit;
    q += e.qty; v += cost;
    if (Math.abs(q) < 1e-9) { q = 0; v = 0; }
    uc[e.id] = unit;
    out.push({ e, q, v, unit, cost });
  }
  return out;
}

/** Build a read-only view over the data. Cheap to rebuild; memoised per item. */
export function createBook({ items = [], entries = [], depts = [] }) {
  const sortedItems = items.slice().sort(byName);
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
  const byItem = {}, byId = {}, reversed = {};
  for (const e of entries) {
    (byItem[e.itemId] ||= []).push(e);
    byId[e.id] = e;
    if (e.type === 'REVERSAL') reversed[e.reverses] = e.id;
  }
  const rows = {};
  const R = (id) => rows[id] || (rows[id] = replay(byItem[id] || []));
  const bal = (id) => { const r = R(id); return r.length ? { q: r[r.length - 1].q, v: r[r.length - 1].v } : { q: 0, v: 0 }; };

  function pricePoints(id, to) {
    return R(id)
      .filter((r) => (r.e.type === 'OPENING' || r.e.type === 'PURCHASE') && !reversed[r.e.id] && (!to || r.e.date <= to) && (r.e.qty > 0 || r.e.rate > 0))
      .map((r) => ({ date: r.e.date, qty: r.e.qty, rate: r.e.rate, type: r.e.type, supplier: r.e.supplier }));
  }
  function priceInfo(id, to) {
    const pts = pricePoints(id, to), cur = pts[pts.length - 1], prev = pts[pts.length - 2];
    if (!cur) return { pts };
    const diff = prev ? cur.rate - prev.rate : null;
    return { pts, cur, prev, diff, pct: prev && prev.rate ? (diff / prev.rate) * 100 : null };
  }

  /** Totals for one item between two dates (inclusive). */
  function period(id, from, to) {
    const P = { openQ: 0, openV: 0, pQty: 0, pVal: 0, adjQ: 0, adjV: 0, issQ: 0, issV: 0, dq: {}, dv: {}, closeQ: 0, closeV: 0, adj: [] };
    for (const r of R(id)) {
      const e = r.e, d = e.date;
      if (d < from) { P.openQ = r.q; P.openV = r.v; }
      if (d <= to) { P.closeQ = r.q; P.closeV = r.v; }
      if (d >= from && d <= to) {
        const o = e.type === 'REVERSAL' ? byId[e.reverses] : e, k = o ? o.type : e.type;
        if (k === 'OPENING') { P.openQ += e.qty; P.openV += r.cost; }
        else if (k === 'PURCHASE') { P.pQty += e.qty; P.pVal += r.cost; }
        else if (k === 'ISSUE') {
          const dep = (o && o.dept) || 'Other';
          P.issQ -= e.qty; P.issV -= r.cost;
          P.dq[dep] = (P.dq[dep] || 0) - e.qty; P.dv[dep] = (P.dv[dep] || 0) - r.cost;
        } else if (k === 'ADJUST') { P.adjQ += e.qty; P.adjV += r.cost; }
        if (k === 'ADJUST' || e.type === 'REVERSAL') P.adj.push(e);
      }
    }
    return P;
  }

  function buildReports(from, to) {
    const len = daysBetween(from, to) + 1, pFrom = addDays(from, -len), pTo = addDays(from, -1);
    const set = {}; depts.forEach((d) => { set[d] = 1; });
    const list = sortedItems.map((it) => {
      const P = period(it.id, from, to), PP = period(it.id, pFrom, pTo);
      Object.keys(P.dq).forEach((d) => { set[d] = 1; });
      return { it, P, PP, price: priceInfo(it.id, to) };
    });
    const dl = Object.keys(set), tot = { issV: 0, openV: 0, pVal: 0, closeV: 0, adjV: 0 }, dv = {};
    dl.forEach((d) => { dv[d] = 0; });
    list.forEach((r) => {
      tot.issV += r.P.issV; tot.openV += r.P.openV; tot.pVal += r.P.pVal; tot.closeV += r.P.closeV; tot.adjV += r.P.adjV;
      dl.forEach((d) => { dv[d] += r.P.dv[d] || 0; });
    });
    return { from, to, pFrom, pTo, rows: list, depts: dl, tot, dv };
  }

  // ── table builders — one source for the screen and for Excel / PDF ────────
  const sym = (it) => UNITS[it.unit].s;
  function tStock(Rp) {
    const head = ['Item', 'Unit', 'Opening qty', 'Opening value (Rs)', 'Purchased qty', 'Purchased value (Rs)', 'Total available'];
    Rp.depts.forEach((d) => head.push(d + ' issued'));
    head.push('Other adjustments', 'Closing qty', 'Closing value (Rs)');
    const body = Rp.rows.map((r) => {
      const P = r.P, row = [r.it.name, sym(r.it), r6(P.openQ), r6(P.openV), r6(P.pQty), r6(P.pVal), r6(P.openQ + P.pQty)];
      Rp.depts.forEach((d) => row.push(r6(P.dq[d] || 0)));
      row.push(r6(P.adjQ), r6(P.closeQ), r6(P.closeV));
      return row;
    });
    const foot = ['Total value', '', '', r6(Rp.tot.openV), '', r6(Rp.tot.pVal), ''];
    Rp.depts.forEach(() => foot.push(''));
    foot.push('', '', r6(Rp.tot.closeV));
    return { head, body, foot };
  }
  function tPrice(Rp) {
    const head = ['Item', 'Unit', 'Previous rate (Rs)', 'Current rate (Rs)', 'Change (Rs)', 'Change %', 'Last purchase', 'Previous purchase qty', 'Current purchase qty', 'Bought in period', 'Purchase cost (Rs)', 'Average rate paid (Rs)'];
    const body = Rp.rows.map((r) => {
      const pi = r.price, P = r.P;
      return [r.it.name, sym(r.it), pi.prev ? r6(pi.prev.rate) : '', pi.cur ? r6(pi.cur.rate) : '', pi.diff != null ? r6(pi.diff) : '',
        pi.pct != null ? Math.round(pi.pct * 10) / 10 : '', pi.cur ? pi.cur.date : '', pi.prev ? r6(pi.prev.qty) : '', pi.cur ? r6(pi.cur.qty) : '',
        r6(P.pQty), r6(P.pVal), P.pQty > 0 ? r6(P.pVal / P.pQty) : ''];
    });
    return { head, body, foot: null };
  }
  function tCons(Rp) {
    const head = ['Item', 'Unit'];
    Rp.depts.forEach((d) => head.push(d));
    head.push('Total issued', 'Issue value (Rs)', 'Share of value %', 'Previous period issued', 'Change %');
    const body = Rp.rows.map((r) => {
      const P = r.P, row = [r.it.name, sym(r.it)];
      Rp.depts.forEach((d) => row.push(r6(P.dq[d] || 0)));
      const ch = pctChange(P.issQ, r.PP.issQ);
      row.push(r6(P.issQ), r6(P.issV), Rp.tot.issV > 0 ? Math.round((P.issV / Rp.tot.issV) * 1000) / 10 : 0, r6(r.PP.issQ), ch == null ? '' : Math.round(ch * 10) / 10);
      return row;
    });
    const foot = ['Total value', ''];
    Rp.depts.forEach(() => foot.push(''));
    foot.push('', r6(Rp.tot.issV), 100, '', '');
    return { head, body, foot };
  }
  function tDeptValue(Rp) {
    return { head: ['Department', 'Issue value (Rs)', 'Share %'], body: Rp.depts.map((d) => [d, r6(Rp.dv[d]), Rp.tot.issV > 0 ? Math.round((Rp.dv[d] / Rp.tot.issV) * 1000) / 10 : 0]), foot: null };
  }
  function tHistory() {
    const body = [];
    sortedItems.forEach((it) => {
      let prev = null;
      pricePoints(it.id).forEach((p) => {
        body.push([it.name, sym(it), p.date, p.type === 'OPENING' ? 'Opening' : 'Purchase', r6(p.qty), r6(p.rate), prev ? r6(p.rate - prev) : '', prev ? Math.round(((p.rate - prev) / prev) * 1000) / 10 : '', p.supplier || '']);
        prev = p.rate;
      });
    });
    return { head: ['Item', 'Unit', 'Date', 'Type', 'Quantity', 'Rate (Rs)', 'Change (Rs)', 'Change %', 'Supplier'], body, foot: null };
  }
  function tLedger(from, to) {
    const body = [];
    entries.filter((e) => e.date >= from && e.date <= to).forEach((e) => {
      const it = itemById[e.itemId]; if (!it) return;
      const o = e.type === 'REVERSAL' ? byId[e.reverses] : null;
      body.push([e.date, new Date(e.ts).toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' }), it.name, sym(it), TYPE_LABEL[e.type], r6(e.qty), e.rate != null ? r6(e.rate) : '',
        (o && o.dept) || e.dept || '', e.to || '', e.supplier || '', e.reason || e.note || '', e.approvedBy || '', e.by || '']);
    });
    return { head: ['Date', 'Time', 'Item', 'Unit', 'Type', 'Quantity (+in / -out)', 'Rate (Rs)', 'Department', 'Received by', 'Supplier', 'Reason / note', 'Approved by', 'Entered by'], body, foot: null };
  }

  return {
    items: sortedItems, itemById, entries, byId, reversed, depts,
    R, bal, pricePoints, priceInfo, period, buildReports,
    tStock, tPrice, tCons, tDeptValue, tHistory, tLedger,
  };
}
