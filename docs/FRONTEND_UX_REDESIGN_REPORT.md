# Frontend Simplification & Workflow-Centred UX Redesign Report — Pro Office (Adarsh ID Cards)

## 1. Executive Summary

The Pro Office frontend has been redesigned from a 12-item, development-phase-driven navigation layout into a streamlined, workflow-centred office operations application organized around **four core working modules** (`Clients`, `Orders`, `Labour`, `Stock`), a compact **`Administration`** secondary section, and an action-oriented **Today / Operations Dashboard**. All 13 backend Django domain apps, PostgreSQL 17 schemas, `/api/v1/` endpoints, business rules, and role permissions remain intact.

---

## 2. Previous vs. New Navigation Structure

### Previous Navigation Structure (12 Top-Level Links across 4 Technical Groups)
- **OVERVIEW:** `Dashboard` (contained welcome banner, Phase 1–4 status labels, 3 planned placeholder cards, infrastructure health telemetry, and a 9-card module directory)
- **WORK MANAGEMENT:** `Clients`, `Orders`, `Production`, `Dispatch`
- **OPERATIONS:** `Labour`, `Machines`, `Inventory`, `Stock Audit`
- **SYSTEM:** `Settings`, `Users`, `Activity Logs` (plus nonfunctional `"Notifications (Planned)"` header chip)

### New Navigation Structure (4 Primary Working Modules + Compact Administration)
- **Home:** `Dashboard` (`/dashboard`) — Answers *"What should I work on right now?"*
- **Workspace (ONLY 4 Primary Modules):**
  1. **Clients** (`/clients`) — Client directory, quick creation, duplicate-safe search, profiles, original & replacement order history (`clients.view`).
  2. **Orders** (`/orders`) — Orders list, new/replacement order intake, and the **Order Workspace** (`/orders/:orderId`) with integrated tabs for Overview, Items, Production (Design & Printing + Lanyard Batch Calculator), Labour & Assembly, Packing & Dispatch, and History (`orders.view`).
  3. **Labour** (`/labour`) — Unified **Labour & Machines** workspace featuring tabs for `Labourers` directory & seasonal recovery profiles, `Machines` allocation & register, and `Work Assignments & Returns` (`labour.view`).
  4. **Stock** (`/stock`) — Unified **Stock Management** workspace featuring tabs for `Overview & Catalogue`, `Office & Labour Balances`, `Consumption`, `Defective`, `Stock Audits` (physical counts & adjustments), and `Movement History`, plus live Ledger Reconciliation verification (`inventory.view`).
- **Administration (Compact Secondary Navigation, Role-Filtered):**
  - `Users & Roles` (`/system/users`, `OWNER_ADMIN` / `users.view`)
  - `Activity Logs` (`/system/activity-logs`, `audit_logs.view`)
  - `Settings & Health` (`/system/settings` — account profile, password dialog, workspace config, quick link to Machine Configuration, and live System & Database Health moved off the Dashboard)

*(Backward compatibility preserved: legacy routes `/inventory`, `/stock-audit`, `/machines`, `/production`, `/production/jobs/:jobId`, and `/dispatch` continue to resolve directly without broken links.)*

---

## 3. Dashboard Redesign

### Removed Clutter
- Large welcome card banner and `"Phase 1 / Phase 2 / Phase 3 / Phase 4"` labels.
- 3 dashed `"Planned"` placeholder cards (`Production`, `Inventory`, `Dispatch`).
- `Application & Infrastructure Health` card (relocated to `Administration -> Settings & Health`).
- Redundant 9-card `Pro Office Operational Modules` directory.
- Unused `ModulePlaceholderPage.tsx` Phase 1 scaffold removed.

### New Action-Focused Layout (`DashboardPage.tsx`)
1. **Header & 4 Quick Actions:** Time-aware greeting + current IST business date + `New Order`, `Add Client` (`/clients?action=new`), `Assign Labour` (item picker modal -> `/orders/:id?tab=assembly`, or `/labour`), and `Stock In` (`/stock?action=stock-in`).
2. **Work Overview (Real Backend Counts Only):**
   - `Active Orders` (non-completed/cancelled orders)
   - `Orders in Production` (`/api/v1/production/overview/`)
   - `Pending Assembly` (`lanyards_ready_for_assembly`)
   - `Ready for Dispatch` (`/api/v1/dispatch/queue/`)
