# Captain App Audit Report

## Summary

| Severity | Count |
|---|---|
| Critical | 4 |
| High | 9 |
| Medium | 6 |
| Low | 3 |
| Open Question | 4 |

---

## Findings

### CAP-001 — Critical — KOT order ID extraction crashes on unexpected response shape
- **Category:** B (Cart & order lifecycle)
- **File:** `src/captain/CaptainApp.jsx` ~L2334-2338, L2362
- **Description:** `sendIncrementalKOT` extracts `realKotId` with `(response?.order?.kotHistory || response?.kotHistory)?.[...?.length - 1]?.id`. If the backend returns an error-wrapped shape or `kotHistory` is undefined, `?.length` returns `undefined`, `undefined - 1` is `NaN`, and array access with `NaN` returns `undefined`. The fallback `Math.floor(1000 + Math.random() * 9000)` then generates a fake KOT ID that pollutes `kotHistory` and breaks cancellation matching.
- **Steps to reproduce:** Trigger a KOT send where backend returns `{ error: "..." }` or an order shape without `kotHistory`.
- **Suggested fix:** Validate that `kotHistory` is an array and has length > 0 before indexing. If not present, derive the KOT ID from the response's `kotNumber` or skip the optimistic `kotHistory` append.
- **Blast radius:** `sendIncrementalKOT` only; no shared files.

### CAP-002 — Critical — `onTableUpdated` socket handler ingests cross-restaurant table events
- **Category:** F (Real-time sync)
- **File:** `src/captain/CaptainApp.jsx` ~L1453-1478
- **Description:** The socket handler `onTableUpdated` checks `table.restaurantId === 'venue-001'` to decide whether to call `setVenueTables` or `setActiveTables`, but it does NOT skip the event if `table.restaurantId` does not match `activeRestaurantId`. A table update from `restaurant-001` can mutate `venueTables` if the payload shape happens to match, or vice versa.
- **Suggested fix:** Add an early return guard: `if (table.restaurantId && table.restaurantId !== activeRestaurantId) return;` before applying the update.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-003 — Critical — Swap table modal always passes `RESTAURANT_ID` (hardcoded), breaking venue swaps
- **Category:** C (Table assignment, move & swap)
- **File:** `src/captain/CaptainApp.jsx` ~L5383-5391
- **Description:** The `swapTable` call inside the Move Table modal passes `RESTAURANT_ID` (always `restaurant-001`) as the 4th argument. If the captain is swapping a venue table (`venue-001`), the backend receives the wrong `restaurantId` and may reject the swap or assign the table to the wrong restaurant context.
- **Suggested fix:** Pass `activeRestaurantId` instead of `RESTAURANT_ID`.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-004 — Critical — `tableCarts` cleanup effect deletes valid carts during initial load
- **Category:** A (State & persistence)
- **File:** `src/captain/CaptainApp.jsx` ~L1702-1712
- **Description:** The `useEffect` that "cleans stale carts" runs whenever `activeTables` or `venueTables` change. During initial `useTableSync` load, `activeTables` briefly transitions from fallback tables to API-fetched tables. If a captain has an unsubmitted cart for a real table that isn't in the fallback set yet, the effect deletes the cart before the real tables arrive.
- **Suggested fix:** Only run the cleanup after `tablesSyncing` / `venueTablesLoading` is false and tables are stable. Also check `isSyncing` flag.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-005 — High — `updateDraftQty` triggers side effects inside a state updater function
- **Category:** B (Cart & order lifecycle)
- **File:** `src/captain/CaptainApp.jsx` ~L2105-2134
- **Description:** `updateDraftQty` calls `setTableCarts(prev => { ... setRemovedItem(itemToUpdate); ... })`. Calling another state setter (`setRemovedItem`) inside a functional `setState` updater violates React guarantees and can cause batching/ordering bugs.
- **Suggested fix:** Move `setRemovedItem` and `setTimeout` logic outside the updater, or compute the delta first and dispatch side effects in a `useEffect` or after the `setTableCarts` call.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-006 — High — `addNotification` ID collision under rapid events + potential memory leak
- **Category:** F (Real-time sync)
- **File:** `src/captain/CaptainApp.jsx` ~L1724-1730
- **Description:** `addNotification` uses `Date.now()` as the notification ID. If two socket events fire within the same millisecond (common on bulk updates), notifications deduplicate incorrectly or overwrite each other. Also, `setTimeout(() => remove, 3000)` is scheduled but never cleared if the component unmounts.
- **Suggested fix:** Use `crypto.randomUUID()` or a monotonic counter for IDs. Store timeout refs and clear them on unmount.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-007 — High — `onOrderPaid` clears table state but leaves `lastConfirmedItemsRef` stale
- **Category:** F (Real-time sync)
- **File:** `src/captain/CaptainApp.jsx` ~L1427-1451
- **Description:** When an `order:paid` event arrives, the handler resets `activeOrder`, `kotHistory`, `currentBill`, etc., and clears the cart. However, `lastConfirmedItemsRef.current` is never reset. If the captain immediately opens the same table again (before socket re-fetch), `sessionBill` uses the stale ref and displays a non-zero total for a free table.
- **Suggested fix:** Add `lastConfirmedItemsRef.current = []` inside the `order:paid` handler.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-008 — High — `openTableSession` unconditionally deletes previous cart even if it has unsent items
- **Category:** A (State & persistence)
- **File:** `src/captain/CaptainApp.jsx` ~L1972-1979
- **Description:** When switching tables, `openTableSession` calls `delete next[previousTableId]` for the previous table's cart without checking if there are unsubmitted items. If a captain accidentally taps a different table, their current draft is silently lost with no warning or recovery.
- **Suggested fix:** Check if `prev[previousTableId]?.length > 0` and either warn the captain or preserve the cart in a temporary "drafts" stash.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-009 — High — Menu search in `filteredMenu` diverges from shared `filterMenuItems` utility
- **Category:** D (Menu, search & variants)
- **File:** `src/captain/CaptainApp.jsx` ~L1259-1299
- **Description:** `filteredMenu` implements its own substring search (`words.some(w => name.includes(w))`) instead of using the shared `filterMenuItems` from `menuSearch.js`, which includes Levenshtein fuzzy matching, subsequence matching, veg/non-veg shorthand, etc. This means search behavior is inconsistent between CaptainApp and Cashier/Admin.
- **Suggested fix:** Replace the inline search with `filterMenuItems(outletFilteredMenuItems, { query: searchQuery, category: activeCategory, diet: activeDiet })`.
- **Blast radius:** `CaptainApp.jsx` only; `menuSearch.js` is already imported.

