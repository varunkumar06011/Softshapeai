# SoftShape Offline-First Architecture — Master Implementation Plan

## How to use this document

This is a **plan and prompt set, not code.** Each phase below is written to be handed to an AI coding agent (Windsurf, Cursor, Kimi, Claude Code) as a standalone task brief — paste the phase you're working on, plus the relevant files it references, and tell the agent to implement exactly what's specified and to stop and ask before assuming anything not stated here.

Phases are ordered by dependency, not by priority — **Phase 0 is not optional and is not busywork.** It resolves three unknowns and one live bug that the rest of the plan depends on for correctness. Skipping it doesn't save time, it just moves the cost to Phase 3 where it's more expensive to fix.

Every file path below was verified against your actual repos (`Softshapeai-main`, `softshape-backend-main`), not assumed from the original proposal.

---

## Governing principles (non-negotiable across every phase)

1. **Offline is not a fallback state, it's the default state.** Cashier and Captain apps must create orders, print, and view tables/menu with zero connectivity, indefinitely — not "gracefully degrade until reconnect." If a feature needs network to function, it doesn't belong in the cashier/captain hot path.
2. **Sync is a background reconciliation process, never a blocker.** Nothing in the cashier or captain UI should ever wait on a network call to complete a local action.
3. **Cloud Postgres stays the system of record** for anything that isn't billing-hot-path: payroll, inventory, ledger, purchase orders, audit logs, multi-outlet aggregation. Local SQLite is a subset, not a replacement.
4. **Production stays live throughout.** No phase requires a big-bang cutover that breaks billing for restaurants currently using the system. Every phase should be shippable (or safely feature-flagged off) on its own.
5. **Business logic (GST calculation, pricing, discounts, ESC/POS formatting) must not silently fork between client and server.** Every place this plan asks you to duplicate logic locally, it also requires a stated plan for keeping the two copies in sync — this is a first-class deliverable, not a footnote.
6. **When a phase's implementation would touch a file whose current behavior you're not fully sure of, read the file first.** Several phases below explicitly say "inspect X before building" — this isn't caution for its own sake, it's because earlier audit passes found real gaps between assumption and reality in this exact codebase.

---

## Phase dependency map

```
Phase 0 (Foundation & Risk Resolution)
  ├─ 0.1 App inventory decision ──────────┐
  ├─ 0.2 Edge/print-agent audit ──────────┤
  ├─ 0.3 Tenant-scoping remediation ──────┼─→ blocks Phase 3 (sync writes)
  └─ 0.4 Auth strategy decision ──────────┘   blocks Phase 5 (onboarding)

Phase 1 (Local SQLite Layer) ──depends on 0.1
  └─→ Phase 2 (Local-First API + Offline Print Parity) ──depends on 0.2
        └─→ Phase 3 (Sync Engine) ──depends on 0.3 being closed/fenced
              └─→ Phase 4 (Local Assets + OTA) ──depends on 0.2
                    └─→ Phase 5 (Onboarding) ──depends on 0.4
                          └─→ Phase 6 (Admin Restructure) ──depends on 1, 3
                                └─→ Phase 7 (Hardening + GTM)
```

Phases 1 and the audit tasks in Phase 0 can run in parallel across a two-person team — e.g. one person closes 0.3 (tenant-scoping) while the other starts Phase 1 (SQLite schema), since Phase 1 doesn't depend on 0.3. Don't start Phase 3 until 0.3 is verifiably closed.

---

## Phase 0 — Foundation & Risk Resolution

### Objective
Resolve four unknowns/risks found during the codebase audit that the rest of the plan silently assumes are settled. None of these are large engineering efforts on their own — they're decisions and a bug fix — but getting them wrong means redoing Phase 1–3 work later.

### 0.1 — Cashier-Android disposition
**Current state:** `apps/cashier-android/` exists as a complete, independent Capacitor app — its own `capacitor.config.ts` (pointing at `https://www.softshape.in/cashier`), its own `EscposPrintPlugin.java`, its own `package.json` with `apk:cashier-android` build script. This app is not mentioned anywhere in the original four-app framing (Cashier Desktop, Admin Desktop, Admin Android, Captain Android).

**Task:** Determine whether cashier-android is (a) actively installed/used by any current restaurant, (b) legacy scaffolding from before cashier-desktop existed, or (c) intentionally kept as a backup path for restaurants without a dedicated billing PC. Check deployment logs, APK download counts, or ask directly — don't infer from code alone.

**Output:** A one-line decision recorded at the top of this document before Phase 1 starts: either "cashier-android is deprecated, do not build local-first support for it" or "cashier-android stays, build the local-first layer as a shared package so it works there too." Either answer is fine — building Phase 1 without knowing which is not.

**RESOLVED (2026-07-12):** cashier-android is live — first-class CI build (`build-apps.yml`), signed APK on GitHub Releases, actively polled for updates via `useAppUpdate.jsx`, prominently listed as a download option in `AppsSection.jsx`. Decision: **in scope.** Build the shared local-data-layer so it works on cashier-android identically to cashier-desktop.

