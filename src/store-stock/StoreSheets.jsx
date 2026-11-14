// StoreSheets.jsx — the bottom-sheet forms of the Store Stock portal.
import { useMemo, useState } from 'react';
import { useStore } from './storeContext';
import { Sheet, Field, Btn, ErrorText, Kv, inputCls, TableWrap, thCls, tdCls } from './ui';
import {
  UNITS, UNIT_GROUPS, compatUnits, sameFamily, isEditable, unitRatio, unitSym, TYPE_LABEL,
  fq, fm, fr, fp, fd, r6, pctChange,
} from './storeEngine';

/** Runs an async save with busy + error state. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (fn) => {
    setErr('');
    setBusy(true);
    try { await fn(); } catch (e) { setErr(e.message || 'Could not save.'); } finally { setBusy(false); }
  };
  return { busy, err, setErr, run };
}

const num = (s) => (s === '' || s == null ? NaN : parseFloat(s));
/** Item picker. With more than a handful of items a search box appears above it; typing selects the first match. */
function ItemSelect({ book, value, onChange }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const matches = book.items.filter((i) => !needle || i.name.toLowerCase().includes(needle));
  const list = book.items.filter((i) => i.id === value || matches.includes(i));
  const search = (v) => {
    setQ(v);
    const n = v.trim().toLowerCase();
    const m = book.items.filter((i) => !n || i.name.toLowerCase().includes(n));
    if (m.length && !m.some((i) => i.id === value)) onChange(m[0].id);
  };
  return (
    <div className="space-y-2">
      {book.items.length > 6 && (
        <input type="search" value={q} onChange={(e) => search(e.target.value)} placeholder="Search item" aria-label="Search item" className={inputCls} autoComplete="off" />
      )}
      <Field label="Item">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {list.map((i) => <option key={i.id} value={i.id}>{i.name} ({unitSym(i)})</option>)}
        </select>
      </Field>
      {needle && !matches.length && <p className="px-1 text-[12px] font-bold text-gray-400">No item matches “{q.trim()}”.</p>}
    </div>
  );
}
/** Unit list grouped (Weight / Volume / Count / Packaging). `only` limits it to a set of unit keys. */
function UnitPicker({ value, onChange, only }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {UNIT_GROUPS.map(([label, keys]) => {
        const ks = only ? keys.filter((k) => only.includes(k)) : keys;
        return ks.length ? <optgroup key={label} label={label}>{ks.map((k) => <option key={k} value={k}>{UNITS[k].l}</option>)}</optgroup> : null;
      })}
    </select>
  );
}
const UnitSelect = ({ item, value, onChange }) => (
  <Field label="Unit">
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {compatUnits(item.unit).map((k) => <option key={k} value={k}>{UNITS[k].s}</option>)}
    </select>
  </Field>
);

// ── who is entering ──────────────────────────────────────────────────────────
export function NameSheet({ then }) {
  const { setUser, close, openSheet } = useStore();
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const go = () => {
    const n = name.trim();
    if (!n) return setErr('Enter your name.');
    setUser(n);
    close();
    if (then) setTimeout(() => openSheet(then.type, then.props), 0);
  };
  return (
    <Sheet title="Who is entering stock?" onClose={close}>
      <Field label="Your name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} className={inputCls} placeholder="e.g. Lakshmi" /></Field>
      <p className="px-1 text-[12px] font-bold text-gray-400">Every entry is saved with this name.</p>
      <ErrorText>{err}</ErrorText>
      <Btn className="w-full" onClick={go}>Continue</Btn>
    </Sheet>
  );
}

