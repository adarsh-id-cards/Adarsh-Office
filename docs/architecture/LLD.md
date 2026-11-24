# Low-Level Design (LLD) — Pro Office (Phase 5 Verified)

## 1. Backend Application Modules (`backend/apps/`)

| Module | Responsibility | Key Files |
| :--- | :--- | :--- |
| `apps.common` | Shared base models (`TimeStampedUUIDModel`, `ArchivableModel`), pagination, exception handler, `GET /api/v1/health/`. | `models.py`, `exceptions.py`, `pagination.py`, `views.py` |
| `apps.accounts` | Custom UUID `User` model, `UserRole`, `RolePermission`, `HasModulePermission`, session/CSRF auth. | `models.py`, `permissions.py`, `serializers.py`, `views.py` |
| `apps.audit_logs` | Immutable `AuditLog`, `record_audit_log()` service, and `/api/v1/audit-logs/`. | `models.py`, `services.py`, `views.py` |
| `apps.catalog` | Configurable product options (`CatalogOption`) including lanyard `batch_capacity`. | `models.py`, `serializers.py`, `views.py` |
| `apps.clients` | `Client` model, normalized duplicate detection, aggregated client order history. | `models.py`, `serializers.py`, `views.py` |
| `apps.orders` | `OrderSequence`, `Order`, `OrderItem`, `OrderStatusHistory`, original & replacement creation (integrating optional surplus pool allocation). | `models.py`, `services.py`, `serializers.py`, `views.py` |
| `apps.production` | `ProductionJob` (1:1 `OrderItem`), `PrintingRun`, `ProductionStatusHistory`, lanyard ceiling batch calculator. | `models.py`, `services.py`, `serializers.py`, `views.py` |
| `apps.labour` | `Labourer`, `SeasonalClosing`, `SeasonalClosingMaterialLine`, `SeasonalClosingMachineLine`, seasonal recovery service. | `models.py`, `services.py`, `serializers.py`, `views.py`, `seasonal_urls.py` |
| `apps.machines` | `Machine`, `MachineAllocation` with partial unique active constraint preventing double allocation. | `models.py`, `services.py`, `serializers.py`, `views.py` |
| `apps.inventory` | `Material`, `MaterialPackaging`, `StockLocation`, `InventoryBalance`, `StockMovement`, `DefectiveRecord`, consumption formula & ledger verification. | `models.py`, `services.py`, `serializers.py`, `views.py`, `seed_phase4_defaults.py` |
| `apps.assembly` | `AssemblyAssignment`, `AssignmentMaterialAllocation`, `AssemblyReceivingRecord`, split assignment & balance-aware issuance math. | `models.py`, `services.py`, `serializers.py`, `views.py` |
| `apps.stock_audit` | `StockAudit`, `StockAuditLine`, Draft -> Submit -> Approve physical count adjustment workflow. | `models.py`, `services.py`, `serializers.py`, `views.py` |
| `apps.dispatch` | `DispatchRecord`, `DispatchItem`, `OfficeSurplusPool`, `ClientSurplusRecord`, `ReplacementSurplusAllocation`. | `models.py`, `services.py`, `serializers.py`, `views.py`, `surplus_urls.py` |

---

## 2. Phases 4–5 Critical Concurrency, Integrity & Accounting Rules

1. **PostgreSQL Row Locking Without Outer-Join `FOR UPDATE` Errors:**
   - All locking queries that combine `.select_for_update()` with `.select_related(...)` on nullable foreign keys explicitly use `.select_for_update(of=("self",))`.
   - Dual-location transfers (`transfer_material_to_labourer` and `return_material_from_labourer`) sort `[office_loc, labour_loc]` deterministically by UUID string before calling `SELECT ... FOR UPDATE` to prevent circular deadlocks.
   - `next_named_sequence` (`apps.inventory.services`) uses row-locked `StockMovementSequence` rows for atomic `MOV-`, `DSP-`, `SRP-`, `AUD-`, and `SCL-` generation.
   - `create_dispatch_record` supports `idempotency_key` deduplication and caps `quantity_dispatched_for_order` against actual usable produced/assembled quantity minus prior dispatches.
2. **Location Transfer vs. Consumption Invariant:**
   - Issuing raw materials to a labourer creates a `TRANSFER_TO_LABOURER` `StockMovement` debiting `MAIN_OFFICE.usable_quantity` and crediting `LABOURER_<id>.usable_quantity`. Company stock never drops on issuance.
   - Consumption reduces usable balance strictly upon assembly reconciliation (`LABOUR_CONSUMPTION`) or office usage (`INTERNAL_CONSUMPTION`).
3. **Retained Labourer Balance Calculation:**
   - `additional_needed_quantity = max(0, required_quantity - opening_labour_balance)`.
   - `total_available_after_issue = opening_labour_balance + issued_quantity`.
   - `expected_remaining_balance = max(0, total_available_after_issue - required_quantity)`.
   - Remaining usable material stays on the labourer's `InventoryBalance` across jobs until consumed or recovered via `SeasonalClosing`.
4. **Automatic Office Consumption Formula (`compute_office_consumption_formula`):**
   - `calculated_net_office_consumption = opening_office_stock + stock_received + returns_from_labourers - transfers_to_labourers - closing_physical_office_stock`.
   - Separately compares against `recorded_manual_consumption` (`internal_consumption`, `defective_material`, `material_write_off`) to surface `unexplained_difference`.
