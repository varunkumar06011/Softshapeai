// ─────────────────────────────────────────────────────────────────────────────
// PortalSelection — Landing page for selecting which portal to log into
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Smartphone, ShoppingCart, UserCog, QrCode, ArrowRight, Phone, Mail, Users } from 'lucide-react';

const PortalSelection = ({ onSelect }) => {
  const isDesktopApp = typeof window !== 'undefined' && !!window.__TAURI__;

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
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white font-['Inter',sans-serif]">
      {/* ── Dark Hero Section ── */}
      <section className="relative overflow-hidden bg-[#0B0F19]">
        {/* Subtle grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Navbar */}
        <nav className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-16">
          <img
            src="/logo softshape.ai.png"
            alt="Softshape.ai"
            className="h-12 w-auto rounded-lg shadow-lg shadow-black/20"
          />
          <Link
            to={isDesktopApp ? '/onboarding' : '/onboarding/legacy'}
            className="inline-flex items-center gap-2 rounded-lg bg-[#E53935] px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-[#B71C1C]"
          >
            Get Started
            <ArrowRight size={16} />
          </Link>
        </nav>

        {/* Hero content */}
        <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 pb-24 pt-10 lg:grid-cols-2 lg:px-16 lg:pb-32 lg:pt-16">
          <div className="max-w-xl">
            <h1 className="text-[2.5rem] font-bold leading-[1.15] tracking-tight text-white sm:text-5xl lg:text-[3.5rem]">
              Run your restaurant{' '}
              <span className="text-[#E53935]">smarter</span>, faster, and more profitably.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-gray-400">
              Billing, KOT, inventory, QR ordering, and real-time analytics — unified in one platform built for Indian restaurants, cafes, and bars.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to={isDesktopApp ? '/onboarding' : '/onboarding/legacy'}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#E53935] px-7 py-3.5 text-sm font-bold text-white transition-all hover:bg-[#B71C1C]"
              >
                Get Started Free
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/edge-setup"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-7 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/5"
              >
                Link Existing Restaurant
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-4 text-sm text-gray-500">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0B0F19] bg-gradient-to-br from-[#E53935] to-[#B71C1C] text-[10px] font-bold text-white"
                  >
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
              </div>
              <p>Trusted by restaurants across India</p>
            </div>
          </div>

          {/* Professional laptop mockup */}
          <div className="relative flex justify-center lg:justify-end">
            <div className="relative w-full max-w-[680px]">
              {/* Laptop frame */}
              <div className="relative rounded-t-xl border border-white/10 bg-[#1a1f2e] p-2 shadow-2xl shadow-black/50">
                {/* Screen bezel */}
                <div className="relative overflow-hidden rounded-lg bg-[#0f131a]">
                  <video
                    src="/Red_chef_hat_zips_screen_202607151152.mp4"
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="h-auto w-full"
                    poster="/image.png"
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              </div>
              {/* Laptop base */}
              <div className="relative mx-auto h-3 w-[110%] -translate-x-[5%] rounded-b-lg bg-gradient-to-b from-[#2a303f] to-[#1a1f2e] shadow-xl">
                <div className="absolute left-1/2 top-0 h-1 w-20 -translate-x-1/2 rounded-b bg-[#3a4155]" />
              </div>
              {/* Subtle reflection */}
              <div
                className="pointer-events-none absolute -bottom-8 left-1/2 h-16 w-[90%] -translate-x-1/2 rounded-[100%] bg-black/20 blur-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Portals Section ── */}
      <section className="relative z-10 bg-white px-6 py-20 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E53935]">Choose Your Portal</p>
            <h2 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">
              Built for every role in your restaurant
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {portals.map((portal) => {
              const Icon = portal.icon;
              return (
                <button
                  key={portal.id}
                  onClick={() => onSelect(portal.id)}
                  className="group flex flex-col items-start rounded-xl border border-gray-100 bg-white p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-gray-200 hover:shadow-lg"
                >
                  <div
                    className="mb-4 rounded-lg p-3 text-white transition-transform duration-200 group-hover:scale-105"
                    style={{ backgroundColor: portal.color }}
                  >
                    <Icon size={24} strokeWidth={2} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{portal.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">{portal.description}</p>
                  <span className="mt-auto pt-5 inline-flex items-center gap-1 text-sm font-semibold text-[#E53935]">
                    Open Portal <ArrowRight size={14} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Why Clients Love Us ── */}
      <section className="relative overflow-hidden bg-[#0B0F19] px-6 py-24 lg:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E53935]">Why Our Clients Love Us</p>
            <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
              Simplicity meets excellence
            </h2>
            <p className="mt-2 text-lg font-medium text-gray-400">
              Our products excel in every aspect
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-gray-500">
              We design our products to be the best in every way, so you get the most out of them.
            </p>
          </div>

          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-3">
            {[
              { src: '/image 2.png', alt: 'Insightful Data Dashboard' },
              { src: '/image 3.png', alt: 'Customer Support' },
              { src: '/image 4.png', alt: 'Free POS for Restaurant Owners' },
            ].map((img, idx) => (
              <div
                key={idx}
                className="group relative overflow-hidden rounded-2xl border border-white/10 shadow-lg transition-all duration-300 hover:-translate-y-2 hover:border-[#E53935]/30 hover:shadow-xl"
              >
                <img
                  src={img.src}
                  alt={img.alt}
                  className="block h-auto w-full transition-transform duration-500 group-hover:scale-[1.02]"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact Us ── */}
      <section className="bg-white px-6 py-24 lg:px-16">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 lg:grid-cols-2">
          {/* Left: Image */}
          <div className="flex justify-center lg:justify-start">
            <div className="relative w-full max-w-lg overflow-hidden rounded-2xl shadow-xl">
              <img
                src="/image 5.png"
                alt="Softshape Team"
                className="h-auto w-full"
              />
            </div>
          </div>

          {/* Right: Form + Details */}
          <div className="max-w-md lg:max-w-none">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E53935]">Get in Touch</p>
            <h2 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">Contact Us</h2>
            <p className="mt-3 text-gray-500">
              Have questions? Fill out the form and our team will reach out to you on WhatsApp.
            </p>

            <form onSubmit={handleWhatsAppSend} className="mt-8 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <input
                  type="text"
                  required
                  placeholder="Your Name"
                  value={contactForm.name}
                  onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-[#E53935] focus:ring-2 focus:ring-[#E53935]/10"
                />
                <input
                  type="email"
                  required
                  placeholder="Email Address"
                  value={contactForm.email}
                  onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-[#E53935] focus:ring-2 focus:ring-[#E53935]/10"
                />
              </div>
              <input
                type="tel"
                required
                placeholder="Phone Number"
                value={contactForm.phone}
                onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-[#E53935] focus:ring-2 focus:ring-[#E53935]/10"
              />
              <textarea
                rows={4}
                placeholder="How can we help you?"
                value={contactForm.message}
                onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-[#E53935] focus:ring-2 focus:ring-[#E53935]/10"
              />
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-8 py-3.5 text-sm font-bold text-white transition-all hover:bg-[#128C7E] sm:w-auto"
              >
                <Phone size={18} />
                Send via WhatsApp
              </button>
            </form>

            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                  <Mail size={16} className="text-[#E53935]" />
                  Email
                </div>
                <a
                  href="mailto:softshapeai@gmail.com"
                  className="text-sm text-gray-600 hover:text-[#E53935]"
                >
                  softshapeai@gmail.com
                </a>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                  <Phone size={16} className="text-[#E53935]" />
                  Contact
                </div>
                <div className="flex flex-col text-sm text-gray-600">
                  <a href="tel:9391798370" className="hover:text-[#E53935]">9391798370</a>
                  <a href="tel:9381872579" className="hover:text-[#E53935]">9381872579</a>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                  <Users size={16} className="text-[#E53935]" />
                  Founders
                </div>
                <p className="text-sm text-gray-600">
                  T. Vinod Chowdary<br />
                  N. Varun Kumar<br />
                  V. Akhil
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="mt-auto border-t border-gray-100 bg-gray-50 px-6 py-8 lg:px-16">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <img
              src="/logo softshape.ai.png"
              alt="Softshape.ai"
              className="h-7 w-auto rounded"
            />
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gray-500">Powered by Vtech</p>
          </div>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
            <Link
              to={isDesktopApp ? '/onboarding' : '/onboarding/legacy'}
              className="text-sm font-semibold text-[#E53935] hover:text-[#B71C1C] transition-colors"
            >
              New Restaurant? Get Started
            </Link>
            <Link
              to="/edge-setup"
              className="text-sm font-semibold text-gray-600 hover:text-[#E53935] transition-colors"
            >
              Link Existing Restaurant
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PortalSelection;
