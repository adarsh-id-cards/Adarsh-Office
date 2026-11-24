# Phase Status Report — Pro Office (Adarsh ID Cards)

## Current Phase: Phase 5 — Final Verification, Integration, Testing & Production Readiness (COMPLETED)

---

## 1. Completed Work (Phases 1–5)

### Phases 1–4 Operational Foundation (Verified & Hardened)
- **Modular Monolith (`React 19 + TypeScript` SPA, `Django 5.1 + DRF` REST API under `/api/v1/`, `PostgreSQL 17` in `Asia/Kolkata`):** Single codebase, single PostgreSQL database, isolated port configuration (`8088`, `8008`, `5178`, `5434`).
- **Authentication, Security & Audit Logs (`apps.accounts`, `apps.audit_logs`):** Internal `OWNER_ADMIN` and `OFFICE_WORKER` roles (labourers strictly excluded), CSRF + HTTP-only session cookies, immutable audit trail (`audit_logs.view` enforced), and `ScopedRateThrottle` on `/api/v1/auth/login/`.
- **Clients, Orders & Independent Production (`apps.catalog`, `apps.clients`, `apps.orders`, `apps.production`):** Duplicate-safe client directory, multi-item orders (`id_card` & `lanyard`), replacement orders with optional surplus allocation, 1:1 `ProductionJob` workflows, and lanyard batch capacity calculations (`12 mm = 37`, `16 mm = 30`, `20 mm = 25`).
- **Labour, Machines, Assembly, Inventory, Audits & Dispatch (`apps.labour`, `apps.machines`, `apps.inventory`, `apps.assembly`, `apps.stock_audit`, `apps.dispatch`):** Office-managed labourer profiles, single-active-holder machine allocation locks, split lanyard assembly, balance-aware material issuance, immutable `StockMovement` ledger (`MOV-10001+`), `/api/v1/inventory/reconcile/`, consumption reconciliation formula, physical stock audits, partial/full dispatches with produced-usable guards and `idempotency_key`, office/client surplus pools, and end-of-season recovery.

### Phase 5 Verification & Defect Fixes Completed
1. Enforced `HasModulePermission("audit_logs.view")` on `AuditLogListAPIView` (`GET /api/v1/audit-logs/`).
2. Added `ScopedRateThrottle` (`auth_login`) to `LoginAPIView` (`POST /api/v1/auth/login/`).
3. Enforced produced-usable dispatch cap (`produced_usable - dispatched_quantity`) in `create_dispatch_record` and `DispatchPage.tsx`, and added `DispatchRecord.idempotency_key` (`dispatch.0002_dispatchrecord_idempotency_key`).
4. Scaled replacement `ProductionJob` planned quantities by `ordered_quantity - allocated_from_surplus_quantity` in `allocate_office_surplus_to_replacement_item`.
5. Unified `DSP-`, `SRP-`, `AUD-`, and `SCL-` generators onto row-locked `next_named_sequence(...)` (`StockMovementSequence`).
6. Fixed `get_order_item_assembly_capacity` unprinted check (`max_allocatable = min(printed_qty, required_assembly)`) and added `["assembly"]` query invalidation in `ProductionJobDetailPage.tsx`.
7. Added `GET /api/v1/inventory/reconcile/` endpoint and eliminated N+1 `production_job` lookup in `DispatchQueueView`.
8. Fixed `/orders` desktop horizontal overflow (`OrdersListPage.tsx` & `AppShellLayout.tsx`).
9. Updated `backend/entrypoint.sh` (`seed_phase4_defaults`) and `docker-compose.yml` (`change-me-` fallback secret guard).

---

## 2. Verification Results (Final Run)

- **Django System Check & Migration Drift:** `python manage.py check` -> 0 issues; `python manage.py makemigrations --check --dry-run` -> `No changes detected`.
- **Backend Pytest (`backend/` against PostgreSQL 17 with `--create-db`):** **35 passed** in `19.53s` (Phases 1–4 suites + `TestPhase5CompleteWorkflowAndAudit` covering Scenarios A–I, permissions, login `429` throttling, dispatch idempotency + `TestPhase5ConcurrencyProtection` multi-threaded row-lock tests; 1 PytestWarning on test DB teardown connection cleanup from worker threads).
- **Frontend TypeScript (`tsc --noEmit`):** **0 errors**.
- **Frontend Vitest (`vitest run`):** **4 files, 12 passed**.
- **Frontend Production Build (`tsc -b && vite build`):** Succeeded (`dist/assets/index-CzQXpF2o.js` `716.54 kB`, gzip `190.02 kB`).
- **Playwright E2E (`npx playwright test`):** **3 specs passed in 51.1s** (`phase4.spec.ts`, `phase5_responsive_and_fixes.spec.ts` across Desktop/Tablet/Mobile viewports, and `smoke.spec.ts`).
- **Docker Runtime Note:** Docker Desktop is not installed on the local Windows workstation, so `docker compose up --build` could not be executed locally; Docker/Nginx configs were statically audited and hardened for container deployment.