// ── add item ─────────────────────────────────────────────────────────────────
export function AddItemSheet() {
  const { book, close, user, actions, notify } = useStore();
  const [name, setName] = useState(''), [unit, setUnit] = useState('kg'), [open, setOpen] = useState(''), [rate, setRate] = useState('');
  const { busy, err, setErr, run } = useSubmit();
  const q = num(open), r = num(rate);
  const save = () => run(async () => {
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) throw new Error('Enter the item name.');
    if (book.items.some((i) => i.name.toLowerCase() === n.toLowerCase())) throw new Error('This item already exists.');
    const oq = isNaN(q) ? 0 : q, or = isNaN(r) ? 0 : r;
    if (oq < 0 || or < 0) throw new Error('Stock and rate cannot be negative.');
    if (oq > 0 && !(or > 0)) throw new Error(`Enter the rate per ${UNITS[unit].s} for the opening stock.`);
    await actions.addItem({ name: n, unit, openingQty: oq, openingRate: or, by: user });
    close();
    notify(`${n} added`);
  });
  return (
    <Sheet title="Add item" onClose={close}>
      <Field label="Item name"><input autoFocus value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} className={inputCls} placeholder="e.g. Basmati Rice" autoComplete="off" /></Field>
      <Field label="Unit of measurement">
        <UnitPicker value={unit} onChange={setUnit} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opening stock"><input type="number" inputMode="decimal" min="0" step="any" value={open} onChange={(e) => setOpen(e.target.value)} className={inputCls} placeholder="0" /></Field>
        <Field label={`Rate per ${UNITS[unit].s} (₹)`}><input type="number" inputMode="decimal" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls} placeholder="0" /></Field>
      </div>
      <p className="px-1 text-[12px] font-bold text-gray-400">
        {q > 0 && r > 0 ? `Opening value: ${fm(q * r)}` : 'Enter the name once. Opening stock is entered only now; after this the book carries it forward every day.'}
      </p>
      <ErrorText>{err}</ErrorText>
      <Btn className="w-full" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save item'}</Btn>
    </Sheet>
  );
}

// ── purchase ─────────────────────────────────────────────────────────────────
export function PurchaseSheet({ itemId }) {
  const { book, close, user, actions, notify } = useStore();
  const [id, setId] = useState(itemId || book.items[0]?.id);
  const item = book.itemById[id];
  const [unit, setUnit] = useState(item.unit), [qty, setQty] = useState(''), [rate, setRate] = useState(''), [sup, setSup] = useState('');
  const { busy, err, setErr, run } = useSubmit();
  const ratio = unitRatio(unit, item.unit), q = num(qty), r = num(rate), pi = book.priceInfo(id);
  const changeItem = (v) => { setId(v); setUnit(book.itemById[v].unit); setErr(''); };
  let cmp = '';
  if (pi.cur) {
    cmp = `Last rate ${fr(pi.cur.rate * ratio)}/${UNITS[unit].s} on ${fd(pi.cur.date)}`;
    if (r > 0) { const ch = pctChange(r / ratio, pi.cur.rate); if (ch != null) cmp += ` · this rate is ${fp(ch)}`; }
  }
  const save = () => run(async () => {
    if (!(q > 0)) throw new Error('Enter the quantity.');
    if (!(r > 0)) throw new Error('Enter the purchase rate.');
    await actions.addEntry({ kind: 'PURCHASE', itemId: id, qty: r6(q * ratio), rate: r6(r / ratio), supplier: sup, entQty: q, entUnit: unit, entRate: r, by: user });
    close();
    notify(`Purchase saved: ${fq(q)} ${UNITS[unit].s} ${item.name}`);
  });
  return (
    <Sheet title="Record purchase" onClose={close}>
      <ItemSelect book={book} value={id} onChange={changeItem} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity"><input type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} placeholder="0" /></Field>
        <UnitSelect item={item} value={unit} onChange={setUnit} />
      </div>
      <Field label={`Rate per ${UNITS[unit].s} (₹)`}><input type="number" inputMode="decimal" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls} placeholder="0" /></Field>
      {cmp && <p className="px-1 text-[12px] font-bold text-gray-400">{cmp}</p>}
      <Field label="Supplier (optional)"><input value={sup} onChange={(e) => setSup(e.target.value)} className={inputCls} autoComplete="off" /></Field>
      {q > 0 && r > 0 && <p className="px-1 text-[13px] font-black text-gray-700">Total cost: {fm(q * r)}</p>}
      <ErrorText>{err}</ErrorText>
      <Btn className="w-full" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save purchase'}</Btn>
    </Sheet>
  );
}

