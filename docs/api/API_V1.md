# REST API Reference (`/api/v1/`) — Phase 5 Verified

All endpoints are prefixed with `/api/v1/` and use Django Session Authentication (`pro_office_sessionid` HTTP-only cookie) and CSRF protection (`X-CSRFToken` header).

---

## 1. Health, Authentication & Audit Logs (Phase 1)
- `GET /api/v1/health/`
- `GET /api/v1/auth/csrf/`
- `POST /api/v1/auth/login/` *(protected by `ScopedRateThrottle`, `auth_login` default `15/minute`)*
- `POST /api/v1/auth/logout/`
- `GET /api/v1/auth/me/`
- `POST /api/v1/auth/password/change/`
- `GET /api/v1/auth/users/` *(requires `OWNER_ADMIN`)*
- `GET /api/v1/audit-logs/` *(requires `audit_logs.view`, `OWNER_ADMIN` by default)*

---

## 2. Catalog, Clients & Orders (Phase 2)
- `GET /api/v1/catalog/` (`12 mm = 37`, `16 mm = 30`, `20 mm = 25`)
- `GET / POST /api/v1/clients/`, `GET / PATCH /api/v1/clients/{id}/`, `GET /api/v1/clients/{id}/orders/`
- `GET / POST /api/v1/orders/`, `GET / PATCH /api/v1/orders/{id}/`
- `POST /api/v1/orders/{id}/confirm/`, `cancel/`, `transition/`, `GET /history/`
- `GET / POST /api/v1/orders/{id}/replacements/` (supports optional `surplus_pool_id` and `allocate_from_surplus_quantity` to reuse Office Surplus Pool stock before producing new units)
- `PATCH /api/v1/order-items/{id}/`, `GET /api/v1/order-items/{id}/replacements/`

---

## 3. Production Management (`apps.production` — Phase 3)
- `GET /api/v1/production/overview/`
- `GET /api/v1/production/queue/`, `GET /api/v1/production/jobs/`, `GET /api/v1/production/jobs/{id}/`
- `POST /api/v1/production/jobs/{id}/design/{start,review,approve,complete}/`
- `POST /api/v1/production/jobs/{id}/printing-plan/override/`
- `GET / POST /api/v1/production/jobs/{id}/printing-runs/`, `POST /api/v1/printing-runs/{id}/complete/`
- `GET /api/v1/production/jobs/{id}/assembly/`, `POST /api/v1/production/jobs/{id}/assembly/{ready,start,complete}/`
- `POST /api/v1/production/jobs/{id}/complete/`

---

## 4. Labour & Seasonal Recovery (`apps.labour` — Phase 4)
- `GET / POST /api/v1/labourers/` — List/search active & inactive office-managed labourers (`?is_active=`, `?supported_size=`, `?search=`) or create a new labourer (zero user accounts created).
- `GET / PATCH /api/v1/labourers/{id}/` — Profile including allocated machines, held material balances, active/past assignments, movement history, and seasonal closings.
- `GET /api/v1/labourers/{id}/assignments/` & `GET /api/v1/labourers/{id}/inventory/`
- `GET / POST /api/v1/seasonal-closings/` — Initiate end-of-season snapshot of machines & expected materials held by a labourer.
- `POST /api/v1/seasonal-closings/{id}/reconcile/` — Reconcile returned usable/defective stock back to Main Office, return machines to `in_office`, and log missing/damage explanations.

---

## 5. Physical Machines (`apps.machines` — Phase 4)
- `GET / POST /api/v1/machines/` — Register & filter physical machines (`?status=`, `?supported_size=`, `?holder=`).
- `GET / PATCH /api/v1/machines/{id}/` — Machine detail and full `MachineAllocation` history.
- `POST /api/v1/machines/{id}/allocations/` — Allocate in-office machine to an active labourer (row-level lock prevents double allocation).
- `POST /api/v1/machines/{id}/return/` — Return machine to office with `return_condition` (`good`, `maintenance_required`, `damaged`).

---

## 6. Central Inventory, Packaging, Consumption & Defects (`apps.inventory` — Phase 4)
- `GET / POST /api/v1/materials/` — Configurable raw material catalog with aggregated office usable/defective stock and total labourer stock.
- `GET / POST /api/v1/materials/{id}/packaging/` — Vendor packaging configurations per material (e.g., Packet of 500 vs Box of 1,000).
- `GET /api/v1/inventory/balances/` — Location-wise balances (`MAIN_OFFICE` vs each `LABOURER`).
- `GET /api/v1/inventory/reconcile/` — Full ledger reconciliation verifying every `(material, location)` `InventoryBalance` equals the net sum of its immutable `StockMovement` deltas.
- `GET /api/v1/inventory/movements/` — Immutable `StockMovement` ledger (`MOV-10001+`).
- `POST /api/v1/inventory/stock-in/` — Opening stock & vendor stock-in with packet-to-base-unit conversion and defective lot capture.
- `POST /api/v1/inventory/transfers/` — Explicit Office <-> Labourer stock transfers without inflating or reducing company inventory.
- `GET / POST /api/v1/inventory/consumption/` — Computes `Opening + Received + Returns - Transfers - Closing Physical` vs recorded manual consumption, or logs explicit office usage with mandatory reason.
- `GET / POST /api/v1/inventory/defects/` — Lists or records `raw_material` and `finished_product` defects by discovery stage.

---

## 7. Split Assembly, Material Issuance & Receiving (`apps.assembly` — Phase 4)
- `GET /api/v1/assembly/queue/` — Assembly capacity & existing split assignments for all lanyard items.
- `GET / POST /api/v1/assembly/assignments/` — Create full, split, or `office_assembly` assignments with machine compatibility validation and row locks preventing over-assignment.
- `POST /api/v1/assembly/assignments/{id}/issue-materials/` — Calculates `additional_needed = max(0, required - opening_labour_balance)` and transfers packages/units from Main Office to Labourer location.
- `POST /api/v1/assembly/assignments/{id}/receiving/` — Partial or full receiving of `usable_quantity` and `defective_quantity` lanyards, syncing parent `ProductionJob`.
- `POST /api/v1/assembly/assignments/{id}/reconcile/` — Reconciles material consumed, defective, returned to office, and closing usable balance retained by labourer.

---

## 8. Physical Stock Audits (`apps.stock_audit` — Phase 4)
- `GET / POST /api/v1/audits/` & `GET /api/v1/audits/{id}/`
- `POST /api/v1/audits/{id}/counts/` — Update physical counts and discrepancy reasons.
- `POST /api/v1/audits/{id}/submit/` — Validates discrepancy reasons are entered for all non-zero variances.
- `POST /api/v1/audits/{id}/approve/` — Approves audit and creates `audit_adjustment` `StockMovement` ledger entries.

---

## 9. Packing, Dispatch & Surplus Pool (`apps.dispatch` — Phase 4 & 5 Hardened)
- `GET /api/v1/dispatch/queue/` — Order items with produced, dispatched, remaining, and surplus estimates.
- `GET / POST /api/v1/dispatch/` & `GET /api/v1/dispatch/{id}/` — Partial or full dispatches splitting `quantity_dispatched_for_order` (capped at `min(ordered - dispatched, produced_usable - dispatched)`), `extra_dispatched_to_client` (`ClientSurplusRecord`), and `extra_retained_in_office` (`OfficeSurplusPool`), with optional `idempotency_key` deduplication.
- `GET /api/v1/surplus/office/` & `POST /api/v1/surplus/office/{id}/allocate/` — View and allocate retained office surplus to Replacement Order items.
- `GET /api/v1/surplus/clients/` — View extra finished items dispatched directly to clients.
