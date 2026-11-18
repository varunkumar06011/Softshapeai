// ─────────────────────────────────────────────────────────────────────────────
// PortalSelection — Landing page for selecting which portal to log into
//
// Two parts are deliberately frozen and must not be restyled:
//   1. the portal cards (the `portals` array and the card grid that renders
//      it, including onSelect(portal.id)),
//   2. the footer with the large wordmark.
// Everything else is the marketing page around them.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  LayoutDashboard, Smartphone, ShoppingCart, UserCog, QrCode, ArrowRight,
  Package, WifiOff, Printer, FileSpreadsheet, Check,
} from 'lucide-react';

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap';

// Tokens. PAPER, RED, display and mono are also read by the frozen footer.
const RED = '#E3262B';
const RED_DEEP = '#C11C21';
const INK = '#0B0B0C';
const PAPER = '#F3F1EC';
const STONE = '#E7E3DA';

const display = { fontFamily: "'Inter Tight', 'Plus Jakarta Sans', sans-serif" };
const serif = { fontFamily: "'Instrument Serif', Georgia, serif" };
// Monospace is used only where the real thing is monospace: thermal-printed tickets.
const mono = { fontFamily: "'Roboto Mono', ui-monospace, monospace" };

const EASE = [0.16, 1, 0.3, 1];

