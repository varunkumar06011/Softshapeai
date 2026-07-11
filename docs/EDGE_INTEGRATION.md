# Edge Server Integration Guide — Captain App

## Overview

The edge server runs on the billing PC alongside the Tauri app. It handles
hot-path operations (order creation, KOT printing, table/menu reads) locally,
eliminating the 500-800ms cloud round-trip.

## New Files

| File | Purpose |
|------|---------|
| `src/services/edgeClient.js` | Edge server detection, health check, smart routing |
| `src/services/edgeApi.js` | Edge-first API wrappers for hot-path calls |
| `src/hooks/useEdgeStatus.js` | React hook for edge availability in components |

## Integration Steps

### 1. Replace hot-path API calls in components

Swap cloud API calls with edge-first wrappers in any component that does
order creation, table reads, or menu reads:

```js
// Before (cloud-only):
import { createOrder } from '../services/orderApi';
const result = await createOrder({ tableId, items, ... });

// After (edge-first with cloud fallback):
import { edgeCreateOrder } from '../services/edgeApi';
const result = await edgeCreateOrder({ tableId, items, ... });
```

### 2. Hot-path functions to replace

| Current | Edge replacement | Notes |
|---------|-----------------|-------|
| `createOrder()` from `orderApi.js` | `edgeCreateOrder()` | Same params, same return shape |
| `fetch(apiUrl('/api/tables'))` | `edgeGetTables()` | Sections + nested tables + orders + KOTs |
| `fetch(apiUrl('/api/sections'))` | `edgeGetSections()` | Sections with venue/floor |
| `fetch(apiUrl('/api/menu'))` | `edgeGetMenu(venueId)` | Full menu with variants/addons |
| `fetch(apiUrl('/api/menu/items'))` | `edgeGetMenuItems(venueId)` | Lean POS list |
| `fetch(apiUrl('/api/venues'))` | `edgeGetVenues()` | Venues with floors/sections |

### 3. Show edge status in the UI (optional)

```jsx
import { useEdgeStatus } from '../hooks/useEdgeStatus';

function StatusBar() {
  const { edgeAvailable } = useEdgeStatus();
  return (
    <span className={edgeAvailable ? 'text-green-500' : 'text-gray-400'}>
      {edgeAvailable ? '⚡ Local' : '☁ Cloud'}
    </span>
  );
}
```

### 4. Preload all data on app launch (optional)

```js
import { edgePreloadAll } from '../services/edgeApi';

// On app mount — loads tables, menu, sections, venues in parallel
const { tables, menu, sections, venues } = await edgePreloadAll(venueId);
```

### 5. Environment variable (optional)

Set `VITE_EDGE_URL` in `.env` if the edge server runs on a non-default port:

```
VITE_EDGE_URL=http://localhost:3100
```

## How It Works

```
Captain app makes API call
         │
         ▼
   edgeApi.js wrapper
         │
         ├── Edge available? ──→ Route to localhost:3100 (15-40ms)
         │                              │
         │                              ├── Success → Return response
         │                              └── Fail → Fall back to cloud
         │
         └── Edge unavailable? ──→ Route to cloud backend (500-800ms)
```

- **Edge health check**: Every 15s, 2s timeout, 2 failures to mark offline
- **Write fallback**: If edge fails on POST, automatically retries on cloud
- **Read fallback**: GET requests to edge-only reads don't fall back (data
  might be stale). Other GETs fall back to cloud.
- **Transparent**: Same response shapes as cloud — components don't need changes

## What NOT to Route to Edge

These operations should always go to the cloud backend:
- Authentication (`/api/auth/*`)
- Reports and analytics (`/api/reports/*`)
- Settings and configuration (`/api/settings/*`)
- Payment processing (`/api/payments/*`)
- User management (`/api/users/*`)
- Any non-hot-path operation

## Existing Offline Fallback

The captain app already has an offline queue (`orderApi.js` → `addPendingAction`).
The edge server is a **better alternative** to the offline queue:

| Scenario | Without edge | With edge |
|----------|-------------|-----------|
| Internet down | Queue locally, print later, sync when online | Write to local SQLite, print immediately, sync in background |
| Internet flaky | Retry 3×, then queue | Edge handles it locally, no retries needed |
| Internet OK | 500-800ms cloud round-trip | 15-40ms local edge response |

The existing offline fallback in `orderApi.js` remains as a last resort — if
both edge AND cloud are unavailable, the offline queue kicks in.
