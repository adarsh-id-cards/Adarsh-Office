"""Comprehensive backend test suite for Phase 4: Labour, Machines, Assembly, Inventory, Audit & Dispatch."""
import pytest
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User, UserRole
from apps.assembly.models import AssemblyAssignment, AssignmentMode
from apps.catalog.models import ApplicableProduct, CatalogCategory, CatalogOption
from apps.inventory.models import (
    BaseUnit,
    InventoryBalance,
    Material,
    MaterialCategory,
    MaterialPackaging,
    MovementType,
    StockMovement,
)
from apps.inventory.services import (
    ensure_labourer_stock_location,
    get_main_office_location,
    verify_ledger_reconciliation,
)
from apps.labour.models import Labourer, SeasonalClosingStatus
from apps.machines.models import Machine, MachineStatus
from apps.stock_audit.models import StockAuditStatus


@pytest.mark.django_db
class TestPhase4Operations:
    def setup_method(self) -> None:
        self.user = User.objects.create_user(
            username="ops.manager",
            email="ops@adarshidcards.local",
            full_name="Operations Staff",
            password="SecurePassword123!",
            role=UserRole.OFFICE_WORKER,
        )
        self.api = APIClient()
        self.api.force_authenticate(user=self.user)

        self.size_16mm, _ = CatalogOption.objects.update_or_create(
            code="lanyard_16mm",
            defaults={
                "category": CatalogCategory.LANYARD_SIZE,
                "name": "16 mm",
                "applicable_to": ApplicableProduct.LANYARD,
                "batch_capacity": 30,
                "sort_order": 2,
            },
        )
        self.size_20mm, _ = CatalogOption.objects.update_or_create(
            code="lanyard_20mm",
            defaults={
                "category": CatalogCategory.LANYARD_SIZE,
                "name": "20 mm",
                "applicable_to": ApplicableProduct.LANYARD,
                "batch_capacity": 25,
                "sort_order": 3,
            },
        )

        call_command("seed_phase4_defaults")
        self.jointer_16mm = Material.objects.get(code="MAT-JOINTER-16MM")
        self.pkg_500 = MaterialPackaging.objects.get(
            material=self.jointer_16mm, units_per_package=500
        )
        self.pkg_1000 = MaterialPackaging.objects.get(
            material=self.jointer_16mm, units_per_package=1000
        )

    def _create_ready_lanyard_order(self, quantity: int = 1000) -> dict:
        order_res = self.api.post(
            "/api/v1/orders/",
            {
                "client_name": "Bright Future Academy",
                "status": "confirmed",
                "items": [
                    {
                        "item_name": "Academy Lanyards 16mm",
                        "category": "lanyard",
                        "ordered_quantity": quantity,
                        "lanyard_size_option": str(self.size_16mm.id),
                    }
                ],
            },
            format="json",
        )
        assert order_res.status_code == status.HTTP_201_CREATED
        order = order_res.json()
        job_id = order["items"][0]["production_job"]["id"]

        # Approve design and complete printing run cleanly
        assert (
            self.api.post(
                f"/api/v1/production/jobs/{job_id}/design/approve/",
                {"notes": "Approved artwork"},
                format="json",
            ).status_code
            == status.HTTP_200_OK
        )
        planned_qty = order["items"][0]["production_job"]["planned_printing_quantity"]
        planned_batches = order["items"][0]["production_job"]["planned_batches"]
        run_res = self.api.post(
            f"/api/v1/production/jobs/{job_id}/printing-runs/",
            {
                "planned_batches": planned_batches,
                "planned_quantity": planned_qty,
                "actual_printed_quantity": planned_qty,
                "rejected_quantity": 0,
                "complete_immediately": True,
            },
            format="json",
        )
        assert run_res.status_code == status.HTTP_201_CREATED
        assert (
            self.api.post(
                f"/api/v1/production/jobs/{job_id}/assembly/ready/",
                {"planned_assembly_quantity": quantity},
                format="json",
            ).status_code
            == status.HTTP_200_OK
        )
        return order

    def test_labour_machine_allocation_and_double_allocation_blocked(self) -> None:
        # 1. Create two labourers (Office manages records; zero user accounts created)
        l1 = self.api.post(
            "/api/v1/labourers/",
            {"name": "Ramesh Kumar", "contact_number": "9876500001"},
            format="json",
        )
        l2 = self.api.post(
            "/api/v1/labourers/",
            {"name": "Suresh Yadav", "contact_number": "9876500002"},
            format="json",
        )
        assert l1.status_code == status.HTTP_201_CREATED
        assert l2.status_code == status.HTTP_201_CREATED
        assert User.objects.filter(username__icontains="ramesh").count() == 0

        # Duplicate normalized name rejected
        dup = self.api.post(
            "/api/v1/labourers/",
            {"name": "  ramesh   KUMAR "},
            format="json",
        )
        assert dup.status_code == status.HTTP_400_BAD_REQUEST

        # 2. Register machine & allocate to Labourer 1
        mch = self.api.post(
            "/api/v1/machines/",
            {
                "machine_code": "MCH-16-01",
                "name": "Press 16mm Alpha",
                "supported_size_label": "16 mm",
            },
            format="json",
        )
        assert mch.status_code == status.HTTP_201_CREATED
        mch_id = mch.json()["id"]

        alloc1 = self.api.post(
            f"/api/v1/machines/{mch_id}/allocations/",
            {"labourer": l1.json()["id"], "notes": "Issued for school season"},
            format="json",
        )
        assert alloc1.status_code == status.HTTP_200_OK
        assert alloc1.json()["status"] == MachineStatus.ALLOCATED
        assert alloc1.json()["current_holder"] == l1.json()["id"]

        # Double-allocation to Labourer 2 MUST fail
        alloc2 = self.api.post(
            f"/api/v1/machines/{mch_id}/allocations/",
            {"labourer": l2.json()["id"]},
            format="json",
        )
        assert alloc2.status_code == status.HTTP_400_BAD_REQUEST

        # Return to office and re-allocate to Labourer 2
        ret = self.api.post(
            f"/api/v1/machines/{mch_id}/return/",
            {"return_condition": "good", "notes": "Checked clean"},
            format="json",
        )
        assert ret.status_code == status.HTTP_200_OK
        assert ret.json()["status"] == MachineStatus.IN_OFFICE
        assert ret.json()["current_holder"] is None

        alloc2_retry = self.api.post(
            f"/api/v1/machines/{mch_id}/allocations/",
            {"labourer": l2.json()["id"]},
            format="json",
        )
        assert alloc2_retry.status_code == status.HTTP_200_OK

    def test_split_assembly_material_issuance_math_and_partial_receiving(self) -> None:
        order = self._create_ready_lanyard_order(quantity=1000)
        order_item_id = order["items"][0]["id"]

        l_a = self.api.post("/api/v1/labourers/", {"name": "Mahesh"}, format="json").json()
        l_b = self.api.post("/api/v1/labourers/", {"name": "Dinesh"}, format="json").json()

        m_16 = self.api.post(
            "/api/v1/machines/",
            {"machine_code": "MCH-16-A", "name": "16mm Press A", "supported_size_label": "16 mm"},
            format="json",
        ).json()
        m_20 = self.api.post(
            "/api/v1/machines/",
            {"machine_code": "MCH-20-B", "name": "20mm Press B", "supported_size_label": "20 mm"},
            format="json",
        ).json()
        self.api.post(
            f"/api/v1/machines/{m_16['id']}/allocations/", {"labourer": l_a["id"]}, format="json"
        )
        self.api.post(
            f"/api/v1/machines/{m_20['id']}/allocations/", {"labourer": l_b["id"]}, format="json"
        )

        # Incompatible machine check blocks Dinesh (only holds 20mm) without override
        incompat_res = self.api.post(
            "/api/v1/assembly/assignments/",
            {
                "order_item": order_item_id,
                "assignment_mode": AssignmentMode.LABOURER,
                "labourer": l_b["id"],
                "assigned_quantity": 400,
            },
            format="json",
        )
        assert incompat_res.status_code == status.HTTP_400_BAD_REQUEST

        # Stock-In 10 packets of 500 jointers = 5,000 pcs into Main Office
        stock_in = self.api.post(
            "/api/v1/inventory/stock-in/",
            {
                "material": str(self.jointer_16mm.id),
                "packaging": str(self.pkg_500.id),
                "package_count": 10,
                "defective_quantity": 0,
                "notes": "Vendor B Jointer delivery",
            },
            format="json",
        )
        assert stock_in.status_code == status.HTTP_201_CREATED
        assert stock_in.json()["quantity"] == 5000

        # Pre-seed Mahesh with 400 jointers via direct transfer (Location Transfer, not consumption)
        pre_transfer = self.api.post(
            "/api/v1/inventory/transfers/",
            {
                "material": str(self.jointer_16mm.id),
                "labourer": l_a["id"],
                "direction": "to_labourer",
                "quantity": 400,
                "notes": "Carryover opening stock",
            },
            format="json",
        )
        assert pre_transfer.status_code == status.HTTP_201_CREATED

        # Split Assignment 1: 600 lanyards to Mahesh
        asm1_res = self.api.post(
            "/api/v1/assembly/assignments/",
            {
                "order_item": order_item_id,
                "assignment_mode": AssignmentMode.LABOURER,
                "labourer": l_a["id"],
                "assigned_quantity": 600,
            },
            format="json",
        )
        assert asm1_res.status_code == status.HTTP_201_CREATED
        asm1 = asm1_res.json()

        # Issue materials with Section 6/7 calculation:
        # Need 600, existing balance 400 -> additional 200 -> 1 packet of 500 -> 900 available -> 300 remaining
        issue_res = self.api.post(
            f"/api/v1/assembly/assignments/{asm1['id']}/issue-materials/",
            {
                "lines": [
                    {
                        "material": str(self.jointer_16mm.id),
                        "required_quantity": 600,
                        "packaging": str(self.pkg_500.id),
                        "packets_issued": 1,
                    }
                ]
            },
            format="json",
        )
        assert issue_res.status_code == status.HTTP_200_OK
        alloc = issue_res.json()["material_allocations"][0]
        assert alloc["required_quantity"] == 600
        assert alloc["opening_labour_balance"] == 400
        assert alloc["additional_needed_quantity"] == 200
        assert alloc["packets_issued"] == 1
        assert alloc["issued_quantity"] == 500
        assert alloc["total_available_after_issue"] == 900
        assert alloc["expected_remaining_balance"] == 300

        # Split Assignment 2: Remaining 400 to Internal Office Assembly
        asm2_res = self.api.post(
            "/api/v1/assembly/assignments/",
            {
                "order_item": order_item_id,
                "assignment_mode": AssignmentMode.OFFICE_ASSEMBLY,
                "assigned_quantity": 400,
            },
            format="json",
        )
        assert asm2_res.status_code == status.HTTP_201_CREATED

        # Over-assignment blocked (0 remain unassigned)
        over_res = self.api.post(
            "/api/v1/assembly/assignments/",
            {
                "order_item": order_item_id,
                "assignment_mode": AssignmentMode.OFFICE_ASSEMBLY,
                "assigned_quantity": 1,
            },
            format="json",
        )
        assert over_res.status_code == status.HTTP_400_BAD_REQUEST

        # Partial assembly receiving for Mahesh: batch 1 (350 usable, 10 defective), batch 2 (240 usable)
        rec1 = self.api.post(
            f"/api/v1/assembly/assignments/{asm1['id']}/receiving/",
            {"usable_quantity": 350, "defective_quantity": 10, "notes": "Lot 1"},
            format="json",
        )
        assert rec1.status_code == status.HTTP_200_OK
        assert rec1.json()["pending_quantity"] == 240
        assert rec1.json()["status"] == "partially_received"

        rec2 = self.api.post(
            f"/api/v1/assembly/assignments/{asm1['id']}/receiving/",
            {"usable_quantity": 240, "defective_quantity": 0, "notes": "Lot 2"},
            format="json",
        )
        assert rec2.status_code == status.HTTP_200_OK
        assert rec2.json()["pending_quantity"] == 0
        assert rec2.json()["status"] == "completed"

        # Reconcile materials for Mahesh: 590 usable + 10 defective material consumed; 300 retained by Mahesh!
        reconcile_res = self.api.post(
            f"/api/v1/assembly/assignments/{asm1['id']}/reconcile/",
            {
                "material_reconciliations": [
                    {
                        "allocation_id": alloc["id"],
                        "consumed_quantity": 590,
                        "defective_quantity": 10,
                        "returned_to_office_quantity": 0,
                    }
                ]
            },
            format="json",
        )
        assert reconcile_res.status_code == status.HTTP_200_OK
        reconciled_alloc = reconcile_res.json()["material_allocations"][0]
        assert reconciled_alloc["closing_labour_balance"] == 300

        # Verify ledger reconciliation holds identically for both Main Office and Mahesh
        mahesh = Labourer.objects.get(id=l_a["id"])
        mahesh_loc = ensure_labourer_stock_location(mahesh)
        office_loc = get_main_office_location()
        assert verify_ledger_reconciliation(self.jointer_16mm, office_loc)["is_reconciled"] is True
        mahesh_recon = verify_ledger_reconciliation(self.jointer_16mm, mahesh_loc)
        assert mahesh_recon["is_reconciled"] is True
        assert mahesh_recon["projected_usable_quantity"] == 300
        assert mahesh_recon["projected_defective_quantity"] == 10

    def test_office_consumption_formula_audit_approval_and_seasonal_closing(self) -> None:
        # Opening stock 2,000 (Box of 1,000 x 2)
        self.api.post(
            "/api/v1/inventory/stock-in/",
            {
                "material": str(self.jointer_16mm.id),
                "packaging": str(self.pkg_1000.id),
                "package_count": 2,
                "movement_type": MovementType.OPENING_STOCK,
            },
            format="json",
        )
        # Stock in 500
        self.api.post(
            "/api/v1/inventory/stock-in/",
            {
                "material": str(self.jointer_16mm.id),
                "packaging": str(self.pkg_500.id),
                "package_count": 1,
                "movement_type": MovementType.STOCK_IN,
            },
            format="json",
        )
        # Manual office consumption 120
        cons_res = self.api.post(
            "/api/v1/inventory/consumption/",
            {
                "material": str(self.jointer_16mm.id),
                "quantity": 120,
                "reason": "Internal sample assembly at office desk",
            },
            format="json",
        )
        assert cons_res.status_code == status.HTTP_201_CREATED

        # Transfer 600 to labourer & register machine for seasonal closing test
        l_c = self.api.post("/api/v1/labourers/", {"name": "Vikram"}, format="json").json()
        m_16 = self.api.post(
            "/api/v1/machines/",
            {"machine_code": "MCH-16-V", "name": "Vikram 16mm Press", "supported_size_label": "16 mm"},
            format="json",
        ).json()
        self.api.post(
            f"/api/v1/machines/{m_16['id']}/allocations/", {"labourer": l_c["id"]}, format="json"
        )
        self.api.post(
            "/api/v1/inventory/transfers/",
            {
                "material": str(self.jointer_16mm.id),
                "labourer": l_c["id"],
                "direction": "to_labourer",
                "quantity": 600,
            },
            format="json",
        )

        # System expected at office: 2000 + 500 - 120 - 600 = 1780
        formula_res = self.api.get(
            f"/api/v1/inventory/consumption/?material={self.jointer_16mm.id}&closing_physical_stock=1750"
        )
        assert formula_res.status_code == status.HTTP_200_OK
        f_data = formula_res.json()
        assert f_data["system_expected_office_stock"] == 1780
        assert f_data["recorded_manual_consumption"] == 120
        assert f_data["calculated_net_office_consumption"] == 150
        assert f_data["unexplained_difference"] == 30

        # Weekly Physical Stock Audit workflow (Draft -> Requires reason -> Submit -> Approve)
        audit_res = self.api.post("/api/v1/audits/", {"notes": "Friday check"}, format="json")
        assert audit_res.status_code == status.HTTP_201_CREATED
        audit = audit_res.json()
        jointer_line = next(
            ln for ln in audit["lines"] if ln["material"] == str(self.jointer_16mm.id)
        )
        assert jointer_line["expected_usable_quantity"] == 1780

        # Submit with count 1750 without discrepancy_reason must fail
        self.api.post(
            f"/api/v1/audits/{audit['id']}/counts/",
            {"counts": [{"line_id": jointer_line["id"], "physical_usable_quantity": 1750}]},
            format="json",
        )
        bad_submit = self.api.post(f"/api/v1/audits/{audit['id']}/submit/", {}, format="json")
        assert bad_submit.status_code == status.HTTP_400_BAD_REQUEST

        # Provide reason, submit & approve
        self.api.post(
            f"/api/v1/audits/{audit['id']}/counts/",
            {
                "counts": [
                    {
                        "line_id": jointer_line["id"],
                        "physical_usable_quantity": 1750,
                        "discrepancy_reason": "Spillage during bin transfer",
                    }
                ]
            },
            format="json",
        )
        good_submit = self.api.post(f"/api/v1/audits/{audit['id']}/submit/", {}, format="json")
        assert good_submit.status_code == status.HTTP_200_OK
        assert good_submit.json()["status"] == StockAuditStatus.SUBMITTED

        approve_res = self.api.post(f"/api/v1/audits/{audit['id']}/approve/", {}, format="json")
        assert approve_res.status_code == status.HTTP_200_OK
        assert approve_res.json()["status"] == StockAuditStatus.APPROVED

        # Main office balance updated to 1,750 and ledger-reconciled
        office_loc = get_main_office_location()
        assert verify_ledger_reconciliation(self.jointer_16mm, office_loc)["projected_usable_quantity"] == 1750
        assert StockMovement.objects.filter(
            related_audit_id=audit["id"], movement_type=MovementType.AUDIT_ADJUSTMENT
        ).exists()

        # Seasonal closing recovery for Vikram (600 expected -> 500 usable + 80 defective returned; 20 missing; machine returned)
        sc_res = self.api.post(
            "/api/v1/seasonal-closings/",
            {"labourer": l_c["id"], "season_label": "School Season 2026"},
            format="json",
        )
        assert sc_res.status_code == status.HTTP_201_CREATED
        sc = sc_res.json()
        sc_line = next(ln for ln in sc["material_lines"] if ln["material"] == str(self.jointer_16mm.id))

        sc_rec = self.api.post(
            f"/api/v1/seasonal-closings/{sc['id']}/reconcile/",
            {
                "material_lines": [
                    {
                        "id": sc_line["id"],
                        "actual_returned_usable": 500,
                        "actual_returned_defective": 80,
                        "discrepancy_explanation": "20 jointers lost at home bench",
                    }
                ],
                "mark_labourer_inactive": True,
            },
            format="json",
        )
        assert sc_rec.status_code == status.HTTP_200_OK
        assert sc_rec.json()["status"] == SeasonalClosingStatus.RECONCILED

        # Verify machine returned to office & Office usable stock increased by 500 (1750 + 500 = 2250)
        vikram_mch = Machine.objects.get(id=m_16["id"])
        assert vikram_mch.status == MachineStatus.IN_OFFICE
        assert vikram_mch.current_holder is None
        office_bal = InventoryBalance.objects.get(material=self.jointer_16mm, location=office_loc)
        assert office_bal.usable_quantity == 2250
        assert office_bal.defective_quantity == 80

    def test_dispatch_surplus_pool_and_replacement_surplus_allocation(self) -> None:
        order = self._create_ready_lanyard_order(quantity=1000)
        order_id = order["id"]
        order_item_id = order["items"][0]["id"]
        client_id = order["client"]

        # Record internal assembly completion of 1,020 lanyards
        asm_res = self.api.post(
            "/api/v1/assembly/assignments/",
            {
                "order_item": order_item_id,
                "assignment_mode": AssignmentMode.OFFICE_ASSEMBLY,
                "assigned_quantity": 1000,
            },
            format="json",
        )
        assert asm_res.status_code == status.HTTP_201_CREATED
        self.api.post(
            f"/api/v1/assembly/assignments/{asm_res.json()['id']}/receiving/",
            {"usable_quantity": 1000, "defective_quantity": 0},
            format="json",
        )

        # Dispatch 1,000 for order, 10 extra sent to client, 10 extra retained in Office Surplus Pool
        dsp_res = self.api.post(
            "/api/v1/dispatch/",
            {
                "order": order_id,
                "packing_verified": True,
                "items": [
                    {
                        "order_item": order_item_id,
                        "quantity_dispatched_for_order": 1000,
                        "extra_dispatched_to_client": 10,
                        "extra_retained_in_office": 10,
                        "notes": "20 batch surplus split 10 client / 10 office",
                    }
                ],
            },
            format="json",
        )
        assert dsp_res.status_code == status.HTTP_201_CREATED
        assert dsp_res.json()["order_status"] == "completed"

        office_surplus = self.api.get(f"/api/v1/surplus/office/?client={client_id}")
        assert office_surplus.status_code == status.HTTP_200_OK
        pool = office_surplus.json()["results"][0]
        assert pool["remaining_quantity"] == 10

        client_surplus = self.api.get(f"/api/v1/surplus/clients/?client={client_id}")
        assert client_surplus.status_code == status.HTTP_200_OK
        assert client_surplus.json()["results"][0]["quantity_sent"] == 10

        # Create a Replacement Order for 8 lanyards and allocate 8 from Office Surplus Pool
        rep_res = self.api.post(
            f"/api/v1/orders/{order_id}/replacements/",
            {
                "items": [
                    {
                        "original_item": order_item_id,
                        "ordered_quantity": 8,
                        "replacement_reason": "lost",
                        "surplus_pool_id": pool["id"],
                        "allocate_from_surplus_quantity": 8,
                    }
                ]
            },
            format="json",
        )
        assert rep_res.status_code == status.HTTP_201_CREATED
        rep_item = rep_res.json()["items"][0]
        assert rep_item["allocated_from_surplus_quantity"] == 8
        assert rep_item["production_job"]["is_ready_for_dispatch"] is True

        # Remaining office surplus is now 2
        pool_after = self.api.get(f"/api/v1/surplus/office/?client={client_id}").json()["results"][0]
        assert pool_after["remaining_quantity"] == 2
        assert pool_after["allocated_quantity"] == 8