// ── issue / outward ──────────────────────────────────────────────────────────
export function IssueSheet({ itemId }) {
  const { book, close, user, actions, notify, depts, people } = useStore();
  const [id, setId] = useState(itemId || book.items[0]?.id);
  const item = book.itemById[id];
  const [unit, setUnit] = useState(item.unit), [qty, setQty] = useState(''), [dept, setDept] = useState(null), [note, setNote] = useState(''), [to, setTo] = useState('');
  const { busy, err, setErr, run } = useSubmit();
  const ratio = unitRatio(unit, item.unit), q = num(qty), bl = book.bal(id), avg = bl.q > 0 ? bl.v / bl.q : 0;
  const changeItem = (v) => { setId(v); setUnit(book.itemById[v].unit); setErr(''); };
  const save = () => run(async () => {
    if (!(q > 0)) throw new Error('Enter the quantity.');
    if (!dept) throw new Error('Choose the department.');
    if (!to.trim()) throw new Error('Enter who received it.');
    if (q * ratio > bl.q + 1e-9) throw new Error(`Only ${fq(bl.q)} ${unitSym(item)} available. You are trying to issue ${fq(q * ratio)} ${unitSym(item)}.`);
    await actions.addEntry({ kind: 'ISSUE', itemId: id, qty: r6(q * ratio), dept, to: to.trim(), note: dept === 'Other' ? note : '', entQty: q, entUnit: unit, by: user });
    close();
    notify(`Issued ${fq(q)} ${UNITS[unit].s} ${item.name} to ${dept}`);
  });
  return (
    <Sheet title="Issue stock" onClose={close}>
      <ItemSelect book={book} value={id} onChange={changeItem} />
      <p className="px-1 text-[12px] font-bold text-gray-400">Available: {fq(bl.q)} {unitSym(item)}{bl.q > 0 ? ` · average cost ${fr(avg)}/${unitSym(item)}` : ''}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity"><input autoFocus type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => { setQty(e.target.value); setErr(''); }} className={inputCls} placeholder="0" /></Field>
        <UnitSelect item={item} value={unit} onChange={setUnit} />
      </div>
      <div>
        <span className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Department</span>
        <div className="grid grid-cols-2 gap-2.5">
          {depts.map((d) => (
            <button key={d} type="button" aria-pressed={dept === d} onClick={() => { setDept(d); setErr(''); }}
              className={`min-h-14 rounded-2xl border-2 px-2 text-[12px] font-black uppercase tracking-wide transition-all active:scale-95 ${dept === d ? 'border-[#B71C1C] bg-[#B71C1C] text-white' : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-[#E53935]'}`}>{d}</button>
          ))}
        </div>
      </div>
      {dept === 'Other' && <Field label="Other department / purpose"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} autoComplete="off" /></Field>}
      <Field label="Received by (chef / person)">
        <input value={to} onChange={(e) => { setTo(e.target.value); setErr(''); }} list="store-people" className={inputCls} placeholder="e.g. Ramesh" autoComplete="off" />
        <datalist id="store-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
      </Field>
      {q > 0 && <p className="px-1 text-[13px] font-black text-gray-700">Value of this issue: {fm(q * ratio * avg)}</p>}
      <ErrorText>{err}</ErrorText>
      <Btn className="w-full" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save issue'}</Btn>
    </Sheet>
  );
}

