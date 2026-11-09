// ─────────────────────────────────────────────────────────────────────────────
// StoreStockPortal — standalone Store Supervisor portal  (route: /store)
// ─────────────────────────────────────────────────────────────────────────────
// Not linked to the admin, cashier, captain or any other portal. The supervisor
// types the Outlet ID (no password) and gets that outlet's store stock book:
//   - add an item once (unit, opening stock, rate)
//   - record purchases (qty + rate, price history is kept)
//   - issue stock to Indian / Chinese / Tandoori / Other kitchens
//   - closing stock carries forward automatically (opening = previous closing)
//   - daily / weekly / monthly reports, downloadable as Excel and PDF
// Data lives in the store_* tables via /api/store-stock/:code/*.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Package, ClipboardList, BarChart3, Settings as Cog, ArrowRight, Loader2 } from 'lucide-react';
import { storeApi } from './storeApi';
import { createBook, fd, istToday } from './storeEngine';
import { StoreCtx } from './storeContext';
import { NameSheet, AddItemSheet, PurchaseSheet, IssueSheet, AdjustSheet, ReverseSheet, RenameSheet, ItemSheet } from './StoreSheets';
import { StockView, ActivityView, ReportsView, SettingsView } from './StoreViews';
import { Btn, ErrorText, inputCls, Label } from './ui';

const LS_CODE = 'softshape.store.code', LS_USER = 'softshape.store.user';
const read = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const write = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* private mode */ } };
const WRITE_SHEETS = new Set(['addItem', 'purchase', 'issue', 'adjust', 'reverse', 'rename']);

// ── Outlet ID entry (Softshape login look, no password) ─────────────────────
function CodeScreen({ initial, onOpen, error, busy }) {
  const [code, setCode] = useState(initial || '');
  const go = () => { if (code.trim()) onOpen(code.trim()); };
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F8F9FA] p-4 font-sans sm:p-6">
      <div className="pointer-events-none absolute right-[-10%] top-[-10%] h-[40%] w-[40%] rounded-full bg-[#E53935]/5 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-[#B71C1C]/5 blur-[120px]" />
      <div className="relative z-10 mx-auto w-full max-w-md rounded-[32px] border border-gray-100 bg-white p-7 shadow-[0_32px_64px_rgba(0,0,0,0.04)] sm:rounded-[44px] sm:p-10">
        <div className="mb-8 text-center">
          <img src="/logo softshape.ai.png" alt="Softshape" className="mx-auto mb-5 h-16 w-auto object-contain" />
          <h2 className="text-lg font-black uppercase leading-none tracking-widest text-gray-900">Store Stock</h2>
          <p className="mt-2 text-xs font-bold uppercase tracking-widest text-gray-400">Enter your Outlet ID</p>
        </div>
        <div className="space-y-5">
          <label className="block">
            <Label>Outlet ID</Label>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && go()}
              className={`${inputCls} text-center !text-lg tracking-[0.2em]`}
              placeholder="OUTLET ID"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <ErrorText>{error}</ErrorText>
          <Btn variant="danger" className="!h-16 w-full !rounded-[24px] !text-sm" disabled={busy || !code.trim()} onClick={go}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : <>Open store <ArrowRight size={18} /></>}
          </Btn>
        </div>
      </div>
    </div>
  );
}

const TABS = [['stock', 'Stock', Package], ['activity', 'Activity', ClipboardList], ['reports', 'Reports', BarChart3], ['settings', 'Settings', Cog]];

