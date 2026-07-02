import { lazy } from 'react';
import {
  LayoutDashboard, Table2, UtensilsCrossed, ClipboardList, Receipt,
  ChartNoAxesCombined, DollarSign, Megaphone, Camera, Sparkles,
  Settings, Printer, QrCode, Tag, Store, Users, Wallet, Star,
} from 'lucide-react';

// ── Lazy-loaded section components (code-splitting) ──────────────────────────
// Each section becomes a separate chunk, reducing initial bundle size.
// PWA service worker precaches all chunks via globPatterns for offline use.

const Dashboard       = lazy(() => import('./AdminComponents').then(m => ({ default: m.Dashboard })));
const Tables          = lazy(() => import('./AdminComponents').then(m => ({ default: m.Tables })));
const BarTables       = lazy(() => import('./AdminComponents').then(m => ({ default: m.BarTables })));
const MenuPage        = lazy(() => import('./AdminComponents').then(m => ({ default: m.MenuPage })));
const BarMenuPage     = lazy(() => import('./AdminComponents').then(m => ({ default: m.BarMenuPage })));
const Orders          = lazy(() => import('./AdminComponents').then(m => ({ default: m.Orders })));
const Reports         = lazy(() => import('./AdminComponents').then(m => ({ default: m.Reports })));
const Payroll         = lazy(() => import('./AdminComponents').then(m => ({ default: m.Payroll })));
const Marketing       = lazy(() => import('./AdminComponents').then(m => ({ default: m.Marketing })));
const Pricing         = lazy(() => import('./AdminComponents').then(m => ({ default: m.Pricing })));
const Inventory       = lazy(() => import('./AdminComponents').then(m => ({ default: m.Inventory })));
const KitchenInventory = lazy(() => import('./AdminComponents').then(m => ({ default: m.KitchenInventory })));
const StaffManagement = lazy(() => import('./AdminComponents').then(m => ({ default: m.StaffManagement })));
const Attendance      = lazy(() => import('./AdminComponents').then(m => ({ default: m.Attendance })));
const AdminVouchers   = lazy(() => import('./AdminVouchers'));
const SurveillanceDashboard = lazy(() => import('./SurveillanceDashboard'));
const TodaySpecials   = lazy(() => import('./TodaySpecials'));
const AdminTransactions = lazy(() => import('./AdminTransactions'));
const SettingsPage    = lazy(() => import('./components/SettingsPage'));
const PrinterSettingsPage = lazy(() => import('./printers/PrinterSettingsPage'));
const TableQRCodes    = lazy(() => import('./TableQRCodes'));
const PriceProfilesPage = lazy(() => import('./PriceProfilesPage'));
const OutletsOverview = lazy(() => import('./OutletsOverview'));
const CaptainPerformanceDashboard = lazy(() => import('../captain/CaptainPerformanceDashboard'));

// ── Wrapper components for activeOutlet forking ──────────────────────────────
// Keeps bar/restaurant branching inside the section, not in the router config.

function TablesSection({ activeOutlet, onOpen }) {
  if (activeOutlet === 'bar') return <BarTables />;
  return <Tables onOpen={onOpen} />;
}

function MenuSection({ activeOutlet, onAddDish }) {
  if (activeOutlet === 'bar') return <BarMenuPage />;
  return <MenuPage onAddDish={onAddDish} />;
}

// ── Eager preloading for frequently used sections ──────────────────────────
// Call this after AdminDashboard mounts so Menu, Tables, Dashboard, etc.
// start downloading in the background before the user clicks them.

export function preloadAdminSections() {
  try {
    // Touch the dynamic import factories so Vite/webpack starts fetching the chunk
    const preload = import('./AdminComponents');
    preload.catch(() => {});
  } catch {
    // ignore
  }
}

// ── Route config — single source of truth for sidebar + routes ───────────────
// Each entry drives both the sidebar nav button and the <Route> definition.
// To add a section: add one entry here. Both sidebar and routes update automatically.