// ── physical count / adjustment ──────────────────────────────────────────────
const REASONS = ['Wastage', 'Spoilage', 'Counting error', 'Loss / theft', 'Damaged', 'Other'];
export function AdjustSheet({ itemId }) {
  const { book, close, user, actions, notify } = useStore();
  const item = book.itemById[itemId], bl = book.bal(itemId), pi = book.priceInfo(itemId);
  const [count, setCount] = useState(''), [why, setWhy] = useState(REASONS[0]), [note, setNote] = useState(''), [appr, setAppr] = useState('');
  const { busy, err, run } = useSubmit();
  const c = num(count), diff = isNaN(c) ? null : r6(c - bl.q);
  const save = () => run(async () => {
    if (isNaN(c) || c < 0) throw new Error('Enter the counted stock.');
    if (diff === 0) { await actions.countMatch({ itemId, counted: c, by: user }); close(); notify('Count matches the book.'); return; }
    if (!appr.trim()) throw new Error('Enter who approved this adjustment.');
    await actions.addEntry({ kind: 'ADJUST', itemId, qty: diff, reason: why, note, approvedBy: appr.trim(), rate: diff > 0 && pi.cur ? pi.cur.rate : undefined, by: user });
    close();
    notify('Adjustment recorded');
  });
  return (
    <Sheet title={`Count: ${item.name}`} onClose={close}>
      <Kv items={[['Book stock', `${fq(bl.q)} ${unitSym(item)}`], ['Value', fm(bl.v)]]} />
      <Field label={`Counted stock (${unitSym(item)})`}><input autoFocus type="number" inputMode="decimal" min="0" step="any" value={count} onChange={(e) => setCount(e.target.value)} className={inputCls} /></Field>
      {diff != null && <p className="px-1 text-[13px] font-black text-gray-700">{diff === 0 ? 'Matches the book.' : `Difference: ${diff > 0 ? '+' : ''}${fq(diff)} ${unitSym(item)} (${fm(Math.abs(diff) * (bl.q > 0 ? bl.v / bl.q : 0))})`}</p>}
      {diff !== 0 && (
        <>
          <Field label="Reason"><select value={why} onChange={(e) => setWhy(e.target.value)} className={inputCls}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} autoComplete="off" /></Field>
          <Field label="Approved by"><input value={appr} onChange={(e) => setAppr(e.target.value)} className={inputCls} placeholder="Owner or manager name" autoComplete="off" /></Field>
        </>
      )}
      <ErrorText>{err}</ErrorText>
      <Btn className="w-full" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Record count'}</Btn>
    </Sheet>
  );
}

// ── correction ───────────────────────────────────────────────────────────────
export function ReverseSheet({ entryId }) {
  const { book, close, user, actions, notify } = useStore();
  const e = book.byId[entryId], item = book.itemById[e.itemId];
  const [why, setWhy] = useState('');
  const { busy, err, run } = useSubmit();
  const save = () => run(async () => {
    if (!why.trim()) throw new Error('Enter the reason.');
    await actions.addEntry({ kind: 'REVERSAL', itemId: e.itemId, reverses: e.id, reason: why.trim(), by: user });
    close();
    notify('Entry corrected');
  });
  return (
    <Sheet title="Correct this entry" onClose={close}>
      <p className="text-sm font-bold text-gray-800">{TYPE_LABEL[e.type]} · {item.name} · <span className="font-mono">{e.qty > 0 ? '+' : ''}{fq(e.qty)} {unitSym(item)}</span> on {fd(e.date)}</p>
      <p className="px-1 text-[12px] font-bold text-gray-400">The original stays in history, marked as corrected. An opposite entry is added today, then you enter the right one.</p>
      <Field label="Reason for correction"><input autoFocus value={why} onChange={(x) => setWhy(x.target.value)} className={inputCls} placeholder="e.g. typed 100 instead of 10" autoComplete="off" /></Field>
      <ErrorText>{err}</ErrorText>
      <Btn variant="danger" className="w-full" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Correct entry'}</Btn>
    </Sheet>
  );
}

