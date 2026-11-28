// ─────────────────────────────────────────────────────────────────────────────
// PortalSelection — Landing page for selecting which portal to log into
//
// Two parts are deliberately frozen and must not be restyled or animated:
//   1. the portal cards (the `portals` array and the card grid that renders
//      it, including onSelect(portal.id)),
//   2. the footer with the large wordmark.
// Everything else is the marketing page around them.
//
// Motion: GSAP (ScrollTrigger + SplitText) with Lenis smooth scrolling, and a
// three.js hero (ReceiptPrinter3D) loaded on demand. Everything degrades to a
// static, fully readable page under prefers-reduced-motion or without WebGL.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { QRCodeSVG } from 'qrcode.react';
import {
  LayoutDashboard, Smartphone, ShoppingCart, UserCog, QrCode, ArrowRight,
  Package, WifiOff, Printer, FileSpreadsheet, Check, ClipboardList,
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger, SplitText);
// Phones resize the viewport when the address bar slides; re-measuring every
// trigger on that is a visible hitch, so skip it.
ScrollTrigger.config({ ignoreMobileResize: true });

const useLayoutEffectSafe = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap';

// Tokens. PAPER, RED, display and mono are also read by the frozen footer.
const RED = '#E3262B';
const RED_DEEP = '#C11C21';
const INK = '#0B0B0C';
const PAPER = '#F3F1EC';

const display = { fontFamily: "'Inter Tight', 'Plus Jakarta Sans', sans-serif" };
const serif = { fontFamily: "'Instrument Serif', Georgia, serif" };
// Monospace is used only where the real thing is monospace: thermal-printed tickets.
const mono = { fontFamily: "'Roboto Mono', ui-monospace, monospace" };

// Browser surfaces (selection, caret, focus) themed from the palette, plus the
// pieces GSAP and Lenis need. Scoped to .ss-l so the portal cards and the
// footer keep their own defaults.
const SURFACE_CSS = `
html.lenis, html.lenis body { height: auto; }
.lenis.lenis-smooth { scroll-behavior: auto !important; }
.lenis.lenis-stopped { overflow: hidden; }
.ss-l ::selection { background: ${RED}; color: #fff; }
.ss-l input, .ss-l textarea { caret-color: ${RED}; }
.ss-l a:focus-visible, .ss-l button:focus-visible {
  outline: 2px solid ${RED}; outline-offset: 3px; border-radius: 9999px;
}
.ss-l input:focus-visible, .ss-l textarea:focus-visible { outline: none; }
.ss-l .tnum { font-variant-numeric: tabular-nums; }
.ss-l [data-hero-reveal] { opacity: 0; animation: ss-failsafe 0.01s 3.5s forwards; }
@keyframes ss-failsafe { to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .ss-l [data-hero-reveal] { opacity: 1; animation: none; } }
.ss-l .ss-word { perspective: 900px; }
.ss-l .ss-char { display: inline-block; }
`;

// Loads the landing-only typefaces once, so other portals don't pay for them.
function useLandingFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const on = () => setReduce(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

// 'full' gets the live 3D hero, 'lite' a pre-rendered poster of it.
// ?motion=full or ?motion=lite in the URL overrides this, to test on a phone.
function detectMotionTier() {
  if (typeof window === 'undefined') return 'lite';
  try {
    const q = new URLSearchParams(window.location.search).get('motion');
    if (q === 'full' || q === 'lite') return q;
  } catch {
    // ignore
  }
  const nav = window.navigator || {};
  const conn = nav.connection || {};
  if (conn.saveData) return 'lite';
  if (/2g|^3g$/.test(conn.effectiveType || '')) return 'lite';
  // deviceMemory and core count are only trusted where deviceMemory exists
  // (Chromium). Safari reports neither reliably, so iPhones rely on the
  // scene's own frame-rate watchdog instead.
  // Chrome rounds RAM down to 0.25/0.5/1/2/4/8 GB, so "< 4" means under 4 GB:
  // budget phones get the poster, mid-range phones (4-7 GB report 4) get the
  // live 3D, still guarded by the watchdog.
  if (typeof nav.deviceMemory === 'number') {
    if (nav.deviceMemory < 4) return 'lite';
    if ((nav.hardwareConcurrency || 8) <= 4) return 'lite';
  }
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'lite';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    // no GPU: the browser is drawing 3D on the CPU
    if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer)) return 'lite';
  } catch {
    return 'lite';
  }
  return 'full';
}

const isTouchDevice = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none), (pointer: coarse)').matches;

const inr = (n) => '₹' + n.toLocaleString('en-IN');

// ── The cashier screen ──────────────────────────────────────────────────────

const BILL = [
  { name: 'Paneer tikka', qty: 1, price: 320, station: 'K' },
  { name: 'Butter naan', qty: 4, price: 200, station: 'K' },
  { name: 'Dal makhani', qty: 1, price: 280, station: 'K' },
  { name: 'Masala chaas', qty: 2, price: 120, station: 'B' },
  { name: 'Draught beer 650 ml', qty: 2, price: 560, station: 'B' },
];

const TABLES = [
  { id: 'T1', s: 'busy' }, { id: 'T2', s: 'free' }, { id: 'T3', s: 'bill' }, { id: 'T4', s: 'busy' },
  { id: 'T5', s: 'active' }, { id: 'T6', s: 'free' }, { id: 'T7', s: 'busy' }, { id: 'T8', s: 'free' },
  { id: 'B1', s: 'busy' }, { id: 'B2', s: 'free' }, { id: 'R1', s: 'bill' }, { id: 'R2', s: 'busy' },
];

const TABLE_TONE = {
  free: 'border-white/10 text-white/45',
  busy: 'border-white/15 bg-white/[0.06] text-white/85',
  bill: 'border-amber-300/40 bg-amber-300/10 text-amber-200',
  active: 'text-white',
};

