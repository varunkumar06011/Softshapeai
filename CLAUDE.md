# Softshapeai Frontend - Claude Code Guidelines

## Project Overview

Softshapeai is a production-grade restaurant management system with real-time order tracking, dual-outlet support (Restaurant + Bar), gamification, AI tools, and multi-role dashboards.

### Tech Stack
- React 19.2.5, React Router 7.15.0, Vite 8.0.14
- Tailwind CSS 4.2.4, Framer Motion 12.40.0
- Context API + Custom Hooks, TanStack React Query 5.100.11
- Socket.io Client 4.8.3, Recharts 3.8.1, Lucide React 1.16.0

## Architecture

### Role-Based Organization
```
src/
├── admin/      # Full system control
├── captain/    # Waiter interface
├── cashier/    # Billing terminal
├── user-menu/  # Customer menu
├── shared/     # Reusable components
├── context/    # Global state
├── hooks/      # Custom hooks
└── services/   # API & business logic
```

### Dual-Outlet System
- Single codebase for Restaurant (food) + Bar (liquor)
- Outlet toggle in localStorage: `'softshape_active_outlet'`
- Separate APIs: `/api/...` vs `/api/bar/...`
- Menu filtering: `menuType: 'FOOD' | 'LIQUOR'`

### Real-Time Sync
- Socket.io: Server → Client updates
- WebSocket (PieSocket): Frontend-to-frontend communication
- localStorage events: Cross-tab sync
- Polling: 5s fallback for tables

### Optimistic UI
Update state immediately, fire API in background (non-blocking):
```javascript
// ✅ CORRECT
setTables(prev => /* update */);
addNotification('Success');
createOrder(data).catch(console.warn);

// ❌ WRONG - Don't await
await createOrder(data);
setTables(prev => /* update */);
```

## Code Conventions

### File Naming
- Components: `PascalCase.jsx`
- Services: `camelCase.js` with suffix (Service/Api/Sync)
- Contexts: `[Feature]Context.jsx`
- Hooks: `use[Feature].js`

### Component Structure Order
```javascript
export default function Component({ props }) {
  // 1. State hooks
  // 2. Context hooks
  // 3. Derived state (useMemo)
  // 4. Effects
  // 5. Event handlers
  // 6. Helper functions
  // 7. JSX return
}
```

### Abbreviated Props (for menu/orders)
Reduce payload size:
- `n` → name, `p` → price, `q` → quantity
- `c` → category, `t` → type, `v` → variant

### State Management
- **Context**: Global data (outlet, menu, socket)
- **Local**: Component UI state, forms, timers
- **localStorage keys** (reserved):
  - `softshape_unified_menu`
  - `softshape_tables_cache_v3`
  - `softshape_active_outlet`
  - `softshape_captain_targets`
  - `captain_auth_v2`

## API Integration

### Backend Config
```javascript
import { API_BASE } from '../services/apiConfig';
// Reads: VITE_API_URL || VITE_BACKEND_URL || "https://softshape-backend.onrender.com"
```

### Key Endpoints
```
GET  /api/menu/:restaurantId
POST /api/orders
PATCH /api/tables/:id/session
GET  /api/transactions?restaurantId=X&date=YYYY-MM-DD
```

### Socket Events
```javascript
socket.on('table:updated', handleUpdate);
socket.on('order:created', handleOrder);
socket.on('billing:requested', handleBilling);
```

## Styling

### Colors
```
Primary:    #E53935 (Red)
Dark:       #B71C1C
Background: #FFF5F5 (Light Pink)
Cards:      #FFCDD2
Text:       #1A1A1A
```

### Typography
- Font: `font-['Inter',sans-serif]`
- Headings: `font-black uppercase tracking-[0.2em]`
- Buttons: `text-xs uppercase`

