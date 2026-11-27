// ─────────────────────────────────────────────────────────────────────────────
// T1Portal — T1 Task Portal: Head Accountant Master Daily Report (route: /t1)
// ─────────────────────────────────────────────────────────────────────────────
// Standalone, like the /store portal: not linked to admin / cashier / captain.
//   1. Outlet ID   2. Accountant login (username + password)
//   3. Pick a date + branch → fill the digital form → it saves to the database
//      (auto-save + Save button; every save is kept as a version, nothing is deleted)
//   4. Generate Image / Generate PDF of the filled form.
//   5. NSNC button → AI assistant over T1 + Store + admin data (T1Nsnc.jsx).
// Owners / admins create accountant logins from "Manage accountants" using their
// normal Softshape email + password.
// Data lives in the t1_* tables via /api/t1/:code/*.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Loader2, LogOut, Users, ArrowLeft, Sparkles } from 'lucide-react';
import { t1Api, getToken, setToken } from './t1Api';
import { inputCls, Btn, ErrorText, Field } from './t1Ui';
import T1Owner from './T1Owner';
import T1Workspace from './T1Workspace';
import T1Nsnc from './T1Nsnc';

const LS_CODE = 'softshape.t1.code';
const read = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const write = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* private mode */ } };

function Shell({ title, subtitle, children, onBack }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F8F9FA] p-4 font-sans sm:p-6">
      <div className="pointer-events-none absolute right-[-10%] top-[-10%] h-[40%] w-[40%] rounded-full bg-[#E53935]/5 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-[#B71C1C]/5 blur-[120px]" />
      <div className="relative z-10 mx-auto w-full max-w-md rounded-[32px] border border-gray-100 bg-white p-7 shadow-[0_32px_64px_rgba(0,0,0,0.04)] sm:rounded-[44px] sm:p-10">
        {onBack && (
          <button onClick={onBack} className="mb-4 flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-[#B71C1C]">
            <ArrowLeft size={14} /> Back
          </button>
        )}
        <div className="mb-8 text-center">
          <img src="/logo softshape.ai.png" alt="Softshape" className="mx-auto mb-5 h-16 w-auto object-contain" />
          <h2 className="text-lg font-black uppercase leading-none tracking-widest text-gray-900">{title}</h2>
          {subtitle && <p className="mt-2 text-xs font-bold uppercase tracking-widest text-gray-400">{subtitle}</p>}
        </div>
        <div className="space-y-5">{children}</div>
      </div>
    </div>
  );
}

function CodeScreen({ initial, onOpen, error, busy }) {
  const [code, setCode] = useState(initial || '');
  const go = () => { if (code.trim()) onOpen(code.trim()); };
  return (
    <Shell title="T1 Task Portal" subtitle="Head Accountant · Daily Report">
      <Field label="Outlet ID">
        <input
          autoFocus value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && go()}
          className={`${inputCls} text-center !text-lg tracking-[0.2em]`}
          placeholder="OUTLET ID" autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off"
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Btn variant="danger" className="!h-16 w-full !rounded-[24px] !text-sm" disabled={busy || !code.trim()} onClick={go}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : <>Continue <ArrowRight size={18} /></>}
      </Btn>
    </Shell>
  );
}

function LoginScreen({ info, onLogin, onOwner, onChangeOutlet }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!username.trim() || !password) return;
    setBusy(true); setErr('');
    try { await onLogin(username.trim(), password); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Shell title={info.outlet.name} subtitle="Accountant sign in" onBack={onChangeOutlet}>
      {!info.hasAccountants && (
        <div className="rounded-2xl bg-amber-50 p-4 text-[13px] font-bold text-amber-800">
          No accountant login exists yet. The owner should open “Manage accountants” below and create one.
        </div>
      )}
      <Field label="Username">
        <input autoFocus value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} className={inputCls} placeholder="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" />
      </Field>
      <Field label="Password">
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} className={inputCls} placeholder="••••••" autoComplete="current-password" />
      </Field>
      <ErrorText>{err}</ErrorText>
      <Btn variant="danger" className="!h-16 w-full !rounded-[24px] !text-sm" disabled={busy || !username.trim() || !password} onClick={go}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : <>Sign in <ArrowRight size={18} /></>}
      </Btn>
      <Btn variant="ghost" className="w-full" onClick={onOwner}><Users size={16} /> Manage accountants (owner)</Btn>
    </Shell>
  );
}

export default function T1Portal() {
  const params = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(() => (params.code || read(LS_CODE)).toUpperCase());
  const [info, setInfo] = useState(null);
  const [session, setSession] = useState(null); // { user, outlet, today }
  const [view, setView] = useState('login'); // login | owner
  const [nsnc, setNsnc] = useState(false);    // NSNC assistant layer open
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const open = useCallback(async (c) => {
    const cc = c.toUpperCase();
    setBusy(true); setErr('');
    try {
      const i = await t1Api.info(cc);
      setInfo(i); setCode(cc); write(LS_CODE, cc);
      if (params.code !== cc) navigate(`/t1/${cc}`, { replace: true });
      if (getToken()) {
        try { setSession(await t1Api.me(cc)); } catch { setToken(''); }
      }
    } catch (e) {
      setErr(e.status === 404 ? 'Outlet ID not found.' : e.message);
      setInfo(null);
    } finally { setBusy(false); }
  }, [navigate, params.code]);

  useEffect(() => {
    if (!code) return undefined;
    const t = setTimeout(() => open(code), 0);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = 'T1 Task Portal · Softshape'; }, []);

  const login = async (username, password) => {
    const r = await t1Api.login(code, { username, password });
    setToken(r.token);
    setSession({ user: r.user, outlet: r.outlet, today: info?.today });
  };
  const logout = () => { setToken(''); setSession(null); setView('login'); setNsnc(false); };
  const changeOutlet = () => { setToken(''); setSession(null); setInfo(null); write(LS_CODE, ''); setCode(''); navigate('/t1', { replace: true }); };

  if (!info) return <CodeScreen initial={code} onOpen={open} error={err} busy={busy} />;
  if (!session) {
    if (view === 'owner') return <T1Owner code={code} outletName={info.outlet.name} onBack={() => { setView('login'); open(code); }} Shell={Shell} />;
    return <LoginScreen info={info} onLogin={login} onOwner={() => setView('owner')} onChangeOutlet={changeOutlet} />;
  }
  return (
    <>
      <T1Workspace
        code={code}
        session={session}
        onSessionExpired={logout}
        headerRight={(
          <>
            <button onClick={() => setNsnc(true)} className="flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-br from-[#C8102E] to-[#7F0E1C] px-3 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-red-100 hover:opacity-90">
              <Sparkles size={14} /> NSNC
            </button>
            <button onClick={logout} className="flex h-10 items-center gap-1.5 rounded-xl border border-gray-100 px-3 text-[11px] font-black uppercase tracking-widest text-gray-500 hover:border-[#E53935] hover:text-[#B71C1C]">
              <LogOut size={14} /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </>
        )}
      />
      {/* NSNC opens as a layer, so the report underneath keeps its unsaved state. */}
      {nsnc && <T1Nsnc code={code} session={session} onClose={() => setNsnc(false)} onSessionExpired={logout} />}
    </>
  );
}
