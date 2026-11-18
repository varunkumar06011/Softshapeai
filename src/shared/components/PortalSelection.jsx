// ─────────────────────────────────────────────────────────────────────────────
// PortalSelection — Landing page for selecting which portal to log into
//
// The portal cards (the `portals` array and the card grid that renders it)
// are intentionally kept exactly as they were: same markup, same
// onSelect(portal.id) behaviour. Everything around them is the marketing page.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  LayoutDashboard, Smartphone, ShoppingCart, UserCog, QrCode, ArrowRight, ArrowUpRight,
  Phone, Mail, Users, Package, WifiOff, Printer, FileSpreadsheet, BarChart3, Wine, Check,
} from 'lucide-react';

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap';

const RED = '#E3262B';
const INK = '#0B0B0C';
const PAPER = '#F3F1EC';

const display = { fontFamily: "'Inter Tight', 'Plus Jakarta Sans', sans-serif" };
const serif = { fontFamily: "'Instrument Serif', Georgia, serif" };
const mono = { fontFamily: "'Roboto Mono', ui-monospace, monospace" };

// Film grain, inline so there is no extra request.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Loads the two landing-only typefaces once, so other portals don't pay for them.
function useLandingFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);
}

function Reveal({ children, delay = 0, className = '', y = 24 }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children, light = false }) {
  return (
    <p
      style={mono}
      className={`flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] ${light ? 'text-white/50' : 'text-black/50'}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: RED }} />
      {children}
    </p>
  );
}

// ── Hero product mockup (built in code: no stock imagery) ───────────────────

const BILL = [
  { name: 'Paneer Tikka', qty: 1, price: 320 },
  { name: 'Butter Naan', qty: 4, price: 200 },
  { name: 'Dal Makhani', qty: 1, price: 280 },
  { name: 'Masala Chaas', qty: 2, price: 120 },
  { name: 'Kingfisher Ultra 650', qty: 2, price: 560 },
];

const TABLES = [
  { id: 'T1', s: 'busy' }, { id: 'T2', s: 'free' }, { id: 'T3', s: 'bill' }, { id: 'T4', s: 'busy' },
  { id: 'T5', s: 'active' }, { id: 'T6', s: 'free' }, { id: 'T7', s: 'busy' }, { id: 'T8', s: 'free' },
  { id: 'B1', s: 'busy' }, { id: 'B2', s: 'free' }, { id: 'R1', s: 'bill' }, { id: 'R2', s: 'busy' },
];

const inr = (n) => '₹' + n.toLocaleString('en-IN');

function HeroMockup() {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? BILL.length : 0);

  useEffect(() => {
    if (reduce) return undefined;
    if (shown >= BILL.length) return undefined;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 900 : 650);
    return () => clearTimeout(t);
  }, [shown, reduce]);

  const items = BILL.slice(0, shown);
  const sub = items.reduce((a, b) => a + b.price, 0);
  const gst = Math.round(sub * 0.05);

  const tableTone = {
    free: 'border-white/10 text-white/35',
    busy: 'border-white/15 bg-white/[0.06] text-white/80',
    bill: 'border-amber-300/30 bg-amber-300/10 text-amber-200',
    active: 'text-white',
  };

  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[#121214] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
        {/* window chrome */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <div className="flex items-center gap-4">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            </div>
            <span style={mono} className="text-[10px] uppercase tracking-[0.2em] text-white/35">Cashier · Main floor</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.15fr]">
          {/* floor */}
          <div className="border-b border-white/[0.07] p-4 sm:border-b-0 sm:border-r">
            <div className="mb-3 flex items-center justify-between">
              <p style={mono} className="text-[10px] uppercase tracking-[0.2em] text-white/35">Floor</p>
              <span style={mono} className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-emerald-400/80">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {TABLES.map((t) => (
                <div
                  key={t.id}
                  className={`flex aspect-square items-center justify-center rounded-lg border text-[11px] font-medium ${tableTone[t.s]}`}
                  style={t.s === 'active' ? { backgroundColor: RED, borderColor: RED } : undefined}
                >
                  {t.id}
                </div>
              ))}
            </div>
            <div style={mono} className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[9px] uppercase tracking-[0.15em] text-white/35">
              <span>8 occupied</span><span>2 billing</span><span>4 free</span>
            </div>
          </div>

          {/* bill */}
          <div className="flex flex-col p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <p style={mono} className="text-[10px] uppercase tracking-[0.2em] text-white/35">Table T5 · 4 guests</p>
              <p style={mono} className="text-[10px] text-white/35">#0142</p>
            </div>
            <div className="min-h-[150px] space-y-2">
              {items.map((it) => (
                <motion.div
                  key={it.name}
                  initial={reduce ? false : { opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center justify-between text-[12.5px]"
                >
                  <span className="text-white/80">
                    <span style={mono} className="mr-2 text-white/35">{it.qty}x</span>{it.name}
                  </span>
                  <span style={mono} className="text-white/70">{inr(it.price)}</span>
                </motion.div>
              ))}
            </div>
            <div className="mt-3 space-y-1 border-t border-dashed border-white/10 pt-3 text-[11px]" style={mono}>
              <div className="flex justify-between text-white/40"><span>Subtotal</span><span>{inr(sub)}</span></div>
              <div className="flex justify-between text-white/40"><span>GST 5%</span><span>{inr(gst)}</span></div>
              <div className="flex justify-between pt-1 text-sm text-white"><span>Total</span><span>{inr(sub + gst)}</span></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-medium">
              <span className="rounded-lg border border-white/10 py-2 text-center text-white/70">Print KOT</span>
              <span className="rounded-lg py-2 text-center text-white" style={{ backgroundColor: RED }}>Settle bill</span>
            </div>
          </div>
        </div>
      </div>

      {/* floating status chips */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.6, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="absolute -left-6 -bottom-8 hidden items-center gap-3 rounded-2xl border border-white/10 bg-[#18181B]/90 px-4 py-3 shadow-2xl backdrop-blur md:flex"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06]"><Printer size={15} className="text-white/80" /></span>
        <div>
          <p className="text-[12px] font-medium text-white">KOT sent to Kitchen</p>
          <p style={mono} className="text-[10px] text-white/40">Printer 2 · 0.4s</p>
        </div>
      </motion.div>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="absolute -right-4 -top-9 hidden items-center gap-3 rounded-2xl border border-white/10 bg-[#18181B]/90 px-4 py-3 shadow-2xl backdrop-blur md:flex"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06]"><WifiOff size={15} className="text-white/80" /></span>
        <div>
          <p className="text-[12px] font-medium text-white">Offline. Still billing.</p>
          <p style={mono} className="text-[10px] text-white/40">3 bills queued to sync</p>
        </div>
      </motion.div>
    </div>
  );
}

// ── Feature tiles: small, code-drawn illustrations ───────────────────────────

function OfflineArt() {
  return (
    <div className="space-y-2" style={mono}>
      {['#0139  ₹1,240', '#0140  ₹860', '#0141  ₹2,315'].map((r, i) => (
        <div key={r} className="flex items-center justify-between rounded-lg border border-black/[0.07] bg-white px-3 py-2 text-[11px]">
          <span className="text-black/70">{r}</span>
          <span className={`flex items-center gap-1 ${i < 2 ? 'text-emerald-600' : 'text-black/40'}`}>
            {i < 2 ? <><Check size={11} /> synced</> : 'queued'}
          </span>
        </div>
      ))}
    </div>
  );
}

const Ticket = ({ title, lines, className }) => (
  <div className={`w-[46%] rounded-md bg-white p-3 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)] ${className}`} style={mono}>
    <p className="text-[9px] uppercase tracking-[0.2em] text-black/40">{title}</p>
    <div className="mt-2 space-y-1">
      {lines.map((l) => <p key={l} className="text-[10.5px] text-black/75">{l}</p>)}
    </div>
    <div className="mt-2 border-t border-dashed border-black/15 pt-1 text-[9px] text-black/40">T5 · 21:42</div>
  </div>
);

function PrintArt() {
  return (
    <div className="relative flex h-[132px] items-start justify-center gap-3">
      <Ticket title="Kitchen KOT" lines={['1  Paneer Tikka', '4  Butter Naan', '1  Dal Makhani']} className="-rotate-3" />
      <Ticket title="Bar BOT" lines={['2  KF Ultra 650', '2  Masala Chaas']} className="mt-4 rotate-2" />
    </div>
  );
}

function MenuArt() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg border border-black/[0.07] bg-white px-3 py-2 text-[11px] text-black/70">
        <FileSpreadsheet size={14} className="text-emerald-600" />
        <span style={mono}>family-menu.xlsx</span>
        <span style={mono} className="ml-auto text-black/40">214 items</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {['Starters', 'Tandoor', 'Curries', 'Biryani', 'Breads', 'Beverages', 'Bar'].map((c) => (
          <span key={c} className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10.5px] text-black/65">{c}</span>
        ))}
      </div>
    </div>
  );
}

function LedgerArt() {
  const rows = [
    { n: 'Single malt 750ml', v: 72 },
    { n: 'Premium whisky 750ml', v: 41 },
    { n: 'Craft beer 650ml', v: 88 },
  ];
  return (
    <div className="space-y-3" style={mono}>
      {rows.map((r) => (
        <div key={r.n}>
          <div className="flex justify-between text-[10.5px] text-black/60"><span>{r.n}</span><span>{r.v}%</span></div>
          <div className="mt-1 h-1 rounded-full bg-black/[0.07]">
            <div className="h-1 rounded-full" style={{ width: `${r.v}%`, backgroundColor: r.v < 50 ? RED : INK }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartArt() {
  const bars = [38, 52, 44, 61, 57, 72, 90];
  return (
    <div className="flex h-[112px] items-end gap-2">
      {bars.map((h, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="w-full rounded-t-[4px]" style={{ height: `${Math.round(h * 1.1)}px`, backgroundColor: i === bars.length - 1 ? RED : 'rgba(11,11,12,0.12)' }} />
          <span style={mono} className="text-[9px] text-black/40">{'MTWTFSS'[i]}</span>
        </div>
      ))}
    </div>
  );
}

function QrArt() {
  return (
    <div className="flex items-center gap-4">
      <div className="rounded-xl bg-white p-2.5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)]">
        <QRCodeSVG value="https://softshape.ai" size={84} fgColor={INK} bgColor="#ffffff" level="M" />
      </div>
      <div className="space-y-1.5 text-[11px]" style={mono}>
        <p className="text-black/40">Table 7 · scanned</p>
        <p className="text-black/75">2 items added</p>
        <p style={{ color: RED }}>Order sent to captain</p>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: WifiOff, title: 'Works without internet', body: 'Bills, KOTs and payments keep running when the connection drops. Everything syncs the moment it returns.', Art: OfflineArt, span: 'lg:col-span-2' },
  { icon: Printer, title: 'Kitchen and bar printing', body: 'Every item routes to the right printer. Kitchen gets the KOT, the bar gets the BOT.', Art: PrintArt, span: '' },
  { icon: FileSpreadsheet, title: 'Menu setup in minutes', body: 'Import your existing Excel menu. Categories, variants and prices come across as they are.', Art: MenuArt, span: '' },
  { icon: QrCode, title: 'QR table ordering', body: 'Guests scan, browse and order from the table. Orders land with the captain instantly.', Art: QrArt, span: '' },
  { icon: Wine, title: 'Inventory and bar ledger', body: 'Track stock down to the peg. Opening, purchases, sales and closing, reconciled every day.', Art: LedgerArt, span: '' },
  { icon: BarChart3, title: 'Real-time analytics', body: 'Revenue, top sellers, captain performance and day-close reports, live from every outlet.', Art: ChartArt, span: 'lg:col-span-2' },
];

const STEPS = [
  { n: '01', t: 'Create your restaurant', b: 'Answer a few questions about your outlet, tables and taxes. No sales call required.' },
  { n: '02', t: 'Bring your menu', b: 'Upload your spreadsheet or add items by hand. Assign printers and sections.' },
  { n: '03', t: 'Start billing', b: 'Open the cashier panel, hand the captain app to your team, and take your first order.' },
];

const MARQUEE = ['Billing', 'KOT', 'Captain app', 'QR ordering', 'Bar ledger', 'Store stock', 'Offline mode', 'Day close', 'Multi-outlet', 'GST invoices'];

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

  const headline = ['The', 'operating', 'system', 'for', 'Indian', 'restaurants.'];

  const inputCls =
    'w-full border-0 border-b border-white/15 bg-transparent px-0 py-3 text-[15px] text-white outline-none transition-colors placeholder:text-white/35 focus:border-white';

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden antialiased" style={{ backgroundColor: PAPER, color: INK }} data-desktop={isDesktopApp || undefined}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden text-white" style={{ ...display, backgroundColor: INK }}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
        <div
          className="pointer-events-none absolute -top-[30%] right-[-20%] h-[900px] w-[900px] rounded-full opacity-40 blur-[140px]"
          style={{ background: `radial-gradient(circle, ${RED} 0%, transparent 60%)` }}
        />

        {/* Navbar */}
        <nav className="relative z-20 mx-auto flex max-w-[1360px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo softshape.ai.png" alt="Softshape" className="h-9 w-9 rounded-[10px]" />
            <span className="text-[17px] font-semibold tracking-tight">softshape</span>
          </Link>
          <div className="hidden items-center gap-8 text-[13.5px] text-white/60 md:flex">
            <a href="#product" className="transition-colors hover:text-white">Product</a>
            <a href="#portals" className="transition-colors hover:text-white">Portals</a>
            <Link to="/support" className="transition-colors hover:text-white">Support</Link>
            <Link to="/archives" className="transition-colors hover:text-white">Archives</Link>
            <a href="#contact" className="transition-colors hover:text-white">Contact</a>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/manager"
              className="rounded-full border border-white/15 px-4 py-2 text-[13px] font-medium text-white/85 transition-colors hover:border-white/40 hover:text-white"
            >
              Manager
            </Link>
            <Link
              to="/onboarding/legacy"
              className="group inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black transition-colors hover:bg-white/85"
            >
              Get started
              <ArrowUpRight size={15} className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </nav>

        <div className="relative z-10 mx-auto max-w-[1360px] px-5 pb-24 pt-14 sm:px-8 lg:px-12 lg:pb-36 lg:pt-24">
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
            className="mb-10 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-4 text-[12.5px] text-white/70"
          >
            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: RED }}>Free</span>
            For the first 200 restaurants that sign up
          </motion.div>

          <h1 className="max-w-[15ch] text-[clamp(3rem,8.4vw,8.25rem)] font-medium leading-[0.92] tracking-[-0.05em]">
            {headline.map((w, i) => (
              <span key={i} className="mr-[0.2em] inline-block overflow-hidden pb-[0.1em] align-bottom">
                <motion.span
                  className="inline-block"
                  style={w === 'Indian' || w === 'restaurants.' ? { ...serif, fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.02em' } : undefined}
                  initial={reduce ? false : { y: '110%' }}
                  animate={{ y: 0 }}
                  transition={{ duration: 1.1, delay: 0.1 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                >
                  {w}
                </motion.span>
              </span>
            ))}
          </h1>

          <div className="mt-14 grid grid-cols-1 gap-16 lg:mt-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div className="flex flex-col justify-between gap-12">
              <div>
                <Reveal delay={0.6}>
                  <p className="max-w-[30rem] text-[17px] leading-relaxed text-white/55 sm:text-lg">
                    Billing, KOT, inventory, QR ordering and live analytics in one platform, built for the way restaurants, cafes and bars in India actually run.
                  </p>
                </Reveal>
                <Reveal delay={0.75}>
                  <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Link
                      to="/onboarding/legacy"
                      className="group inline-flex items-center justify-center gap-3 rounded-full py-2 pl-6 pr-2 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.02]"
                      style={{ backgroundColor: RED }}
                    >
                      Get started free
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 transition-transform duration-300 group-hover:rotate-[-45deg]">
                        <ArrowRight size={16} />
                      </span>
                    </Link>
                    <Link
                      to="/edge-setup"
                      className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-[15px] text-[15px] font-medium text-white/85 transition-colors hover:border-white/40 hover:text-white"
                    >
                      Link existing restaurant
                    </Link>
                  </div>
                </Reveal>
              </div>
              <Reveal delay={0.9}>
                <dl style={mono} className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/10 pt-6 text-[11px] uppercase tracking-[0.16em]">
                  {[
                    ['Runs on', 'Web, Windows, Android, iOS'],
                    ['Billing', 'GST-ready invoices'],
                    ['Connection', 'Works fully offline'],
                    ['Printing', 'Kitchen, bar, cashier'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-white/35">{k}</dt>
                      <dd className="mt-1.5 normal-case tracking-normal text-[13px] text-white/80" style={display}>{v}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
            </div>

            <Reveal delay={0.4} y={40}>
              <HeroMockup />
            </Reveal>
          </div>
        </div>

        {/* capability marquee */}
        <div className="relative z-10 border-t border-white/[0.08] py-6">
          <div className="flex w-max animate-[scroll_40s_linear_infinite] motion-reduce:animate-none">
            {[0, 1, 2].map((k) => (
              <div key={k} className="flex shrink-0 items-center" aria-hidden={k > 0}>
                {MARQUEE.map((m) => (
                  <span key={m} className="flex items-center whitespace-nowrap px-7 text-[15px] text-white/45">
                    {m}
                    <span className="ml-14 inline-block h-1 w-1 rounded-full bg-white/25" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Portals ──────────────────────────────────────────────────────── */}
      <section id="portals" className="relative z-10 px-6 py-24 lg:px-16 lg:py-32" style={{ backgroundColor: PAPER }}>
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-end" style={display}>
            <Reveal>
              <Eyebrow>Choose your portal</Eyebrow>
              <h2 className="mt-5 text-[clamp(2.2rem,4.6vw,3.9rem)] font-medium leading-[1] tracking-[-0.04em]">
                One platform. <span style={serif} className="italic font-normal tracking-[-0.01em]">Every role</span> on the floor.
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="max-w-md text-[16px] leading-relaxed text-black/55 lg:justify-self-end">
                Each person in your restaurant gets a screen made for their job, all reading from the same live data.
              </p>
            </Reveal>
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

      {/* ── Product / features ───────────────────────────────────────────── */}
      <section id="product" className="px-5 pb-24 sm:px-8 lg:px-12 lg:pb-36" style={{ ...display, backgroundColor: PAPER }}>
        <div className="mx-auto max-w-[1360px] border-t border-black/10 pt-20 lg:pt-28">
          <div className="mb-16 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.3fr]">
            <Reveal>
              <Eyebrow>What it does</Eyebrow>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="text-[clamp(2.2rem,4.6vw,3.9rem)] font-medium leading-[1] tracking-[-0.04em]">
                Everything a busy service needs, and <span style={serif} className="italic font-normal tracking-[-0.01em]">nothing it doesn't.</span>
              </h2>
            </Reveal>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body, Art, span }, i) => (
              <Reveal key={title} delay={(i % 3) * 0.08} className={span}>
                <div className="group flex h-full flex-col justify-between gap-10 rounded-[22px] border border-black/[0.06] bg-[#EAE7E0] p-6 transition-colors duration-500 hover:bg-[#E4E0D7] sm:p-7">
                  <div className="min-h-[132px]"><Art /></div>
                  <div>
                    <div className="mb-3 flex items-center gap-2.5">
                      <Icon size={16} strokeWidth={1.75} className="text-black/60" />
                      <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h3>
                    </div>
                    <p className="max-w-[30rem] text-[14.5px] leading-relaxed text-black/55">{body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-5 py-24 text-white sm:px-8 lg:px-12 lg:py-36" style={{ ...display, backgroundColor: INK }}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
        <div className="relative mx-auto max-w-[1360px]">
          <Reveal>
            <Eyebrow light>Getting started</Eyebrow>
            <h2 className="mt-5 max-w-4xl text-[clamp(2.2rem,4.6vw,3.9rem)] font-medium leading-[1] tracking-[-0.04em]">
              From sign-up to your first bill <span style={serif} className="italic font-normal tracking-[-0.01em]">the same afternoon.</span>
            </h2>
          </Reveal>
          <div className="mt-16 grid grid-cols-1 border-t border-white/10 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.1}>
                <div className={`h-full py-10 md:px-8 ${i > 0 ? 'border-t border-white/10 md:border-l md:border-t-0' : 'md:pl-0'}`}>
                  <p style={serif} className="text-[64px] italic leading-none" >
                    <span style={{ color: RED }}>{s.n}</span>
                  </p>
                  <h3 className="mt-8 text-xl font-semibold tracking-[-0.01em]">{s.t}</h3>
                  <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-white/50">{s.b}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/onboarding/legacy"
                className="group inline-flex items-center justify-center gap-3 rounded-full bg-white py-3.5 pl-6 pr-2 text-[15px] font-semibold text-black transition-transform duration-300 hover:scale-[1.02]"
              >
                Create your restaurant
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white transition-transform duration-300 group-hover:rotate-[-45deg]">
                  <ArrowRight size={16} />
                </span>
              </Link>
              <Link
                to="/edge-setup"
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-[17px] text-[15px] font-medium text-white/85 transition-colors hover:border-white/40 hover:text-white"
              >
                Link existing restaurant
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Contact ──────────────────────────────────────────────────────── */}
      <section id="contact" className="px-5 py-24 sm:px-8 lg:px-12 lg:py-36" style={{ ...display, backgroundColor: PAPER }}>
        <div className="mx-auto max-w-[1360px] overflow-hidden rounded-[28px] text-white" style={{ backgroundColor: '#141416' }}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr]">
            <div className="relative flex flex-col justify-between gap-16 p-8 sm:p-12 lg:p-16">
              <div
                className="pointer-events-none absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full opacity-30 blur-[120px]"
                style={{ background: `radial-gradient(circle, ${RED} 0%, transparent 65%)` }}
              />
              <div className="relative">
                <Eyebrow light>Get in touch</Eyebrow>
                <h2 className="mt-5 text-[clamp(2.4rem,5vw,4.4rem)] font-medium leading-[0.98] tracking-[-0.045em]">
                  Let's set up <span style={serif} className="italic font-normal tracking-[-0.01em]">your</span> restaurant.
                </h2>
                <p className="mt-6 max-w-md text-[16px] leading-relaxed text-white/50">
                  Tell us a little about your outlet. We reply on WhatsApp, usually within the hour.
                </p>
              </div>

              <div className="relative grid grid-cols-1 gap-8 sm:grid-cols-3">
                <div>
                  <p style={mono} className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-white/40"><Mail size={12} /> Email</p>
                  <a href="mailto:softshapeai@gmail.com" className="mt-3 block break-all text-[14.5px] text-white/85 transition-colors hover:text-white">
                    softshapeai@gmail.com
                  </a>
                </div>
                <div>
                  <p style={mono} className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-white/40"><Phone size={12} /> Contact</p>
                  <div className="mt-3 flex flex-col gap-1 text-[14.5px] text-white/85">
                    <a href="tel:9391798370" className="transition-colors hover:text-white">93917 98370</a>
                    <a href="tel:9381872579" className="transition-colors hover:text-white">93818 72579</a>
                  </div>
                </div>
                <div>
                  <p style={mono} className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-white/40"><Users size={12} /> Founders</p>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-white/85">
                    T. Vinod Chowdary<br />
                    N. Varun Kumar<br />
                    V. Akhil
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleWhatsAppSend} className="flex flex-col gap-6 border-t border-white/[0.08] p-8 sm:p-12 lg:border-l lg:border-t-0 lg:p-16">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <input
                  type="text"
                  required
                  placeholder="Your name"
                  value={contactForm.name}
                  onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                />
                <input
                  type="email"
                  required
                  placeholder="Email address"
                  value={contactForm.email}
                  onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <input
                type="tel"
                required
                placeholder="Phone number"
                value={contactForm.phone}
                onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
                className={inputCls}
              />
              <textarea
                rows={4}
                placeholder="Tell us about your restaurant"
                value={contactForm.message}
                onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                className={`${inputCls} resize-none`}
              />
              <button
                type="submit"
                className="group mt-4 inline-flex w-full items-center justify-between rounded-full bg-white py-2 pl-6 pr-2 text-[15px] font-semibold text-black transition-transform duration-300 hover:scale-[1.01] sm:w-auto sm:self-start sm:gap-6"
              >
                Send on WhatsApp
                <span className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-transform duration-300 group-hover:rotate-[-45deg]" style={{ backgroundColor: RED }}>
                  <ArrowRight size={17} />
                </span>
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