3. **Today's Work:** Actionable queue listing items `Awaiting Design`, `Awaiting Printing`, `Awaiting Assembly`, or `Ready for Dispatch`, each linking straight into the target tab of `/orders/:orderId`.
4. **Pending Attention:** Rendered only when genuine operational alerts exist (labour assignments awaiting return, low-stock materials below `minimum_stock_level`, consumption variances, or unapproved physical audits).
5. **Recent Orders:** Compact operational table (`Order #`, `Client`, `Order Date`, `Items`, `Current Progress`, `Open`).

---

## 4. Screens & Components Modified / Added

| File | Purpose / Change |
| :--- | :--- |
| `frontend/src/types/navigation.ts` | Replaced phase-status metadata with `TODAY` / `OPERATIONS` / `ADMINISTRATION` sections and `matchPaths`. |
| `frontend/src/app/router/navigationConfig.ts` | Reduced primary navigation to 4 modules (`Clients`, `Orders`, `Labour`, `Stock`), moved admin items to `Administration`, added role/permission visibility helpers (`canAccessNavigationItem`, `getVisibleNavigationSections`). |
| `frontend/src/app/layouts/SidebarNav.tsx` | Light-first compact sidebar (`w-56`), removed Phase/version clutter, grouped primary vs Administration cleanly, role-gated links. |
| `frontend/src/app/layouts/TopHeader.tsx` | Added live **Global Search** (orders, clients, labourers) and live **Operational Alerts Bell** (replacing `"Notifications (Planned)"`). |
| `frontend/src/app/layouts/AppShellLayout.tsx` | Widened desktop container (`max-w-[1440px]`) with `overflow-x-hidden`. |
| `frontend/src/app/router/AppRouter.tsx` | Added `/stock` route while preserving `/inventory`, `/stock-audit`, `/machines`, `/production*`, `/dispatch`, and `/system/*`. |
| `frontend/src/app/providers/AuthProvider.tsx` | Cleared auth state & cancelled queries prior to session logout to prevent post-logout 403 noise. |
| `frontend/src/modules/dashboard/DashboardPage.tsx` | Complete workflow-first dashboard replacement backed by real production, order, dispatch, labour, and stock queries. |
| `frontend/src/modules/production/OrderItemProductionPanel.tsx` | Extracted full Design, Printing, Lanyard Batch Calculator, Printing Runs, ID Card completion, and Assembly UI into reusable panel. |
| `frontend/src/modules/production/ProductionJobDetailPage.tsx` | Refactored standalone job permalink page to wrap `<OrderItemProductionPanel />`. |
| `frontend/src/modules/orders/OrderDispatchPanel.tsx` | Built order-scoped Packing & Dispatch queue, dispatch modal, partial dispatch history, and Client/Office Surplus summary. |
| `frontend/src/modules/orders/OrderDetailPage.tsx` | Redesigned with 6 workflow tabs (`Overview`, `Items`, `Production`, `Labour & Assembly`, `Packing & Dispatch`, `History`) synced with URL query params (`?tab=&item=`). |
| `frontend/src/modules/labour/LabourPage.tsx` | Unified Labour workspace with `Labourers`, `Machines` (`<MachinesPanel embedded />`), and `Work Assignments & Returns` tabs. |
| `frontend/src/modules/machines/MachinesPage.tsx` | Extracted `<MachinesPanel />` for embedding inside `Labour`. |
| `frontend/src/modules/inventory/InventoryPage.tsx` | Unified Stock Management workspace adding `Stock Audits` tab (`<StockAuditPanel embedded />`), live Ledger Verification badge (`/api/v1/inventory/reconcile/`), and `?tab=` / `?action=stock-in` triggers. |
| `frontend/src/modules/stock_audit/StockAuditPage.tsx` | Extracted `<StockAuditPanel />` for embedding inside `Stock`. |
| `frontend/src/modules/clients/ClientsListPage.tsx` | Added `?action=new` query support to launch `Add Client` dialog directly from Dashboard Quick Actions. |
| `frontend/src/modules/system/SettingsPage.tsx` | Relocated live `System & Database Health` card off Dashboard and added compact Administration links (`Users & Roles`, `Activity Logs`, `Machine Configuration`). |