### CAP-010 — High — `totalQty` calculation uses `startsWith` causing false quantity matches
- **Category:** D (Menu, search & variants)
- **File:** `src/captain/CaptainApp.jsx` ~L4229, L4131
- **Description:** `currentSessionItems.filter(i => i.n.startsWith(item.n))` is used to compute how many of an item are in the cart. If the cart contains "Chicken 65" and the menu shows "Chicken", `startsWith` incorrectly attributes the quantity of "Chicken 65" to "Chicken".
- **Suggested fix:** Use exact name match `i.n === item.n` or match by `menuItemId`/`id`.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-011 — High — Voice search `recognitionRef` leak on rapid toggle
- **Category:** D (Menu, search & variants)
- **File:** `src/captain/CaptainApp.jsx` ~L1736-1807
- **Description:** `startVoiceSearch` assigns `recognitionRef.current = recognition` but if the user rapidly toggles voice search on/off, the old `SpeechRecognition` instance is abandoned without calling `.abort()` or removing its event listeners. The old instance may still fire `onresult` and mutate `searchInput`.
- **Suggested fix:** Before creating a new instance, call `recognitionRef.current?.abort()` and null out the ref.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-012 — High — `requestFinalBill` clears `activeTableId` before API success
- **Category:** B (Cart & order lifecycle)
- **File:** `src/captain/CaptainApp.jsx` ~L2686-2703
- **Description:** The function sets `setActiveTableId(null)` and `setView('tables')` optimistically before the `requestBilling(orderId)` API call. If the API fails, the revert handler restores the table status but does NOT restore `activeTableId` or the view. The captain is kicked out to the tables view and loses their session context.
- **Suggested fix:** Only clear `activeTableId` after the API resolves successfully. On error, keep the captain in the session view.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-013 — High — `CaptainPerformanceDashboard` IST offset math is incorrect
- **Category:** E (Billing calculations)
- **File:** `src/captain/CaptainPerformanceDashboard.jsx` ~L163, L181
- **Description:** The dashboard adds `5.5 * 60 * 60 * 1000` ms to a UTC timestamp and then calls `.getUTCHours()`. This does not convert to IST; it merely shifts the timestamp and then reads UTC hours of the shifted value, which is incorrect during DST transitions and gives wrong hour labels near midnight.
- **Suggested fix:** Use `toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric' })` instead of manual offset arithmetic.
- **Blast radius:** `CaptainPerformanceDashboard.jsx` only.

