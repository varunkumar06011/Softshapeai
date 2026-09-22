// ─────────────────────────────────────────────────────────────────────────────
// SupportPage — Public support page (route: /support)
// ─────────────────────────────────────────────────────────────────────────────
// Linked from the marketing home page (PortalSelection navbar + footer) and used
// as the App Store / Play Store support URL for the SoftShape Admin app.
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  LifeBuoy,
  Mail,
  Phone,
  Globe,
  MessageCircle,
  KeyRound,
  ShoppingCart,
  Boxes,
  BarChart3,
  Printer,
  Rocket,
  AlertTriangle,
} from 'lucide-react';

const TOPICS = [
  { icon: KeyRound, title: 'Account Access', desc: 'Login issues, password resets, PINs, and staff role permissions.' },
  { icon: ShoppingCart, title: 'Orders & Billing', desc: 'Bills, KOTs, settlements, refunds, and payment reconciliation.' },
  { icon: Boxes, title: 'Inventory', desc: 'Stock tracking, item setup, categories, and low-stock alerts.' },
  { icon: BarChart3, title: 'Reports & Analytics', desc: 'Sales reports, captain performance, expenses, and exports.' },
  { icon: Printer, title: 'Printing & Devices', desc: 'KOT routing, ESC/POS printers, print agent, and edge setup.' },
  { icon: Rocket, title: 'Onboarding & Setup', desc: 'New restaurant registration, menu import, and outlet linking.' },
];

const SupportPage = () => {
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900 font-sans">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 border-b border-white/10 bg-[#0B0F19]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-16">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-[#E53935] transition-colors"
          >
            <ArrowLeft size={16} /> Back to Softshape
          </Link>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#E53935]">
            <LifeBuoy size={14} /> Support
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-[#0B0F19] px-6 py-20 lg:px-16 lg:py-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[#E53935]/30 bg-[#E53935]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-[#E53935]">
            <LifeBuoy size={14} /> We are here to help
          </div>
          <h1 className="text-balance text-4xl font-black tracking-tight text-white sm:text-5xl">
            SoftShape Admin Support
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-base leading-relaxed text-gray-400 sm:text-lg">
            Need help with SoftShape Admin? Contact our support team for assistance
            with account access, orders, inventory, reports, or other app-related
            issues.
          </p>
        </div>
      </section>

      {/* ── Contact channels ── */}
      <section className="relative z-10 -mt-10 px-6 lg:px-16">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-3">
          <a
            href="mailto:softshapeai@gmail.com"
            className="group flex flex-col items-start rounded-2xl border border-gray-100 bg-white p-6 shadow-lg shadow-gray-200/50 transition-all duration-200 hover:-translate-y-1 hover:border-[#E53935]/30 hover:shadow-xl"
          >
            <div className="mb-4 rounded-xl bg-[#E53935] p-3 text-white transition-transform duration-200 group-hover:scale-105">
              <Mail size={22} />
            </div>
            <h3 className="text-base font-bold text-gray-900">Email Us</h3>
            <p className="mt-1 text-sm text-gray-500">We typically respond within one business day.</p>
            <span className="mt-3 text-sm font-semibold text-[#E53935]">softshapeai@gmail.com</span>
          </a>

          <a
            href="https://wa.me/919391798370"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-start rounded-2xl border border-gray-100 bg-white p-6 shadow-lg shadow-gray-200/50 transition-all duration-200 hover:-translate-y-1 hover:border-[#E53935]/30 hover:shadow-xl"
          >
            <div className="mb-4 rounded-xl bg-[#25D366] p-3 text-white transition-transform duration-200 group-hover:scale-105">
              <MessageCircle size={22} />
            </div>
            <h3 className="text-base font-bold text-gray-900">WhatsApp / Call</h3>
            <p className="mt-1 text-sm text-gray-500">Fastest way to reach the team during business hours.</p>
            <span className="mt-3 text-sm font-semibold text-[#E53935]">+91 93917 98370</span>
          </a>

          <a
            href="https://softshape.in"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-start rounded-2xl border border-gray-100 bg-white p-6 shadow-lg shadow-gray-200/50 transition-all duration-200 hover:-translate-y-1 hover:border-[#E53935]/30 hover:shadow-xl"
          >
            <div className="mb-4 rounded-xl bg-[#0B0F19] p-3 text-white transition-transform duration-200 group-hover:scale-105">
              <Globe size={22} />
            </div>
            <h3 className="text-base font-bold text-gray-900">Website</h3>
            <p className="mt-1 text-sm text-gray-500">Product info, portals, and getting started.</p>
            <span className="mt-3 text-sm font-semibold text-[#E53935]">softshape.in</span>
          </a>
        </div>
      </section>

      {/* ── What we can help with ── */}
      <section className="bg-white px-6 py-20 lg:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E53935]">Support Topics</p>
            <h2 className="mt-3 text-balance text-3xl font-bold text-gray-900 sm:text-4xl">
              What can we help you with?
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TOPICS.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6 transition-all duration-200 hover:border-gray-200 hover:bg-white hover:shadow-md"
              >
                <div className="mb-4 inline-flex rounded-lg bg-[#E53935]/10 p-2.5 text-[#E53935]">
                  <Icon size={20} />
                </div>
                <h3 className="text-base font-bold text-gray-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Urgent issues callout ── */}
      <section className="px-6 pb-20 lg:px-16">
        <div className="mx-auto flex max-w-3xl items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="mt-0.5 shrink-0 rounded-lg bg-amber-100 p-2 text-amber-600">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Urgent restaurant-operation issue?</h3>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              For urgent issues affecting live service — billing down during peak hours,
              printers not firing KOTs, staff locked out — please contact your SoftShape
              account administrator first, then reach us on WhatsApp for the fastest
              response.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="mt-auto border-t border-gray-100 bg-gray-50 px-6 py-8 lg:px-16">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <img
              src="/logo softshape.ai.png"
              alt="Softshape"
              className="h-7 w-auto rounded"
            />
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gray-500">Powered by Vtech</p>
          </div>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
            <a href="mailto:softshapeai@gmail.com" className="text-sm font-semibold text-gray-600 hover:text-[#E53935] transition-colors">
              softshapeai@gmail.com
            </a>
            <a href="tel:+919391798370" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-[#E53935] transition-colors">
              <Phone size={14} /> +91 93917 98370
            </a>
            <Link to="/terms" className="text-sm font-semibold text-gray-600 hover:text-[#E53935] transition-colors">
              Terms
            </Link>
            <Link to="/privacy" className="text-sm font-semibold text-gray-600 hover:text-[#E53935] transition-colors">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default SupportPage;
