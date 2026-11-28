// ─────────────────────────────────────────────────────────────────────────────
// T1Nsnc — NSNC, the AI business assistant inside the T1 portal.
// Ask in plain words ("eggs used from 1 to 25 Nov", "how can I increase sales",
// "what gaps do you see"); the answer comes from the business's own data:
// T1 daily reports + Store portal + admin / POS (read-only, via /api/nsnc).
// Opens as a full-screen layer over the report, so the report keeps its state.
// The chat is kept on this device only (localStorage).
// A question runs as a job on the server; this screen polls for the answer.
// The job id is saved with the chat, so closing NSNC, locking the phone or a
// network drop never loses the answer: it is picked up on return. Stop ends it.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Loader2, RotateCcw, Send, Sparkles, Trash2 } from 'lucide-react';
import { nsncApi } from './t1Api';

const SUGGESTIONS = [
  'How many eggs were used from 1st of this month till today?',
  'How can I increase my sales? Give me insights.',
  'What gaps do you see in my sales, store and accounts?',
  'Compare Swiggy and Zomato this month.',
  'Top 10 and least selling items this month.',
  'Expenses this month by category.',
  'Which days and hours are slow for sales?',
  'Any cash shortage in the last 7 days?',
];

const MAX_KEEP = 40;
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v.slice(-MAX_KEEP))); } catch { /* storage full / private mode */ } };
const ddmm = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : d || '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

// Earlier answered questions as context: (question, answer) pairs only.
function historyOf(list) {
  const out = [];
  for (let i = 0; i < list.length - 1; i += 1) {
    const q = list[i];
    const a = list[i + 1];
    if (q.role === 'user' && a.role === 'model' && !a.error && q.text && a.text) {
      out.push({ role: 'user', text: q.text }, { role: 'model', text: a.text });
      i += 1;
    }
  }
  return out.slice(-10);
}

function workingLine(stage, s) {
  const t = s >= 3 ? ` · ${s}s` : '';
  if (stage && stage !== 'Starting') return `${stage}…${t}`;
  return `${s < 6 ? 'Reading your data…' : s < 20 ? 'Analysing…' : 'Working through the numbers…'}${t}`;
}

// ── Tiny, safe Markdown → React (no HTML injection) ─────────────────────────
// The model sometimes writes <br> for a line break (mostly inside table cells):
// show a real line break instead of the tag text.
const brs = (s, kb) => s.split(/<br\s*\/?>/i).flatMap((part, j) => (j ? [<br key={`${kb}-br${j}`} />, part] : [part]));

