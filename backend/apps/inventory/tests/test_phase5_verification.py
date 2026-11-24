"""Phase 5 Independent Verification Suite: Scenarios A–I, Ledger Accounting, Packaging, Security & Concurrency."""
from concurrent.futures import ThreadPoolExecutor

import pytest
from django.core.management import call_command
from django.db import close_old_connections
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.test import APIClient

from apps.accounts.models import User, UserRole
from apps.assembly.models import AssemblyAssignment, AssignmentMode
from apps.assembly.services import create_assembly_assignment
from apps.catalog.models import ApplicableProduct, CatalogCategory, CatalogOption
from apps.dispatch.models import ClientSurplusRecord, DispatchRecord, OfficeSurplusPool
from apps.dispatch.services import create_dispatch_record
from apps.inventory.models import (
    InventoryBalance,
    Material,
    MaterialPackaging,
    StockLocation,
    StockMovement,
)
from apps.inventory.services import (
    ensure_labourer_stock_location,
    get_main_office_location,
    transfer_material_to_labourer,
    verify_ledger_reconciliation,
)
from apps.labour.models import Labourer, SeasonalClosingStatus
from apps.machines.models import Machine, MachineStatus
from apps.orders.models import OrderItem


@pytest.mark.django_db
class TestPhase5CompleteWorkflowAndAudit:
    def setup_method(self) -> None:
        self.admin = User.objects.create_user(
            username="phase5.admin",
            email="p5admin@adarshidcards.local",
            full_name="Phase 5 Owner",
            password="StrongPassword123!",
            role=UserRole.OWNER_ADMIN,
        )
        self.worker = User.objects.create_user(
            username="phase5.worker",
            email="p5worker@adarshidcards.local",
            full_name="Phase 5 Office Worker",
            password="StrongPassword123!",
            role=UserRole.OFFICE_WORKER,
        )
        self.api = APIClient()
        self.api.force_authenticate(user=self.admin)

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
        call_command("seed_phase4_defaults")
        self.jointer_16mm = Material.objects.get(code="MAT-JOINTER-16MM")
        self.pkg_500 = MaterialPackaging.objects.get(
            material=self.jointer_16mm, units_per_package=500
        )
        self.pkg_1000 = MaterialPackaging.objects.get(
            material=self.jointer_16mm, units_per_package=1000
        )
        # Add third packaging option (250/pkt) for packaging audit
        self.pkg_250, _ = MaterialPackaging.objects.get_or_create(
            material=self.jointer_16mm,
            package_name="Mini Pack of 250",
            units_per_package=250,
            defaults={"vendor_label": "Vendor C"},
        )

    def test_complete_adarsh_scenarios_a_through_i_and_ledger_reconciliation(self) -> None:
        # =====================================================================
        # SCENARIO A — Original Order (ABC Public School, 4 Separate Items)
        # =====================================================================
        order_res = self.api.post(
            "/api/v1/orders/",
            {
                "client_name": "ABC Public School",
                "status": "confirmed",
                "items": [
                    {
                        "item_name": "Student ID Cards",
                        "category": "id_card",
                        "ordered_quantity": 1000,
                        "card_orientation": "vertical",
                        "card_printing": "double_sided",
                    },
                    {
                        "item_name": "Staff ID Cards",
                        "category": "id_card",
                        "ordered_quantity": 50,
                        "card_orientation": "horizontal",
                        "card_printing": "single_sided",
                    },
                    {
                        "item_name": "Student Lanyards",
                        "category": "lanyard",
                        "ordered_quantity": 1000,
                        "lanyard_size_option": str(self.size_16mm.id),
                    },
                    {
                        "item_name": "Staff Lanyards",
                        "category": "lanyard",
                        "ordered_quantity": 50,
                        "lanyard_size_option": str(self.size_16mm.id),
                    },
                ],
            },
            format="json",
        )
        assert order_res.status_code == status.HTTP_201_CREATED
        order = order_res.json()
        assert order["client_name"] == "ABC Public School"
        assert len(order["items"]) == 4
        assert order["total_ordered_quantity"] == 2100

        student_card_item = order["items"][0]
        staff_card_item = order["items"][1]
        student_lan_item = order["items"][2]
        staff_lan_item = order["items"][3]

        # =====================================================================
        # SCENARIO B — Independent Production, Multiple Runs & Batch Calc
        # =====================================================================
        sc_job = student_card_item["production_job"]["id"]
        stf_job = staff_card_item["production_job"]["id"]
        slan_job = student_lan_item["production_job"]["id"]
        stflan_job = staff_lan_item["production_job"]["id"]

        # Verify Lanyard Batch Plan (ceil(1000 / 30) = 34 batches = 1020 printed, 20 surplus)
        assert student_lan_item["production_job"]["batch_capacity"] == 30
        assert student_lan_item["production_job"]["calculated_batches"] == 34
        assert student_lan_item["production_job"]["calculated_planned_quantity"] == 1020
        assert student_lan_item["production_job"]["calculated_expected_surplus"] == 20

        # Student ID Cards: Design Complete + 2 partial runs (410 gross / 10 rejected, then 600 good)
        self.api.post(f"/api/v1/production/jobs/{sc_job}/design/approve/", {}, format="json")
        self.api.post(
            f"/api/v1/production/jobs/{sc_job}/printing-runs/",
            {"actual_printed_quantity": 410, "rejected_quantity": 10, "complete_immediately": True},
            format="json",
        )
        run2 = self.api.post(
            f"/api/v1/production/jobs/{sc_job}/printing-runs/",
            {"actual_printed_quantity": 600, "rejected_quantity": 0, "complete_immediately": True},
            format="json",
        ).json()
        assert run2["successful_printed_quantity"] == 1000
        assert run2["total_rejected_quantity"] == 10
        assert run2["actual_printed_surplus"] == 0
        self.api.post(f"/api/v1/production/jobs/{sc_job}/complete/", {}, format="json")

        # Staff ID Cards progress independently (design only so far)
        self.api.post(f"/api/v1/production/jobs/{stf_job}/design/start/", {}, format="json")
        stf_detail = self.api.get(f"/api/v1/production/jobs/{stf_job}/").json()
        assert stf_detail["printing_status"] == "not_started"

        # Student Lanyards: Design + Printing Run (1,020 gross, 0 waste -> 1,020 good)
        self.api.post(f"/api/v1/production/jobs/{slan_job}/design/approve/", {}, format="json")
        slan_print = self.api.post(
            f"/api/v1/production/jobs/{slan_job}/printing-runs/",
            {
                "planned_batches": 34,
                "planned_quantity": 1020,
                "actual_printed_quantity": 1020,
                "rejected_quantity": 0,
                "complete_immediately": True,
            },
            format="json",
        ).json()
        assert slan_print["actual_printed_surplus"] == 20
        assert slan_print["is_assembly_ready"] is True

        # =====================================================================
        # SCENARIO C — Split Assembly (Labour X: 600, Labour Y: 400)
        # =====================================================================
        lab_x = self.api.post("/api/v1/labourers/", {"name": "Labour X"}, format="json").json()
        lab_y = self.api.post("/api/v1/labourers/", {"name": "Labour Y"}, format="json").json()
        m_x = self.api.post(
            "/api/v1/machines/",
            {"machine_code": "MCH-X-16", "name": "Press X 16mm", "supported_size_label": "16 mm"},
            format="json",
        ).json()
        m_y = self.api.post(
            "/api/v1/machines/",
            {"machine_code": "MCH-Y-16", "name": "Press Y 16mm", "supported_size_label": "16 mm"},
            format="json",
        ).json()
        self.api.post(f"/api/v1/machines/{m_x['id']}/allocations/", {"labourer": lab_x["id"]}, format="json")
        self.api.post(f"/api/v1/machines/{m_y['id']}/allocations/", {"labourer": lab_y["id"]}, format="json")

        asm_x = self.api.post(
            "/api/v1/assembly/assignments/",
            {
                "order_item": student_lan_item["id"],
                "assignment_mode": AssignmentMode.LABOURER,
                "labourer": lab_x["id"],
                "assigned_quantity": 600,
            },
            format="json",
        ).json()
        asm_y = self.api.post(
            "/api/v1/assembly/assignments/",
            {
                "order_item": student_lan_item["id"],
                "assignment_mode": AssignmentMode.LABOURER,
                "labourer": lab_y["id"],
                "assigned_quantity": 400,
            },
            format="json",
        ).json()
        assert asm_x["assigned_quantity"] + asm_y["assigned_quantity"] == 1000

        # =====================================================================
        # SCENARIO D — Packaging Conversion Audit & Material Issuance (Transfers)
        # =====================================================================
        # Stock-In using all 3 package sizes: 1 box of 1000 + 2 pkts of 500 + 2 mini of 250 = 2,500 pcs
        self.api.post(
            "/api/v1/inventory/stock-in/",
            {"material": str(self.jointer_16mm.id), "packaging": str(self.pkg_1000.id), "package_count": 1},
            format="json",
        )
        self.api.post(
            "/api/v1/inventory/stock-in/",
            {"material": str(self.jointer_16mm.id), "packaging": str(self.pkg_500.id), "package_count": 2},
            format="json",
        )
        self.api.post(
            "/api/v1/inventory/stock-in/",
            {"material": str(self.jointer_16mm.id), "packaging": str(self.pkg_250.id), "package_count": 2},
            format="json",
        )

        # Verify Office Usable = 2,500 before transfer
        mat_before = next(
            m for m in self.api.get("/api/v1/materials/").json()["results"]
            if m["id"] == str(self.jointer_16mm.id)
        )
        assert mat_before["office_usable_stock"] == 2500
        assert mat_before["total_company_usable_stock"] == 2500

        # Issue Labour X: 2 packets of 500 = 1,000; Labour Y: 1 packet of 500 = 500
        iss_x = self.api.post(
            f"/api/v1/assembly/assignments/{asm_x['id']}/issue-materials/",
            {
                "lines": [
                    {
                        "material": str(self.jointer_16mm.id),
                        "required_quantity": 600,
                        "packaging": str(self.pkg_500.id),
                        "packets_issued": 2,
                    }
                ]
            },
            format="json",
        ).json()
        iss_y = self.api.post(
            f"/api/v1/assembly/assignments/{asm_y['id']}/issue-materials/",
            {
                "lines": [
                    {
                        "material": str(self.jointer_16mm.id),
                        "required_quantity": 400,
                        "packaging": str(self.pkg_500.id),
                        "packets_issued": 1,
                    }
                ]
            },
            format="json",
        ).json()
        alloc_x = iss_x["material_allocations"][0]
        alloc_y = iss_y["material_allocations"][0]
        assert alloc_x["issued_quantity"] == 1000
        assert alloc_y["issued_quantity"] == 500

        # Office decreased by 1,500 -> 1,000; Labour X +1,000; Labour Y +500; Company Total STILL 2,500
        mat_after = next(
            m for m in self.api.get("/api/v1/materials/").json()["results"]
            if m["id"] == str(self.jointer_16mm.id)
        )
        assert mat_after["office_usable_stock"] == 1000
        assert mat_after["labour_usable_stock"] == 1500
        assert mat_after["total_company_usable_stock"] == 2500

        # =====================================================================
        # SCENARIO E — Assembly Receiving & Dispatch Block on Incomplete Usable Stock
        # =====================================================================
        rec_x = self.api.post(
            f"/api/v1/assembly/assignments/{asm_x['id']}/receiving/",
            {"usable_quantity": 590, "defective_quantity": 5},
            format="json",
        ).json()
        rec_y = self.api.post(
            f"/api/v1/assembly/assignments/{asm_y['id']}/receiving/",
            {"usable_quantity": 395, "defective_quantity": 3},
            format="json",
        ).json()
        assert rec_x["pending_quantity"] == 5
        assert rec_y["pending_quantity"] == 2

        slan_after_recv = self.api.get(f"/api/v1/production/jobs/{slan_job}/").json()
        assert slan_after_recv["completed_assembly_quantity"] == 985

        # Attempt to dispatch 1,000 usable lanyards MUST FAIL (only 985 usable assembled!)
        over_dsp = self.api.post(
            "/api/v1/dispatch/",
            {
                "order": order["id"],
                "items": [
                    {
                        "order_item": student_lan_item["id"],
                        "quantity_dispatched_for_order": 1000,
                        "extra_dispatched_to_client": 0,
                        "extra_retained_in_office": 0,
                    }
                ],
            },
            format="json",
        )
        assert over_dsp.status_code == status.HTTP_400_BAD_REQUEST

        # =====================================================================
        # SCENARIO F — Material Reconciliation (Remaining Retained by Labour)
        # =====================================================================
        rec_mat_x = self.api.post(
            f"/api/v1/assembly/assignments/{asm_x['id']}/reconcile/",
            {
                "material_reconciliations": [
                    {
                        "allocation_id": alloc_x["id"],
                        "consumed_quantity": 580,
                        "defective_quantity": 10,
                        "returned_to_office_quantity": 0,
                    }
                ]
            },
            format="json",
        ).json()
        rec_mat_y = self.api.post(
            f"/api/v1/assembly/assignments/{asm_y['id']}/reconcile/",
            {
                "material_reconciliations": [
                    {
                        "allocation_id": alloc_y["id"],
                        "consumed_quantity": 390,
                        "defective_quantity": 5,
                        "returned_to_office_quantity": 0,
                    }
                ]
            },
            format="json",
        ).json()
        assert rec_mat_x["material_allocations"][0]["closing_labour_balance"] == 410
        assert rec_mat_y["material_allocations"][0]["closing_labour_balance"] == 105

        # Independently verify EVERY InventoryBalance reconciles with StockMovement ledger
        reconcile_api = self.api.get("/api/v1/inventory/reconcile/").json()
        assert reconcile_api["all_reconciled"] is True

        # =====================================================================
        # SCENARIO G — Partial Dispatch, Remaining Qty, Client & Office Surplus
        # =====================================================================
        # Partial dispatch 500 then 485 of Student Lanyards (= 985 usable)
        dsp1 = self.api.post(
            "/api/v1/dispatch/",
            {
                "order": order["id"],
                "idempotency_key": "dsp-partial-1",
                "items": [
                    {
                        "order_item": student_lan_item["id"],
                        "quantity_dispatched_for_order": 500,
                        "extra_dispatched_to_client": 0,
                        "extra_retained_in_office": 0,
                    }
                ],
            },
            format="json",
        )
        assert dsp1.status_code == status.HTTP_201_CREATED

        dsp2 = self.api.post(
            "/api/v1/dispatch/",
            {
                "order": order["id"],
                "items": [
                    {
                        "order_item": student_lan_item["id"],
                        "quantity_dispatched_for_order": 485,
                        "extra_dispatched_to_client": 0,
                        "extra_retained_in_office": 0,
                    }
                ],
            },
            format="json",
        )
        assert dsp2.status_code == status.HTTP_201_CREATED

        refreshed_order = self.api.get(f"/api/v1/orders/{order['id']}/").json()
        refreshed_slan = refreshed_order["items"][2]
        assert refreshed_slan["dispatched_quantity"] == 985
        assert refreshed_slan["remaining_quantity"] == 15

        # Complete Staff Lanyards (50) and dispatch 50 + 5 client surplus + 5 office surplus
        self.api.post(f"/api/v1/production/jobs/{stflan_job}/design/approve/", {}, format="json")
        self.api.post(
            f"/api/v1/production/jobs/{stflan_job}/printing-runs/",
            {"actual_printed_quantity": 60, "rejected_quantity": 0, "complete_immediately": True},
            format="json",
        )
        asm_stf = self.api.post(
            "/api/v1/assembly/assignments/",
            {
                "order_item": staff_lan_item["id"],
                "assignment_mode": AssignmentMode.OFFICE_ASSEMBLY,
                "assigned_quantity": 50,
            },
            format="json",
        ).json()
        self.api.post(
            f"/api/v1/assembly/assignments/{asm_stf['id']}/receiving/",
            {"usable_quantity": 50, "defective_quantity": 0},
            format="json",
        )
        dsp_stf = self.api.post(
            "/api/v1/dispatch/",
            {
                "order": order["id"],
                "items": [
                    {
                        "order_item": staff_lan_item["id"],
                        "quantity_dispatched_for_order": 50,
                        "extra_dispatched_to_client": 5,
                        "extra_retained_in_office": 5,
                    }
                ],
            },
            format="json",
        )
        assert dsp_stf.status_code == status.HTTP_201_CREATED
        office_pools = self.api.get(f"/api/v1/surplus/office/?client={order['client']}").json()["results"]
        client_surpluses = self.api.get(f"/api/v1/surplus/clients/?client={order['client']}").json()["results"]
        assert office_pools[0]["remaining_quantity"] == 5
        assert client_surpluses[0]["quantity_sent"] == 5

        # =====================================================================
        # SCENARIO H — Replacement Order + Partial Surplus Allocation -> Reduced Production
        # =====================================================================
        rep_res = self.api.post(
            f"/api/v1/orders/{order['id']}/replacements/",
            {
                "items": [
                    {
                        "original_item": student_card_item["id"],
                        "ordered_quantity": 10,
                        "replacement_reason": "lost",
                    },
                    {
                        "original_item": staff_card_item["id"],
                        "ordered_quantity": 2,
                        "replacement_reason": "damaged",
                    },
                    {
                        "original_item": staff_lan_item["id"],
                        "ordered_quantity": 8,
                        "replacement_reason": "lost",
                        "surplus_pool_id": office_pools[0]["id"],
                        "allocate_from_surplus_quantity": 5,
                    },
                ]
            },
            format="json",
        )
        assert rep_res.status_code == status.HTTP_201_CREATED
        rep_order = rep_res.json()
        # Staff Lanyard replacement: 8 ordered, 5 allocated from office surplus -> only 3 left to produce!
        rep_lan_item = rep_order["items"][2]
        assert rep_lan_item["allocated_from_surplus_quantity"] == 5
        assert rep_lan_item["production_job"]["planned_assembly_quantity"] == 3

        # Original order quantities untouched
        orig_after_rep = self.api.get(f"/api/v1/orders/{order['id']}/").json()
        assert orig_after_rep["items"][0]["ordered_quantity"] == 1000
        assert orig_after_rep["items"][1]["ordered_quantity"] == 50

        # =====================================================================
        # SCENARIO I — Seasonal Closing Preserves Historical Movements & Assignments
        # =====================================================================
        movements_before = StockMovement.objects.count()
        assignments_before = AssemblyAssignment.objects.count()

        sc_x = self.api.post(
            "/api/v1/seasonal-closings/",
            {"labourer": lab_x["id"], "season_label": "Season 2026"},
            format="json",
        ).json()
        sc_x_line = next(
            ln for ln in sc_x["material_lines"] if ln["material"] == str(self.jointer_16mm.id)
        )
        assert sc_x_line["expected_usable_balance"] == 410

        rec_sc_x = self.api.post(
            f"/api/v1/seasonal-closings/{sc_x['id']}/reconcile/",
            {
                "material_lines": [
                    {
                        "id": sc_x_line["id"],
                        "actual_returned_usable": 400,
                        "actual_returned_defective": 0,
                        "discrepancy_explanation": "10 jointers dropped/missing",
                    }
                ],
                "machine_lines": [
                    {
                        "id": sc_x["machine_lines"][0]["id"],
                        "was_returned": True,
                        "return_condition": "damaged",
                        "notes": "Die worn out",
                    }
                ],
            },
            format="json",
        )
        assert rec_sc_x.status_code == status.HTTP_200_OK
        assert rec_sc_x.json()["status"] == SeasonalClosingStatus.RECONCILED
        assert Machine.objects.get(id=m_x["id"]).status == MachineStatus.DAMAGED
        assert AssemblyAssignment.objects.count() == assignments_before
        assert StockMovement.objects.count() > movements_before

        # Final independent full ledger reconciliation across every balance row
        final_recon = self.api.get("/api/v1/inventory/reconcile/").json()
        assert final_recon["all_reconciled"] is True

    def test_security_permissions_and_login_rate_limiting(self) -> None:
        # 1. Office Worker cannot access Admin Audit Logs or Users
        worker_api = APIClient()
        worker_api.force_authenticate(user=self.worker)
        assert worker_api.get("/api/v1/audit-logs/").status_code == status.HTTP_403_FORBIDDEN
        assert worker_api.get("/api/v1/auth/users/").status_code == status.HTTP_403_FORBIDDEN

        # Admin can access Audit Logs
        assert self.api.get("/api/v1/audit-logs/").status_code == status.HTTP_200_OK

        # 2. Dispatch idempotency prevents double dispatch
        order = self.api.post(
            "/api/v1/orders/",
            {
                "client_name": "Concurrency Academy",
                "status": "confirmed",
                "items": [
                    {
                        "item_name": "Cards",
                        "category": "id_card",
                        "ordered_quantity": 20,
                        "card_orientation": "vertical",
                        "card_printing": "single_sided",
                    }
                ],
            },
            format="json",
        ).json()
        job_id = order["items"][0]["production_job"]["id"]
        self.api.post(f"/api/v1/production/jobs/{job_id}/design/approve/", {}, format="json")
        self.api.post(
            f"/api/v1/production/jobs/{job_id}/printing-runs/",
            {"actual_printed_quantity": 20, "rejected_quantity": 0},
            format="json",
        )

        payload = {
            "order": order["id"],
            "idempotency_key": "unique-dispatch-key-001",
            "items": [
                {
                    "order_item": order["items"][0]["id"],
                    "quantity_dispatched_for_order": 10,
                    "extra_dispatched_to_client": 0,
                    "extra_retained_in_office": 0,
                }
            ],
        }
        d1 = self.api.post("/api/v1/dispatch/", payload, format="json")
        d2 = self.api.post("/api/v1/dispatch/", payload, format="json")
        assert d1.status_code == status.HTTP_201_CREATED
        assert d2.status_code == status.HTTP_201_CREATED
        assert d1.json()["id"] == d2.json()["id"]
        assert OrderItem.objects.get(id=order["items"][0]["id"]).dispatched_quantity == 10

        # 3. Brute-force login throttling returns HTTP 429 when rate exceeded
        from django.core.cache import cache
        from rest_framework.throttling import ScopedRateThrottle

        cache.clear()
        orig_rates = ScopedRateThrottle.THROTTLE_RATES.copy()
        try:
            ScopedRateThrottle.THROTTLE_RATES = {**orig_rates, "auth_login": "3/minute"}
            anon = APIClient()
            statuses = [
                anon.post(
                    "/api/v1/auth/login/",
                    {"username": "nonexistent.user", "password": "wrong"},
                    format="json",
                ).status_code
                for _ in range(4)
            ]
            assert statuses[:3] == [400, 400, 400]
            assert statuses[3] == status.HTTP_429_TOO_MANY_REQUESTS
        finally:
            ScopedRateThrottle.THROTTLE_RATES = orig_rates
            cache.clear()