export default function StoreStockPortal() {
  const params = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(() => (params.code || read(LS_CODE)).toUpperCase());
  const [data, setData] = useState(null);
  const [opening, setOpening] = useState(false);
  const [openErr, setOpenErr] = useState('');
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState('stock');
  const [user, setUserState] = useState(() => read(LS_USER));
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState({ type: 'ALL', item: '' });
  const codeRef = useRef(code);
  const toastTimer = useRef(null);
  useEffect(() => { codeRef.current = code; }, [code]);

  const setUser = useCallback((n) => { setUserState(n); write(LS_USER, n); }, []);
  const notify = useCallback((msg, kind) => {
    setToast({ msg, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), kind === 'error' ? 4500 : 2200);
  }, []);

  // open / refresh
  const load = useCallback(async (c, { silent } = {}) => {
    if (!silent) { setOpening(true); setOpenErr(''); }
    try {
      const d = await storeApi.state(c);
      setData(d); setOffline(false);
      write(LS_CODE, c);
      if (!silent && params.code && params.code.toUpperCase() !== c) navigate('/store', { replace: true });
      return true;
    } catch (e) {
      if (silent) { if (e.offline) setOffline(true); return false; }
      setOpenErr(e.message || 'Could not open the store.');
      if (e.status === 404) write(LS_CODE, '');
      return false;
    } finally { if (!silent) setOpening(false); }
  }, [navigate, params.code]);

  // first open: a saved code, or the code in /store/:code
  useEffect(() => {
    if (!code) return undefined;
    const t = setTimeout(() => load(code), 0);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // keep two phones in step: refresh every 30 s while visible, and when the tab returns
  useEffect(() => {
    if (!data) return undefined;
    const tick = () => { if (document.visibilityState === 'visible') load(codeRef.current, { silent: true }); };
    const id = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [data, load]);

  const leave = useCallback(() => { write(LS_CODE, ''); setData(null); setCode(''); setSheet(null); setTab('stock'); setOpenErr(''); }, []);

  // ── derived data ───────────────────────────────────────────────────────────
  const depts = data?.depts;
  const book = useMemo(() => (data ? createBook({ items: data.items, entries: data.entries, depts: data.depts }) : null), [data]);
  const people = useMemo(() => (data ? [...new Set(data.entries.map((e) => e.to).filter(Boolean))].sort() : []), [data]);
  const usedDepts = useMemo(() => new Set((data?.entries || []).map((e) => e.dept).filter(Boolean)), [data]);
  const today = data?.today || istToday();

  // ── writes (server is the authority; merge its answer) ────────────────────
  const actions = useMemo(() => ({
    addItem: async (body) => {
      const r = await storeApi.addItem(codeRef.current, body);
      setData((d) => ({ ...d, items: [...d.items, r.item], entries: r.entry ? [...d.entries, r.entry] : d.entries }));
    },
    renameItem: async (id, body) => {
      const r = await storeApi.renameItem(codeRef.current, id, body);
      setData((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? r.item : i)) }));
    },
    addEntry: async (body) => {
      const r = await storeApi.addEntry(codeRef.current, body);
      setData((d) => ({ ...d, entries: [...d.entries, r.entry] }));
      load(codeRef.current, { silent: true }); // pick up the audit line and any other phone's entries
    },
    countMatch: async (body) => { await storeApi.countMatch(codeRef.current, body); load(codeRef.current, { silent: true }); },
    setDepartments: async (list) => {
      const r = await storeApi.setDepartments(codeRef.current, { depts: list, by: read(LS_USER) || user });
      setData((d) => ({ ...d, depts: r.depts }));
      load(codeRef.current, { silent: true });
    },
  }), [load, user]);

  const close = useCallback(() => setSheet(null), []);
  const openSheet = useCallback((type, props = {}) => {
    if (WRITE_SHEETS.has(type) && !read(LS_USER)) { setSheet({ type: 'name', props: { then: { type, props } } }); return; }
    setSheet({ type, props });
  }, []);
  const openActivity = useCallback((itemId) => { setFilter({ type: 'ALL', item: itemId || '' }); setTab('activity'); }, []);

  if (!data) {
    return <CodeScreen initial={code} busy={opening} error={openErr} onOpen={(c) => { setCode(c); load(c); }} />;
  }

  const ctx = { code, outlet: data.outlet, book, today, user, setUser, depts, people, usedDepts, audit: data.audit, actions, notify, close, openSheet, openActivity, leave };
  const S = sheet && {
    name: <NameSheet {...sheet.props} />,
    addItem: <AddItemSheet />,
    purchase: <PurchaseSheet {...sheet.props} />,
    issue: <IssueSheet {...sheet.props} />,
    adjust: <AdjustSheet {...sheet.props} />,
    reverse: <ReverseSheet {...sheet.props} />,
    rename: <RenameSheet {...sheet.props} />,
    item: <ItemSheet {...sheet.props} />,
  }[sheet.type];

  return (
    <StoreCtx.Provider value={ctx}>
      <div className="min-h-screen bg-[#F8F9FA] pb-28 font-sans text-gray-900">
        <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <img src="/logo-square.png" alt="" className="h-9 w-9 rounded-xl object-contain" />
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-black uppercase leading-tight tracking-wider text-gray-900">{data.outlet.name}</h1>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#B71C1C]">Store Stock</p>
              </div>
            </div>
            <p className="shrink-0 text-right text-[11px] font-bold leading-tight text-gray-400">{fd(today)}<br />{user || 'Add your name'}</p>
          </div>
          {offline && <p className="bg-amber-50 px-4 py-1.5 text-center text-[11px] font-black uppercase tracking-wider text-amber-700">No connection · showing last loaded data · entries need internet</p>}
        </header>

        <main className="mx-auto max-w-3xl px-4 pt-4">
          {tab === 'stock' && <StockView />}
          {tab === 'activity' && <ActivityView filter={filter} setFilter={setFilter} />}
          {tab === 'reports' && <ReportsView />}
          {tab === 'settings' && <SettingsView />}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)]" aria-label="Sections">
          <div className="mx-auto grid max-w-3xl grid-cols-4">
            {TABS.map(([k, label, Icon]) => (
              <button key={k} onClick={() => { setTab(k); window.scrollTo(0, 0); }} aria-current={tab === k ? 'page' : undefined}
                className={`flex min-h-[60px] flex-col items-center justify-center gap-1 text-[10px] font-black uppercase tracking-wider transition-colors ${tab === k ? 'text-[#B71C1C]' : 'text-gray-400'}`}>
                <Icon size={22} strokeWidth={tab === k ? 2.4 : 1.8} />
                {label}
              </button>
            ))}
          </div>
        </nav>

        {S}
        {toast && (
          <div role="status" className={`fixed bottom-24 left-1/2 z-[10000] max-w-[90vw] -translate-x-1/2 rounded-2xl px-5 py-3 text-center text-sm font-bold text-white shadow-xl ${toast.kind === 'error' ? 'bg-[#B71C1C]' : 'bg-gray-900'}`}>{toast.msg}</div>
        )}
      </div>
    </StoreCtx.Provider>
  );
}