**New open item found during this audit, not previously known:** `AppsSection.jsx` also lists a **"Cashier iPad PWA"** download option alongside Cashier Desktop and Cashier Android. A PWA has a completely different offline mechanism (service worker + Cache API, not Capacitor/Tauri + native SQLite) — it cannot use the shared local-data-layer package as designed. This needs its own investigation pass before Phase 1 is considered complete: is it live, and if so, does "complete offline-first" need to cover it too, or is it being retired in favor of cashier-android?

### 0.2 — Edge-server and print-agent audit
**Current state:** `docs/EDGE_INTEGRATION.md` (in the frontend repo) documents a real "edge server" intended to run locally on the billing PC alongside the Tauri app, with its own frontend routing layer (`src/services/edgeClient.js`, `src/services/edgeApi.js`, a `useEdgeStatus` hook) and backend routes (`src/routes/edge.ts`: `/sync`, `/changes`, `/config`, `/register`). Separately, `apps/cashier-desktop/src-tauri/Cargo.toml` contains the comment `# Windows printing (same as print-agent)`, and `src/utils/escposFrontend.ts`'s header explicitly says it was "ported from softshape-backend/src/utils/escpos.ts" and references `agentSocket.js` and `http_server.rs` — neither of which exist in the frontend or backend repos. This strongly implies a separate `softshape-print-agent` codebase exists (or existed) outside these two repos.

**Task:** Before deleting anything referencing "edge" or "print-agent," confirm: is the edge server actually deployed and running on any restaurant's billing PC today? Is there a live `softshape-print-agent` repo, and if so, is it still in use? If either is genuinely dead, deleting it is safe and Phase 2/4 can proceed as planned. If either is still load-bearing for any live restaurant, that restaurant needs a migration path before its dependency is removed.

**Output:** A short inventory: which of `edgeClient.js`, `edgeApi.js`, `docs/EDGE_INTEGRATION.md`, and any external print-agent repo are safe to retire, and which need a live-restaurant migration plan first.