### CAP-014 — Medium — `handlePinInput` uses `setTimeout` without cleanup on unmount
- **Category:** G (Auth / PIN flow)
- **File:** `src/captain/CaptainApp.jsx` ~L1919-1947
- **Description:** PIN validation uses a 600ms `setTimeout` to simulate auth delay. If the component unmounts during this delay (e.g., page refresh), the timeout fires on a destroyed component tree, potentially calling state setters on an unmounted component.
- **Suggested fix:** Store the timeout ID in a ref and clear it in the effect cleanup / component unmount.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-015 — Medium — `sendIncrementalKOT` `printTimeout` leaks if component unmounts during 30s window
- **Category:** B (Cart & order lifecycle)
- **File:** `src/captain/CaptainApp.jsx` ~L2482-2485
- **Description:** A `setTimeout` is registered to wait for `kot:printed` socket ack. If the captain navigates away or the component unmounts within 30 seconds, the timeout fires and calls `socket.off` + `addNotification` on a dead component.
- **Suggested fix:** Store `printTimeout` in a ref and clear it in a cleanup effect.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-016 — Medium — `cancelKotItem` print ack promise never rejects on socket error
- **Category:** B (Cart & order lifecycle)
- **File:** `src/captain/CaptainApp.jsx` ~L2607-2620
- **Description:** The `await new Promise` for print confirmation only resolves (with `'timeout'`). If the socket disconnects, the promise never rejects and the function hangs until the 12s timeout. The captain sees loading spinner for the full 12 seconds even if the network is obviously down.
- **Suggested fix:** Add a socket disconnect listener that resolves the promise early with `'disconnected'`.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-017 — Medium — `filteredTables` for bar-ac-hall assumes section name contains "bar"
- **Category:** C (Table assignment, move & swap)
- **File:** `src/captain/CaptainApp.jsx` ~L1219-1228
- **Description:** `baseTables = activeTables.filter(t => { const sec = (t.sectionName || t.section?.name || '').toLowerCase(); return sec.includes('bar'); })` relies on string matching. If a section is renamed to "Bar & Lounge" or "Main Bar", it works, but if renamed to "Pub" or "Drinks", the tables vanish from the captain's view with no fallback.
- **Suggested fix:** Add a fallback to show all tables when the section filter returns zero results, or use `sectionId` matching instead of string includes.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-018 — Medium — `activeRestaurantId` memo returns `RESTAURANT_ID` for unknown `tableSubCategory`
- **Category:** C (Table assignment, move & swap)
- **File:** `src/captain/CaptainApp.jsx` ~L1010-1018
- **Description:** If `tableSubCategory` is somehow set to an invalid value (e.g., from a corrupted localStorage entry or a future feature), `activeRestaurantId` silently falls back to `RESTAURANT_ID`. This could cause venue tables to be created under the wrong restaurant.
- **Suggested fix:** Add a defensive check and log a warning when `tableSubCategory` is unrecognized.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-019 — Medium — `getLiquorDescription` and module-level `levenshtein` are dead code
- **Category:** D (Menu, search & variants)
- **File:** `src/captain/CaptainApp.jsx` ~L35-128
- **Description:** `levenshtein` is defined at module level in CaptainApp.jsx but never used (the component uses `filterMenuItems` from `menuSearch.js`). `getLiquorDescription` is also never referenced anywhere in the file.
- **Suggested fix:** Remove dead code to reduce bundle size and avoid confusion. (Note: this is a safe cleanup, not a logic change.)
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-020 — Low — `isVenueTableRef.current` set by string inclusion of `'-'`
- **Category:** C (Table assignment, move & swap)
- **File:** `src/captain/CaptainApp.jsx` ~L1967-1968
- **Description:** `isVenueTableRef.current = venueTables.some(...) || (table.id && String(table.id).includes('-'))` uses a hyphen check as a venue heuristic. If a regular table ID happens to contain a hyphen (e.g., `"local-5"` from fallback tables), `setActiveOrVenueTables` routes mutations to `venueTables`, which may not contain the table.
- **Suggested fix:** Remove the hyphen heuristic and rely solely on `venueTables.some(...)`.
- **Blast radius:** `CaptainApp.jsx` only.