// ── edit item: name, unit, opening stock + rate ──────────────────────────────
export function EditItemSheet({ itemId }) {
  const { book, close, user, actions, notify } = useStore();
  const item = book.itemById[itemId], bl = book.bal(itemId);
  const own = book.entries.filter((x) => x.itemId === itemId);
  const opening = own.find((x) => x.type === 'OPENING');
  const openingVoid = !!opening && !!book.reversed[opening.id];
  const hasOther = own.some((x) => x.type !== 'OPENING');
  const oq0 = opening ? opening.qty : 0, or0 = opening?.rate ?? 0;
  const [name, setName] = useState(item.name), [unit, setUnit] = useState(item.unit);
  const [oq, setOq] = useState(opening ? String(oq0) : ''), [orate, setOrate] = useState(opening ? String(or0) : '');
  const [touched, setTouched] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const { busy, err, setErr, run } = useSubmit();
  const unitChanged = unit !== item.unit, famChanged = unitChanged && !sameFamily(unit, item.unit);

  const changeUnit = (u) => {
    setUnit(u); setErr('');
    if (!opening) return;
    if (u === item.unit) { setOq(String(oq0)); setOrate(String(or0)); setTouched(false); return; }
    if (sameFamily(u, item.unit)) {
      // same group: the server converts everything; show the opening in the new unit unless the person already typed their own
      if (!touched) { const k = UNITS[item.unit].f / UNITS[u].f; setOq(String(r6(oq0 * k))); setOrate(String(r6(or0 / k))); }
    } else { setOq(''); setOrate(''); setTouched(true); } // another group: must be entered again
  };

  const save = () => run(async () => {
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) throw new Error('Enter the item name.');
    if (book.items.some((i) => i.id !== itemId && i.name.toLowerCase() === n.toLowerCase())) throw new Error('Another item already has this name.');
    const body = { by: user };
    if (n !== item.name) body.name = n;
    if (unitChanged) body.unit = unit;
    if (!openingVoid && (touched || famChanged)) {
      const q = num(oq), r = num(orate);
      if (famChanged && opening && (oq0 > 0 || or0 > 0) && (isNaN(q) || isNaN(r))) throw new Error(`Enter the opening stock and rate in ${UNITS[unit].s}.`);
      const qq = isNaN(q) ? 0 : q, rr = isNaN(r) ? 0 : r;
      if (qq < 0 || rr < 0) throw new Error('Stock and rate cannot be negative.');
      if (qq > 0 && !(rr > 0)) throw new Error(`Enter the rate per ${UNITS[unit].s} for the opening stock.`);
      body.openingQty = qq; body.openingRate = rr;
    }
    if (Object.keys(body).length === 1) { close(); notify('Nothing changed'); return; }
    await actions.editItem(itemId, body);
    close();
    notify(`${n} updated`);
  });

  const remove = () => run(async () => {
    await actions.deleteItem(itemId, { by: user });
    close();
    notify(`${item.name} deleted`);
  });

  return (
    <Sheet title="Edit item" onClose={close}>
      <Field label="Item name"><input autoFocus value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} className={inputCls} autoComplete="off" /></Field>
      <Field label="Unit of measurement">
        <UnitPicker value={unit} onChange={changeUnit} only={hasOther ? compatUnits(item.unit) : undefined} />
      </Field>
      {hasOther && !unitChanged && <p className="px-1 text-[12px] font-bold text-gray-400">This item has purchases or issues, so the unit can only change within its group (for example KG ↔ g).</p>}
      {unitChanged && !famChanged && <p className="px-1 text-[12px] font-bold text-gray-400">Every existing entry is converted automatically. Quantities and values stay the same.</p>}
      {famChanged && <p className="px-1 text-[12px] font-bold text-amber-700">Different kind of unit: enter the opening stock and rate again in {UNITS[unit].s}.</p>}
      {openingVoid ? (
        <p className="px-1 text-[12px] font-bold text-gray-400">The opening stock was corrected earlier, so it can’t be edited here.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Opening stock (${UNITS[unit].s})`}><input type="number" inputMode="decimal" min="0" step="any" value={oq} onChange={(e) => { setOq(e.target.value); setTouched(true); setErr(''); }} className={inputCls} placeholder="0" /></Field>
          <Field label={`Rate per ${UNITS[unit].s} (₹)`}><input type="number" inputMode="decimal" min="0" step="any" value={orate} onChange={(e) => { setOrate(e.target.value); setTouched(true); setErr(''); }} className={inputCls} placeholder="0" /></Field>
        </div>
      )}
      <p className="px-1 text-[12px] font-bold text-gray-400">
        In stock now: {fq(bl.q)} {unitSym(item)}. Purchases, issues and counts are edited from Activity (tap Edit on the entry). Every edit is saved in the audit log.
      </p>
      <ErrorText>{err}</ErrorText>
      <Btn className="w-full" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</Btn>
      {hasOther ? (
        <p className="px-1 text-[12px] font-bold text-gray-400">This item has purchases or issues, so it can’t be deleted.</p>
      ) : confirmDel ? (
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-bold text-red-700">Delete {item.name}{bl.q > 0 ? ` (${fq(bl.q)} ${unitSym(item)} opening stock)` : ''}? This can’t be undone.</p>
          <div className="grid grid-cols-2 gap-2">
            <Btn variant="soft" disabled={busy} onClick={() => setConfirmDel(false)}>Keep it</Btn>
            <Btn variant="danger" disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Yes, delete'}</Btn>
          </div>
        </div>
      ) : (
        <Btn variant="danger" className="w-full" disabled={busy} onClick={() => setConfirmDel(true)}>Delete item</Btn>
      )}
    </Sheet>
  );
}

// ── edit entry: quantity, price, who / where, reason ─────────────────────────
const ENTRY_TITLE = { OPENING: 'Edit opening stock', PURCHASE: 'Edit purchase', ISSUE: 'Edit issue', ADJUST: 'Edit adjustment' };
export function EditEntrySheet({ entryId }) {
  const { book, close, user, actions, notify, depts, people } = useStore();
  const e = book.byId[entryId], item = book.itemById[e.itemId], sym = unitSym(item);
  const [qty, setQty] = useState(String(e.type === 'ADJUST' ? e.qty : Math.abs(e.qty)));
  const [rate, setRate] = useState(e.rate != null ? String(e.rate) : '');
  const [sup, setSup] = useState(e.supplier || ''), [dept, setDept] = useState(e.dept || null), [to, setTo] = useState(e.to || '');
  const [note, setNote] = useState(e.note || ''), [why, setWhy] = useState(e.reason || REASONS[0]), [appr, setAppr] = useState(e.approvedBy || '');
  const { busy, err, setErr, run } = useSubmit();
  const q = num(qty), r = num(rate);
  const reasons = REASONS.includes(why) ? REASONS : [why, ...REASONS];

  const save = () => run(async () => {
    const body = { by: user };
    const was = e.type === 'ADJUST' ? e.qty : Math.abs(e.qty);
    if (e.type === 'OPENING') {
      if (isNaN(q) || q < 0) throw new Error('Enter the stock (0 or more).');
      if (isNaN(r) || r < 0) throw new Error('Enter the rate (0 or more).');
      if (q > 0 && !(r > 0)) throw new Error(`Enter the rate per ${sym} for the opening stock.`);
    } else if (e.type === 'PURCHASE') {
      if (!(q > 0)) throw new Error('Enter the quantity.');
      if (!(r > 0)) throw new Error('Enter the purchase rate.');
      if (sup.trim() !== (e.supplier || '')) body.supplier = sup.trim();
    } else if (e.type === 'ISSUE') {
      if (!(q > 0)) throw new Error('Enter the quantity.');
      if (!dept) throw new Error('Choose the department.');
      if (!to.trim()) throw new Error('Enter who received it.');
      if (dept !== e.dept) body.dept = dept;
      if (to.trim() !== (e.to || '')) body.to = to.trim();
      const nt = dept === 'Other' ? note.trim() : '';
      if (nt !== (e.note || '')) body.note = nt;
    } else if (e.type === 'ADJUST') {
      if (isNaN(q) || q === 0) throw new Error('Enter the difference (+ added, − removed).');
      if (!appr.trim()) throw new Error('Enter who approved this adjustment.');
      if (why !== (e.reason || '')) body.reason = why;
      if (appr.trim() !== (e.approvedBy || '')) body.approvedBy = appr.trim();
      if (note.trim() !== (e.note || '')) body.note = note.trim();
    }
    if (r6(q) !== r6(was)) body.qty = q;
    if ((e.type === 'OPENING' || e.type === 'PURCHASE') && r6(r) !== r6(e.rate ?? 0)) body.rate = r;
    if (Object.keys(body).length === 1) { close(); notify('Nothing changed'); return; }
    await actions.editEntry(entryId, body);
    close();
    notify('Entry updated');
  });

  const qtyInput = (label) => (
    <Field label={label}><input autoFocus type="number" inputMode="decimal" step="any" min={e.type === 'ADJUST' ? undefined : '0'} value={qty} onChange={(x) => { setQty(x.target.value); setErr(''); }} className={inputCls} placeholder="0" /></Field>
  );
  const rateInput = (
    <Field label={`Rate per ${sym} (₹)`}><input type="number" inputMode="decimal" min="0" step="any" value={rate} onChange={(x) => { setRate(x.target.value); setErr(''); }} className={inputCls} placeholder="0" /></Field>
  );

  return (
    <Sheet title={ENTRY_TITLE[e.type] || 'Edit entry'} onClose={close}>
      <p className="text-sm font-bold text-gray-800">{item.name} · <span className="text-gray-500">{fd(e.date)} · entered by {e.by || '—'}</span></p>
      {e.type === 'OPENING' && <div className="grid grid-cols-2 gap-3">{qtyInput(`Stock (${sym})`)}{rateInput}</div>}
      {e.type === 'PURCHASE' && (
        <>
          <div className="grid grid-cols-2 gap-3">{qtyInput(`Quantity (${sym})`)}{rateInput}</div>
          <Field label="Supplier (optional)"><input value={sup} onChange={(x) => setSup(x.target.value)} className={inputCls} autoComplete="off" /></Field>
          {q > 0 && r > 0 && <p className="px-1 text-[13px] font-black text-gray-700">Total cost: {fm(q * r)}</p>}
        </>
      )}
      {e.type === 'ISSUE' && (
        <>
          {qtyInput(`Quantity (${sym})`)}
          <div>
            <span className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Department</span>
            <div className="grid grid-cols-2 gap-2.5">
              {depts.map((d) => (
                <button key={d} type="button" aria-pressed={dept === d} onClick={() => { setDept(d); setErr(''); }}
                  className={`min-h-14 rounded-2xl border-2 px-2 text-[12px] font-black uppercase tracking-wide transition-all active:scale-95 ${dept === d ? 'border-[#B71C1C] bg-[#B71C1C] text-white' : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-[#E53935]'}`}>{d}</button>
              ))}
            </div>
          </div>
          {dept === 'Other' && <Field label="Other department / purpose"><input value={note} onChange={(x) => setNote(x.target.value)} className={inputCls} autoComplete="off" /></Field>}
          <Field label="Received by (chef / person)">
            <input value={to} onChange={(x) => { setTo(x.target.value); setErr(''); }} list="store-people-edit" className={inputCls} autoComplete="off" />
            <datalist id="store-people-edit">{people.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
        </>
      )}
      {e.type === 'ADJUST' && (
        <>
          {qtyInput(`Difference (${sym}, + added / − removed)`)}
          <Field label="Reason"><select value={why} onChange={(x) => setWhy(x.target.value)} className={inputCls}>{reasons.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Note (optional)"><input value={note} onChange={(x) => setNote(x.target.value)} className={inputCls} autoComplete="off" /></Field>
          <Field label="Approved by"><input value={appr} onChange={(x) => { setAppr(x.target.value); setErr(''); }} className={inputCls} autoComplete="off" /></Field>
        </>
      )}
      <p className="px-1 text-[12px] font-bold text-gray-400">The entry keeps its original date. Stock and values in the reports update, and the change (old → new) is saved in the audit log. Stock can’t be taken below zero.</p>
      <ErrorText>{err}</ErrorText>
      <Btn className="w-full" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</Btn>
    </Sheet>
  );
}