function Ticket({ title, number, lines, className = '' }) {
  return (
    <div className={`rounded-[3px] bg-[#FBFAF7] px-3.5 pb-3 pt-3 text-[#1A1A1B] shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)] ${className}`} style={mono}>
      <div className="flex justify-between text-[10px]">
        <span className="font-medium">{title}</span>
        <span className="text-black/55">{number}</span>
      </div>
      <p className="mt-0.5 text-[10px] text-black/55">Table 5, 21:42</p>
      <div className="my-2 border-t border-dashed border-black/25" />
      <div className="space-y-1">
        {lines.map((l) => (
          <p key={l.name} className="flex gap-2.5 text-[11px]"><span>{l.qty}</span><span>{l.name}</span></p>
        ))}
      </div>
    </div>
  );
}


// The order for table 5 is keyed in line by line once `play` turns true, then
// the kitchen and bar tickets come off the printers.
function ServiceBoard({ play, reduce }) {
  const [shown, setShown] = useState(reduce ? BILL.length : 0);
  const [printed, setPrinted] = useState(!!reduce);

  useEffect(() => {
    if (reduce || !play) return undefined;
    if (shown < BILL.length) {
      const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 350 : 480);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPrinted(true), 600);
    return () => clearTimeout(t);
  }, [shown, play, reduce]);

  const items = BILL.slice(0, shown);
  const sub = items.reduce((a, b) => a + b.price, 0);
  const gst = Math.round(sub * 0.05);
  const kitchen = BILL.filter((b) => b.station === 'K');
  const bar = BILL.filter((b) => b.station === 'B');
  const enter = 'transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]';

  return (
    <div className="overflow-hidden rounded-[20px] border border-white/10 bg-[#141416] text-white shadow-[0_60px_120px_-50px_rgba(0,0,0,0.9)]">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3.5 text-[12px]">
        <span className="font-medium text-white/80">Cashier, main floor</span>
        <span className="flex items-center gap-2 text-white/60">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Synced
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] lg:grid-cols-[0.85fr_1fr_0.95fr]">
        <div className="border-b border-white/[0.08] p-5 md:border-b-0 md:border-r">
          <p className="mb-3 text-[12px] text-white/60">Floor</p>
          <div className="grid grid-cols-4 gap-2">
            {TABLES.map((t) => (
              <div
                key={t.id}
                className={`tnum flex aspect-square items-center justify-center rounded-lg border text-[12px] font-medium ${TABLE_TONE[t.s]}`}
                style={t.s === 'active' ? { backgroundColor: RED, borderColor: RED } : undefined}
              >
                {t.id}
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12px] text-white/55">8 seated, 2 waiting on the bill, 2 free</p>
        </div>

        <div className="flex flex-col p-5 lg:border-r lg:border-white/[0.08]">
          <div className="mb-3 flex items-baseline justify-between text-[12px]">
            <p className="text-white/60">Table 5, 4 guests</p>
            <p className="tnum text-white/45">Bill 0142</p>
          </div>
          <div className="min-h-[148px] space-y-2.5">
            {BILL.map((it, i) => (
              <div
                key={it.name}
                className={`tnum flex items-center justify-between text-[13px] ${enter} ${i < shown ? 'translate-x-0 opacity-100' : 'translate-x-2.5 opacity-0'}`}
              >
                <span className="text-white/90"><span className="mr-2.5 text-white/45">{it.qty}</span>{it.name}</span>
                <span className="text-white/80">{inr(it.price)}</span>
              </div>
            ))}
          </div>
          <div className="tnum mt-4 space-y-1.5 border-t border-white/10 pt-3.5 text-[12px]">
            <div className="flex justify-between text-white/55"><span>Subtotal</span><span>{inr(sub)}</span></div>
            <div className="flex justify-between text-white/55"><span>GST 5%</span><span>{inr(gst)}</span></div>
            <div className="flex justify-between pt-1 text-[15px] font-medium text-white"><span>Total</span><span>{inr(sub + gst)}</span></div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 text-[12px] font-medium">
            <span className="rounded-lg border border-white/15 py-2.5 text-center text-white/85">Print KOT</span>
            <span className="rounded-lg py-2.5 text-center text-white" style={{ backgroundColor: RED }}>Settle bill</span>
          </div>
        </div>

        <div className="hidden flex-col bg-[#0F0F11] p-5 lg:flex">
          <div className="mb-4 flex items-center justify-between text-[12px]">
            <p className="text-white/60">Printers</p>
            <span className="flex items-center gap-1.5 text-white/45"><Printer size={13} /> 2 online</span>
          </div>
          <div className="relative flex-1">
            <div className={`${enter} ${printed ? 'translate-y-0 opacity-100' : '-translate-y-5 opacity-0'}`}>
              <Ticket title="Kitchen" number="KOT 0142" lines={kitchen} />
            </div>
            <div className={`mt-3 ${enter} delay-200 ${printed ? 'translate-y-0 opacity-100' : '-translate-y-5 opacity-0'}`}>
              <Ticket title="Bar" number="BOT 0088" lines={bar} />
            </div>
            {!printed && <p className="absolute inset-x-0 top-8 text-center text-[12px] text-white/50">Waiting for the order</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hero 3D scene host ──────────────────────────────────────────────────────
// 'full' devices load three.js once the page is idle, so the 3D never competes
// with the first paint or the headline entrance. 'lite' devices, and any device
// whose frame rate collapses while running the scene, get a 21 kB poster of the
// same printer instead. Exposes the scene API through apiRef so the page's GSAP
// timelines can drive printing and camera from scroll.
function HeroScene({ apiRef, reduce, tier }) {
  const hostRef = useRef(null);
  const [poster, setPoster] = useState(tier === 'lite');

  useEffect(() => {
    if (poster) return undefined;
    let disposed = false;
    let api = null;
    const start = () => {
      Promise.all([import('./landing/ReceiptPrinter3D.js'), document.fonts?.ready]).then(([mod]) => {
        if (disposed || !hostRef.current) return;
        try {
          api = mod.createReceiptScene(hostRef.current, {
            reducedMotion: reduce,
            quality: isTouchDevice() || window.innerWidth < 1024 ? 'low' : 'high',
            onDegrade: (level) => {
              // Still too slow at pixel ratio 1: hand over to the poster.
              if (level >= 2 && !disposed) setPoster(true);
            },
          });
          apiRef.current = api;
          if (reduce) api.setPrinted(0.85);
          hostRef.current.dataset.ready = '1';
          window.dispatchEvent(new Event('ss:scene-ready'));
        } catch {
          setPoster(true);
        }
      }).catch(() => setPoster(true));
    };
    const idleId = window.requestIdleCallback ? window.requestIdleCallback(start, { timeout: 1500 }) : window.setTimeout(start, 700);
    return () => {
      disposed = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idleId);
      window.clearTimeout(idleId);
      apiRef.current = null;
      api?.dispose();
    };
  }, [apiRef, reduce, poster]);

  if (poster) {
    return (
      <img
        src="/landing/printer-poster.webp"
        alt=""
        aria-hidden="true"
        decoding="async"
        fetchPriority="low"
        className="absolute inset-0 h-full w-full object-contain object-bottom"
      />
    );
  }
  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="absolute inset-0 opacity-0 transition-opacity duration-[1400ms] data-[ready='1']:opacity-100"
    />
  );
}

// Elements marked data-magnetic drift toward the pointer.
function bindMagnetic(scope) {
  const offs = [];
  scope.querySelectorAll('[data-magnetic]').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
    const move = (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.28);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.4);
    };
    const leave = () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' });
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    offs.push(() => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    });
  });
  return () => offs.forEach((f) => f());
}