### CAP-021 — Low — `mobile-touch-target` CSS has invalid property `justify-center: center`
- **Category:** H (UI/UX glitches)
- **File:** `src/captain/captain-mobile-optimizations.css` ~L10
- **Description:** `.mobile-touch-target { justify-center: center; }` is invalid CSS. It should be `justify-content: center`. This means the class does not actually center content as intended.
- **Suggested fix:** Change to `justify-content: center`.
- **Blast radius:** `captain-mobile-optimizations.css` only.

### CAP-022 — Low — `undoRemove` function referenced but not defined in the file
- **Category:** H (UI/UX glitches)
- **File:** `src/captain/CaptainApp.jsx` ~L5136
- **Description:** The removed-item toast has an `onClick={undoRemove}` button, but `undoRemove` is not defined anywhere in `CaptainApp.jsx`. This will throw a ReferenceError if the user taps "Undo".
- **Suggested fix:** Define `undoRemove` to re-add the removed item to `tableCarts`, or remove the button if undo is not implemented.
- **Blast radius:** `CaptainApp.jsx` only.

---

## Open Questions

1. **OQ-001:** `isBeerItem` in `itemHelpers.js` checks for keywords like `beer`, `lager`, `ale`, `bira`, `carlsberg`, etc. Is it intentional that non-beer liquors (whisky, vodka) skip the variant picker and go straight to `addItemToSession`? The code at `handleItemClick` says "Beer items should be added directly" and "Other liquor items (spirits) should show variant picker", but the actual logic routes `item.menuType === 'LIQUOR' && !item.isBottleItem` to the variant picker. What is the intended behavior for `isBottleItem` vs `isBeerItem`?

2. **OQ-002:** `todayRevenue` is polled every 60 seconds and summed from both `RESTAURANT_ID` and `BAR_ID`. Should a captain's revenue count transactions from both outlets, or only the outlet they are currently logged into? Currently it always sums both.

3. **OQ-003:** The `activeVariantItem` / `VariantPicker` flow: when a variant is selected, `handleVariantSelect` calls `addItemToSession(item, variant)`, but `addItemToSession` only takes one argument (`item`) in its signature. Is `variant` supposed to be used to override the price/quantity, and if so, where is that logic?

4. **OQ-004:** The `tableSyncService.js` `persistStatusChanges` function sends `PATCH /api/tables/:id/session` with a `status` field. When a table becomes `Free`, it sends `status: 'Free'`. The backend `tables.ts` `PATCH /:id/session` route accepts `status`, `captainId`, `guests`, `time`, `currentBill`. However, the backend also has `PATCH /:id/status` for status-only updates. Is the session endpoint the correct one for status changes, or should the sync service use the dedicated status endpoint to avoid side effects on other session fields?

---

## Out of Scope / Noted but not investigated

- `socket.ts` — Only exports `getIo`/`setIo`; no Captain-specific logic to audit.
- `prisma/schema.prisma` — Not read; schema changes are out of scope.
- `src/services/menuSyncService.js` — Imported via `useMenuSync` hook; audited only at the hook contract level.
- `src/services/barTableSyncService.js`, `barMenuSyncService.js`, `venueTableSyncService.js` — These are separate sync services with their own socket handlers; a full audit of them would require reading additional files and is out of scope for this CaptainApp-focused pass.
- `src/services/waiterCallService.js`, `customerSessionService.js` — Used for emergency overlay; audited only for their interaction with CaptainApp state.
- `src/services/captainTargetService.js` — Thin wrapper around `/api/captain-targets`; no frontend state bugs observed.
- `src/shared/components/VariantPicker.jsx`, `VenueSectionView.jsx`, `OutletToggle.jsx`, `BarMenuToggle.jsx`, `DateInputButton.jsx` — External components; audited only via their props/contracts with CaptainApp.
- `src/utils/resilience.js` — Imported but not audited in depth; appears to be a shared retry utility.
- `src/config/captains.js` — Hardcoded captain list with plaintext PINs; noted as a security concern but out of scope for this functional audit.