// ── item detail ──────────────────────────────────────────────────────────────
export function ItemSheet({ itemId }) {
  const { book, close, openSheet, openActivity, today } = useStore();
  const item = book.itemById[itemId], bl = book.bal(itemId), pi = book.priceInfo(itemId), t = book.period(itemId, today, today);
  const hist = useMemo(() => pi.pts.map((p, i, a) => ({ ...p, ch: i > 0 ? pctChange(p.rate, a[i - 1].rate) : null })).reverse(), [pi.pts]);
  const recent = book.R(itemId).slice(-8).reverse();
  return (
    <Sheet title={item.name} onClose={close}>
      <Kv items={[['In stock', `${fq(bl.q)} ${unitSym(item)}`], ['Stock value', fm(bl.v)], ['Average cost', bl.q > 0 ? fr(bl.v / bl.q) : '—'], ['Today in / out', `${fq(t.pQty)} / ${fq(t.issQ)}`]]} />
      <div className="grid grid-cols-2 gap-3">
        <Btn onClick={() => openSheet('purchase', { itemId })}>Purchase</Btn>
        <Btn variant="dark" onClick={() => openSheet('issue', { itemId })}>Issue</Btn>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Btn variant="soft" className="!px-2" onClick={() => openSheet('adjust', { itemId })}>Count / adjust</Btn>
        <Btn variant="soft" className="!px-2" onClick={() => openSheet('editItem', { itemId })}>Edit item</Btn>
      </div>
      {pi.cur && (
        <>
          <p className="pt-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Purchase price</p>
          <Kv items={[
            ['Current rate', fr(pi.cur.rate)], ['Previous rate', pi.prev ? fr(pi.prev.rate) : '—'],
            ['Change', pi.diff == null ? '—' : `${pi.diff > 0 ? '+' : ''}${fr(pi.diff)} (${fp(pi.pct)})`, pi.diff > 0 ? 'text-red-600' : pi.diff < 0 ? 'text-green-600' : ''],
            ['Last purchase', fd(pi.cur.date)],
          ]} />
          <TableWrap>
            <table className="w-full"><thead><tr><th className={thCls}>Date</th><th className={thCls}>Qty</th><th className={thCls}>Rate</th><th className={thCls}>Change</th></tr></thead>
              <tbody>{hist.map((p, i) => (
                <tr key={i}><td className={tdCls}>{fd(p.date)}</td><td className={tdCls}>{fq(p.qty)}</td><td className={tdCls}>{fr(p.rate)}</td>
                  <td className={`${tdCls} ${p.ch > 0 ? '!text-red-600' : p.ch < 0 ? '!text-green-600' : ''}`}>{p.ch == null ? (p.type === 'OPENING' ? 'opening' : '—') : fp(p.ch)}</td></tr>
              ))}</tbody></table>
          </TableWrap>
        </>
      )}
      <p className="pt-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Recent movements</p>
      <TableWrap>
        <table className="w-full"><thead><tr><th className={thCls}>Date</th><th className={thCls}>Type</th><th className={thCls}>Qty</th><th className={thCls}>Balance</th><th className={thCls} aria-label="Edit" /></tr></thead>
          <tbody>{recent.map((r) => (
            <tr key={r.e.id}><td className={tdCls}>{fd(r.e.date)}</td><td className={tdCls}>{TYPE_LABEL[r.e.type]}</td>
              <td className={`${tdCls} ${r.e.qty >= 0 ? '!text-green-700' : '!text-[#B71C1C]'}`}>{r.e.qty > 0 ? '+' : ''}{fq(r.e.qty)}</td><td className={tdCls}>{fq(r.q)}</td>
              <td className={tdCls}>{isEditable(book, r.e) && <button onClick={() => openSheet('editEntry', { entryId: r.e.id })} className="py-1 font-sans text-[11px] font-black uppercase tracking-wider text-[#B71C1C]">Edit</button>}</td></tr>
          ))}</tbody></table>
      </TableWrap>
      <Btn variant="soft" className="!h-11 w-full" onClick={() => { close(); openActivity(itemId); }}>All history</Btn>
    </Sheet>
  );
}