// ── One night of service: product-specific moments, in time order ────────────

function MenuArt() {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2.5 rounded-lg bg-white px-3.5 py-2.5 text-[13px] text-black/80 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <FileSpreadsheet size={15} className="text-emerald-700" />
        <span>tonight-specials.xlsx</span>
        <span className="tnum ml-auto text-black/55">12 items</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {['Starters', 'Tandoor', 'Curries', 'Biryani', 'Breads', 'Bar'].map((c) => (
          <span key={c} className="rounded-full border border-black/10 bg-white/70 px-3 py-1 text-[12px] text-black/70">{c}</span>
        ))}
      </div>
    </div>
  );
}

function QrArt() {
  return (
    <div className="flex items-center gap-5">
      <div className="rounded-xl bg-white p-2.5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.3)]">
        <QRCodeSVG value="https://softshape.ai" size={76} fgColor={INK} bgColor="#ffffff" level="M" />
      </div>
      <div className="space-y-1 text-[13px]">
        <p className="text-black/60">Table 7 scanned the menu</p>
        <p className="text-black/85">2 items added to the order</p>
        <p className="font-medium" style={{ color: RED_DEEP }}>Sent to the captain</p>
      </div>
    </div>
  );
}

function PrintArt() {
  return (
    <div className="flex items-start gap-3">
      <div className="-rotate-2 w-1/2"><Ticket title="Kitchen" number="KOT 0151" lines={[{ name: 'Chicken 65', qty: 2 }, { name: 'Jeera rice', qty: 1 }]} /></div>
      <div className="mt-3 rotate-1 w-1/2"><Ticket title="Bar" number="BOT 0093" lines={[{ name: 'Fresh lime soda', qty: 2 }]} /></div>
    </div>
  );
}

function OfflineArt() {
  const rows = [['0163', 1240, true], ['0164', 860, true], ['0165', 2315, false]];
  return (
    <div className="space-y-2">
      {rows.map(([n, amt, done]) => (
        <div key={n} className="tnum flex items-center justify-between rounded-lg bg-white px-3.5 py-2.5 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <span className="text-black/80">Bill {n}<span className="ml-3 text-black/55">{inr(amt)}</span></span>
          <span className={`flex items-center gap-1.5 ${done ? 'text-emerald-700' : 'text-black/55'}`}>
            {done ? <><Check size={13} /> Synced</> : <><WifiOff size={13} /> Saved offline</>}
          </span>
        </div>
      ))}
    </div>
  );
}

