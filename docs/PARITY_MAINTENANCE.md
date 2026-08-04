# ESC/POS Parity Maintenance Plan

## Problem
Two independent ESC/POS builders exist:
- **Backend**: `softshape-backend/src/utils/escpos.ts` — used for server-side print dispatch via Socket.IO
- **Frontend**: `Softshapeai/src/utils/escposFrontend.ts` — used for local-first printing via Tauri/edge server

Silent drift between these two produces **incorrect bills** — wrong GST, wrong formatting, missing items. This is a financial accuracy risk, not a cosmetic issue.

## Scope of parity
The following functions must produce identical ESC/POS output:
- `buildFoodKOT` — kitchen order ticket
- `buildLiquorKOT` — bar order ticket
- `buildFinalBill` — full bill with GST, discounts, settlement
- `buildCancelKOT` — cancelled item ticket
- `buildTableSwap` — table move slip
- `buildReceipt` — simple receipt with food/liquor split
- `buildXReport` — X Report (end of shift cash reconciliation)
- GST calculation: `gst.ts` (backend) ↔ `gstFrontend.ts` (frontend)

## Maintenance process

### When changing ESC/POS or GST logic:
1. **Make the change in the backend first** (`escpos.ts` / `gst.ts`)
2. **Port the same change to the frontend** (`escposFrontend.ts` / `gstFrontend.ts`) in the same PR
3. **Add or update the test** in `softshape-print-agent/softshape-print-agent/edge-server/escpos.ts` (the edge server's own copy, which is the third copy that must also stay in sync)
4. **Verify output matches** by diffing the raw ESC/POS string output for a known input

### PR checklist (add to PR template):
- [ ] If `escpos.ts` was changed, `escposFrontend.ts` was updated to match
- [ ] If `gst.ts` was changed, `gstFrontend.ts` was updated to match
- [ ] If the edge server's `escpos.ts` was changed, all three copies are in sync
- [ ] GST rate changes verified: NON_AC=5%, AC=18%, owner override, unregistered=0%
- [ ] Discount calculation verified: applied on (subtotal + GST), not just subtotal
- [ ] Bill formatting verified: item names, quantities, amounts, alignment

### Three copies that must stay in sync:
1. `softshape-backend/src/utils/escpos.ts` — cloud backend (server-side printing)
2. `Softshapeai/src/utils/escposFrontend.ts` — frontend (local-first printing via Tauri)
3. `softshape-print-agent/softshape-print-agent/edge-server/escpos.ts` — edge server (LAN hub printing)

### GST copies that must stay in sync:
1. `softshape-backend/src/utils/gst.ts` — cloud backend
2. `Softshapeai/src/utils/gstFrontend.ts` — frontend

## Future improvement
Extract shared ESC/POS constants and GST logic into a shared package (`@softshape/print-core`) that all three consumers import. This eliminates manual sync entirely. Not a Phase 2 deliverable — track as tech debt.