// Browser surfaces (selection, caret, focus) themed from the palette.
// Scoped to .ss-l so the portal cards and the footer keep their own defaults.
const SURFACE_CSS = `
.ss-l ::selection { background: ${RED}; color: #fff; }
.ss-l input, .ss-l textarea { caret-color: ${RED}; }
.ss-l a:focus-visible, .ss-l button:focus-visible {
  outline: 2px solid ${RED}; outline-offset: 3px; border-radius: 9999px;
}
.ss-l input:focus-visible, .ss-l textarea:focus-visible { outline: none; }
.ss-l .tnum { font-variant-numeric: tabular-nums; }
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

// ── Hero: the live service board ────────────────────────────────────────────
// One orchestrated moment: the order for table 5 is keyed in, line by line,
// then the kitchen and bar tickets come off the printers.

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

const inr = (n) => '₹' + n.toLocaleString('en-IN');

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

function ServiceBoard() {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? BILL.length : 0);
  const [printed, setPrinted] = useState(!!reduce);

  useEffect(() => {
    if (reduce) return undefined;
    if (shown < BILL.length) {
      const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 1100 : 520);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPrinted(true), 650);
    return () => clearTimeout(t);
  }, [shown, reduce]);

  const items = BILL.slice(0, shown);
  const sub = items.reduce((a, b) => a + b.price, 0);
  const gst = Math.round(sub * 0.05);
  const kitchen = BILL.filter((b) => b.station === 'K');
  const bar = BILL.filter((b) => b.station === 'B');

  return (
    <div className="overflow-hidden rounded-[20px] border border-white/10 bg-[#141416] shadow-[0_40px_80px_-40px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3.5 text-[12px]">
        <span className="font-medium text-white/80">Cashier, main floor</span>
        <span className="flex items-center gap-2 text-white/60">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Synced
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] lg:grid-cols-[0.85fr_1fr_0.95fr]">
        {/* Floor */}
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

        {/* Bill */}
        <div className="flex flex-col p-5 lg:border-r lg:border-white/[0.08]">
          <div className="mb-3 flex items-baseline justify-between text-[12px]">
            <p className="text-white/60">Table 5, 4 guests</p>
            <p className="tnum text-white/45">Bill 0142</p>
          </div>
          <div className="min-h-[148px] space-y-2.5">
            {items.map((it) => (
              <motion.div
                key={it.name}
                initial={reduce ? false : { opacity: 0, x: 10, filter: 'blur(4px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.55, ease: EASE }}
                className="tnum flex items-center justify-between text-[13px]"
              >
                <span className="text-white/90"><span className="mr-2.5 text-white/45">{it.qty}</span>{it.name}</span>
                <span className="text-white/80">{inr(it.price)}</span>
              </motion.div>
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

        {/* Printers */}
        <div className="hidden flex-col bg-[#0F0F11] p-5 lg:flex">
          <div className="mb-4 flex items-center justify-between text-[12px]">
            <p className="text-white/60">Printers</p>
            <span className="flex items-center gap-1.5 text-white/45"><Printer size={13} /> 2 online</span>
          </div>
          <div className="relative flex-1">
            {printed ? (
              <>
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: -18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, ease: EASE }}
                >
                  <Ticket title="Kitchen" number="KOT 0142" lines={kitchen} />
                </motion.div>
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: -18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.25, ease: EASE }}
                  className="mt-3"
                >
                  <Ticket title="Bar" number="BOT 0088" lines={bar} />
                </motion.div>
              </>
            ) : (
              <p className="pt-8 text-center text-[12px] text-white/50">Waiting for the order</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
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
      <p className="mt-1 text-[34px] font-medium leading-none tracking-[-0.03em]">{inr(110150)}</p>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-black/10 pt-3 text-[13px]">
        {rows.map(([k, v, plain]) => (
          <div key={k}><p className="text-black/55">{k}</p><p className="mt-0.5 text-black/85">{plain ? v : inr(v)}</p></div>
        ))}
      </div>
    </div>
  );
}

const NIGHT = [
  { time: '6:40 pm', title: 'The specials go on the menu', body: 'Upload a spreadsheet or edit items by hand. Prices, variants and categories update on every device at once.', Art: MenuArt },
  { time: '7:42 pm', title: 'Table 7 orders from their phones', body: 'Guests scan the table QR, browse the menu and add items. The order lands with the captain for confirmation.', Art: QrArt },
  { time: '7:43 pm', title: 'Each ticket reaches the right printer', body: 'Food goes to the kitchen, drinks go to the bar. Nobody walks a paper slip across the floor.', Art: PrintArt },
  { time: '9:15 pm', title: 'The internet drops. Billing does not.', body: 'Bills, tickets and payments keep working offline and sync on their own when the connection returns.', Art: OfflineArt },
  { time: '11:30 pm', title: 'Bar stock counts itself', body: 'Every peg and bottle sold is deducted from stock, so the closing count matches the ledger.', Art: LedgerArt },
  { time: '11:55 pm', title: 'The day closes, and the owner sees it from home', body: 'Sales by section, top items and captain performance, live from every outlet you run.', Art: CloseArt },
];

const STEPS = [
  { t: 'Create your restaurant', b: 'Answer a few questions about your outlet, its tables and its taxes.' },
  { t: 'Bring your menu', b: 'Upload your spreadsheet or add items by hand, then assign printers and sections.' },
  { t: 'Start billing', b: 'Open the cashier panel, give your captains the app, and take the first order.' },
];

// ─────────────────────────────────────────────────────────────────────────────

const PortalSelection = ({ onSelect }) => {
  const isDesktopApp = typeof window !== 'undefined' && !!window.__TAURI__;
  useLandingFonts();
  const reduce = useReducedMotion();

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
  ];

  const headline = [
    { w: 'Every', s: false }, { w: 'table,', s: false },
    { w: 'every', s: false }, { w: 'ticket,', s: false },
    { w: 'every', s: true }, { w: 'peg.', s: true },
  ];

  const enter = (delay) => (reduce ? {} : {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.9, delay, ease: EASE },
  });

  const fieldCls =
    'w-full border-0 border-b border-white/25 bg-transparent px-0 pb-3 pt-1 text-[16px] text-white outline-none transition-colors placeholder:text-white/50 hover:border-white/45 focus:border-white';
  const labelCls = 'block text-[13px] text-white/65';

  return (
    <div className="ss-l min-h-screen flex flex-col overflow-x-hidden antialiased" style={{ backgroundColor: PAPER, color: INK }} data-desktop={isDesktopApp || undefined}>
      <style>{SURFACE_CSS}</style>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative text-white" style={{ ...display, backgroundColor: INK }}>
        <nav className="relative z-20 mx-auto flex max-w-[1360px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
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

        <div className="relative z-10 mx-auto max-w-[1360px] px-5 pt-14 sm:px-8 lg:px-12 lg:pt-24">
          <motion.p {...enter(0)} className="mb-8 inline-flex items-center gap-2.5 text-[14px] text-white/70">
            <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold text-white" style={{ backgroundColor: RED }}>Free</span>
            for the first 200 restaurants that sign up
          </motion.p>

          <div className="grid grid-cols-1 items-end gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
            <h1 className="text-[clamp(2.9rem,7.2vw,6rem)] font-medium leading-[0.96] tracking-[-0.04em]">
              {headline.map(({ w, s }, i) => (
                <span key={i} className="mr-[0.2em] inline-block overflow-hidden pb-[0.1em] align-bottom">
                  <motion.span
                    className="inline-block"
                    style={s ? { ...serif, fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.01em' } : undefined}
                    initial={reduce ? false : { y: '105%' }}
                    animate={{ y: 0 }}
                    transition={{ duration: 1.1, delay: 0.1 + i * 0.06, ease: EASE }}
                  >
                    {w}
                  </motion.span>
                </span>
              ))}
            </h1>

            <motion.div {...enter(0.55)} className="pb-[0.6em]">
              <p className="max-w-[28rem] text-[17px] leading-[1.6] text-white/70">
                Softshape runs billing, kitchen tickets, bar stock and QR ordering for restaurants, cafes and bars across India, and keeps running when the internet doesn't.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to="/onboarding/legacy"
                  className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-[#C11C21]"
                  style={{ backgroundColor: RED }}
                >
                  Create your restaurant
                </Link>
                <Link
                  to="/edge-setup"
                  className="inline-flex items-center justify-center rounded-full px-5 py-3.5 text-[15px] font-medium text-white/85 underline decoration-white/30 underline-offset-[6px] transition-colors hover:text-white hover:decoration-white"
                >
                  Link an existing restaurant
                </Link>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.7, ease: EASE }}
            className="relative z-10 -mb-28 mt-16 lg:-mb-40 lg:mt-20"
          >
            <ServiceBoard />
          </motion.div>
        </div>
      </section>

      {/* ── Portals ──────────────────────────────────────────────────────── */}
      <section id="portals" className="relative z-0 scroll-mt-6 px-6 pb-24 pt-44 lg:px-16 lg:pb-32 lg:pt-64" style={{ backgroundColor: PAPER }}>
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-end" style={display}>
            <h2 className="text-balance text-[clamp(2.1rem,4.2vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.035em]">
              One platform. A screen for every role on the floor.
            </h2>
            <p className="max-w-md text-[16px] leading-[1.6] text-black/65 lg:justify-self-end">
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

      {/* ── One night of service ─────────────────────────────────────────── */}
      <section id="night" className="scroll-mt-6 px-5 pb-24 sm:px-8 lg:px-12 lg:pb-36" style={{ ...display, backgroundColor: PAPER }}>
        <div className="mx-auto grid max-w-[1360px] grid-cols-1 gap-12 border-t border-black/10 pt-20 lg:grid-cols-[0.8fr_1.6fr] lg:gap-20 lg:pt-28">
          <div className="lg:sticky lg:top-10 lg:self-start">
            <h2 className="text-balance text-[clamp(2rem,3.3vw,2.9rem)] font-medium leading-[1.05] tracking-[-0.035em]">
              One Friday night, from the first order to day close.
            </h2>
            <p className="mt-6 max-w-sm text-[16px] leading-[1.6] text-black/65">
              What Softshape is doing in the background while your team serves a full house.
            </p>
          </div>

          <ol className="border-t border-black/10 lg:border-t-0">
            {NIGHT.map(({ time, title, body, Art }) => (
              <li key={time} className="grid grid-cols-1 gap-6 border-b border-black/10 py-10 first:lg:pt-0 md:grid-cols-[1fr_1.05fr] md:gap-10">
                <div>
                  <p className="tnum text-[14px] font-medium" style={{ color: RED_DEEP }}>{time}</p>
                  <h3 className="mt-3 text-balance text-[22px] font-semibold leading-[1.2] tracking-[-0.02em]">{title}</h3>
                  <p className="mt-3 max-w-[34rem] text-[15.5px] leading-[1.6] text-black/65">{body}</p>
                </div>
                <div className="rounded-2xl p-5 sm:p-6" style={{ backgroundColor: STONE }}>
                  <Art />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Getting started ──────────────────────────────────────────────── */}
      <section className="px-5 py-24 text-white sm:px-8 lg:px-12 lg:py-32" style={{ ...display, backgroundColor: INK }}>
        <div className="mx-auto max-w-[1360px]">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
            <h2 className="text-balance text-[clamp(2.1rem,4.2vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.035em]">
              Three steps to your first bill.
            </h2>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-self-end">
              <Link
                to="/onboarding/legacy"
                className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3.5 text-[15px] font-semibold text-black transition-colors hover:bg-white/85"
              >
                Create your restaurant
              </Link>
              <Link
                to="/edge-setup"
                className="inline-flex items-center justify-center rounded-full px-5 py-3.5 text-[15px] font-medium text-white/85 underline decoration-white/30 underline-offset-[6px] transition-colors hover:text-white hover:decoration-white"
              >
                Link an existing restaurant
              </Link>
            </div>
          </div>
          <ol className="mt-16 grid grid-cols-1 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.t} className={`border-t border-white/15 py-8 md:pr-10 ${i > 0 ? 'md:pl-10 md:border-l' : ''}`}>
                <p className="tnum text-[44px] font-medium leading-none tracking-[-0.04em]" style={{ color: RED }}>{i + 1}</p>
                <h3 className="mt-6 text-[20px] font-semibold tracking-[-0.015em]">{s.t}</h3>
                <p className="mt-2.5 max-w-sm text-[15.5px] leading-[1.6] text-white/65">{s.b}</p>
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
                <h2 className="text-balance text-[clamp(2.3rem,4.6vw,4rem)] font-medium leading-[1] tracking-[-0.04em]">
                  Let's set up your restaurant.
                </h2>
                <p className="mt-6 max-w-md text-[16px] leading-[1.6] text-white/70">
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
                className="mt-2 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-white px-7 py-3.5 text-[15px] font-semibold text-black transition-colors hover:bg-white/85 sm:w-auto sm:self-start"
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
