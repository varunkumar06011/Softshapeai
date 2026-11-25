// T1Workspace — the signed-in accountant's screen: pick date + branch, fill the
// report, it auto-saves to the database, then Generate Image / PDF.
//
// Never losing entries:
//   - every keystroke is kept on this device at once (local draft) until the
//     server confirms the save, so a closed tab / lost network loses nothing;
//   - the server keeps every saved version (History → restore any of them);
//   - if someone else saved the same report meanwhile, nothing is overwritten
//     silently: you choose to load theirs or save yours as the newer version.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, CloudOff, FileDown, History, ImageDown, Loader2, Eye, Save, AlertTriangle, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { t1Api } from './t1Api';
import {
  BRANCHES, OFFLINE_CHANNELS, PAYMENT_MODES, PLATFORMS, GOOGLE_ROWS, CHECKS,
  emptyReport, normalize, compute, totalsFor, applyLastWeek, money, pctText, istToday, dayName, fmtDate, addDays,
} from './t1Schema';
import T1ReportSheet from './T1ReportSheet';
import { exportImage, exportPdf, fileBase } from './t1Export';
import { Btn, Seg, Sheet, ErrorText, Pill } from './t1Ui';

const draftKey = (code, date, branch) => `softshape.t1.draft.${code}.${date}.${branch}`;
const readDraft = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const writeDraft = (k, v) => { try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch { /* storage full / private */ } };
const sameData = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── small inputs ────────────────────────────────────────────────────────────
const cellIn = 'h-10 w-full min-w-[84px] rounded-xl border-2 border-gray-100 bg-gray-50 px-2.5 text-right font-mono text-[14px] font-semibold text-gray-900 outline-none transition-all focus:border-[#E53935] focus:bg-white placeholder:text-gray-300';
const textIn = 'h-10 w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-3 text-[14px] font-semibold text-gray-900 outline-none transition-all focus:border-[#E53935] focus:bg-white placeholder:text-gray-300';