---

## 5. Features Moved to Secondary Navigation

- **Users & Roles** (`/system/users`) — Moved under `Administration` (visible only to `Owner / Admin`).
- **Activity Logs** (`/system/activity-logs`) — Moved under `Administration` (visible only with `audit_logs.view`).
- **Settings & System Health** (`/system/settings`) — Moved under `Administration`; live API/PostgreSQL health monitoring moved out of Dashboard into `Settings & Health`.
- **Machine Allocation & Configuration** — Operational machine register moved into **Labour -> Machines** tab and linked from `Settings & Health` (route `/machines` retained).
- **Physical Stock Audits** — Moved into **Stock -> Stock Audits** tab (route `/stock-audit` retained).

---

## 6. Functionality Preserved

- Normalized client duplicate detection, archival, client profiles, and inline client creation during order intake.
- Multi-item original and linked replacement orders separating Student vs Staff items, ID Card specifications, and Lanyard specifications.
- Independent 1:1 `ProductionJob` tracking, lanyard batch printing calculations (`12 mm = 37`, `16 mm = 30`, `20 mm = 25`), partial runs, waste tracking, and batch overrides.
- Split lanyard assignments across labourers / internal `office_assembly`, machine size compatibility & overrides, balance-aware material issuance, partial assembly receiving, and retained labourer balance reconciliation.
- Central inventory ledger (`MOV-10001+`), multi-packaging stock-in, Office <-> Labour transfers, automatic office consumption formula, defective records, draft/submit/approve stock audits, partial dispatches, Office Surplus Pool, Client Surplus, and seasonal material/machine recovery.
- All backend RBAC checks (`OWNER_ADMIN` vs `OFFICE_WORKER`, zero labourer login accounts) and CSRF/session security.

---

## 7. Tests Performed (Verified After Final Edits)

- **TypeScript Strict Check (`npm run lint` -> `tsc --noEmit`):** **0 errors**.
- **Vitest Unit & Component Integration Suite (`npm run test`):** **4 test files, 13 tests passed** (`App.test.tsx`, `Phase2Orders.test.tsx`, `Phase3Production.test.tsx`, `Phase4Operations.test.tsx`), including verification of the 4-module sidebar, Office Worker role hiding of admin links, Dashboard quick actions & overview counts, and `/inventory` / `/stock` routing.
- **Production Vite Build (`npm run build`):** Succeeded cleanly (`dist/` bundle generated).
- **Playwright Live E2E Browser Suite (`npx playwright test`):** Executed against live PostgreSQL 17 (`:5434`), Django 5.1 (`:8008`), and Vite/React 19 (`:5178`) across `phase4.spec.ts`, `phase5_responsive_and_fixes.spec.ts`, and `smoke.spec.ts`, covering:
  - 4-module primary navigation + zero legacy top-level Production/Machines/Dispatch/Stock Audit clutter
  - Dashboard Quick Actions (`Add Client`, `New Order`, `Stock In`), Global Search, and `/api/v1/inventory/reconcile/`
  - Complete Order-centred inline workflow (`Overview`, `Production`, `Labour & Assembly`, `Packing & Dispatch` tabs) & Scenario E dispatch quantity guard
  - Labourers + embedded Machines tab & Stock + embedded Stock Audits tab
  - Desktop (`1280x800`), Tablet (`768x1024`), and Mobile (`390x844`) responsive viewports across all primary and administration routes with zero horizontal overflow (`scrollWidth <= clientWidth + 4`) and zero browser page/console errors.

---

## 8. Known Incomplete / Future-Scope Features

- **Offline PWA Support & Background Sync:** Deferred for future phase (`vite-plugin-pwa` / IndexedDB outbox queue; backend UUIDv4 PKs and `idempotency_key` fields already exist on `Order`, `PrintingRun`, `StockMovement`, and `DispatchRecord`).
- **Route-Level Code Splitting:** Production JS bundle compiles cleanly as a single chunk (`~735 kB` minified / `~193 kB` gzipped); lazy-loading secondary tabs/routes is a non-blocking future optimization.
- **Automated Daily Customer Notifications:** No external email/WhatsApp/SMS gateway is integrated (notifications bell surfaces real internal operational alerts only).