export const adminRoutes = [
  { key: 'dashboard',         label: 'Dashboard',              icon: LayoutDashboard,     roles: ['admin','owner'], element: <Dashboard />,                    props: (ctx) => ({ revenue: ctx.revenue, totalSales: ctx.totalSales, netSales: ctx.netSales, totalDiscount: ctx.totalDiscount, ordersCount: ctx.ordersCount, activityLog: ctx.activityLog, statsLoading: ctx.statsLoading }) },
  { key: 'tables',            label: 'Tables',                 icon: Table2,              roles: ['admin','owner'], element: <TablesSection />,                props: (ctx) => ({ activeOutlet: ctx.activeOutlet }) },
  { key: 'menu',              label: 'Menu',                   icon: UtensilsCrossed,     roles: ['admin','owner'], element: <MenuSection />,                  props: (ctx) => ({ activeOutlet: ctx.activeOutlet, onAddDish: ctx.onAddDish }) },
  { key: 'specials',          label: 'Today Specials',         icon: Star,                roles: ['admin','owner'], element: <TodaySpecials /> },
  { key: 'orders',            label: 'Online Orders',          icon: ClipboardList,       roles: ['admin','owner'], element: <Orders /> },
  { key: 'transactions',      label: 'Transactions',           icon: Receipt,             roles: ['admin','owner'], element: <AdminTransactions />,            props: (ctx) => ({ onStatsRefresh: ctx.loadStats }) },
  { key: 'reports',           label: 'Reports',                icon: ChartNoAxesCombined, roles: ['admin','owner'], element: <Reports /> },
  { key: 'staff',             label: 'Staff',                  icon: Users,               roles: ['admin','owner'], element: <StaffManagement /> },
  { key: 'captains',          label: 'Captain Analytics',      icon: ChartNoAxesCombined, roles: ['admin','owner'], element: <CaptainPerformanceDashboard /> },
  { key: 'payroll',           label: 'Payroll',                icon: DollarSign,          roles: ['admin','owner'], element: <Payroll />,                       props: (ctx) => ({ onPayslip: () => {} }) },
  { key: 'vouchers',          label: 'Vouchers',               icon: Wallet,              roles: ['admin','owner'], element: <AdminVouchers /> },
  { key: 'attendance',        label: 'Attendance',             icon: Users,               roles: ['admin','owner'], element: <Attendance /> },
  { key: 'kitchen-inventory', label: 'Kitchen/Bar Inventory',  icon: UtensilsCrossed,     roles: ['admin','owner'], element: <KitchenInventory /> },
  { key: 'marketing',         label: 'Marketing AI',           icon: Megaphone,           roles: ['admin','owner'], element: <Marketing />,                     props: (ctx) => ({ upload: ctx.mUpload, setUpload: ctx.setMUpload, uploadRef: ctx.mUploadRef, generated: ctx.mGenerated, setGenerated: ctx.setMGenerated, posted: ctx.mPosted, setPosted: ctx.setMPosted }) },
  { key: 'surveillance',      label: 'Surveillance',           icon: Camera,              roles: ['admin','owner'], element: <SurveillanceDashboard />,         props: (ctx) => ({ onIncident: () => {} }) },
  { key: 'pricing',           label: 'Pricing',                icon: Sparkles,            roles: ['admin','owner'], element: <Pricing /> },
  { key: 'price-profiles',    label: 'Price Profiles',         icon: Tag,                 roles: ['admin','owner'], element: <PriceProfilesPage /> },
  { key: 'settings',          label: 'Settings',               icon: Settings,            roles: ['admin','owner'], element: <SettingsPage />,                  props: (ctx) => ({ onNavigate: ctx.goToSection }) },
  { key: 'printers',          label: 'Printers',               icon: Printer,             roles: ['admin','owner'], element: <PrinterSettingsPage /> },
  { key: 'qr-codes',          label: 'QR Codes',               icon: QrCode,              roles: ['admin','owner'], element: <TableQRCodes /> },
  { key: 'outlets-overview',  label: 'My Outlets',             icon: Store,               roles: ['admin','owner'], element: <OutletsOverview /> },
];

// Manager-only routes — managers see only these in the sidebar and can only
// access these URLs. All other routes redirect synchronously via AdminRouteGuard.
export const managerRoutes = ['tables', 'captains'];

// ── Module gating logic ──────────────────────────────────────────────────────
// Verbatim extraction of the filter that existed in AdminDashboard.jsx
// (moduleGatedNavItems, lines ~257–282). Pure function, zero behavioral risk.

export function isRouteEnabled(key, enabledModules) {
  if (key === 'specials') return true;
  if (key === 'surveillance') return enabledModules.surveillance === true;
  if (key === 'pricing') return enabledModules.pricing !== false;
  if (key === 'tables') return enabledModules.tables !== false || enabledModules.food !== false;
  if (key === 'menu') return enabledModules.food !== false || enabledModules.bar !== false;
  if (key === 'orders') return enabledModules.food !== false || enabledModules.bar !== false;
  if (key === 'transactions') return true;
  if (key === 'reports') return true;
  if (key === 'captains') return enabledModules.tables !== false;
  if (key === 'payroll') return enabledModules.payroll !== false;
  if (key === 'vouchers') return enabledModules.vouchers !== false;
  if (key === 'attendance') return enabledModules.payroll !== false;
  if (key === 'marketing') return enabledModules.marketing !== false;
  if (key === 'kitchen-inventory') return enabledModules.food !== false || enabledModules.bar_inventory === true || enabledModules.bar !== false;
  if (key === 'settings') return true;
  if (key === 'printers') return true;
  if (key === 'outlets-overview') return true;
  return enabledModules[key] !== false;
}

export function getInventoryLabel(enabledModules) {
  if (enabledModules?.bar && enabledModules?.food) return 'Kitchen/Bar Inventory';
  if (enabledModules?.bar) return 'Bar Inventory';
  if (enabledModules?.food) return 'Kitchen Inventory';
  return 'Inventory';
}
