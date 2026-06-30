<div align="center">

<img src="https://img.shields.io/badge/SoftShape-v6.0.0-6366f1?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIi8+PHBhdGggZD0iTTEyIDZ2MTJsNi02Ii8+PC9zdmc+" alt="SoftShape" />

# 🍽️ SoftShape — The Restaurant Operating System

**Billing, tables, kitchen, QR menus, inventory, payroll, and reports — all running offline-first.**

[![Version](https://img.shields.io/badge/version-6.0.0-6366f1)](./package.json)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite)](https://vitejs.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss)](https://tailwindcss.com)
[![Tests](https://img.shields.io/badge/tests-vitest-6E9F18?logo=vitest)](./vitest.config.js)
[![License](https://img.shields.io/badge/license-ISC-22c55e)](./package.json)

</div>

---

## 🚀 What is SoftShape?

**SoftShape** is a modern, **offline-first restaurant POS and management platform** built for the real world of F&B in India: flaky internet, noisy kitchens, multi-outlet operations, and staff who need to move fast.

It replaces the patchwork of paper KOTs, WhatsApp orders, and slow cloud dashboards with one unified system:

- **Admin Dashboard** — menu, tables, staff, inventory, pricing, reports, and vouchers.
- **Cashier Billing** — fast settlement, split payments, receipts, and daily closing.
- **Captain App** — table-side ordering, status tracking, and KOT routing.
- **Kitchen Display System (KDS)** — live order tickets with elapsed timers.
- **QR Code Menu** — customer-facing digital menu for self ordering.
- **Print Station** — map thermal printers and manage the Windows Print Agent.
- **Onboarding Wizard** — self-serve restaurant signup with payment and verification.

Whether you run a single café or a chain of restaurants, SoftShape is designed to keep orders flowing even when the network is not.

---

## ⚙️ How It Works

SoftShape is a **single React web app** that powers every role and every screen:

```
┌─────────────────────────────────────────────────────────────┐
│                    React + Vite Frontend                     │
│  Admin │ Cashier │ Captain │ KDS │ QR Menu │ Print Station  │
└─────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │  IndexedDB  │    │ Socket.IO   │    │  Tauri /    │
    │  Sync Queue │    │  Real-time  │    │  Capacitor  │
    └─────────────┘    └─────────────┘    └─────────────┘
           │                  │                  │
           ▼                  ▼                  ▼
    ┌─────────────────────────────────────────────────────┐
    │           SoftShape Backend API (Node/Express)        │
    │    PostgreSQL · Prisma · Redis · Razorpay · Resend    │
    └─────────────────────────────────────────────────────┘
```

### Offline-first by design

Every action is written to an **IndexedDB sync queue** first. The app then attempts to sync with the backend. If the connection drops, work continues locally and syncs automatically when the network returns. Conflict resolution is handled per action type so the most important data wins.

### Real-time where it matters

Live orders, table updates, and KOT events flow through **Socket.IO**. The backend can scale horizontally with a **Redis adapter** for multi-instance deployments.

### Multi-platform, one codebase

The same React build becomes:

| Platform | Technology | Use Case |
|----------|------------|----------|
| Web / PWA | Vite + service worker | iPad, desktop browser, customer QR menu |
| Android | Capacitor 8 | Cashier, captain, and admin handheld tablets |
| Windows | Tauri 2 | Cashier and admin desktop apps with native printing |

---

## ✨ Key Features

- **🧾 Fast Billing & Settlement** — One-tap KOT, bill generation, split payments, discounts, and vouchers.
- **🍳 Kitchen & Bar Routing** — Auto-route KOTs to kitchen, bar, or bill printers based on item category.
- **📊 Live Reports & Analytics** — Sales, items, inventory, payroll, and attendance dashboards.
- **🧠 AI Menu Creation** — Parse PDF menus and generate digital menu items with AI assistance.
- **🪑 Table & Floor Management** — Visual floor plan editor, QR codes per table, and section assignments.
- **📦 Inventory & Recipes** — Track stock, recipe costs, and low-stock alerts.
- **💰 Payroll & Attendance** — Staff shifts, attendance, and salary calculations.
- **🎟️ Vouchers & Loyalty** — Create and redeem promotional vouchers.
- **🔒 Role-Based Access** — Owner, admin, cashier, captain, and kitchen roles with scoped permissions.
- **🌐 Offline Mode** — Continue taking orders, billing, and printing without internet; sync when back online.

---

## 🐛 Bugs We Faced & Hardening We Added

Building a POS that has to work in real restaurants taught us hard lessons:

- **Mixed-content Android builds** — Production `.apk` builds bundle `dist/` assets and refuse to load `http://localhost` references. We added `npm run verify:captain` to fail the build if any `localhost` string leaks into the bundle.
- **Offline sync conflicts** — When two devices edit the same table or order offline, the last-write-wins default causes data loss. We built a per-action conflict resolver and a comprehensive IndexedDB test suite.
- **Service worker cache poisoning** — Old assets stuck around after deployments. We added cache-key versioning and `purgeLegacyCaches` to wipe stale caches on first load.
- **Print routing at scale** — Routing KOTs to the wrong printer caused kitchen chaos. We added explicit printer mapping per station and a fallback printer queue.
- **PIN and token expiry edge cases** — Captains and cashiers often stay logged in for days. We added token refresh, PIN auth, and graceful session expiry handling.
- **UI performance on large menus** — Menus with hundreds of items lagged on low-end Android tablets. We added virtualization, image lazy loading, and category filtering.

---

## 🎯 Our Vision

> We want to become the **default operating system for restaurants in India and beyond** — a single, affordable, reliable platform that handles everything from the first customer order to the last daily report.

No Java dependencies. No paper KOTs. No "sorry, the internet is down." Just a fast, beautiful POS that works the way restaurants actually work.

---

## 🛠️ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp .env.example .env.local
# Edit .env.local and set VITE_API_URL to your backend

# 3. Start the web dev server
npm run dev

# 4. Run tests
npm test
```

### Build the apps

```bash
# Web production build
npm run build

# Android APKs
npm run apk:cashier-android
npm run apk:admin-android
npm run apk:captain-android

# Windows desktop installers
npm run build:cashier-desktop
npm run build:admin-desktop
```

For detailed app build instructions, see [`apps/README.md`](./apps/README.md).

---

## 🧰 Tech Stack

| Layer | Tools |
|-------|-------|
| Frontend | React 19, React Router 7, Tailwind CSS 4, Vite 8, Framer Motion, Recharts, Lucide |
| State & Sync | TanStack Query, IndexedDB, custom sync engine, Socket.IO client |
| Mobile | Capacitor 8, Android SDK 33+, custom ESC/POS print plugin |
| Desktop | Tauri 2, Rust, Win32 raw printing |
| Testing | Vitest, Testing Library, jsdom, fake-indexeddb |
| Backend | Node.js, Express, TypeScript, Prisma, PostgreSQL, Redis, Razorpay, Resend, Firebase |

---

## 🔍 SEO Notes

SoftShape is built for teams searching for **restaurant POS software India**, **billing app for restaurants**, **QR menu India**, **offline-first POS**, **F&B POS system**, **PWA restaurant app**, **React POS open source**, and **kitchen display system**.

If you are a developer, restaurant owner, or integrator looking for a modern, offline-capable POS platform, you are in the right place.

---

## 📄 License

[ISC](./package.json) — SoftShape AI.
