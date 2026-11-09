// StoreViews.jsx — the four screens: Stock, Activity, Reports, Settings.
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useStore } from './storeContext';
import { Btn, Pill, Seg, TableWrap, thCls, tdCls, inputCls, Field } from './ui';
import {
  UNITS, unitSym, TYPE_LABEL, fq, fm, fr, fp, fd, ft, pd, ymd, rangeFor, pctChange,
} from './storeEngine';
import { exportExcel, exportPdf } from './storeExport';

const card = 'rounded-[28px] border border-gray-100 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.03)]';
const H = ({ children }) => <h4 className="mb-2 mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">{children}</h4>;

// ── Stock ────────────────────────────────────────────────────────────────────
export function StockView() {
  const { book, today, openSheet } = useStore();
  const [q, setQ] = useState('');
  const totals = useMemo(() => {
    let v = 0, p = 0, i = 0;
    book.items.forEach((it) => { const P = book.period(it.id, today, today); v += P.closeV; p += P.pVal; i += P.issV; });
    return { v, p, i };
  }, [book, today]);
  const list = book.items.filter((i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Btn onClick={() => openSheet('issue', {}, true)} disabled={!book.items.length}>Issue stock</Btn>
        <Btn variant="soft" onClick={() => openSheet('purchase', {}, true)} disabled={!book.items.length}>Record purchase</Btn>
      </div>
      <Btn variant="soft" className="w-full" onClick={() => openSheet('addItem', {}, true)}><Plus size={16} /> Add new item</Btn>
      {book.items.length > 0 && (
        <>
          <p className="px-1 text-[13px] font-bold text-gray-500">
            <b className="text-gray-900">{book.items.length}</b> items · stock value <b className="font-mono text-gray-900">{fm(totals.v)}</b><br />
            Today: bought <b className="font-mono text-gray-900">{fm(totals.p)}</b> · issued <b className="font-mono text-gray-900">{fm(totals.i)}</b>
          </p>
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search items" className={inputCls} />
        </>
      )}
      {list.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {list.map((it) => {
            const P = book.period(it.id, today, today), pi = book.priceInfo(it.id);
            return (
              <button key={it.id} onClick={() => openSheet('item', { itemId: it.id })} className={`${card} p-4 text-left transition-all hover:border-[#E53935] active:scale-[0.99]`}>
                <p className="text-[15px] font-black text-gray-900">{it.name} <span className="ml-1 text-[11px] font-bold text-gray-400">{unitSym(it)}</span></p>
                <p className="mt-1 font-mono text-[28px] leading-tight text-gray-900">{fq(P.closeQ)} <span className="font-sans text-[13px] font-bold text-gray-400">{unitSym(it)}</span></p>
                <p className="mt-0.5 flex flex-wrap gap-x-4 text-[12px] font-bold text-gray-400">
                  <span>{fm(P.closeV)}</span>
                  {pi.cur && <span>last rate {fr(pi.cur.rate)} {pi.pct != null && <b className={pi.pct > 0 ? 'text-red-600' : pi.pct < 0 ? 'text-green-600' : ''}>{fp(pi.pct)}</b>}</span>}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {P.closeQ <= 0 && <Pill tone="amber">Out of stock</Pill>}
                  {P.pQty > 0 && <Pill tone="green">+{fq(P.pQty)} bought today</Pill>}
                  {P.issQ > 0 && <Pill tone="red">−{fq(P.issQ)} issued today</Pill>}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[28px] border-2 border-dashed border-gray-200 p-8 text-center text-sm font-bold text-gray-400">
          {book.items.length ? `No item matches “${q}”.` : 'No items yet. Tap “Add new item”, enter the name once with its opening stock and rate. Closing stock then carries forward by itself each day.'}
        </div>
      )}
    </div>
  );
}

// ── Activity ─────────────────────────────────────────────────────────────────
export function ActivityView({ filter, setFilter }) {
  const { book, today, openSheet } = useStore();
  const [shown, setShown] = useState(60);
  const all = useMemo(() => book.entries.slice().reverse().filter((e) =>
    (filter.type === 'ALL' || e.type === filter.type || (filter.type === 'ADJUST' && e.type === 'REVERSAL')) && (!filter.item || e.itemId === filter.item)), [book, filter]);
  return (
    <div>
      <Seg value={filter.type} onChange={(t) => { setFilter({ ...filter, type: t }); setShown(60); }} options={[['ALL', 'All'], ['PURCHASE', 'Purchases'], ['ISSUE', 'Issues'], ['ADJUST', 'Adjustments']]} />
      <select value={filter.item} onChange={(e) => { setFilter({ ...filter, item: e.target.value }); setShown(60); }} className={`${inputCls} mt-3`}>
        <option value="">All items</option>
        {book.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
      {all.length === 0 && <div className="mt-4 rounded-[28px] border-2 border-dashed border-gray-200 p-8 text-center text-sm font-bold text-gray-400">No entries yet.</div>}
      {all.slice(0, shown).map((e, idx, arr) => {
        const it = book.itemById[e.itemId]; if (!it) return null;
        const header = idx === 0 || arr[idx - 1].date !== e.date ? <p key={'d' + e.date} className="mb-2 mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">{e.date === today ? 'Today · ' : ''}{fd(e.date)}</p> : null;
        const voided = !!book.reversed[e.id];
        const asEntered = e.entUnit && e.entUnit !== it.unit ? ` · entered as ${fq(e.entQty)} ${UNITS[e.entUnit].s}` : '';
        const d = e.type === 'OPENING' ? `Opening stock at ${fr(e.rate)}/${unitSym(it)}`
          : e.type === 'PURCHASE' ? `${fr(e.rate)}/${unitSym(it)}${e.supplier ? ' · ' + e.supplier : ''}${asEntered}`
          : e.type === 'ISSUE' ? `→ ${e.dept}${e.to ? ' · received by ' + e.to : ''}${e.note ? ' · ' + e.note : ''}${asEntered}`
          : e.type === 'ADJUST' ? `${e.reason || 'Adjustment'}${e.note ? ' · ' + e.note : ''}${e.approvedBy ? ' · approved by ' + e.approvedBy : ''}`
          : `Correction of an earlier entry · ${e.reason || ''}`;
        return (
          <div key={e.id}>
            {header}
            <div className={`${card} mb-2 p-3.5 ${voided ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <p className={`text-[14px] font-black text-gray-900 ${voided ? 'line-through' : ''}`}>{it.name}</p>
                <p className={`whitespace-nowrap font-mono text-[14px] ${e.qty >= 0 ? 'text-green-700' : 'text-[#B71C1C]'}`}>{e.qty > 0 ? '+' : ''}{fq(e.qty)} {unitSym(it)}</p>
              </div>
              <p className="mt-0.5 text-[12px] font-bold text-gray-500">{d}</p>
              <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-gray-400">
                <span><Pill>{TYPE_LABEL[e.type]}</Pill> <span className="ml-1">{ft(e.ts)} · {e.by || '—'}{voided ? ' · Corrected' : ''}</span></span>
                {e.type !== 'REVERSAL' && !voided && <button onClick={() => openSheet('reverse', { entryId: e.id }, true)} className="py-1 text-[11px] font-black uppercase tracking-wider text-[#B71C1C]">Correct</button>}
              </div>
            </div>
          </div>
        );
      })}
      {all.length > shown && <Btn variant="soft" className="mt-3 w-full" onClick={() => setShown(shown + 60)}>Show more</Btn>}
      <p className="mt-4 px-1 text-[12px] font-bold text-gray-400">Entries are never edited or deleted. A mistake is fixed with a correction entry that stays in the history.</p>
    </div>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────
function Cell({ c, head }) {
  if (c === '' || c == null) return '–';
  if (typeof c === 'number') {
    if (/%/.test(head)) return `${Math.round(c * 10) / 10}%`;
    return /value|cost|rate|Rs/i.test(head) ? fm(c) : fq(c);
  }
  return c;
}
function DataTable({ t, skipUnit = true, cls }) {
  const cols = t.head.map((h, i) => i).filter((i) => !(skipUnit && i === 1));
  return (
    <TableWrap>
      <table className="w-full">
        <thead><tr>{cols.map((i) => <th key={i} className={thCls}>{t.head[i].replace(' (Rs)', ' (₹)')}</th>)}</tr></thead>
        <tbody>
          {t.body.map((r, ri) => (
            <tr key={ri}>{cols.map((i) => (
              <td key={i} className={`${tdCls} ${cls ? cls(i, r[i], r) : ''}`}>
                {i === 0 ? <>{r[0]}<span className="block text-[10px] font-bold text-gray-400">{r[1]}</span></> : <Cell c={r[i]} head={t.head[i]} />}
              </td>
            ))}</tr>
          ))}
          {t.foot && <tr className="bg-gray-50">{cols.map((i) => <td key={i} className={`${tdCls} !bg-gray-50 font-black`}>{i === 0 ? t.foot[0] : typeof t.foot[i] === 'number' ? <Cell c={t.foot[i]} head={t.head[i]} /> : ''}</td>)}</tr>}
        </tbody>
      </table>
    </TableWrap>
  );
}

export function ReportsView() {
  const { book, today, outlet, notify } = useStore();
  const [mode, setMode] = useState('week'), [anchor, setAnchor] = useState(today), [view, setView] = useState(1), [busy, setBusy] = useState('');
  const rg = rangeFor(mode, anchor);
  const Rp = useMemo(() => book.buildReports(rg.from, rg.to), [book, rg.from, rg.to]);
  const step = (dir) => {
    const a = pd(anchor);
    if (mode === 'day') a.setDate(a.getDate() + dir); else if (mode === 'week') a.setDate(a.getDate() + 7 * dir); else a.setMonth(a.getMonth() + dir, 1);
    const n = ymd(a); setAnchor(n > today ? today : n);
  };
  const doExport = async (kind) => {
    setBusy(kind);
    try { await (kind === 'xlsx' ? exportExcel : exportPdf)(book, rg.from, rg.to, outlet.name); notify(kind === 'xlsx' ? 'Excel downloaded' : 'PDF downloaded'); }
    catch (e) { notify(e.message || 'Export failed', 'error'); } finally { setBusy(''); }
  };

  const head = (
    <>
      <Seg value={mode} onChange={setMode} options={[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']]} />
      <div className="mt-3 grid grid-cols-[52px_1fr_52px] items-center gap-2">
        <Btn variant="soft" className="!h-12 !px-0" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft size={18} /></Btn>
        <p className="text-center text-sm font-black text-gray-900">{rg.label}</p>
        <Btn variant="soft" className="!h-12 !px-0" aria-label="Next" disabled={rg.to >= today} onClick={() => step(1)}><ChevronRight size={18} /></Btn>
      </div>
      <div className="mt-3"><Seg value={view} onChange={setView} options={[[1, '1 · Stock movement'], [2, '2 · Price & consumption']]} /></div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Btn variant="soft" disabled={!!busy || !book.items.length} onClick={() => doExport('xlsx')}>{busy === 'xlsx' ? 'Preparing…' : 'Download Excel'}</Btn>
        <Btn variant="soft" disabled={!!busy || !book.items.length} onClick={() => doExport('pdf')}>{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</Btn>
      </div>
    </>
  );
  if (!book.items.length) return <div>{head}<div className="mt-4 rounded-[28px] border-2 border-dashed border-gray-200 p-8 text-center text-sm font-bold text-gray-400">Add items and record some movements to see reports.</div></div>;

  if (view === 1) {
    const t = book.tStock(Rp), adj = [];
    Rp.rows.forEach((r) => r.P.adj.forEach((e) => adj.push({ it: r.it, e })));
    return (
      <div>
        {head}
        <p className="mb-3 mt-4 px-1 text-[12px] font-bold text-gray-400">Opening is the previous day’s closing, carried forward automatically. Stock is valued at weighted-average cost.</p>
        <DataTable t={t} />
        <H>Variance and adjustment details</H>
        {adj.length ? (
          <TableWrap><table className="w-full"><thead><tr>{['Item', 'Date', 'Qty', 'Reason', 'Approved by'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>{adj.map((a) => (
              <tr key={a.e.id}><td className={tdCls}>{a.it.name}</td><td className={tdCls}>{fd(a.e.date)}</td>
                <td className={`${tdCls} ${a.e.qty >= 0 ? '!text-green-700' : '!text-[#B71C1C]'}`}>{a.e.qty > 0 ? '+' : ''}{fq(a.e.qty)} {unitSym(a.it)}</td><td className={tdCls}>{a.e.reason || ''}</td><td className={tdCls}>{a.e.approvedBy || '–'}</td></tr>
            ))}</tbody></table></TableWrap>
        ) : <p className="px-1 text-[12px] font-bold text-gray-400">No adjustments or corrections in this period.</p>}
      </div>
    );
  }

  const maxV = Math.max(1, ...Rp.depts.map((d) => Rp.dv[d]));
  const top = Rp.rows.slice().sort((a, b) => b.P.issV - a.P.issV).filter((r) => r.P.issV > 0).slice(0, 5);
  const movers = Rp.rows.filter((r) => r.price.pct != null && r.price.pct !== 0).sort((a, b) => Math.abs(b.price.pct) - Math.abs(a.price.pct)).slice(0, 6);
  return (
    <div>
      {head}
      <H>Where the stock went (by value)</H>
      <div className={`${card} space-y-1 px-4 py-3`}>
        {Rp.depts.map((d) => (
          <div key={d} className="grid grid-cols-[minmax(90px,130px)_1fr_auto] items-center gap-3 py-1.5 text-[13px] font-bold text-gray-700">
            <span>{d}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100"><i className="block h-full rounded-full bg-[#B71C1C]" style={{ width: `${(Rp.dv[d] / maxV) * 100}%` }} /></div>
            <span className="whitespace-nowrap font-mono text-[12px]">{fm(Rp.dv[d])} · {Rp.tot.issV > 0 ? Math.round((Rp.dv[d] / Rp.tot.issV) * 100) : 0}%</span>
          </div>
        ))}
      </div>
      {top.length > 0 && (
        <>
          <H>High-consumption items</H>
          <TableWrap><table className="w-full"><thead><tr>{['Item', 'Issued', 'Value', 'vs previous'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>{top.map((r) => { const ch = pctChange(r.P.issQ, r.PP.issQ); return (
              <tr key={r.it.id}><td className={tdCls}>{r.it.name}</td><td className={tdCls}>{fq(r.P.issQ)} {unitSym(r.it)}</td><td className={tdCls}>{fm(r.P.issV)}</td>
                <td className={`${tdCls} ${ch > 50 ? '!text-red-600' : ''}`}>{fp(ch)}{ch > 50 ? ' ⚠' : ''}</td></tr>); })}</tbody></table></TableWrap>
        </>
      )}
      {movers.length > 0 && (
        <>
          <H>Price changes</H>
          <TableWrap><table className="w-full"><thead><tr>{['Item', 'Previous', 'Current', 'Change'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>{movers.map((r) => (
              <tr key={r.it.id}><td className={tdCls}>{r.it.name}</td><td className={tdCls}>{fr(r.price.prev.rate)}</td><td className={tdCls}>{fr(r.price.cur.rate)}</td>
                <td className={`${tdCls} ${r.price.pct > 0 ? '!text-red-600' : '!text-green-600'}`}>{fp(r.price.pct)}</td></tr>
            ))}</tbody></table></TableWrap>
        </>
      )}
      <H>Purchase price analysis</H>
      <DataTable t={book.tPrice(Rp)} cls={(i, c) => ((i === 4 || i === 5) && typeof c === 'number' ? (c > 0 ? '!text-red-600' : c < 0 ? '!text-green-600' : '') : '')} />
      <H>Consumption by department (quantity)</H>
      <DataTable t={book.tCons(Rp)} cls={(i, c, r) => (i === r.length - 1 && typeof c === 'number' && c > 50 ? '!text-red-600' : '')} />
    </div>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────
export function SettingsView() {
  const { user, setUser, depts, actions, notify, audit, outlet, leave, usedDepts: used } = useStore();
  const [nd, setNd] = useState(''), [name, setName] = useState(user || '');
  const save = async (list) => { try { await actions.setDepartments(list); } catch (e) { notify(e.message, 'error'); } };
  const add = async () => {
    const v = nd.trim(); if (!v) return;
    if (depts.some((d) => d.toLowerCase() === v.toLowerCase())) return notify('Already exists', 'error');
    const oi = depts.indexOf('Other'), list = depts.slice(); list.splice(oi < 0 ? list.length : oi, 0, v);
    await save(list); setNd('');
  };
  return (
    <div className="space-y-4">
      <div className={`${card} space-y-3 p-4`}>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Outlet</p>
        <p className="text-base font-black text-gray-900">{outlet.name}</p>
        <Btn variant="soft" className="!h-11 w-full" onClick={leave}>Use a different outlet</Btn>
      </div>
      <Field label="Your name (saved with every entry)">
        <input value={name} onChange={(e) => { setName(e.target.value); setUser(e.target.value.trim()); }} className={inputCls} autoComplete="name" />
      </Field>
      <div>
        <H>Departments</H>
        <div className="space-y-2">
          {depts.map((d) => (
            <div key={d} className={`${card} flex items-center justify-between px-4 py-3 text-sm font-bold text-gray-800`}>
              {d}
              {used.has(d) || d === 'Other' ? <span className="text-[11px] text-gray-400">in use</span>
                : <button className="text-[11px] font-black uppercase tracking-wider text-[#B71C1C]" onClick={() => save(depts.filter((x) => x !== d))}>Remove</button>}
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <input value={nd} onChange={(e) => setNd(e.target.value)} placeholder="New department" className={inputCls} />
          <Btn variant="dark" onClick={add}>Add</Btn>
        </div>
      </div>
      <div>
        <H>Audit log</H>
        {audit.length ? (
          <TableWrap><table className="w-full"><thead><tr>{['When', 'Who', 'What'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>{audit.map((a, i) => <tr key={i}><td className={tdCls}>{fd(ymd(new Date(a.ts)))} {ft(a.ts)}</td><td className={tdCls}>{a.by}</td><td className={`${tdCls} !whitespace-normal !text-left`}>{a.action}: {a.detail}</td></tr>)}</tbody></table></TableWrap>
        ) : <p className="px-1 text-[12px] font-bold text-gray-400">Nothing logged yet.</p>}
      </div>
      <p className="px-1 text-[12px] font-bold text-gray-400">Stock is valued at weighted-average cost. Past days cannot be edited; use Correct in Activity.</p>
    </div>
  );
}
