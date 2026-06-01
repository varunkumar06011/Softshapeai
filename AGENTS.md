# AGENTS.md

# Softshape Frontend - AI Agent Rules

This repository contains the frontend for the Softshape POS SaaS platform.

Tech Stack:

* React
* Vite
* Socket.io
* Thermal Printing Integration (QZ Tray)
* Restaurant POS workflows

This frontend is production-sensitive.

The application handles:

* live restaurant operations
* realtime table states
* billing workflows
* kitchen order workflows
* analytics dashboards
* printing systems

Changes must preserve operational stability.

---

# 1. CRITICAL GIT RULES

## NEVER FORCE PUSH

NEVER RUN:

```bash id="k89f6j"
git push --force
git push -f
```

Do not rewrite commit history.

Always create branches for changes.

The backend is on https://softshape-backend.onrender.com, always clone https://github.com/varunkumar06011/softshape-backend for backend repo and chnage both simaltaneously
---

## BRANCH NAMING

Use:

```txt id="7fmnvp"
feature/<name>
fix/<name>
refactor/<name>
hotfix/<name>
```

Examples:

```txt id="vq7d4v"
feature/lazy-loading
fix/socket-reconnect
refactor/dashboard-state
```

---

# 2. FRONTEND PERFORMANCE RULES

The project currently has large bundle size issues.

Mandatory optimization goals:

* reduce initial JS payload
* implement route-based lazy loading
* split large dashboard modules
* remove duplicate imports
* reduce rerenders

---

## DYNAMIC IMPORT RULES

Never statically import a module that is also dynamically imported.

BAD:

```js id="m7y2ho"
import AdminPage from "./AdminPage";

const AdminPage = lazy(() => import("./AdminPage"));
```

GOOD:

```js id="11bqeq"
const AdminPage = lazy(() => import("./AdminPage"));
```

---

# 3. COMPONENT RULES

DO:

* keep components modular
* separate business logic from UI
* use reusable hooks
* isolate API logic into services

DO NOT:

* create massive components
* duplicate logic
* hardcode business values
* mix socket logic directly into large UI files

Target:

* small maintainable components
* predictable state flow

---

# 4. SOCKET.IO RULES

Realtime synchronization is critical.

Socket logic must:

* cleanup listeners properly
* avoid duplicate listeners
* reconnect safely
* handle disconnects gracefully

Always cleanup listeners:

```js id="kckl4g"
socket.off("eventName");
```

before re-registering.

Never create listeners inside uncontrolled rerenders.

---

# 5. QZ TRAY / PRINTING RULES

This application uses local thermal printer integration.

Printing is production-sensitive.

DO NOT:

* remove fallback handling
* assume QZ Tray is installed
* assume websocket printer availability
* auto-trigger duplicate prints

Always:

* handle connection failures
* show printer error states
* support reconnect attempts
* validate print success/failure

Printing failures must never silently fail.

---

# 6. API COMMUNICATION RULES

All API requests must:

* handle loading states
* handle null responses
* handle network failures
* handle expired authentication

Never assume successful responses.

Use centralized API service layers.

---

# 7. AUTHENTICATION RULES

Frontend must NEVER:

* store sensitive secrets
* expose admin credentials
* trust frontend-only role checks

Role validation belongs to backend.

Frontend checks are UI convenience only.

---

# 8. STATE MANAGEMENT RULES

Avoid:

* duplicated state
* deeply nested prop drilling
* uncontrolled global mutations

Prefer:

* reusable hooks
* isolated state
* predictable updates

Do not create hidden side effects.

---

# 9. ERROR HANDLING

All async operations must:

* handle failures
* show user-safe messages
* avoid app crashes

Never silently swallow errors.

BAD:

```js id="53iz2m"
catch (e) {}
```

GOOD:

```js id="7ht1xu"
catch (e) {
  console.error(e);
}
```

---

# 10. UI/UX RULES

The frontend is used in active restaurant environments.

Prioritize:

* speed
* clarity
* readability
* operational simplicity

Avoid:

* unnecessary animations
* blocking popups
* heavy visual effects
* complicated workflows

Restaurant staff need fast interaction.

---

# 11. BUILD RULES

Before committing:

```bash id="pl5fg4"
npm run build
```

Build must complete without fatal errors.

Investigate:

* chunk warnings
* bundle growth
* import duplication

---

# 12. ENVIRONMENT VARIABLE RULES

Never hardcode:

* API URLs
* credentials
* tokens
* printer secrets

Use:

```env id="ml8vt7"
VITE_API_URL=
```

Maintain:

```txt id="6kfj8h"
.env.example
```

---

# 13. AI AGENT RESTRICTIONS

AI agents must NEVER:

* remove socket logic blindly
* rewrite printing logic carelessly
* delete "unused" workflow code without verification
* replace business logic with assumptions
* auto-refactor critical transaction UI

Preserve operational workflows.

---

# 14. REQUIRED TESTING

After changes verify:

* login flow
* table updates
* realtime sync
* order creation
* KOT flow
* printer flow
* reconnect handling
* duplicate socket prevention

---

# 15. FINAL RULE

When uncertain:

* preserve existing behavior
* avoid destructive changes
* prioritize operational safety over clever refactors

This frontend supports real restaurant workflows.

A small UI mistake can become:

* wrong bills
* duplicate prints
* incorrect orders
* kitchen confusion
* operational downtime