### Patterns
```jsx
// Card
<div className="bg-white rounded-2xl shadow-xl p-6">

// Button
<button className="px-6 py-4 bg-[#E53935] text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all">

// Input
<input className="w-full px-4 py-3 bg-[#FFF5F5] border-2 focus:border-[#E53935] rounded-xl outline-none" />
```

### Responsive
- Mobile-first with `sm:`, `md:`, `lg:` breakpoints
- Use `h-[100dvh]` not `h-screen` for mobile

## Components

### When to Split
- Component > 1500 lines
- Reusable across roles → `shared/components/`
- Performance issues → lazy load

### Performance
```javascript
// Memoize computations
const filtered = useMemo(() => items.filter(...), [items]);

// Lazy load
const Dashboard = lazy(() => import('./Dashboard'));
```

## Testing & Quality

### Currently: No tests
Add Vitest + React Testing Library before writing tests

### Linting
```bash
npm run lint
npm run lint -- --fix
```

Rules: No console.log, declare useEffect deps, no unused vars, prefer const

## Git & Deployment

### Branches
```
feature/add-menu
bugfix/fix-timer
hotfix/critical-bug
```

### Commits (Conventional Commits)
```
feat: Add dish creation
fix: Resolve KOT timer
chore: Update deps
```

### Deployment
- Push to `main` → Vercel auto-deploy
- Set `VITE_API_URL` in Vercel dashboard
- Pre-deploy: `npm run build`, test both outlets, check socket

## Cross-Repo (Frontend ↔ Backend)

### Backend Location
`/workspace/.../softshape-backend`

### Multi-Tenancy
- Restaurant: `restaurantId="restaurant-001"`
- Bar: `restaurantId="bar-001"`

### Data Models
```typescript
// MenuItem (abbreviated frontend, full backend)
{ id, n, p, c, t: 'VEG'|'NON_VEG', menuType: 'FOOD'|'LIQUOR', variants, addons }

// Table
{ id, number, status, workflowStatus, sessionCaptain, guestCount, kotHistory }

// Order
{ id, tableId, items, status, totalAmount, createdAt }
```

### Authentication
Currently NONE. Backend is public (internal use only).

## Special Features

1. **AI Dish Creation** (`AIDishCreationModal.jsx`) - Generate menu items
2. **Dynamic Pricing** (`pricingEngine.js`) - Weather/event-based pricing
3. **Marketing Engine** (`creativeEngine.js`) - 14 themed promo images
4. **Gamification** (`SliceChallenge.jsx`) - Pizza game for discounts
5. **Captain Performance** - Revenue targets, discount limits

## Performance

### Targets
- Bundle < 500KB gzipped
- Images: JPG for photos, SVG for icons
- Lazy load heavy components

### Avoid Re-Renders
```javascript
// ❌ New function every render
<Button onClick={() => handle(id)} />

// ✅ Memoized
const handleMemo = useCallback(() => handle(id), [id]);
<Button onClick={handleMemo} />
```

## Don't Do

### Never Commit
- `.env`, `node_modules/`, `dist/`
- `console.log` (use warn/error or remove)
- API keys, secrets

### Never Use
- Inline styles (except dynamic values)
- Class components
- `var`, `any` (if TS added)

### Never Block UI
```javascript
// ❌ Awaiting blocks
await api();

// ✅ Background call
api().catch(console.error);
```

## Environment Variables

```bash
# Required
VITE_API_URL=https://softshape-backend.onrender.com

# Access in code
import.meta.env.VITE_API_URL  // ✅
process.env.VITE_API_URL      // ❌ Wrong
```

## Getting Started

```bash
git clone <repo>
cd Softshapeai
npm install --include=dev
cp .env.example .env
npm run dev
```

**Key files**: `apiConfig.js`, `useSocket.js`, `OutletContext.jsx`, `billing.js`

## Contact

Owner: varunkumar06011, Collaborator: Akhil14324

---

**Version**: v1.0.0 (2024-05-24)

**Remember**: Speed > perfection. Optimistic UI accepted. Test both outlets before commit.