function Num({ value, onChange, placeholder = '0', ...p }) {
  return (
    <input
      type="text" inputMode="decimal" value={value ?? ''} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.,-]/g, ''))}
      className={cellIn} {...p}
    />
  );
}
function Txt({ value, onChange, placeholder = '', className = '' }) {
  return <input type="text" value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${textIn} ${className}`} />;
}
const Calc = ({ children, tone }) => (
  <div className={`flex h-10 min-w-[84px] items-center justify-end rounded-xl px-2.5 font-mono text-[14px] font-bold ${tone === 'red' ? 'bg-red-50 text-[#B71C1C]' : 'bg-[#FBE3E6]/60 text-gray-900'}`}>{children || '—'}</div>
);

function Card({ title, children, hint }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between gap-2 bg-[#C8102E] px-5 py-3">
        <h3 className="text-[13px] font-black uppercase tracking-wider text-white">{title}</h3>
        {hint && <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">{hint}</span>}
      </div>
      <div className="overflow-x-auto p-3 sm:p-4">{children}</div>
    </section>
  );
}
const TH = ({ children, left }) => <th className={`px-1.5 pb-2 text-[10px] font-black uppercase tracking-wider text-gray-400 ${left ? 'text-left' : 'text-right'}`}>{children}</th>;
const RowLabel = ({ children, strong }) => <td className={`whitespace-nowrap py-1 pr-3 text-[13px] ${strong ? 'font-black text-gray-900' : 'font-bold text-gray-700'}`}>{children}</td>;
const C = ({ children }) => <td className="px-1 py-1">{children}</td>;

// ── workspace ───────────────────────────────────────────────────────────────
export default function T1Workspace({ code, session, onSessionExpired, headerRight }) {
  const today = session.today || istToday();
  const [date, setDate] = useState(today);
  const [branch, setBranch] = useState(() => { try { return localStorage.getItem('softshape.t1.branch') || BRANCHES[0]; } catch { return BRANCHES[0]; } });
  const [report, setReport] = useState(emptyReport);
  const [meta, setMeta] = useState(null); // server: { version, updatedBy, updatedAt }
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | offline | error | conflict
  const [saveErr, setSaveErr] = useState('');
  const [conflict, setConflict] = useState(null);
  const [draftOffer, setDraftOffer] = useState(null);
  const [list, setList] = useState([]);
  const [panel, setPanel] = useState(null); // history | preview
  const [exporting, setExporting] = useState('');
  const [toast, setToast] = useState('');

  const versionRef = useRef(0);
  const reportRef = useRef(report);
  const savingRef = useRef(false);
  const editSeq = useRef(0);
  const sheetRef = useRef(null);
  const key = draftKey(code, date, branch);
  const keyRef = useRef(key);
  useLayoutEffect(() => { keyRef.current = key; reportRef.current = report; }, [key, report]);

  const handleAuth = useCallback((e) => { if (e.status === 401) { onSessionExpired(); return true; } return false; }, [onSessionExpired]);

  const loadList = useCallback(async () => {
    try { const r = await t1Api.listReports(code, addDays(today, -92), addDays(today, 1)); setList(r.reports); }
    catch (e) { handleAuth(e); }
  }, [code, today, handleAuth]);
  useEffect(() => { const t = setTimeout(loadList, 0); return () => clearTimeout(t); }, [loadList]);

  // Load the report for date + branch.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true); setLoadErr(''); setConflict(null); setDraftOffer(null); setSaveErr(''); setSaveState('idle'); setDirty(false);
      try { localStorage.setItem('softshape.t1.branch', branch); } catch { /* ignore */ }
      try {
        const r = await t1Api.getReport(code, date, branch);
        if (cancelled) return;
        const server = r.report;
        let data = server ? normalize(server.data) : normalize({ preparedBy: session.user.name, sign: { headAccountant: session.user.name } });
        data = applyLastWeek(data, r.lastWeek);
        versionRef.current = server ? server.version : 0;
        setMeta(server ? { version: server.version, updatedBy: server.updatedBy, updatedAt: server.updatedAt } : null);
        const draft = readDraft(draftKey(code, date, branch));
        if (draft && draft.data && !sameData(normalize(draft.data), server ? normalize(server.data) : data)) {
          if (draft.baseVersion === versionRef.current) {
            data = normalize(draft.data);
            setDirty(true);
          } else {
            setDraftOffer(draft);
          }
        } else if (draft) {
          writeDraft(draftKey(code, date, branch), null);
        }
        setReport(data);
        if (server && !draft) setSaveState('saved');
      } catch (e) {
        if (cancelled || handleAuth(e)) return;
        // Offline: fall back to this device's draft so work can continue.
        const draft = readDraft(draftKey(code, date, branch));
        if (draft?.data) { setReport(normalize(draft.data)); versionRef.current = draft.baseVersion || 0; setDirty(true); }
        else setReport(emptyReport());
        setLoadErr(e.message);
      } finally { if (!cancelled) setLoading(false); }
    }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [code, date, branch, session.user.name, handleAuth]);

  const save = useCallback(async () => {
    if (savingRef.current) return false;
    savingRef.current = true;
    const seq = editSeq.current;
    const data = reportRef.current;
    const k = keyRef.current;
    const [d, b] = [date, branch];
    setSaveState('saving'); setSaveErr('');
    try {
      const r = await t1Api.saveReport(code, d, b, { ...data, _totals: totalsFor(compute(data)) }, versionRef.current);
      if (keyRef.current !== k) return true;
      versionRef.current = r.report.version;
      setMeta({ version: r.report.version, updatedBy: r.report.updatedBy, updatedAt: r.report.updatedAt });
      if (editSeq.current === seq) { setDirty(false); writeDraft(k, null); }
      setSaveState('saved');
      loadList();
      return true;
    } catch (e) {
      if (handleAuth(e)) return false;
      if (e.status === 409) { setConflict(e.data?.report || null); setSaveState('conflict'); setSaveErr(e.message); }
      else if (e.offline) { setSaveState('offline'); setSaveErr(e.message); }
      else { setSaveState('error'); setSaveErr(e.message); }
      return false;
    } finally { savingRef.current = false; }
  }, [code, date, branch, handleAuth, loadList]);

  // Auto-save 2.5 s after the last change (not while a conflict is open).
  useEffect(() => {
    if (!dirty || loading || conflict || draftOffer) return undefined;
    const t = setTimeout(save, 2500);
    return () => clearTimeout(t);
  }, [report, dirty, loading, conflict, draftOffer, save]);

  useEffect(() => {
    const on = () => { if (dirty && !conflict) save(); };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [dirty, conflict, save]);

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Any edit: update state, keep a device draft immediately.
  const edit = useCallback((fn) => {
    setReport((prev) => {
      const next = fn(prev);
      writeDraft(keyRef.current, { data: next, baseVersion: versionRef.current, at: Date.now() });
      return next;
    });
    editSeq.current += 1;
    setDirty(true);
    if (saveState === 'saved') setSaveState('idle');
  }, [saveState]);
  const set = (path, value) => edit((prev) => {
    const next = structuredClone(prev);
    let o = next;
    for (let i = 0; i < path.length - 1; i++) { o[path[i]] = o[path[i]] && typeof o[path[i]] === 'object' ? o[path[i]] : {}; o = o[path[i]]; }
    o[path[path.length - 1]] = value;
    return next;
  });

  const c = useMemo(() => compute(report), [report]);

  const resolveConflict = (useTheirs) => {
    if (!conflict) { setConflict(null); setSaveState('idle'); return; }
    versionRef.current = conflict.version;
    setMeta({ version: conflict.version, updatedBy: conflict.updatedBy, updatedAt: conflict.updatedAt });
    if (useTheirs) {
      setReport(normalize(conflict.data)); writeDraft(key, null); setDirty(false); setSaveState('saved');
    } else {
      writeDraft(key, { data: reportRef.current, baseVersion: conflict.version, at: Date.now() });
      setDirty(true); setSaveState('idle');
    }
    setConflict(null); setSaveErr('');
  };
  const applyDraft = (yes) => {
    if (yes) { setReport(normalize(draftOffer.data)); writeDraft(key, { ...draftOffer, baseVersion: versionRef.current }); setDirty(true); }
    else writeDraft(key, null);
    setDraftOffer(null);
  };

  const generate = async (kind) => {
    setExporting(kind); setToast('');
    try {
      const saved = dirty && !conflict ? await save() : true;
      const base = fileBase(code, date, branch);
      const m = kind === 'pdf' ? await exportPdf(sheetRef.current, base) : await exportImage(sheetRef.current, base);
      setToast(saved ? `Saved. ${m}` : `${m}, but the report is NOT saved yet. Your entries are kept on this device; tap Save when online.`);
    } catch (e) {
      setToast(`Could not create the ${kind === 'pdf' ? 'PDF' : 'image'}: ${e.message}`);
    } finally { setExporting(''); }
  };

  const savedLabel = {
    saving: <><Loader2 size={14} className="animate-spin" /> Saving…</>,
    saved: <><Check size={14} /> Saved{meta ? ` · v${meta.version}` : ''}</>,
    offline: <><CloudOff size={14} /> Offline · kept on this device</>,
    error: <><AlertTriangle size={14} /> Not saved</>,
    conflict: <><AlertTriangle size={14} /> Needs your choice</>,
    idle: dirty ? <>Unsaved changes</> : meta ? <><Check size={14} /> Saved · v{meta.version}</> : <>New report</>,
  }[saveState];
  const savedTone = saveState === 'saved' || (saveState === 'idle' && !dirty && meta) ? 'text-green-700' : saveState === 'error' || saveState === 'conflict' ? 'text-[#B71C1C]' : 'text-gray-500';

  const pickDays = useMemo(() => {
    const byDate = new Map();
    for (const r of list) { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [list]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-40 font-sans">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#C8102E] text-sm font-black text-white">T1</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black uppercase tracking-wider text-gray-900">T1 Task Portal</p>
            <p className="truncate text-[11px] font-bold text-gray-400">{session.outlet.name} · {session.user.name}</p>
          </div>
          {headerRight}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 pt-4">
        {/* Date + branch */}
        <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.03)]">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="mb-1.5 ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Report date</p>
              <div className="flex items-center gap-1.5">
                <button aria-label="Previous day" onClick={() => setDate(addDays(date, -1))} className="flex h-12 w-10 items-center justify-center rounded-xl border-2 border-gray-100 text-gray-500 hover:border-[#E53935]"><ChevronLeft size={18} /></button>
                <input type="date" value={date} max={addDays(today, 1)} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-12 rounded-xl border-2 border-gray-100 bg-gray-50 px-3 font-bold text-gray-900 outline-none focus:border-[#E53935]" />
                <button aria-label="Next day" disabled={date >= today} onClick={() => setDate(addDays(date, 1))} className="flex h-12 w-10 items-center justify-center rounded-xl border-2 border-gray-100 text-gray-500 hover:border-[#E53935] disabled:opacity-30"><ChevronRight size={18} /></button>
              </div>
            </div>
            <div>
              <p className="mb-1.5 ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Branch</p>
              <Seg value={branch} onChange={setBranch} options={BRANCHES.map((b) => [b, b])} />
            </div>
            <div className="ml-auto text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Day</p>
              <p className="text-base font-black text-gray-900">{dayName(date)}</p>
            </div>
          </div>
          {pickDays.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 ml-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400"><CalendarDays size={12} /> Saved reports (date wise)</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {pickDays.map(([d, rows]) => (
                  <div key={d} className="shrink-0 rounded-2xl border border-gray-100 bg-gray-50 p-2">
                    <p className="px-1 text-[11px] font-black text-gray-700">{fmtDate(d)}</p>
                    <div className="mt-1 flex gap-1">
                      {rows.map((r) => (
                        <button key={r.branch} onClick={() => { setDate(r.date); setBranch(r.branch); }}
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${r.date === date && r.branch === branch ? 'bg-[#B71C1C] text-white' : 'bg-white text-gray-600 hover:text-[#B71C1C]'}`}
                          title={r.totals ? `Sales ₹${money(r.totals.sales)} · by ${r.updatedBy}` : `by ${r.updatedBy}`}>
                          {r.branch}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {loadErr && <div className="rounded-2xl bg-amber-50 p-3 text-[13px] font-bold text-amber-800">{loadErr}</div>}
        {draftOffer && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
            <p className="flex-1 text-[13px] font-bold text-amber-900">This device has entries for this report that were never saved (from {new Date(draftOffer.at).toLocaleString('en-IN')}), and the report was saved again since. Use this device's entries?</p>
            <Btn variant="soft" className="!h-10" onClick={() => applyDraft(false)}>Discard</Btn>
            <Btn variant="danger" className="!h-10" onClick={() => applyDraft(true)}>Use my entries</Btn>
          </div>
        )}
        {saveState === 'conflict' && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-red-200 bg-red-50 p-4">
            <p className="flex-1 text-[13px] font-bold text-[#B71C1C]">{saveErr} Both versions are kept in History either way.</p>
            <Btn variant="soft" className="!h-10" onClick={() => resolveConflict(true)}>Load their version</Btn>
            <Btn variant="danger" className="!h-10" onClick={() => resolveConflict(false)}>Save mine as newer</Btn>
          </div>
        )}

        {loading ? (
          <div className="flex h-60 items-center justify-center"><Loader2 className="animate-spin text-[#B71C1C]" /></div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[['Total Business Sales', `₹ ${money(c.kpi.sales)}`], ['Total Orders / Bills', c.kpi.orders], ['Total Collections', `₹ ${money(c.kpi.collections)}`], ['Online Sales (Swiggy + Zomato)', `₹ ${money(c.kpi.online)}`]].map(([k, v]) => (
                <div key={k} className="rounded-3xl border border-[#F5C6CC] bg-[#FBE3E6]/50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">{k}</p>
                  <p className="mt-1 font-mono text-xl font-bold text-[#B71C1C]">{v}</p>
                </div>
              ))}
            </div>

            <section className="rounded-3xl border border-gray-100 bg-white p-4">
              <label className="block max-w-sm">
                <span className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Prepared by</span>
                <Txt value={report.preparedBy} onChange={(v) => set(['preparedBy'], v)} placeholder="Name" />
              </label>
            </section>

            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Card title="Offline sales – channel wise" hint="Net = Gross − Discount">
                <table className="w-full">
                  <thead><tr><TH left>Channel</TH><TH>Orders</TH><TH>Gross ₹</TH><TH>Discount ₹</TH><TH>Net ₹</TH></tr></thead>
                  <tbody>
                    {OFFLINE_CHANNELS.map(([k, label]) => (
                      <tr key={k}>
                        <RowLabel>{label}</RowLabel>
                        <C><Num value={report.offline[k].orders} onChange={(v) => set(['offline', k, 'orders'], v)} /></C>
                        <C><Num value={report.offline[k].gross} onChange={(v) => set(['offline', k, 'gross'], v)} /></C>
                        <C><Num value={report.offline[k].discount} onChange={(v) => set(['offline', k, 'discount'], v)} /></C>
                        <C><Calc>{money(c.offline[k].net)}</Calc></C>
                      </tr>
                    ))}
                    <tr>
                      <RowLabel strong>TOTAL OFFLINE</RowLabel>
                      <C><Calc>{c.offlineTotal.orders}</Calc></C><C><Calc>{money(c.offlineTotal.gross)}</Calc></C><C><Calc>{money(c.offlineTotal.discount)}</Calc></C><C><Calc>{money(c.offlineTotal.net)}</Calc></C>
                    </tr>
                  </tbody>
                </table>
              </Card>

              <Card title="Payment collection reconciliation">
                <table className="w-full">
                  <tbody>
                    {PAYMENT_MODES.map(([k, label]) => (
                      <tr key={k}><RowLabel>{label}</RowLabel><C><Num value={report.pay[k]} onChange={(v) => set(['pay', k], v)} /></C></tr>
                    ))}
                    <tr><RowLabel strong>Total Collections (A)</RowLabel><C><Calc>{money(c.collA)}</Calc></C></tr>
                    <tr><RowLabel>Expected Collections (B)</RowLabel><C><Num value={report.pay.expected} onChange={(v) => set(['pay', 'expected'], v)} /></C></tr>
                    <tr><RowLabel>Actual Collections (C)</RowLabel><C><Num value={report.pay.actual} onChange={(v) => set(['pay', 'actual'], v)} placeholder={money(c.collA) || '0'} /></C></tr>
                    <tr><RowLabel strong>Shortage / Excess (C − B)</RowLabel><C><Calc tone={c.shortage < 0 ? 'red' : undefined}>{report.pay.expected === '' ? '' : money(c.shortage)}</Calc></C></tr>
                  </tbody>
                </table>
                <p className="mt-2 px-1 text-[11px] font-semibold text-gray-400">Actual (C) left empty = Total (A).</p>
              </Card>
            </div>

            <Card title="Online delivery – Swiggy & Zomato" hint="Last-week rows fill from the saved report 7 days ago">
              <table className="w-full">
                <thead><tr><TH left>Particulars</TH>{PLATFORMS.map(([k, l]) => <TH key={k}>{l}</TH>)}</tr></thead>
                <tbody>
                  {[
                    ['orders', 'Total Orders Today'],
                    ['gross', 'Gross Sales (₹)'],
                    ['commission', 'Commission & Other Deductions (₹)'],
                    ['refunds', 'Refunds / Cancellations (₹)'],
                    ['=payout', 'Net Payout (₹)'],
                    ['lwOrders', 'Same Day Last Week – Orders'],
                    ['lwPayout', 'Same Day Last Week – Payout (₹)'],
                    ['=og', 'Orders Growth / Decline (%)'],
                    ['=pg', 'Payout Growth / Decline (%)'],
                    ['complaints', 'Customer Complaints (Count / Details)', 'text'],
                    ['pending', 'Pending Settlements (₹)'],
                  ].map(([k, label, kind]) => (
                    <tr key={k}>
                      <RowLabel strong={k === '=payout'}>{label}</RowLabel>
                      {PLATFORMS.map(([p]) => (
                        <C key={p}>
                          {k === '=payout' ? <Calc>{money(c.online[p].payout)}</Calc>
                            : k === '=og' ? <Calc tone={c.online[p].ordersGrowth < 0 ? 'red' : undefined}>{pctText(c.online[p].ordersGrowth)}</Calc>
                            : k === '=pg' ? <Calc tone={c.online[p].payoutGrowth < 0 ? 'red' : undefined}>{pctText(c.online[p].payoutGrowth)}</Calc>
                            : kind === 'text' ? <Txt value={report.online[p][k]} onChange={(v) => set(['online', p, k], v)} placeholder="e.g. 2 – late delivery" />
                            : <Num value={report.online[p][k]} onChange={(v) => set(['online', p, k], v)} />}
                        </C>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Google ratings & customer feedback">
                <table className="w-full">
                  <thead><tr><TH left>Particulars</TH><TH>Ongole</TH><TH>Kandukur</TH></tr></thead>
                  <tbody>
                    {GOOGLE_ROWS.map(([k, label, kind]) => (
                      <tr key={k}>
                        <RowLabel>{label}</RowLabel>
                        {['ongole', 'kandukur'].map((b) => (
                          <C key={b}>{kind === 'text'
                            ? <Txt value={report.google[b]?.[k]} onChange={(v) => set(['google', b, k], v)} placeholder="count / issue" />
                            : <Num value={report.google[b]?.[k]} onChange={(v) => set(['google', b, k], v)} />}
                          </C>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <Card title="Food performance summary">
                <table className="w-full">
                  <tbody>
                    <tr><RowLabel>Food Sale with Commission (₹)</RowLabel><C><Num value={report.food.withCommission} onChange={(v) => set(['food', 'withCommission'], v)} /></C></tr>
                    <tr><RowLabel>Food Sale after Commission (₹)</RowLabel><C><Num value={report.food.afterCommission} onChange={(v) => set(['food', 'afterCommission'], v)} /></C></tr>
                    <tr><RowLabel>Food Consumption (₹)</RowLabel><C><Num value={report.food.consumption} onChange={(v) => set(['food', 'consumption'], v)} /></C></tr>
                  </tbody>
                </table>
                <label className="mt-2 block px-1">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Narration</span>
                  <textarea value={report.food.narration} onChange={(e) => set(['food', 'narration'], e.target.value)} rows={3} maxLength={900} className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 p-3 text-[14px] font-semibold text-gray-900 outline-none focus:border-[#E53935] focus:bg-white" placeholder="Notes for the day" />
                </label>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Daily financial summary" hint="Worked out from the sections above">
                <table className="w-full">
                  <tbody>
                    <tr><RowLabel>Total Offline Net Sales</RowLabel><C><Calc>{money(c.fin.offlineNet)}</Calc></C></tr>
                    <tr><RowLabel>Swiggy Net Payout</RowLabel><C><Calc>{money(c.fin.swiggy)}</Calc></C></tr>
                    <tr><RowLabel>Zomato Net Payout</RowLabel><C><Calc>{money(c.fin.zomato)}</Calc></C></tr>
                    <tr><RowLabel strong>Total Business Net Sales</RowLabel><C><Calc>{money(c.fin.businessNet)}</Calc></C></tr>
                    <tr><RowLabel>Total Collections (Cash + Card + UPI)</RowLabel><C><Calc>{money(c.fin.collections)}</Calc></C></tr>
                    <tr><RowLabel>Total Expenses</RowLabel><C><Num value={report.fin.expenses} onChange={(v) => set(['fin', 'expenses'], v)} /></C></tr>
                    <tr><RowLabel>Pending Settlements (Swiggy + Zomato)</RowLabel><C><Calc>{money(c.fin.pending)}</Calc></C></tr>
                    <tr><RowLabel strong>Cash Shortage / Excess</RowLabel><C><Calc tone={c.shortage < 0 ? 'red' : undefined}>{report.pay.expected === '' ? '' : money(c.fin.shortage)}</Calc></C></tr>
                  </tbody>
                </table>
              </Card>

              <Card title="Verification checklist">
                <div className="grid gap-1 sm:grid-cols-2">
                  {CHECKS.map(([k, label]) => (
                    <label key={k} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-gray-50">
                      <input type="checkbox" checked={!!report.checks[k]} onChange={(e) => set(['checks', k], e.target.checked)} className="h-5 w-5 accent-[#B71C1C]" />
                      <span className="text-[13px] font-bold text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </Card>
            </div>

            <section className="grid gap-3 rounded-3xl border border-gray-100 bg-white p-4 sm:grid-cols-3">
              {[['headAccountant', 'Head Accountant'], ['manager', 'Manager'], ['verifiedBy', 'Verified by']].map(([k, label]) => (
                <label key={k} className="block">
                  <span className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">{label}</span>
                  <Txt value={report.sign[k]} onChange={(v) => set(['sign', k], v)} placeholder="Name" />
                </label>
              ))}
            </section>

            {meta && <p className="px-2 text-center text-[11px] font-bold text-gray-400">Last saved by {meta.updatedBy} · {new Date(meta.updatedAt).toLocaleString('en-IN')} · version {meta.version}</p>}
          </>
        )}
      </main>

      {/* Action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
          <span className={`flex w-full min-w-0 items-center gap-1.5 text-[11px] font-black uppercase tracking-wider sm:w-auto sm:flex-1 sm:text-[12px] ${savedTone}`}>{savedLabel}</span>
          <Btn variant="soft" className="!h-11 !px-3" onClick={() => setPanel('history')} disabled={!meta} title="Saved versions"><History size={16} /><span className="hidden sm:inline">History</span></Btn>
          <Btn variant="soft" className="!h-11 !px-3" onClick={() => setPanel('preview')} disabled={loading}><Eye size={16} /><span className="hidden sm:inline">Preview</span></Btn>
          <Btn variant="dark" className="!h-11 !px-3 sm:!px-4" onClick={save} disabled={loading || saveState === 'saving' || saveState === 'conflict' || (!dirty && !!meta)}><Save size={16} /><span className="hidden sm:inline">Save</span></Btn>
          <Btn variant="danger" className="!h-11 !px-3 sm:!px-4" onClick={() => generate('image')} disabled={loading || !!exporting || saveState === 'conflict'} title="Saves the report, then downloads it as an image">
            {exporting === 'image' ? <Loader2 size={16} className="animate-spin" /> : <ImageDown size={16} />} Save &amp; Get Image
          </Btn>
          <Btn variant="primary" className="!h-11 !px-3 sm:!px-4" onClick={() => generate('pdf')} disabled={loading || !!exporting}>
            {exporting === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} PDF
          </Btn>
        </div>
        {(saveErr && saveState !== 'conflict') && <div className="mx-auto max-w-6xl px-4 pb-2"><ErrorText>{saveErr}</ErrorText></div>}
        {toast && <div className="mx-auto max-w-6xl px-4 pb-2"><p className="rounded-xl bg-gray-900 px-3 py-2 text-[12px] font-bold text-white" onClick={() => setToast('')}>{toast}</p></div>}
      </div>

      {/* Off-screen sheet used for Image / PDF */}
      <div aria-hidden="true" style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
        <T1ReportSheet ref={sheetRef} report={report} date={date} branch={branch} outletName={session.outlet.name} />
      </div>

      {panel === 'preview' && <Preview report={report} date={date} branch={branch} outletName={session.outlet.name} onClose={() => setPanel(null)} />}
      {panel === 'history' && (
        <HistorySheet code={code} date={date} branch={branch} onClose={() => setPanel(null)}
          onRestore={(rev) => { edit(() => normalize(rev.data)); setPanel(null); setToast(`Version ${rev.version} loaded. It will be saved as a new version.`); }} />
      )}
    </div>
  );
}

function Preview({ report, date, branch, outletName, onClose }) {
  const wrap = useRef(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const fit = () => setScale(Math.min(1, ((wrap.current?.clientWidth || 600) - 8) / 1200));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <div ref={wrap} className="mx-auto max-w-[1220px] rounded-2xl bg-white p-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-[12px] font-black uppercase tracking-widest text-gray-500">Preview</p>
          <button onClick={onClose} className="rounded-lg px-3 py-1 text-[12px] font-black uppercase text-[#B71C1C] hover:bg-red-50">Close</button>
        </div>
        <div style={{ width: 1200 * scale, height: 'auto', overflow: 'hidden' }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 1200 }}>
            <T1ReportSheet report={report} date={date} branch={branch} outletName={outletName} />
          </div>
        </div>
      </div>
    </div>
  );
}

function HistorySheet({ code, date, branch, onClose, onRestore }) {
  const [revs, setRevs] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    t1Api.history(code, date, branch).then((r) => setRevs(r.revisions)).catch((e) => setErr(e.message));
  }, [code, date, branch]);
  return (
    <Sheet title={`History · ${fmtDate(date)} · ${branch}`} onClose={onClose}>
      <p className="text-[12px] font-semibold text-gray-500">Every save is kept. Load an older version to bring it back (it is saved as a new version; nothing is deleted).</p>
      <ErrorText>{err}</ErrorText>
      {!revs && !err && <div className="flex justify-center py-6"><Loader2 className="animate-spin text-[#B71C1C]" /></div>}
      {revs && revs.map((r, i) => {
        const t = r.data?._totals;
        return (
          <div key={r.version} className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-gray-900">Version {r.version} {i === 0 && <Pill tone="green">Current</Pill>}</p>
              <p className="text-[11px] font-bold text-gray-400">{r.savedBy} · {new Date(r.savedAt).toLocaleString('en-IN')}</p>
              {t && <p className="text-[11px] font-bold text-gray-500">Sales ₹{money(t.sales)} · Collections ₹{money(t.collections)}</p>}
            </div>
            {i > 0 && <Btn variant="soft" className="!h-9 !px-3 !text-[10px]" onClick={() => onRestore(r)}><RotateCcw size={14} /> Load</Btn>}
          </div>
        );
      })}
    </Sheet>
  );
}