**RESOLVED (2026-07-12) — architecture confirmed:**
- `edgeClient.js`, `edgeApi.js`, `useEdgeStatus.js`, `docs/EDGE_INTEGRATION.md` — confirmed dead code in the main frontend repo. Safe to delete.
- `softshape-print-agent`'s `edge-server/` module is a real, working implementation of most of Phase 1 and all of Phase 3: a 21-table SQLite schema, and a sync engine hitting `/api/edge/sync` and `/api/edge/changes` in the exact batch/queueId/accepted-rejected shape this plan describes, plus real-time Socket.IO push sync on top of that — more sophisticated than this plan originally specified. Not a stub, actively running against live backend endpoints.
- **Confirmed: this is a LAN-hub model, not a peer-to-peer one.** One edge-server instance runs on the restaurant's billing PC (the machine with the printer attached). Captain/cashier apps on other devices talk to it over LAN HTTP — `0.0.0.0` binding, open CORS, a "trust the LAN" auth model explicitly commented in the code as "same as Petpooja's local server." Most devices don't need their own independent local SQLite at all; they need to be LAN clients of the one hub, falling back to cloud only when the hub itself is unreachable. This *simplifies* Phase 1 versus the original per-device design — see the rewritten Phase 1 below.
- Runtime detail: the edge-server is a **Bun process** (`Bun.serve()`, `bun:sqlite`), not Rust — despite living inside a Tauri desktop app. Can't be imported into Tauri's Rust code directly. Recommended path: bundle it as a Bun sidecar that Tauri's `main.rs` spawns on startup, shipped inside the cashier-desktop installer — one download, no separate print-agent install, no risky rewrite.
- Two real gaps in the existing schema, carried into the Phase 1 rewrite: `daily_counter` is keyed per-outlet, not per-device (fine under a strict one-hub-per-outlet rule, a real collision risk otherwise); there's no local `users` table (needed for Phase 0.4's offline PIN check) and no local `transactions` table (needs a direct check — may simply be folded into `order_record`'s `status`/`total_amount` fields rather than actually missing).
- `AppsSection.jsx`'s "Cashier iPad PWA" is confirmed to be the existing hosted web app with a Workbox service worker, not a fourth app. It caches reads and the app shell offline, but cannot create orders, sync writes, or print offline — no local SQLite, non-GET requests are `NetworkOnly`. Its in-app "works offline" claim isn't accurate for writes. Decision: out of scope for real offline-first; leave as browse-only offline unless a future phase specifically targets iPad.

### 0.3 — Tenant-scoping remediation (blocks Phase 3)
**Current state:** The AsyncLocalStorage/Prisma-extension bug — where an extended Prisma client silently collapses a `restaurantId: { in: [...] }` multi-outlet filter down to a single outlet — is still live. The workaround (`basePrisma`, the unextended client, exported from `src/lib/prisma.ts`) is currently referenced across 26 files in the backend. This has been re-identified multiple times as new routes get added, because the *safe* behavior (explicit unextended client) is opt-in, not the default.

**Task:** This phase is not "fix every call site again." It's a structural fix: invert the default. Introduce an explicit, named scoping wrapper — something like `withOutletScope(outletId)` for single-outlet queries and `withOrgScope(organizationId, outletIds)` for multi-outlet aggregation — so that a developer writing a new route has to consciously choose which scope they want, rather than getting silently narrowed scoping by default through the AsyncLocalStorage extension. Audit every route under `src/routes/` that performs cross-outlet aggregation (reports, analytics, dashboards) and confirm each one uses the correct wrapper. Add a lint rule or a runtime assertion (e.g., throw if a query result set size looks suspiciously like it was scoped to one outlet when the caller requested multiple) if feasible.

**Why this blocks Phase 3 specifically:** the sync engine's entire job is batch-upserting records tagged with `restaurantId`/`outletId` from many devices into one shared Postgres. If tenant scoping can still silently misattribute a query today, a sync write path built on top of the same data layer can silently misattribute a *write* — which is a far worse failure mode than a wrong report. Do not start Phase 3's write path until this is verifiably closed.

**Output:** Zero remaining implicit-scope call sites in any route that touches multi-outlet data; a documented scoping convention new routes are expected to follow.

**IMPLEMENTED (2026-07-12) — with one gap to close:** All identified call sites are fixed — 3 in `analytics.ts`, 1 in `menu.ts`, 6 in `services/spire/fetchers.ts` (7 queries), 2 in `services/spire/itemMatcher.ts` — via new `withOutletScope()`/`withOrgScope()` helpers in `src/lib/prisma.ts`, plus a genuinely good regression test (`prismaScope.test.ts`) that reproduces the AsyncLocalStorage bug and asserts multi-outlet results aren't collapsed. Files already using `basePrisma` correctly were left untouched, as instructed.

**The gap:** `withOutletScope`/`withOrgScope` currently just return the unscoped `basePrisma` client — the caller still has to manually write the correct `where: { restaurantId: { in: [...] } } }` themselves, same as before. That closes the 12 known sites for good, but doesn't stop a *new* route written six months from now, by someone who's never heard of these helpers, from making the exact same mistake with the plain `prisma` client — which is the actual failure mode that's caused this bug to resurface multiple times already. Closing that needs either a lint/CI check flagging any use of the plain `prisma` client with a `restaurantId: { in: [...] }` filter, or having the wrapper actually inject the scope instead of just documenting it at the call site. Worth doing before calling 0.3 fully done — see the follow-up prompt below.

### 0.4 — Auth strategy decision (blocks Phase 5)
**Current state:** `src/onboarding/StepOwner.jsx` already implements a working Firebase Phone OTP flow — reCAPTCHA on web, native Capacitor OTP via `FirebaseAuthentication` on Android (wired into all three Android `capacitor.config.ts` files), plus email uniqueness checking and password-strength UI. This is a real, functioning auth system, not a stub. The backend (`src/routes/auth.ts`) has two login endpoints: `/api/auth/login` (email+password for OWNER/ADMIN → 7-day JWT) and `/api/auth/captain-login` (userId+PIN for CAPTAIN/CASHIER/MANAGER → 7-day JWT, with Redis-based brute-force lockout after 5 attempts). The frontend (`src/services/authService.js`) wraps both, stores JWT in `localStorage`, and has a "trust this terminal" feature in `LoginScreen.jsx` that persists sessions across browser restarts.

**DECISION (2026-07-12) — Path A: PIN as device-unlock, Firebase OTP stays for account creation.**

Rationale, confirmed by codebase investigation:
- The existing captain/cashier PIN login (`/api/auth/captain-login`) already works and is battle-tested — bcrypt-hashed PIN, Redis lockout, role enforcement. Path A doesn't touch it.
- Firebase Phone OTP (`src/lib/phoneAuth.js`) is cross-platform and functional. No reason to replace it.
- The edge-server's `auth.ts` uses a "trust the LAN" model — no per-user auth for LAN API requests. Its SQLite schema has no `users` table. This is the gap: when the hub device is offline, there's no local PIN verification, so captain/cashier can't log in at all.
- Path B would require new backend logic for reconciling PIN-created local accounts with cloud identities — high risk, low immediate value.

**What Path A concretely requires (implementation plan for Phase 1/5):**

1. **Add a `users` table to the edge-server SQLite schema** (Phase 1 work):
   - Columns: `id`, `name`, `role`, `pin_hash`, `outlet_id`, `is_active`, `synced_at`
   - Populated during the config download from cloud (`config.ts`'s `downloadFullConfig`)
   - Updated via incremental sync (`socketSync.ts`'s change events) when PINs are changed server-side

2. **Add a local PIN verification endpoint to the edge-server** (Phase 1 work):
   - `POST /api/edge/pin-login` — verifies userId+PIN against the local `users` table
   - Returns a local session token (not a cloud JWT) valid only for LAN API calls to this hub
   - Includes the same brute-force lockout logic as the cloud endpoint (but local, in SQLite, not Redis)
   - When the hub is back online, the cloud JWT from the last successful online login is still used for cloud sync

3. **Frontend: add offline login fallback** (Phase 5 work):
   - When `authService.captainLogin()` fails due to network error, try the edge-server's local `/api/edge/pin-login` instead
   - On success, store the local session token separately (e.g., `ss_local_token`) and use it for LAN API calls
   - When connectivity returns, silently re-authenticate with the cloud to get a fresh JWT

4. **No changes to backend auth** — `/api/auth/captain-login`, `/api/auth/login`, `signToken()`, `verifyToken()`, and the `authenticate` middleware all stay exactly as they are.

**Downstream impact:**
- Phase 1's "Add what the existing schema is missing: a local `users`/staff-PIN table" item is now specified — the table shape and sync mechanism are defined above.
- Phase 5's onboarding rebuild can proceed knowing the auth model is additive (local PIN layer) not replacement (PIN-first identity).
- The "trust the LAN" model from `edge-server/auth.ts` is preserved — the local PIN endpoint is for device unlock, not for LAN API auth (LAN clients are still trusted).

**Output:** Decision recorded as Path A. Implementation is split: `users` table + local PIN endpoint in Phase 1 (schema work), frontend fallback in Phase 5 (onboarding rebuild).

---

## Phase 1 — Local SQLite Database Layer

### Objective
Give the restaurant's billing hub a local, transactional, queryable data store that doesn't depend on the network — and make every other device on-site a thin, resilient client of that hub instead of an independent peer.

### Current state
`softshape-print-agent`'s `edge-server/` module already answers most of this phase: a 21-table SQLite schema, transactional writes, and a sync engine talking to live backend endpoints. It's a standalone Bun process (`bun:sqlite`, `Bun.serve()` on `0.0.0.0:3100`), explicitly designed to be the one local server a restaurant's captain/cashier apps connect to over LAN — not a per-device database. This phase is "adapt and extend a proven design," not "build from zero."

### Architecture: hub + thin clients, not N independent peers
- **Hub-capable:** cashier-desktop and cashier-android — whichever one has the printer attached / is the designated primary billing station for that outlet. Runs the full local database and the sync engine. Exactly one hub should be active per outlet at a time; a second device attempting to register as hub for the same outlet should be blocked or clearly warned, not silently allowed to run a second, divergent local database.
- **Thin LAN clients:** captain-android always, and any additional cashier-desktop/cashier-android device beyond the outlet's one designated hub (e.g. a second checkout counter). These read/write through the hub's local HTTP API over LAN — the same pattern `edge-server` already implements (`reads.ts`'s endpoints are deliberately shaped to match the cloud API so a client can swap between the two). If the hub is unreachable, fall back straight to cloud, not to a local database of their own.
- **Independent of this hub relationship:** admin-desktop and admin-android (Phase 6) — their own local SQLite for operational writes, syncing to cloud on their own schedule, since they don't need to be on the restaurant's LAN to do their job.

This is a real narrowing from a per-device-SQLite design, and it's the right one — fewer independent writers means fewer sync conflicts, and it's how `edge-server` was already, deliberately built.

### Build this
- **Resolve the transactions question first.** The edge-server schema has no `transactions` table — confirm whether settlement is handled by writing directly to `order_record` (it already has `status`, `total_amount`, `bill_number` columns, which would explain the absence) or whether closing out a bill genuinely isn't supported offline yet. This changes what "done" means here and should be answered before any new schema work.
- On the hub device, port `edge-server`'s design — not necessarily its Bun code — reusing its 21-table schema as the reference, since it's more complete than this plan originally specified: includes `tax_profile`, `price_profile`, `menu_item_addon`, `venue_price`, `venue_menu_item_availability`, and `edge_config` (local key-value state for session token, restaurant_id, backend_url, printer config).
- Add what the existing schema is missing: a local `users`/staff-PIN table (needed for Phase 0.4's offline device-unlock — doesn't exist today), plus whatever the transactions investigation above concludes is needed.
- **Cashier-desktop:** bundle the print-agent's existing Bun sidecar rather than rewriting the data layer in Rust — have Tauri's `main.rs` spawn it as a subprocess on startup, ship the Bun runtime inside the installer. More pragmatic than a full port, and reuses code that's already run in production.
- **Cashier-android, if it needs to be hub-capable** for outlets without a Windows PC: Bun doesn't run on Android, so this needs a native port — same schema, same already-validated sync protocol — implemented against `@capacitor-community/sqlite` instead of `bun:sqlite`. New implementation work, but the design underneath it is proven, not speculative.
- **Bill/KOT numbering:** keep `daily_counter`'s existing per-outlet keying — it's correct as long as exactly one hub is active per outlet, which the architecture above requires anyway. Don't build device-prefixed sequences unless the one-hub rule turns out to be unenforceable in practice.
- **Restaurant/outlet identity at onboarding:** today the cloud's `GlobalCounter` assigns a clean sequential ID at submit time, which requires connectivity at the exact moment of signup — incompatible with offline onboarding. The hub device needs to generate its own unique ID locally (e.g. a UUID) with zero network involved, and the cloud adopts that ID as-is on first sync rather than issuing a new one.

### Explicit constraints
- Do **not** build independent local SQLite for captain-android, or for any cashier/cashier-android instance that isn't the outlet's designated hub — they're thin LAN clients. Full local-first support on every single device is specifically what this phase is *not* doing.
- Do **not** create local tables for payroll, inventory, purchase orders, ledger, audit logs, marketing, or surveillance data — cloud-only, read directly from Postgres by admin apps (Phase 6).

### Definition of done
- The designated hub device (cashier-desktop or cashier-android) can create its local database, run migrations, and perform a full insert/read/transaction round-trip with zero network connectivity.
- A captain-android device on the same LAN can create an order through the hub with zero internet connectivity (LAN only), and gets a clear, correct fallback message when the hub itself is unreachable.
- The transactions question above has a written answer, not an assumption.

---

## Phase 2 — Local-First API Layer + Offline Print Parity

### Objective
Make every cashier/captain hot-path action read and write local SQLite first, with cloud sync happening independently in the background — and make sure the app can produce a *correct* printed KOT/receipt while doing so, offline.

### Current state
- `src/services/orderApi.js` (`createOrder()`, roughly lines 145–244) currently does try-cloud-first, fall back to `addPendingAction()` on an IndexedDB-backed offline queue (`src/utils/offlineDB.js`, 868 lines) if the cloud call fails or `isBackendReachable()` returns false.
- Printing today is **server-centric**, not client-centric: the backend (`src/routes/print.ts` in `softshape-backend-main`) builds the actual ESC/POS bytes server-side — `buildFoodKOT`, `buildLiquorKOT`, `buildReceipt`, `buildFinalBill` in `src/utils/escpos.ts` — using DB-sourced GST rates (`src/utils/gst.ts`: NON_AC defaults to 5%, AC to 18%, unless an owner override is set), discounts, and tenant context. It then pushes the rendered bytes out over Socket.IO `print_job` events, routed to per-outlet rooms, protected by Redis-backed locks (`PRINT_LOCK_KEY`, `EMIT_LOCK_KEY` in `print.ts`) to prevent double-prints, with a buffering layer (`bufferPrintJob`/`getRecentPrintJobs`) for reconnect resilience.
- A client-side ESC/POS builder already exists — `src/utils/escposFrontend.ts` (521 lines), explicitly a port of the backend's `escpos.ts` — but today it's a fallback path only, used when the Tauri `print_raw` command is invoked because "the backend socket is unavailable" (per the comment in `apps/cashier-desktop/src-tauri/src/main.rs`).

### Build this
- Rework `orderApi.js`, `tableApi.js`, and the menu read paths (`src/services/menuService.js`, `unifiedMenuService.js`) so local SQLite (from Phase 1) is the *first* write/read target, not a fallback. Every create/update writes to local SQLite, appends a row to `sync_queue`, and returns immediately — no network round trip in the critical path.
- **Promote `escposFrontend.ts` from fallback to primary path**, and bring it to full parity with the backend's `escpos.ts` — same GST breakdown logic (referencing the same NON_AC/AC/owner-override rules), same discount handling, same formatting. This is real, scoped work: audit every code path in `escpos.ts` that `escposFrontend.ts` doesn't yet replicate.
- **Define a parity-maintenance plan**, not just a one-time port: whenever GST rates, discount rules, or receipt formatting change on the backend, there needs to be a stated process (shared constants file, generated from one source, or a checklist in the PR template) for updating the frontend copy too. Silent drift between the two is a live risk to bill accuracy, not a cosmetic issue.
- Local print job dispatch: on order/KOT creation, build the ESC/POS bytes locally and print immediately via the existing Tauri `print_raw`/`print_network` commands (`apps/cashier-desktop/src-tauri/src/main.rs`) — no dependency on the Socket.IO round trip for the common case.
- Remove `edgeClient.js`, `edgeApi.js`, and `offlineDB.js` (IndexedDB) **only after Decision 0.2 confirms it's safe** and Phase 1's SQLite layer is a verified functional replacement.

### Explicit constraints
- Do not remove the server-side ESC/POS generation (`escpos.ts`, `print.ts`) — it's still needed for reprints, admin-initiated prints, and any device that hasn't caught up to local-first printing yet. This phase adds a local-first path, it doesn't delete the server-side one.
- The 8,723-line `src/cashier/CashierDashboard.jsx` should be broken into smaller modules as part of this rework — not as a separate cleanup task afterward, since you'll be touching most of its data-fetching logic anyway.

### Definition of done
- Creating an order and printing a KOT works correctly (right GST, right discount, right formatting) with the device's network adapter physically disabled.
- A documented, findable answer to "what happens when backend GST logic changes" exists before this phase is called complete.

---

## Phase 3 — Cloud Sync Engine

### Objective
Reconcile local SQLite and cloud Postgres bidirectionally, without requiring either side to block on the other.

### Current state
`src/routes/edge.ts` (633 lines) already implements `POST /api/edge/sync`, which accepts `{ restaurantId, batch: [{ queueId, tableName, recordId, operation, data }] }`, processes each item, and returns `{ accepted: [...], rejected: [...] }`. This is structurally almost identical to what a new `/api/sync/push` would need to do. **Treat this phase as adapting and generalizing `edge.ts`, not building a parallel system from scratch** — read it fully before writing anything new.

### Build this
- Push path: a background sync daemon (interval-based, e.g. 30s) reads `sync_queue` from local SQLite, batches pending changes, and calls the adapted `/api/sync/push` (or the generalized `/api/edge/sync`) endpoint. On success, marks queue entries synced. On failure, retries with exponential backoff — do not drop failed items silently.
- Pull path: the daemon periodically (e.g. 60s) calls a pull endpoint with a `since={version}` cursor, applies returned changes (menu edits, price changes, new staff, table config) to local SQLite, and advances `sync_meta.lastPullVersion`.
- Conflict resolution: last-write-wins for most tables; for `orders`, if two devices touched the same order, don't silently pick a winner — surface it as a flagged conflict in the admin app (Phase 6) for manual resolution.
- Device identity: each installed app instance gets a `deviceId` on first launch, persisted locally and registered with the cloud, used to disambiguate which device originated which change (and which bill-number series it owns, per Phase 1's device-prefixed numbering).

### Explicit constraints
- **Do not start the write path (push) until Decision 0.3 — the tenant-scoping remediation — is verified closed.** Read-path (pull) work can proceed in parallel since it's less exposed to the scoping bug (it's pulling data already correctly written by the existing app, not writing new cross-outlet data).
- Reuse the existing Redis-backed locking pattern (`redisLock.ts`) already used for print jobs if sync operations need similar duplicate-prevention guarantees — don't invent a second locking mechanism.

### Definition of done
- A cashier device that goes offline for a full shift, takes orders locally, and reconnects at end-of-day syncs everything to Postgres with zero data loss and zero duplicate bill numbers, verified by an actual test that does exactly this.
- A simulated two-device conflict on the same order is caught and surfaced, not silently resolved incorrectly.

---

## Phase 4 — App Loading: Local Assets + OTA

### Objective
Make every app start instantly and work fully offline from the moment it's launched — including the very first launch after install if connectivity is unavailable at that moment (excluding the one-time initial data sync, which genuinely needs a connection once).

### Why this phase is necessary (and not a step backward)
All three Capacitor configs (`captain-android`, `admin-android`, `cashier-android`) currently use `server.url` pointing at `https://www.softshape.in/...` — this was a deliberate, already-shipped decision to get OTA-style updates (JS changes deploy without forcing an app-store reinstall) without building custom update infrastructure. That decision is still good *for the problem it solved*. But it has a hard limitation this plan's core requirement exposes: if the app loads its UI from a remote URL, it cannot start at all without network — which is fundamentally incompatible with "complete offline-first." This phase doesn't undo the earlier decision so much as replace the mechanism while keeping the goal (JS updates without reinstalls) intact.

### Build this
- Change every Tauri `tauri.conf.json` (`apps/cashier-desktop/src-tauri/tauri.conf.json:18`, and the admin-desktop equivalent) from the remote `url` to load from the local bundled `frontendDist`.
- Remove `server.url` from every Capacitor config (`captain-android`, `admin-android`, and `cashier-android` if Decision 0.1 keeps it) in favor of `webDir` pointing at locally bundled assets.
- Build a custom OTA mechanism to replace what `server.url` was providing: on startup, check a version endpoint; if a newer web-bundle exists, download it, verify integrity, extract to a local assets directory, and prompt for restart (or apply silently on next launch). This must handle a corrupted/partial download by falling back to the last-known-good bundle — never leave the app in a state where it can't start.
- Native binary updates stay as-is: Tauri's already-configured updater for desktop, the existing `src/services/appUpdateService.js` (119 lines) pattern for Android APK updates via GitHub Releases.

### Explicit constraints
- Ship this only after Phase 2 is functional — there's no point making the app load instantly offline if it still can't take an order offline once it's open.
- If Decision 0.2 finds the edge server still live for any restaurant, that restaurant needs to be migrated off remote-URL loading explicitly, not silently cut over.

### Definition of done
- Cold-launching any offline-capable app with no network connection results in a working, billable UI in under 2 seconds, not an error screen or blank webview.
- A deliberately corrupted OTA download does not brick the app on next launch.

---

## Phase 5 — 10-Minute Onboarding

### Objective
Replace the current 13-step, cloud-dependent onboarding wizard with a 4-step flow that works offline and gets a restaurant billing in roughly 10 minutes.

### Current state
`src/onboarding/OnboardingWizard.jsx` currently orchestrates 13+ step components (`StepRestaurant`, `StepOwner`, `StepYourSpace`, `StepStaff`, `StepMenu`/`MenuUpload`, `StepTax`, `StepPrinters`, `StepOutlets`, `StepPlan`, `StepPayment`, `StepBranding`, `StepPreview`, `StepConfirmation`, `OnboardingSuccess`). The final submit hits `POST /api/onboard` in `softshape-backend-main/src/routes/onboard.ts`, whose main handler runs from line 449 to line 1134 (a single ~685-line function inside a 1,252-line file) and creates Organization → Outlet → Users → Venues → Floors → Sections → Tables → Categories → MenuItems → PriceProfiles → Staff in one pass. If connectivity drops near the end, the whole thing is lost. `StepOwner.jsx` already implements a full Firebase Phone OTP flow (reCAPTCHA + native Capacitor OTP), not a stub.

### Build this
- Collapse to 4 steps: (1) Restaurant basics + owner account, (2) menu template selection, (3) table count, (4) printer auto-detect via the existing `list_printers` Tauri command.
- **Owner account creation follows whichever path was decided in 0.4.** If Path A: keep the existing Firebase OTP flow from `StepOwner.jsx` largely as-is, add a local PIN as a device-unlock layer on top. If Path B: build the new PIN-first flow with deferred phone verification — but this requires new backend logic for reconciling a locally-created account with cloud identity once verified, which should be scoped and reviewed before implementation, not discovered mid-build.
- 5–6 menu template JSON files (dine-in veg, dine-in non-veg, bar, cafe, cloud kitchen, generic fallback), each mapped to the actual `Category`/`MenuItem`/variant field names in `prisma/schema.prisma` — inspect the real schema before authoring these, don't assume a shape.
- All four steps write to local SQLite (Phase 1) immediately; a background sync task pushes to cloud Postgres via the sync engine (Phase 3) once connectivity exists. The wizard should never block on a network call to complete a step.
- Defer plan/payment selection to day 7 (or first bill, whichever is sooner) — free trial, no Razorpay integration blocking onboarding. GST configuration and branding get sensible defaults (NON_AC/5%, matching the current backend default in `gst.ts`) and are editable later from admin settings, not collected during onboarding.

### Explicit constraints
- Don't start rebuilding onboarding until 0.4 is decided — the auth path materially changes what Step 1 looks like.
- Multi-outlet setup stays a post-onboarding, admin-side flow, same as the original proposal — don't try to fit outlet configuration into the 10-minute flow.

### Definition of done
- A new restaurant can go from app launch to printing a real KOT in roughly 10 minutes, with no network connection required at any point except (if Path B) deferred phone verification.

---

## Phase 6 — Admin App Restructure

### Objective
Split admin functionality into local-first operational tasks (menu, tables, staff, settings) and cloud-required analytical tasks (reports, payroll, inventory, ledger, purchase orders, audit logs), so admins can make routine changes offline while analytics stay backed by the single source of truth in Postgres.

### Build this
- Admin Desktop and Admin Android both consume the shared local-data-layer package from Phase 1 for operational routes, and call the existing cloud APIs directly for analytical routes.
- Admin writes to local SQLite for menu/table/staff/settings changes, which sync (Phase 3) to cloud and then pull down to cashier/captain devices within the sync interval — this is how a price change on the admin app reaches a cashier machine without a direct connection between them.
- Break up `src/admin/adminRoutes.jsx` (196 lines, currently a fairly flat route list) along this local-first/cloud-required line so the split is explicit in the routing structure, not just a convention developers have to remember.
- Reports, payroll, inventory, ledger, and purchase orders continue to read live from Postgres — no local caching of this data, since staleness here is a correctness problem (payroll amounts, inventory counts) rather than a minor UX one.

### Explicit constraints
- Do not attempt to make payroll/inventory/ledger work offline. That's out of scope for this plan and was correctly excluded in the original proposal — keep it excluded.

### Definition of done
- An admin can rename a menu item or 86 a dish with the admin device offline, and see it reflected on the cashier screen within the sync interval once both devices are back online.
- Reports remain accurate and are never served from stale local data.

---

## Phase 7 — Production Hardening + Go-to-Market

### Objective
Make the system trustworthy enough to hand to a restaurant owner who has never heard the word "SQLite," and package it as something you can install in one sitting.

### Build this
- Daily local SQLite backup to a rotating file (keep ~7 days); pruning of local orders older than ~90 days (cloud retains everything — local storage is bounded, especially on Android).
- Corruption recovery: if local SQLite is unreadable on startup, re-download a fresh copy from cloud (requires connectivity) with a clear, non-technical error message — never fail silently into a blank screen.
- A visible, persistent offline/online indicator ("Offline — billing works, sync pending" vs. "Online — all synced") so staff always know the current state without guessing.
- A "Close Day" action that forces a full sync pass, waits for confirmation from the cloud, and only then locks that day's transactions — this is the moment daily numbers become final, and it should be an explicit, confirmed action, not implicit.
- Test coverage specifically for the scenarios that are cheap to skip and expensive to hit in production: two devices editing the same table simultaneously; a device losing power mid-order; a device that's been offline for a full shift reconnecting and syncing a full day's worth of orders at once; a sync attempt that starts before Phase 0.3's tenant-scoping fix would have caught a misattribution (i.e., a regression test proving the fix holds under sync load, not just under normal request load).
- Single installer per platform: one `.exe`/`.msi` per desktop app (Tauri already bundles this), one `.apk` per Android app (or per surviving Android app, per Decision 0.1).

### Explicit constraints
- Don't treat the go-to-market packaging (installer, pricing, distribution) as blocked on 100% of the above — but don't ship "Close Day" or backup/recovery as an afterthought either. A restaurant owner's trust in this system depends entirely on "did today's numbers come through correctly," and that's exactly what this phase protects.

### Definition of done
- A full onboard → bill → settle → close day → verify-in-admin cycle passes as an automated end-to-end test, including at least one run where connectivity is deliberately cut partway through.

---

## What actually gets deleted (corrected)

Only after the corresponding Phase 0 decision confirms it's safe:

- `src/utils/offlineDB.js` — after Phase 1's SQLite layer is a verified functional replacement (Phase 2).
- `src/utils/syncEngine.js` — after Phase 3's sync engine replaces it and has run successfully against real data.
- `src/services/edgeClient.js`, `src/services/edgeApi.js` — after Decision 0.2 confirms no live restaurant depends on the edge server.
- `src/context/SyncStatusContext.jsx` — after Phase 3's sync daemon has its own status reporting.
- `server.url` in all Capacitor configs, and the remote `url` in both Tauri configs — as part of Phase 4, not before (removing this before Phase 2/local printing works would break billing for whoever's on those builds).
- Any external `softshape-print-agent` repo — **only** after Decision 0.2 explicitly confirms it's not deployed anywhere live. Do not delete on the assumption that it's obsolete; confirm first.

## What definitely doesn't change

Backend Express + PostgreSQL + Prisma as the cloud system of record; Socket.IO for real-time admin-dashboard updates (cloud-side); Tauri's Rust printing commands (`print_raw`, `print_network`, `list_printers`) and the Win32 implementation in `windows_printing.rs`; the Prisma schema as cloud source of truth; the Tauri auto-updater; `EscposPrintPlugin.java` on Android; the `authenticate`/`requireRole` middleware for cloud-side auth.

---

## Appendix — Open questions log

Track these here as they get resolved; each one gates a specific phase above.

| # | Question | Gates | Status |
|---|----------|-------|--------|
| 1 | Is `cashier-android` live, legacy, or intentional backup? | Phase 1 | **Resolved — live, in scope** |
| 2 | Is the edge server actually deployed on any restaurant's billing PC today? | Phase 2, 4 | **Resolved — dead frontend code, but see #3** |
| 3 | Does a live `softshape-print-agent` repo exist, and does its `edge-server/` module overlap with Phase 1–3? | Phase 1 | **Confirmed live — merge-vs-parallel decision pending follow-up investigation (below)** |
| 4 | Is the AsyncLocalStorage tenant-scoping fix verifiably closed (not just re-patched)? | Phase 3 | Blast radius mapped (12 sites / 4 files) — fix not yet applied |
| 5 | Path A (PIN as device-unlock) or Path B (PIN-first account creation) for auth? | Phase 5 | Open — recommend Path A |
| 6 | Is the "Cashier iPad PWA" listed in `AppsSection.jsx` live, and does it need offline support too? | Phase 1 | Open — newly discovered |

## Rough sizing (not a committed timeline)

Given this is a two-person engineering team (you and Akhil) working alongside ongoing production hardening, treat these as rough relative sizes, not deadlines:

- Phase 0: small in engineering effort, but don't compress it — it's decision-and-verification work, and rushing it is exactly how it gets skipped.
- Phase 1: moderate — mostly mechanical once the schema is settled.
- Phase 2: large — the ESC/POS parity and business-logic-sync-plan work inside this phase is the most underestimated part of the original proposal.
- Phase 3: moderate-to-large, and its true size depends entirely on how clean Phase 0.3 leaves the tenant-scoping situation.
- Phase 4: small-to-moderate — mostly config changes plus a genuinely new OTA mechanism.
- Phase 5: moderate — depends on which auth path was chosen.
- Phase 6: moderate.
- Phase 7: don't compress — this is the phase that determines whether restaurant owners trust the system with their daily numbers.