function inline(text, kb) {
  const out = [];
  // **bold**, `code`, *italic* (italic may contain **bold**)
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*(?=[^*\s])(?:\*\*[^*]+\*\*|[^*])+?\*(?!\*))/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...brs(text.slice(last, m.index), `${kb}-${i++}`));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={`${kb}-${i++}`} className="font-black text-gray-900">{inline(t.slice(2, -2), `${kb}-${i}`)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={`${kb}-${i++}`} className="rounded bg-gray-100 px-1 font-mono text-[12px]">{t.slice(1, -1)}</code>);
    else out.push(<em key={`${kb}-${i++}`} className="text-gray-500">{inline(t.slice(1, -1), `${kb}-${i}`)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(...brs(text.slice(last), `${kb}-${i}`));
  return out;
}

const isRow = (s) => /^\s*\|.*\|\s*$/.test(s);
const isSep = (s) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(s);
const cells = (s) => s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const BULLET = /^\s*[-*•]\s+/, NUM = /^\s*\d+[.)]\s+/, HEAD = /^\s*(#{1,4})\s+(.*)$/, HR = /^\s*([-*_])\1{2,}\s*$/;

function Md({ text }) {
  const blocks = useMemo(() => {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const b = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { i++; continue; }
      if (HR.test(l)) { b.push({ t: 'hr' }); i++; continue; }
      if (isRow(l) && i + 1 < lines.length && isSep(lines[i + 1])) {
        const head = cells(l), rows = [];
        i += 2;
        while (i < lines.length && isRow(lines[i])) { rows.push(cells(lines[i])); i++; }
        b.push({ t: 'table', head, rows });
        continue;
      }
      const h = HEAD.exec(l);
      if (h) { b.push({ t: 'h', level: h[1].length, text: h[2].replace(/\*\*/g, '') }); i++; continue; }
      if (BULLET.test(l)) {
        const items = [];
        while (i < lines.length && BULLET.test(lines[i])) { items.push({ text: lines[i].replace(BULLET, ''), sub: /^\s{2,}/.test(lines[i]) }); i++; }
        b.push({ t: 'ul', items });
        continue;
      }
      if (NUM.test(l)) {
        const items = [];
        while (i < lines.length && NUM.test(lines[i])) { items.push({ n: lines[i].match(/\d+/)[0], text: lines[i].replace(NUM, '') }); i++; }
        b.push({ t: 'ol', items });
        continue;
      }
      const para = [l];
      i++;
      while (i < lines.length && lines[i].trim() && !HEAD.test(lines[i]) && !BULLET.test(lines[i]) && !NUM.test(lines[i]) && !isRow(lines[i]) && !HR.test(lines[i])) { para.push(lines[i]); i++; }
      b.push({ t: 'p', text: para.join('\n') });
    }
    return b;
  }, [text]);

  return (
    <div className="space-y-2.5 text-[14px] leading-relaxed text-gray-700">
      {blocks.map((b, k) => {
        if (b.t === 'hr') return <hr key={k} className="border-gray-100" />;
        if (b.t === 'h') return <p key={k} className={`${b.level <= 2 ? 'text-[15px]' : 'text-[14px]'} pt-1 font-black text-gray-900`}>{inline(b.text, k)}</p>;
        if (b.t === 'p') return <p key={k} className="whitespace-pre-wrap">{inline(b.text, k)}</p>;
        if (b.t === 'ul') {
          return (
            <ul key={k} className="space-y-1">
              {b.items.map((it, j) => (
                <li key={j} className={`flex gap-2 ${it.sub ? 'pl-5' : ''}`}>
                  <span className={`mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full ${it.sub ? 'bg-gray-300' : 'bg-[#C8102E]'}`} />
                  <span className="min-w-0">{inline(it.text, `${k}-${j}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.t === 'ol') {
          return (
            <ol key={k} className="space-y-1.5">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-50 px-1 text-[11px] font-black text-[#B71C1C]">{it.n}</span>
                  <span className="min-w-0">{inline(it.text, `${k}-${j}`)}</span>
                </li>
              ))}
            </ol>
          );
        }
        return (
          <div key={k} className="-mx-1 overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-gray-50">
                <tr>{b.head.map((c, j) => <th key={j} className="whitespace-nowrap px-3 py-2 text-[10.5px] font-black uppercase tracking-wider text-gray-500">{inline(c, `${k}-h${j}`)}</th>)}</tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j} className="border-t border-gray-50">
                    {r.map((c, x) => <td key={x} className={`whitespace-nowrap px-3 py-1.5 ${x > 0 ? 'tabular-nums' : 'font-bold text-gray-800'}`}>{inline(c, `${k}-${j}-${x}`)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function Sources({ list }) {
  if (!list || !list.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {list.slice(0, 8).map((s, i) => (
        <span key={i} className="rounded-full bg-gray-50 px-2.5 py-1 text-[10.5px] font-bold text-gray-500">
          {s.label}{s.search ? ` · ${s.search}` : ''}{s.from ? ` · ${ddmm(s.from)}${s.to && s.to !== s.from ? ` → ${ddmm(s.to)}` : ''}` : ''}
        </span>
      ))}
    </div>
  );
}

function CopyBtn({ text }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <button onClick={copy} className="flex items-center gap-1 text-[10.5px] font-black uppercase tracking-widest text-gray-300 hover:text-[#B71C1C]">
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function T1Nsnc({ code, session, onClose, onSessionExpired }) {
  const key = `softshape.nsnc.${code}.${session?.user?.username || session?.user?.name || 'user'}`;
  const [msgs, setMsgs] = useState(() => read(key));
  const [input, setInput] = useState('');
  const [starting, setStarting] = useState(false);
  const [stage, setStage] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const sendingRef = useRef(false);
  const mountedRef = useRef(true);
  const expiredRef = useRef(onSessionExpired);
  const endRef = useRef(null);
  const boxRef = useRef(null);

  // The question still being worked on (at most one). Its job id lives in the
  // saved chat, so after closing NSNC or reloading, the answer is picked up.
  const last = msgs[msgs.length - 1];
  const pending = last?.role === 'user' && last.job && last.pending ? last : null;
  const busy = starting || !!pending;
  const askedAt = busy && last?.role === 'user' ? last.at : 0;
  const elapsed = askedAt ? Math.max(0, Math.round((now - askedAt) / 1000)) : 0;

  useEffect(() => { expiredRef.current = onSessionExpired; });
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => { write(key, msgs); }, [key, msgs]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    if (!busy) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);

  // Puts the reply right after its question and marks the question answered.
  const settle = useCallback((id, reply) => {
    setMsgs((list) => {
      const i = list.findIndex((m) => m.role === 'user' && m.job === id);
      if (i < 0 || !list[i].pending) return list;
      return [...list.slice(0, i), { ...list[i], pending: false }, { role: 'model', at: Date.now(), ...reply }, ...list.slice(i + 1)];
    });
    setStage('');
  }, []);

  // Waits for the pending answer. Each poll is short (the server holds it up to
  // 20 s), and failures just poll again, so nothing is lost on a flaky network.
  const jobId = pending?.job;
  const jobText = pending?.text;
  useEffect(() => {
    if (!jobId) return undefined;
    let alive = true;
    let ctl = null;
    let v = 0;
    let fails = 0;
    const fail = (text) => settle(jobId, { text, error: true, retry: jobText });
    // Back in the app: poll at once instead of waiting on a request the phone froze.
    const wake = () => { if (document.visibilityState === 'visible') ctl?.abort(); };
    document.addEventListener('visibilitychange', wake);
    (async () => {
      while (alive) {
        ctl = new AbortController();
        try {
          const r = await nsncApi.poll(code, jobId, v, ctl.signal);
          if (!alive) return;
          fails = 0;
          if (r.status === 'working') { v = r.v; setStage(r.stage || ''); continue; }
          if (r.status === 'done') settle(jobId, { text: r.answer, sources: r.sources || [] });
          else fail(r.error || 'Something went wrong. Please try again.');
          return;
        } catch (e) {
          if (!alive) return;
          if (e.status === 401) { expiredRef.current?.(); return; }
          if (e.status === 404) { fail(e.message); return; }
          if (e.aborted || e.timedOut) continue;
          fails += 1;
          if (e.offline) setStage('Waiting for the internet');
          await sleep(Math.min(10000, 1500 * fails));
        }
      }
    })();
    return () => { alive = false; ctl?.abort(); document.removeEventListener('visibilitychange', wake); };
  }, [code, jobId, jobText, settle]);

  const ask = async (q, base = msgs) => {
    const question = String(q || '').trim();
    if (!question || busy || sendingRef.current) return;
    sendingRef.current = true;
    const cid = newId();
    setMsgs([...base, { role: 'user', text: question, at: Date.now(), cid }]);
    setInput('');
    setStarting(true);
    try {
      const r = await nsncApi.start(code, question, historyOf(base));
      const mark = (list) => list.map((m) => (m.cid === cid ? { ...m, job: r.id, pending: true } : m));
      if (mountedRef.current) setMsgs(mark);
      else write(key, mark(read(key))); // NSNC was closed meanwhile: keep the job for next time
      setStage(r.stage || '');
    } catch (e) {
      if (e.status === 401) { expiredRef.current?.(); return; }
      setMsgs((list) => [...list, { role: 'model', text: e.message, error: true, retry: question, at: Date.now() }]);
    } finally {
      sendingRef.current = false;
      setStarting(false);
      setTimeout(() => boxRef.current?.focus(), 0);
    }
  };

  // Retry drops the failed question + error from the chat, then asks again.
  const retry = (m) => {
    const i = msgs.indexOf(m);
    if (i < 0 || busy) return;
    const start = i > 0 && msgs[i - 1].role === 'user' ? i - 1 : i;
    ask(m.retry, [...msgs.slice(0, start), ...msgs.slice(i + 1)]);
  };
  const stop = () => {
    if (!pending) return;
    settle(pending.job, { text: 'Stopped.', error: true, retry: pending.text });
    nsncApi.stop(code, pending.job).catch(() => { /* it also stops when the next question is asked */ });
  };
  const clear = () => { if (!busy && window.confirm('Clear this NSNC chat on this device?')) setMsgs([]); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F8F9FA] font-sans">
      <header className="border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button onClick={onClose} aria-label="Back to report" className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-100 text-gray-500 hover:border-[#E53935] hover:text-[#B71C1C]">
            <ArrowLeft size={18} />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#C8102E] to-[#7F0E1C] text-white"><Sparkles size={18} /></div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black uppercase tracking-wider text-gray-900">NSNC</p>
            <p className="truncate text-[11px] font-bold text-gray-400">AI insights · T1 + Store + Admin data</p>
          </div>
          {msgs.length > 0 && (
            <button onClick={clear} disabled={busy} className="flex h-10 items-center gap-1.5 rounded-xl border border-gray-100 px-3 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:border-[#E53935] hover:text-[#B71C1C] disabled:opacity-40">
              <Trash2 size={14} /> <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
          {msgs.length === 0 && (
            <div className="rounded-[28px] border border-gray-100 bg-white p-6 text-center shadow-[0_16px_40px_rgba(0,0,0,0.03)]">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-3xl bg-red-50 text-[#B71C1C]"><Sparkles size={26} /></div>
              <p className="text-base font-black text-gray-900">Ask NSNC anything about your business</p>
              <p className="mt-1 text-[13px] font-semibold text-gray-400">Sales, Swiggy & Zomato, store consumption, expenses, staff, stock — from your own saved data.</p>
              <div className="mt-5 grid gap-2 text-left sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="rounded-2xl border border-gray-100 bg-gray-50/60 px-4 py-3 text-[13px] font-bold text-gray-700 transition hover:border-[#E53935] hover:bg-white">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m, i) => (m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-[22px] rounded-br-md bg-[#B71C1C] px-4 py-2.5 text-[14px] font-semibold text-white">{m.text}</div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className={`w-full max-w-[95%] rounded-[22px] rounded-bl-md border px-4 py-3.5 ${m.error ? 'border-red-100 bg-red-50/60' : 'border-gray-100 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.03)]'}`}>
                {m.error ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-[13.5px] font-bold text-[#B71C1C]">{m.text}</p>
                    {m.retry && (
                      <button onClick={() => retry(m)} disabled={busy} className="flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#B71C1C] disabled:opacity-40">
                        <RotateCcw size={12} /> Retry
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <Md text={m.text} />
                    <Sources list={m.sources} />
                    <div className="mt-2 flex justify-end"><CopyBtn text={m.text} /></div>
                  </>
                )}
              </div>
            </div>
          )))}

          {busy && (
            <div className="flex justify-start">
              <div className="max-w-[95%] rounded-[22px] rounded-bl-md border border-gray-100 bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[13px] font-bold text-gray-500">
                  <Loader2 size={15} className="shrink-0 animate-spin text-[#B71C1C]" />
                  <span className="min-w-0 flex-1">{workingLine(stage, elapsed)}</span>
                  {pending && (
                    <button onClick={stop} className="shrink-0 rounded-lg border border-gray-100 px-2.5 py-1 text-[10.5px] font-black uppercase tracking-widest text-gray-400 hover:border-[#E53935] hover:text-[#B71C1C]">
                      Stop
                    </button>
                  )}
                </div>
                {elapsed >= 15 && (
                  <p className="mt-1.5 text-[11.5px] font-semibold text-gray-400">You can leave this screen — the answer will be here when you come back.</p>
                )}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </main>

      <footer className="border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)]">
        <form
          className="mx-auto flex max-w-3xl items-end gap-2 px-4 py-3"
          onSubmit={(e) => { e.preventDefault(); ask(input); }}
        >
          <textarea
            ref={boxRef}
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            rows={1}
            placeholder="Ask NSNC… e.g. eggs used from 1 to 25 Nov"
            className="max-h-36 min-h-[52px] flex-1 resize-none rounded-2xl border-2 border-gray-50 bg-gray-50 px-4 py-3.5 text-[15px] font-semibold text-gray-900 outline-none transition-all placeholder:text-gray-300 focus:border-[#E53935] focus:bg-white"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Ask"
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-[#B71C1C] text-white shadow-lg shadow-red-100 transition active:scale-95 disabled:opacity-40"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
        <p className="mx-auto max-w-3xl px-4 pb-2 text-[10.5px] font-semibold text-gray-300">NSNC only reads your data — it never changes anything. Check important numbers before acting.</p>
      </footer>
    </div>
  );
}