@pytest.mark.django_db(transaction=True)
class TestPhase5ConcurrencyProtection:
    def test_concurrency_atomic_stock_and_assignment_protection(self) -> None:
        admin = User.objects.create_user(
            username="phase5.concurrent.admin",
            email="p5conc@adarshidcards.local",
            full_name="Phase 5 Conc Owner",
            password="StrongPassword123!",
            role=UserRole.OWNER_ADMIN,
        )
        api = APIClient()
        api.force_authenticate(user=admin)
        call_command("seed_phase4_defaults")
        jointer_16mm = Material.objects.get(code="MAT-JOINTER-16MM")

        # 1. Stock-In 500 jointers and race two 400-unit transfers on PostgreSQL row locks
        api.post(
            "/api/v1/inventory/stock-in/",
            {"material": str(jointer_16mm.id), "quantity": 500},
            format="json",
        )
        lab1 = Labourer.objects.create(name="Concurrent Lab 1")
        lab2 = Labourer.objects.create(name="Concurrent Lab 2")

        def run_transfer(lab: Labourer) -> str:
            close_old_connections()
            try:
                transfer_material_to_labourer(
                    material=jointer_16mm,
                    labourer=lab,
                    quantity=400,
                    actor=admin,
                )
                return "ok"
            except DRFValidationError:
                return "rejected"
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(run_transfer, [lab1, lab2]))

        assert sorted(outcomes) == ["ok", "rejected"]
        office_loc = get_main_office_location()
        office_bal = InventoryBalance.objects.get(
            material=jointer_16mm, location=office_loc
        )
        assert office_bal.usable_quantity == 100
        assert verify_ledger_reconciliation(jointer_16mm, office_loc)["is_reconciled"] is True

        # 2. Race two 600-unit split assembly assignments against a 1,000-unit printed lanyard item
        CatalogOption.objects.update_or_create(
            code="lanyard_16mm",
            defaults={
                "category": CatalogCategory.LANYARD_SIZE,
                "name": "16 mm",
                "applicable_to": ApplicableProduct.LANYARD,
                "batch_capacity": 30,
                "sort_order": 2,
            },
        )
        lanyard_16mm = CatalogOption.objects.get(code="lanyard_16mm")
        order = api.post(
            "/api/v1/orders/",
            {
                "client_name": "Concurrent Assembly School",
                "status": "confirmed",
                "items": [
                    {
                        "item_name": "Lanyards 1000",
                        "category": "lanyard",
                        "ordered_quantity": 1000,
                        "lanyard_size_option": str(lanyard_16mm.id),
                    }
                ],
            },
            format="json",
        ).json()
        item = OrderItem.objects.get(id=order["items"][0]["id"])
        job_id = order["items"][0]["production_job"]["id"]
        api.post(f"/api/v1/production/jobs/{job_id}/design/approve/", {}, format="json")
        api.post(
            f"/api/v1/production/jobs/{job_id}/printing-runs/",
            {"actual_printed_quantity": 1020, "rejected_quantity": 0},
            format="json",
        )

        def run_assignment(lab: Labourer) -> str:
            close_old_connections()
            try:
                create_assembly_assignment(
                    order_item=item,
                    labourer=lab,
                    assignment_mode=AssignmentMode.LABOURER,
                    assigned_quantity=600,
                    is_machine_override=True,
                    machine_override_reason="Concurrent test",
                    actor=admin,
                )
                return "ok"
            except DRFValidationError:
                return "rejected"
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            assign_outcomes = list(pool.map(run_assignment, [lab1, lab2]))

        assert sorted(assign_outcomes) == ["ok", "rejected"]
        assert AssemblyAssignment.objects.filter(order_item=item).count() == 1
