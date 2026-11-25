// T1Owner — owner / admin creates and manages accountant logins for the T1 portal.
// Every call is authorised with the owner's normal Softshape email + password
// (checked by the server, kept only in memory on this screen).
import { useState } from 'react';
import { Loader2, UserPlus, KeyRound, Power } from 'lucide-react';
import { t1Api } from './t1Api';
import { inputCls, Btn, ErrorText, Field, Pill } from './t1Ui';

export default function T1Owner({ code, outletName, onBack, Shell }) {
  const [owner, setOwner] = useState({ ownerEmail: '', ownerPassword: '' });
  const [list, setList] = useState(null);
  const [form, setForm] = useState({ name: '', username: '', password: '' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true); setErr(''); setMsg('');
    try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const refresh = () => run(async () => { const r = await t1Api.ownerList(code, owner); setList(r.accountants); });

  if (!list) {
    return (
      <Shell title="Manage accountants" subtitle={`${outletName} · owner sign in`} onBack={onBack}>
        <Field label="Owner / admin email">
          <input autoFocus value={owner.ownerEmail} onChange={(e) => setOwner({ ...owner, ownerEmail: e.target.value })} className={inputCls} placeholder="owner@example.com" autoCapitalize="none" autoComplete="email" />
        </Field>
        <Field label="Password">
          <input type="password" value={owner.ownerPassword} onChange={(e) => setOwner({ ...owner, ownerPassword: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && refresh()} className={inputCls} placeholder="••••••" autoComplete="current-password" />
        </Field>
        <ErrorText>{err}</ErrorText>
        <Btn variant="danger" className="!h-16 w-full !rounded-[24px]" disabled={busy || !owner.ownerEmail || !owner.ownerPassword} onClick={refresh}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : 'Continue'}
        </Btn>
      </Shell>
    );
  }

  const create = () => run(async () => {
    await t1Api.ownerCreate(code, { ...owner, ...form });
    setMsg(`Login created for ${form.name}. Username: ${form.username}`);
    setForm({ name: '', username: '', password: '' });
    const r = await t1Api.ownerList(code, owner); setList(r.accountants);
  });
  const update = (a, body, done) => run(async () => {
    await t1Api.ownerUpdate(code, a.id, { ...owner, ...body });
    setMsg(done);
    const r = await t1Api.ownerList(code, owner); setList(r.accountants);
  });
  const resetPw = (a) => {
    const p = window.prompt(`New password for ${a.name} (at least 6 characters):`);
    if (p) update(a, { password: p }, `Password changed for ${a.name}.`);
  };

  return (
    <Shell title="Manage accountants" subtitle={outletName} onBack={onBack}>
      <div className="space-y-2">
        {list.length === 0 && <p className="text-center text-sm font-bold text-gray-400">No accountants yet.</p>}
        {list.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-2xl bg-gray-50 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-gray-900">{a.name}</p>
              <p className="text-xs font-bold text-gray-400">@{a.username} {a.isActive ? <Pill tone="green">Active</Pill> : <Pill tone="red">Disabled</Pill>}</p>
            </div>
            <button title="Reset password" disabled={busy} onClick={() => resetPw(a)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-[#B71C1C]"><KeyRound size={15} /></button>
            <button title={a.isActive ? 'Disable' : 'Enable'} disabled={busy} onClick={() => update(a, { isActive: !a.isActive }, `${a.name} ${a.isActive ? 'disabled' : 'enabled'}.`)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-[#B71C1C]"><Power size={15} /></button>
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-3xl border-2 border-gray-50 p-4">
        <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">New accountant login</p>
        <Field label="Full name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Ravi Kumar" /></Field>
        <Field label="Username"><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })} className={inputCls} placeholder="e.g. ravi" autoCapitalize="none" /></Field>
        <Field label="Password (min 6)"><input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} placeholder="password" autoComplete="new-password" /></Field>
        <Btn variant="danger" className="w-full" disabled={busy || !form.name || form.username.length < 3 || form.password.length < 6} onClick={create}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <><UserPlus size={16} /> Create login</>}
        </Btn>
      </div>
      {msg && <p className="rounded-2xl bg-green-50 p-3 text-[13px] font-bold text-green-700">{msg}</p>}
      <ErrorText>{err}</ErrorText>
    </Shell>
  );
}