function LedgerArt() {
  const rows = [
    { n: 'Single malt, 750 ml', left: '9 pegs left', v: 72 },
    { n: 'Premium whisky, 750 ml', left: '5 pegs left', v: 41 },
    { n: 'Draught beer, 650 ml', left: '22 bottles left', v: 88 },
  ];
  return (
    <div className="space-y-3.5">
      {rows.map((r) => (
        <div key={r.n}>
          <div className="tnum flex justify-between text-[13px]"><span className="text-black/80">{r.n}</span><span className="text-black/55">{r.left}</span></div>
          <div className="mt-1.5 h-[3px] rounded-full bg-black/10">
            <div className="h-[3px] rounded-full" style={{ width: `${r.v}%`, backgroundColor: r.v < 50 ? RED : INK }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CloseArt() {
  const rows = [['Food', 48210], ['Bar', 61940], ['Covers', 186, true]];
  return (
    <div className="tnum">
      <p className="text-[13px] text-black/60">Day close, Friday</p>
      <p data-count="110150" className="mt-1 text-[34px] font-medium leading-none tracking-[-0.03em]">{inr(110150)}</p>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-black/10 pt-3 text-[13px]">
        {rows.map(([k, v, plain]) => (
          <div key={k}><p className="text-black/55">{k}</p><p className="mt-0.5 text-black/85">{plain ? v : inr(v)}</p></div>
        ))}
      </div>
    </div>
  );
}


// Evening of service. Panels darken as the night goes on; the lights go out
// with the internet at 9:15.
const NIGHT = [
  { time: '6:40', ampm: 'pm', title: 'The specials go on the menu', body: 'Upload a spreadsheet or edit items by hand. Prices, variants and categories update on every device at once.', Art: MenuArt, bg: '#ECE7DD', dark: false },
  { time: '7:42', ampm: 'pm', title: 'Table 7 orders from their phones', body: 'Guests scan the table QR, browse the menu and add items. The order lands with the captain for confirmation.', Art: QrArt, bg: '#E3DBCC', dark: false },
  { time: '7:43', ampm: 'pm', title: 'Each ticket reaches the right printer', body: 'Food goes to the kitchen, drinks go to the bar. Nobody walks a paper slip across the floor.', Art: PrintArt, bg: '#D7CDBA', dark: false },
  { time: '9:15', ampm: 'pm', title: 'The internet drops. Billing does not.', body: 'Bills, tickets and payments keep working offline and sync on their own when the connection returns.', Art: OfflineArt, bg: '#1D1D20', dark: true },
  { time: '11:30', ampm: 'pm', title: 'Bar stock counts itself', body: 'Every peg and bottle sold is deducted from stock, so the closing count matches the ledger.', Art: LedgerArt, bg: '#151517', dark: true },
  { time: '11:55', ampm: 'pm', title: 'The day closes, and the owner sees it from home', body: 'Sales by section, top items and captain performance, live from every outlet you run.', Art: CloseArt, bg: INK, dark: true },
];

const STEPS = [
  { t: 'Create your restaurant', b: 'Answer a few questions about your outlet, its tables and its taxes.', bg: '#18181A', fg: '#fff' },
  { t: 'Bring your menu', b: 'Upload your spreadsheet or add items by hand, then assign printers and sections.', bg: '#232326', fg: '#fff' },
  { t: 'Start billing', b: 'Open the cashier panel, give your captains the app, and take the first order.', bg: RED, fg: '#fff' },
];

// ─────────────────────────────────────────────────────────────────────────────

const PortalSelection = ({ onSelect }) => {
  const isDesktopApp = typeof window !== 'undefined' && !!window.__TAURI__;
  useLandingFonts();
  const reduce = usePrefersReducedMotion();
  const [tier] = useState(detectMotionTier);
  const rootRef = useRef(null);
  const sceneApi = useRef(null);
  const [boardPlay, setBoardPlay] = useState(false);

  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
  });

  const handleWhatsAppSend = (e) => {
    e.preventDefault();
    const { name, email, phone, message } = contactForm;
    const text = `Hello Softshape Team,\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\n\nMessage:\n${message || 'I am interested in Softshape POS.'}`;
    const url = `https://wa.me/919391798370?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const portals = [
    {
      id: 'admin',
      title: 'Admin Portal',
      description: 'Management suite for revenue, surveillance, and global analytics.',
      icon: UserCog,
      color: '#E53935',
    },
    {
      id: 'cashier',
      title: 'Cashier Panel',
      description: 'Operational interface for billing, payments, and order fulfillment.',
      icon: ShoppingCart,
      color: '#B71C1C',
    },
    {
      id: 'captain',
      title: 'Captain App',
      description: 'Field-ready interface for table orders and service tracking.',
      icon: Smartphone,
      color: '#B71C1C',
    },
    {
      id: 'user-menu',
      title: 'User Menu View',
      description: 'Interactive QR-based dining experience.',
      icon: QrCode,
      color: '#B71C1C',
    },
    {
      id: 'manager',
      title: 'Manager Portal',
      description: 'Shift, staff, and operations oversight for floor managers.',
      icon: LayoutDashboard,
      color: '#B71C1C',
    },
    {
      id: 'store',
      title: 'Store Stock',
      description: 'Store supervisor book: purchases, issues to kitchens, closing stock and reports.',
      icon: Package,
      color: '#B71C1C',
    },
    {
      id: 't1',
      title: 'T1 Portal',
      description: 'Head Accountant daily report: sales, payouts, cash and checks, with the NSNC AI assistant.',
      icon: ClipboardList,
      color: '#B71C1C',
    },
  ];

  // ── Motion ────────────────────────────────────────────────────────────────
  // Layout effect so GSAP reverts its pin wrappers before React removes the DOM.
  useLayoutEffectSafe(() => {
    const root = rootRef.current;
    if (!root || reduce) return undefined;
    let alive = true;
    let ctx = null;
    let lenis = null;
    let tick = null;
    let unbindMagnetic = null;
    let offPointer = null;

    const fontsReady = Promise.race([
      Promise.all([
        document.fonts?.load("500 64px 'Inter Tight'"),
        document.fonts?.load("italic 400 64px 'Instrument Serif'"),
      ]).catch(() => {}),
      new Promise((r) => setTimeout(r, 2500)),
    ]);

    fontsReady.then(() => {
      if (!alive) return;

      const touch = isTouchDevice();
      // Smooth scrolling only with a mouse or trackpad on a capable device;
      // phones and lite devices keep native scrolling, which is the cheapest.
      if (!touch && tier === 'full') {
        lenis = new Lenis({ lerp: 0.085, anchors: true, wheelMultiplier: 0.95 });
        lenis.on('scroll', ScrollTrigger.update);
        tick = (time) => lenis.raf(time * 1000);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);
      }
      if (!touch) unbindMagnetic = bindMagnetic(root);

      ctx = gsap.context(() => {
        const mm = gsap.matchMedia();
        const hero = root.querySelector('[data-hero]');

        // Hero: one orchestrated entrance.
        gsap.set('[data-hero-reveal]', { opacity: 1, animation: 'none' });
        const title = SplitText.create('[data-hero-title]', { type: 'words,chars', wordsClass: 'ss-word', charsClass: 'ss-char' });
        gsap.timeline({ defaults: { ease: 'expo.out' } })
          .fromTo('[data-hero-nav] > *', { y: -18, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: 0.07 }, 0.1)
          .from(title.chars, {
            yPercent: 120, rotateX: -100, opacity: 0, duration: 1.4, stagger: 0.022,
            transformOrigin: '50% 100% -40px',
          }, 0.2)
          .fromTo('[data-hero-sub] > *', { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, stagger: 0.09 }, 0.75);

        // Printer: prints the first 60% on load, the rest is driven by scroll.
        const st = { intro: 0, scroll: 0 };
        const push = () => {
          const api = sceneApi.current;
          if (!api) return;
          api.setPrinted(st.intro + st.scroll * 0.4);
          api.setScroll(st.scroll);
        };
        const startPrint = () => gsap.to(st, { intro: 0.6, duration: 3.6, delay: 0.5, ease: 'power2.inOut', onUpdate: push });
        if (sceneApi.current) startPrint();
        else window.addEventListener('ss:scene-ready', startPrint, { once: true });

        const onMove = (e) => sceneApi.current?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
        hero.addEventListener('pointermove', onMove);
        offPointer = () => hero.removeEventListener('pointermove', onMove);

        ScrollTrigger.create({
          trigger: hero, start: 'top bottom', end: 'bottom top',
          onToggle: (self) => sceneApi.current?.setActive(self.isActive),
        });

        mm.add('(min-width: 1024px)', () => {
          gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: '+=110%', pin: true, pinSpacing: true, scrub: 1 } })
            .to(st, { scroll: 1, ease: 'none', onUpdate: push }, 0)
            .to('[data-hero-copy]', { yPercent: -14, opacity: 0, ease: 'power2.in', duration: 0.55 }, 0.45);
        });
        mm.add('(max-width: 1023px)', () => {
          gsap.to(st, { scroll: 1, ease: 'none', onUpdate: push, scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 1 } });
        });

        // Headings: masked line reveals.
        root.querySelectorAll('[data-lines]').forEach((el) => {
          SplitText.create(el, {
            type: 'lines', mask: 'lines', autoSplit: true,
            onSplit: (self) => gsap.from(self.lines, {
              yPercent: 110, duration: 1.2, stagger: 0.09, ease: 'expo.out',
              scrollTrigger: { trigger: el, start: 'top 86%', once: true },
            }),
          });
        });
        root.querySelectorAll('[data-fade]').forEach((el) => {
          gsap.fromTo(el, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
        });

        // The cashier screen tilts up out of the page, then the order plays.
        const board = root.querySelector('[data-board]');
        // Hinged at the bottom edge: the screen lies back, then stands up to face you.
        mm.add({ wide: '(min-width: 768px)', narrow: '(max-width: 767px)' }, (c) => {
          gsap.fromTo(board,
            { rotateX: c.conditions.wide ? 40 : 22, scale: c.conditions.wide ? 0.84 : 0.92, transformOrigin: '50% 100%' },
            { rotateX: 0, scale: 1, ease: 'none', scrollTrigger: { trigger: '[data-board-section]', start: 'top 85%', end: c.conditions.wide ? 'center 60%' : 'top 10%', scrub: 1 } });
        });
        ScrollTrigger.create({ trigger: board, start: 'top 45%', once: true, onEnter: () => setBoardPlay(true) });

        const countUp = (el) => {
          const o = { v: 0 };
          gsap.to(o, { v: Number(el.dataset.count), duration: 2, ease: 'power3.out', onUpdate: () => { el.textContent = inr(Math.round(o.v)); } });
        };

        // One Friday night: horizontal on desktop, stacked on small screens.
        mm.add('(min-width: 1024px)', () => {
          const section = root.querySelector('[data-night]');
          const track = root.querySelector('[data-night-track]');
          const dist = () => track.scrollWidth - window.innerWidth;
          const horizontal = gsap.to(track, {
            x: () => -dist(), ease: 'none',
            scrollTrigger: { trigger: section, start: 'top top', end: () => `+=${dist()}`, pin: true, pinSpacing: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 },
          });
          gsap.fromTo('[data-night-progress]', { scaleX: 0 }, {
            scaleX: 1, ease: 'none',
            scrollTrigger: { trigger: section, start: 'top top', end: () => `+=${dist()}`, scrub: true, invalidateOnRefresh: true },
          });
          section.querySelectorAll('[data-panel]').forEach((panel) => {
            const art = panel.querySelector('[data-art]');
            const time = panel.querySelector('[data-time]');
            if (art) {
              gsap.fromTo(art, { y: 140, rotate: 5, opacity: 0 }, {
                y: 0, rotate: 0, opacity: 1, ease: 'none',
                scrollTrigger: { trigger: panel, containerAnimation: horizontal, start: 'left 90%', end: 'left 30%', scrub: true },
              });
            }
            if (time) {
              gsap.fromTo(time, { xPercent: 30 }, {
                xPercent: -20, ease: 'none',
                scrollTrigger: { trigger: panel, containerAnimation: horizontal, start: 'left right', end: 'right left', scrub: true },
              });
            }
            panel.querySelectorAll('[data-count]').forEach((el) => {
              ScrollTrigger.create({ trigger: panel, containerAnimation: horizontal, start: 'left 55%', once: true, onEnter: () => countUp(el) });
            });
          });
        });
        mm.add('(max-width: 1023px)', () => {
          root.querySelectorAll('[data-panel] [data-art]').forEach((art) => {
            gsap.fromTo(art, { y: 60, rotate: 2, opacity: 0 }, { y: 0, rotate: 0, opacity: 1, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: art, start: 'top 88%', once: true } });
          });
          root.querySelectorAll('[data-panel] [data-count]').forEach((el) => {
            ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: () => countUp(el) });
          });
        });

        // Steps stack like tickets on a spike.
        const steps = gsap.utils.toArray(root.querySelectorAll('[data-step]'));
        steps.forEach((card, i) => {
          if (i === steps.length - 1) return;
          // scale and an overlay's opacity are both compositor-only; a CSS
          // filter here would repaint the whole card every frame
          const tl = gsap.timeline({ scrollTrigger: { trigger: steps[i + 1], start: 'top 85%', end: 'top 20%', scrub: true } });
          tl.to(card, { scale: 0.93, ease: 'none' }, 0)
            .to(card.querySelector('[data-step-shade]'), { opacity: 0.32, ease: 'none' }, 0);
        });

        // Scroll velocity gives the big numerals a little lean.
        const lean = gsap.utils.toArray(root.querySelectorAll('[data-lean]'));
        if (lean.length && !touch) {
          const setSkew = gsap.quickTo(lean, 'skewX', { duration: 0.6, ease: 'power3.out' });
          let settle = null;
          ScrollTrigger.create({
            onUpdate: (self) => {
              setSkew(gsap.utils.clamp(-8, 8, self.getVelocity() / -300));
              // straighten up once scrolling stops
              settle?.kill();
              settle = gsap.delayedCall(0.12, () => setSkew(0));
            },
          });
        }
      }, root);

      requestAnimationFrame(() => ScrollTrigger.refresh());
      window.addEventListener('ss:scene-ready', () => ScrollTrigger.refresh(), { once: true });
    });

    return () => {
      alive = false;
      offPointer?.();
      unbindMagnetic?.();
      ctx?.revert();
      if (tick) gsap.ticker.remove(tick);
      lenis?.destroy();
    };
  }, [reduce, tier]);

  const fieldCls =
    'w-full border-0 border-b border-white/25 bg-transparent px-0 pb-3 pt-1 text-[16px] text-white outline-none transition-colors placeholder:text-white/50 hover:border-white/45 focus:border-white';
  const labelCls = 'block text-[13px] text-white/65';
  const h2 = 'text-balance text-[clamp(2.2rem,4.6vw,4rem)] font-medium leading-[1] tracking-[-0.04em]';

  return (
    <div ref={rootRef} className="ss-l min-h-screen flex flex-col overflow-x-clip antialiased" style={{ backgroundColor: PAPER, color: INK }} data-desktop={isDesktopApp || undefined}>
      <style>{SURFACE_CSS}</style>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section data-hero className="relative overflow-hidden text-white lg:h-[100svh] lg:min-h-[680px]" style={{ ...display, backgroundColor: INK }}>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[56svh] lg:inset-y-0 lg:left-[44%] lg:right-0 lg:h-auto">
          <HeroScene apiRef={sceneApi} reduce={reduce} tier={tier} />
        </div>

        <nav data-hero-nav className="relative z-20 mx-auto flex max-w-[1360px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
          <Link to="/" className="flex items-center gap-3 rounded-lg">
            <img src="/logo softshape.ai.png" alt="" className="h-9 w-9 rounded-[10px]" />
            <span className="text-[17px] font-semibold tracking-tight">softshape</span>
          </Link>
          <div className="hidden items-center gap-8 text-[14px] text-white/70 md:flex">
            <a href="#portals" className="transition-colors hover:text-white">Portals</a>
            <a href="#night" className="transition-colors hover:text-white">How it works</a>
            <Link to="/support" className="transition-colors hover:text-white">Support</Link>
            <a href="#contact" className="transition-colors hover:text-white">Contact</a>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/manager"
              className="whitespace-nowrap rounded-full px-3 py-2 text-[14px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:px-4"
            >
              Manager<span className="hidden sm:inline"> login</span>
            </Link>
            <Link
              to="/onboarding/legacy"
              className="whitespace-nowrap rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-black transition-colors hover:bg-white/85"
            >
              Get started
            </Link>
          </div>
        </nav>

        <div data-hero-copy className="relative z-10 mx-auto flex max-w-[1360px] flex-col px-5 pb-[60svh] pt-10 sm:px-8 lg:h-[calc(100%-80px)] lg:justify-center lg:px-12 lg:pb-16 lg:pt-0">
          <div data-hero-reveal className="max-w-[40rem]">
            <h1 data-hero-title className="text-[clamp(3rem,7vw,6rem)] font-medium leading-[0.95] tracking-[-0.04em] [perspective:900px]">
              Every table,<br />every ticket,<br /><span style={{ ...serif, fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.01em' }}>every peg.</span>
            </h1>
            <div data-hero-sub className="mt-8">
              <p className="inline-flex items-center gap-2.5 text-[14px] text-white/70">
                <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold text-white" style={{ backgroundColor: RED }}>Free</span>
                for the first 200 restaurants that sign up
              </p>
              <p className="mt-5 max-w-[30rem] text-[17px] leading-[1.6] text-white/70">
                Softshape runs billing, kitchen tickets, bar stock and QR ordering for restaurants, cafes and bars across India, and keeps running when the internet doesn't.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to="/onboarding/legacy"
                  data-magnetic
                  className="inline-flex items-center justify-center rounded-full px-7 py-4 text-[15px] font-semibold text-white transition-colors hover:bg-[#C11C21]"
                  style={{ backgroundColor: RED }}
                >
                  Create your restaurant
                </Link>
                <Link
                  to="/edge-setup"
                  className="inline-flex items-center justify-center rounded-full px-5 py-4 text-[15px] font-medium text-white/85 underline decoration-white/30 underline-offset-[6px] transition-colors hover:text-white hover:decoration-white"
                >
                  Link an existing restaurant
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── The cashier screen ───────────────────────────────────────────── */}
      <section data-board-section className="relative px-5 pb-28 pt-24 text-white sm:px-8 lg:px-12 lg:pb-40 lg:pt-32" style={{ ...display, backgroundColor: INK }}>
        <div className="mx-auto max-w-[1360px]">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
            <h2 data-lines className={h2}>Your whole floor, on one screen.</h2>
            <p data-fade className="max-w-md text-[16px] leading-[1.6] text-white/65 lg:justify-self-end">
              Tables, the running bill and both printers, live. Tap a table, add items, and the tickets print where they should.
            </p>
          </div>
          <div className="mt-14 [perspective:2000px] lg:mt-20">
            <div data-board className="will-change-transform">
              <ServiceBoard play={boardPlay || reduce} reduce={reduce} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Portals ──────────────────────────────────────────────────────── */}
      <section id="portals" className="relative z-10 scroll-mt-6 px-6 py-24 lg:px-16 lg:py-32" style={{ backgroundColor: PAPER }}>
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-end" style={display}>
            <h2 data-lines className="text-balance text-[clamp(2.1rem,4.2vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.035em]">
              One platform. A screen for every role on the floor.
            </h2>
            <p data-fade className="max-w-md text-[16px] leading-[1.6] text-black/65 lg:justify-self-end">
              Pick your portal to sign in. Everyone works from the same live orders, tables and stock.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {portals.map((portal) => {
              const Icon = portal.icon;
              return (
                <button
                  key={portal.id}
                  onClick={() => onSelect(portal.id)}
                  className="group flex h-full flex-col items-start rounded-xl border border-gray-100 bg-white p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-gray-200 hover:shadow-lg"
                >
                  <div
                    className="mb-4 rounded-lg p-3 text-white transition-transform duration-200 group-hover:scale-105"
                    style={{ backgroundColor: portal.color }}
                  >
                    <Icon size={24} strokeWidth={2} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{portal.title}</h3>
                  <p className="mt-2 flex-grow text-sm leading-relaxed text-gray-500">{portal.description}</p>
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-[#E53935]">
                    Open Portal <ArrowRight size={14} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── One Friday night ─────────────────────────────────────────────── */}
      <section id="night" data-night className="relative scroll-mt-0 overflow-hidden lg:h-[100svh]" style={display}>
        <div data-night-track className="flex flex-col lg:h-full lg:w-max lg:flex-row">
          <div data-panel className="flex flex-col justify-end px-5 pb-16 pt-24 sm:px-8 lg:h-full lg:w-[46vw] lg:px-12 lg:pb-24" style={{ backgroundColor: PAPER }}>
            <h2 data-lines className="max-w-[12ch] text-[clamp(2.6rem,5.4vw,5.2rem)] font-medium leading-[0.98] tracking-[-0.04em]">
              One Friday night, start to close.
            </h2>
            <p data-fade className="mt-6 max-w-sm text-[16px] leading-[1.6] text-black/65">
              What Softshape is doing in the background while your team serves a full house.
            </p>
          </div>

          {NIGHT.map(({ time, ampm, title, body, Art, bg, dark }) => (
            <article
              key={time}
              data-panel
              className={`relative grid grid-cols-1 content-center gap-10 overflow-hidden px-5 py-20 sm:px-8 lg:h-full lg:w-[78vw] lg:max-w-[1180px] lg:grid-cols-[1fr_1fr] lg:gap-16 lg:px-14 lg:py-0 ${dark ? 'text-white' : 'text-[#0B0B0C]'}`}
              style={{ backgroundColor: bg }}
            >
              <div className="relative">
                <p data-time className="tnum whitespace-nowrap text-[clamp(4.5rem,11vw,10rem)] font-medium leading-[0.85] tracking-[-0.05em]">
                  <span data-lean className="inline-block" style={{ color: dark ? '#fff' : RED_DEEP }}>{time}</span>
                  <span className={`ml-3 align-top text-[0.22em] tracking-normal ${dark ? 'text-white/60' : 'text-black/55'}`}>{ampm}</span>
                </p>
                <h3 className="mt-8 max-w-[22ch] text-balance text-[clamp(1.5rem,2.2vw,2rem)] font-semibold leading-[1.15] tracking-[-0.02em]">{title}</h3>
                <p className={`mt-4 max-w-[36ch] text-[16px] leading-[1.6] ${dark ? 'text-white/70' : 'text-black/65'}`}>{body}</p>
              </div>
              <div
                data-art
                className={`self-center rounded-[22px] p-6 text-[#0B0B0C] sm:p-8 ${dark ? '' : 'shadow-[0_30px_60px_-35px_rgba(60,40,10,0.45)]'}`}
                style={{ backgroundColor: dark ? PAPER : '#FBFAF7' }}
              >
                <Art />
              </div>
            </article>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-5 bottom-8 hidden h-[2px] overflow-hidden bg-white/25 mix-blend-difference sm:inset-x-8 lg:inset-x-12 lg:block">
          <div data-night-progress className="h-full origin-left bg-white" />
        </div>
      </section>

      {/* ── Getting started ──────────────────────────────────────────────── */}
      <section className="relative px-5 pb-24 pt-24 text-white sm:px-8 lg:px-12 lg:pb-32 lg:pt-32" style={{ ...display, backgroundColor: INK }}>
        <div className="mx-auto max-w-[1360px]">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
            <h2 data-lines className={h2}>Three steps to your first bill.</h2>
            <div data-fade className="flex flex-col gap-3 sm:flex-row lg:justify-self-end">
              <Link
                to="/onboarding/legacy"
                data-magnetic
                className="inline-flex items-center justify-center rounded-full bg-white px-7 py-4 text-[15px] font-semibold text-black transition-colors hover:bg-white/85"
              >
                Create your restaurant
              </Link>
              <Link
                to="/edge-setup"
                className="inline-flex items-center justify-center rounded-full px-5 py-4 text-[15px] font-medium text-white/85 underline decoration-white/30 underline-offset-[6px] transition-colors hover:text-white hover:decoration-white"
              >
                Link an existing restaurant
              </Link>
            </div>
          </div>

          <ol className="mt-16 lg:mt-24">
            {STEPS.map((s, i) => (
              <li
                key={s.t}
                data-step
                className="sticky mb-6 grid min-h-[52vh] grid-cols-1 content-between gap-10 rounded-[28px] p-8 will-change-transform sm:p-12 lg:grid-cols-[1fr_1.2fr] lg:content-stretch lg:p-16"
                style={{ backgroundColor: s.bg, color: s.fg, top: `calc(10vh + ${i * 22}px)` }}
              >
                <span data-step-shade aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[28px] bg-black opacity-0" />
                <p data-lean className="tnum text-[clamp(7rem,16vw,15rem)] font-medium leading-[0.8] tracking-[-0.06em]" style={{ color: i === 2 ? '#fff' : RED }}>
                  {i + 1}
                </p>
                <div className="flex flex-col justify-end">
                  <h3 className="text-[clamp(1.8rem,3.2vw,3rem)] font-semibold leading-[1.05] tracking-[-0.03em]">{s.t}</h3>
                  <p className={`mt-4 max-w-md text-[17px] leading-[1.6] ${i === 2 ? 'text-white/90' : 'text-white/65'}`}>{s.b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Contact ──────────────────────────────────────────────────────── */}
      <section id="contact" className="scroll-mt-6 px-5 py-24 sm:px-8 lg:px-12 lg:py-32" style={{ ...display, backgroundColor: PAPER }}>
        <div className="mx-auto max-w-[1360px] overflow-hidden rounded-[28px] text-white" style={{ backgroundColor: '#141416' }}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr]">
            <div className="flex flex-col justify-between gap-14 p-8 sm:p-12 lg:p-16">
              <div>
                <h2 data-lines className="text-balance text-[clamp(2.3rem,4.6vw,4rem)] font-medium leading-[1] tracking-[-0.04em]">
                  Let's set up your restaurant.
                </h2>
                <p data-fade className="mt-6 max-w-md text-[16px] leading-[1.6] text-white/70">
                  Tell us about your outlet and we'll reply on WhatsApp.
                </p>
              </div>

              <dl className="flex flex-col gap-8 text-[15px] sm:flex-row sm:flex-wrap sm:gap-x-12">
                <div>
                  <dt className="text-[13px] text-white/55">Email</dt>
                  <dd className="mt-2">
                    <a href="mailto:softshapeai@gmail.com" className="whitespace-nowrap text-white/90 underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-white">softshapeai@gmail.com</a>
                  </dd>
                </div>
                <div>
                  <dt className="text-[13px] text-white/55">Phone</dt>
                  <dd className="tnum mt-2 flex flex-col gap-1">
                    <a href="tel:9391798370" className="text-white/90 transition-colors hover:text-white">93917 98370</a>
                    <a href="tel:9381872579" className="text-white/90 transition-colors hover:text-white">93818 72579</a>
                  </dd>
                </div>
                <div>
                  <dt className="text-[13px] text-white/55">Founders</dt>
                  <dd className="mt-2 leading-[1.6] text-white/90">
                    T. Vinod Chowdary<br />
                    N. Varun Kumar<br />
                    V. Akhil
                  </dd>
                </div>
              </dl>
            </div>

            <form onSubmit={handleWhatsAppSend} className="flex flex-col gap-7 border-t border-white/10 p-8 sm:p-12 lg:border-l lg:border-t-0 lg:p-16">
              <div className="grid grid-cols-1 gap-7 sm:grid-cols-2">
                <label className="block">
                  <span className={labelCls}>Your name</span>
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    value={contactForm.name}
                    onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                    className={`${fieldCls} mt-2`}
                  />
                </label>
                <label className="block">
                  <span className={labelCls}>Email</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                    className={`${fieldCls} mt-2`}
                  />
                </label>
              </div>
              <label className="block">
                <span className={labelCls}>Phone</span>
                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  inputMode="tel"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
                  className={`${fieldCls} mt-2`}
                />
              </label>
              <label className="block">
                <span className={labelCls}>About your restaurant <span className="text-white/45">(optional)</span></span>
                <textarea
                  rows={4}
                  placeholder="Outlets, tables, whether you run a bar"
                  value={contactForm.message}
                  onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                  className={`${fieldCls} mt-2 resize-none`}
                />
              </label>
              <button
                type="submit"
                data-magnetic
                className="mt-2 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-white px-7 py-4 text-[15px] font-semibold text-black transition-colors hover:bg-white/85 sm:w-auto sm:self-start"
              >
                Send on WhatsApp
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="mt-auto overflow-hidden px-5 pt-16 sm:px-8 lg:px-12" style={{ ...display, backgroundColor: PAPER }}>
        <div className="mx-auto max-w-[1360px]">
          <div className="flex flex-col justify-between gap-10 border-t border-black/10 pt-10 md:flex-row">
            <div className="flex items-center gap-3">
              <img src="/logo softshape.ai.png" alt="Softshape" className="h-8 w-8 rounded-lg" />
              <p style={mono} className="text-[10.5px] uppercase tracking-[0.25em] text-black/45">Powered by Vtech</p>
            </div>
            <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-[14px] sm:grid-cols-3">
              <Link to="/onboarding/legacy" className="font-medium transition-colors hover:opacity-60" style={{ color: RED }}>New restaurant? Get started</Link>
              <Link to="/edge-setup" className="text-black/65 transition-colors hover:text-black">Link existing restaurant</Link>
              <Link to="/archives" className="text-black/65 transition-colors hover:text-black">Archives</Link>
              <Link to="/support" className="text-black/65 transition-colors hover:text-black">Support</Link>
              <Link to="/terms" className="text-black/65 transition-colors hover:text-black">Terms</Link>
              <Link to="/privacy" className="text-black/65 transition-colors hover:text-black">Privacy</Link>
            </div>
          </div>
          <p
            aria-hidden="true"
            className="mt-12 select-none whitespace-nowrap pb-[2vw] text-center text-[20.5vw] font-semibold leading-[0.9] tracking-[-0.055em] text-[#111112] lg:text-[19vw]"
          >
            softshape
          </p>
        </div>
      </footer>
    </div>
  );
};

export default PortalSelection;
