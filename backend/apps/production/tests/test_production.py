"""Comprehensive tests for Phase 3 Production Management (`apps.production`)."""
import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import RolePermission, User, UserRole
from apps.catalog.models import ApplicableProduct, CatalogCategory, CatalogOption
from apps.production.models import (
    AssemblyStatus,
    DesignStatus,
    PrintingStatus,
    ProductionJob,
    ProductionStage,
)


@pytest.mark.django_db
class TestProductionManagement:
    def setup_method(self) -> None:
        self.user = User.objects.create_user(
            username="production.staff",
            email="prod@adarshidcards.local",
            full_name="Production Officer",
            password="SecurePassword123!",
            role=UserRole.OFFICE_WORKER,
        )
        self.api = APIClient()
        self.api.force_authenticate(user=self.user)

        # Ensure lanyard size catalog options with configurable capacities exist
        self.size_12mm, _ = CatalogOption.objects.update_or_create(
            code="lanyard_12mm",
            defaults={
                "category": CatalogCategory.LANYARD_SIZE,
                "name": "12 mm",
                "applicable_to": ApplicableProduct.LANYARD,
                "batch_capacity": 37,
                "sort_order": 1,
            },
        )
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

    def _create_multi_item_order(self) -> dict:
        order_url = reverse("v1:order-list-create")
        res = self.api.post(
            order_url,
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
                        "item_name": "School Lanyards 16mm",
                        "category": "lanyard",
                        "ordered_quantity": 1000,
                        "lanyard_size_option": str(self.size_16mm.id),
                    },
                ],
            },
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED
        return res.json()

    def test_id_card_design_printing_multiple_runs_waste_and_completion(self) -> None:
        order = self._create_multi_item_order()
        student_item = order["items"][0]
        job_id = student_item["production_job"]["id"]

        # 1. Attempting printing before design approval is rejected
        runs_url = reverse("v1:production-job-printing-runs", kwargs={"pk": job_id})
        early_print = self.api.post(
            runs_url,
            {"actual_printed_quantity": 400, "rejected_quantity": 0},
            format="json",
        )
        assert early_print.status_code == status.HTTP_400_BAD_REQUEST

        # 2. Design lifecycle: Start -> Review -> Approve -> Complete
        start_res = self.api.post(
            reverse("v1:production-design-start", kwargs={"pk": job_id}),
            {"notes": "Preparing student template", "design_reference": "ART-STU-1001"},
            format="json",
        )
        assert start_res.status_code == status.HTTP_200_OK
        assert start_res.json()["design_status"] == DesignStatus.IN_PROGRESS

        review_res = self.api.post(
            reverse("v1:production-design-review", kwargs={"pk": job_id}),
            {"notes": "Sent proof to principal"},
            format="json",
        )
        assert review_res.status_code == status.HTTP_200_OK
        assert review_res.json()["design_status"] == DesignStatus.REVIEW_REQUIRED

        approve_res = self.api.post(
            reverse("v1:production-design-approve", kwargs={"pk": job_id}),
            {"notes": "Principal approved proof"},
            format="json",
        )
        assert approve_res.status_code == status.HTTP_200_OK
        assert approve_res.json()["design_status"] == DesignStatus.APPROVED

        comp_design_res = self.api.post(
            reverse("v1:production-design-complete", kwargs={"pk": job_id}),
            {"notes": "Print-ready PDF exported"},
            format="json",
        )
        assert comp_design_res.status_code == status.HTTP_200_OK
        assert comp_design_res.json()["design_status"] == DesignStatus.COMPLETED
        assert comp_design_res.json()["current_stage"] == ProductionStage.PRINTING

        # 3. Partial printing across 3 runs (400 + 350 + 250 = 1,000 good; plus 15 rejected/wasted)
        run1 = self.api.post(
            runs_url,
            {"actual_printed_quantity": 400, "rejected_quantity": 0, "notes": "Batch 1"},
            format="json",
        )
        assert run1.status_code == status.HTTP_201_CREATED
        assert run1.json()["printing_status"] == PrintingStatus.PARTIALLY_PRINTED
        assert run1.json()["successful_printed_quantity"] == 400

        run2 = self.api.post(
            runs_url,
            {"actual_printed_quantity": 355, "rejected_quantity": 5, "notes": "Batch 2"},
            format="json",
        )
        assert run2.status_code == status.HTTP_201_CREATED
        assert run2.json()["successful_printed_quantity"] == 750
        assert run2.json()["total_rejected_quantity"] == 5

        # Cannot complete ID card production yet (750 < 1,000)
        complete_url = reverse("v1:production-job-complete", kwargs={"pk": job_id})
        premature_comp = self.api.post(complete_url, format="json")
        assert premature_comp.status_code == status.HTTP_400_BAD_REQUEST

        # 3rd run: start in-progress, then complete via /api/v1/printing-runs/{id}/complete/
        run3_start = self.api.post(
            runs_url,
            {
                "planned_quantity": 250,
                "actual_printed_quantity": 0,
                "rejected_quantity": 0,
                "complete_immediately": False,
            },
            format="json",
        )
        assert run3_start.status_code == status.HTTP_201_CREATED
        run3_id = run3_start.json()["printing_runs"][2]["id"]

        run3_comp_url = reverse("v1:printing-run-complete", kwargs={"pk": run3_id})
        run3_comp = self.api.post(
            run3_comp_url,
            {"actual_printed_quantity": 260, "rejected_quantity": 10, "notes": "Batch 3 done"},
            format="json",
        )
        assert run3_comp.status_code == status.HTTP_200_OK
        job_data = run3_comp.json()
        assert job_data["successful_printed_quantity"] == 1000
        assert job_data["total_rejected_quantity"] == 15
        assert job_data["total_printed_quantity"] == 1015
        assert job_data["printing_status"] == PrintingStatus.COMPLETED
        # Customer ordered quantity must NOT be inflated by waste
        assert job_data["required_quantity"] == 1000

        # Attempting to re-complete an immutable completed printing run is rejected
        immutable_retry = self.api.post(
            run3_comp_url,
            {"actual_printed_quantity": 300, "rejected_quantity": 0},
            format="json",
        )
        assert immutable_retry.status_code == status.HTTP_400_BAD_REQUEST

        # 4. Mark ID Card production completed and ready for packing/dispatch
        final_comp = self.api.post(
            complete_url,
            {"ready_for_packing_quantity": 1000, "notes": "Verified and boxed for packing"},
            format="json",
        )
        assert final_comp.status_code == status.HTTP_200_OK
        assert final_comp.json()["is_production_completed"] is True
        assert final_comp.json()["is_ready_for_dispatch"] is True
        assert final_comp.json()["ready_for_packing_quantity"] == 1000

    def test_lanyard_batch_calculations_for_12mm_16mm_20mm_and_override(self) -> None:
        order_url = reverse("v1:order-list-create")
        res = self.api.post(
            order_url,
            {
                "client_name": "Lanyard Capacity Test School",
                "status": "confirmed",
                "items": [
                    {
                        "item_name": "Lanyard 12mm",
                        "category": "lanyard",
                        "ordered_quantity": 1000,
                        "lanyard_size_option": str(self.size_12mm.id),
                    },
                    {
                        "item_name": "Lanyard 16mm",
                        "category": "lanyard",
                        "ordered_quantity": 1000,
                        "lanyard_size_option": str(self.size_16mm.id),
                    },
                    {
                        "item_name": "Lanyard 20mm",
                        "category": "lanyard",
                        "ordered_quantity": 1000,
                        "lanyard_size_option": str(self.size_20mm.id),
                    },
                ],
            },
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED
        items = res.json()["items"]

        # 12 mm: capacity 37 -> ceil(1000/37) = 28 batches -> 1,036 planned -> 36 surplus
        job_12 = items[0]["production_job"]
        assert job_12["batch_capacity"] == 37
        assert job_12["calculated_batches"] == 28
        assert job_12["calculated_planned_quantity"] == 1036
        assert job_12["calculated_expected_surplus"] == 36

        # 16 mm: capacity 30 -> ceil(1000/30) = 34 batches -> 1,020 planned -> 20 surplus
        job_16 = items[1]["production_job"]
        assert job_16["batch_capacity"] == 30
        assert job_16["calculated_batches"] == 34
        assert job_16["calculated_planned_quantity"] == 1020
        assert job_16["calculated_expected_surplus"] == 20

        # 20 mm: capacity 25 -> ceil(1000/25) = 40 batches -> 1,000 planned -> 0 surplus
        job_20 = items[2]["production_job"]
        assert job_20["batch_capacity"] == 25
        assert job_20["calculated_batches"] == 40
        assert job_20["calculated_planned_quantity"] == 1000
        assert job_20["calculated_expected_surplus"] == 0

        # Authorized override on 16mm job (35 batches = 1,050 pcs) preserves calculated values
        override_url = reverse(
            "v1:production-printing-plan-override", kwargs={"pk": job_16["id"]}
        )
        ov_res = self.api.post(
            override_url,
            {
                "planned_batches": 35,
                "override_reason": "Extra buffer batch requested by floor supervisor",
            },
            format="json",
        )
        assert ov_res.status_code == status.HTTP_200_OK
        ov_data = ov_res.json()
        assert ov_data["is_plan_overridden"] is True
        assert ov_data["calculated_batches"] == 34
        assert ov_data["calculated_planned_quantity"] == 1020
        assert ov_data["planned_batches"] == 35
        assert ov_data["planned_printing_quantity"] == 1050
        assert ov_data["expected_surplus_quantity"] == 50

    def test_lanyard_four_stage_workflow_and_independent_item_progress(self) -> None:
        order = self._create_multi_item_order()
        student_job_id = order["items"][0]["production_job"]["id"]
        staff_job_id = order["items"][1]["production_job"]["id"]
        lanyard_job_id = order["items"][2]["production_job"]["id"]

        # Advance Lanyard through Stage 1 (Design) -> Stage 2 (Printing) -> Stage 3 (Assembly) -> Stage 4 (Dispatch)
        self.api.post(reverse("v1:production-design-start", kwargs={"pk": lanyard_job_id}), format="json")
        self.api.post(reverse("v1:production-design-complete", kwargs={"pk": lanyard_job_id}), format="json")

        # Print 34 batches (1,020 gross, 8 rejected/wasted = 1,012 good; 12 actual printed surplus)
        lanyard_print_res = self.api.post(
            reverse("v1:production-job-printing-runs", kwargs={"pk": lanyard_job_id}),
            {
                "planned_batches": 34,
                "planned_quantity": 1020,
                "actual_printed_quantity": 1020,
                "rejected_quantity": 8,
            },
            format="json",
        )
        assert lanyard_print_res.status_code == status.HTTP_201_CREATED
        l_data = lanyard_print_res.json()
        assert l_data["successful_printed_quantity"] == 1012
        assert l_data["total_rejected_quantity"] == 8
        assert l_data["actual_printed_surplus"] == 12
        assert l_data["assembly_status"] == AssemblyStatus.READY_FOR_ASSEMBLY
        assert l_data["is_assembly_ready"] is True

        # Start assembly (partial: 600 of 1,000)
        asm_start_res = self.api.post(
            reverse("v1:production-assembly-start", kwargs={"pk": lanyard_job_id}),
            {"completed_assembly_quantity": 600, "notes": "First 600 stitched"},
            format="json",
        )
        assert asm_start_res.status_code == status.HTTP_200_OK
        assert asm_start_res.json()["assembly_status"] == AssemblyStatus.PARTIALLY_COMPLETED

        # Meanwhile, check Student ID and Staff ID remain completely untouched in Design (Not Started)
        student_detail = self.api.get(
            reverse("v1:production-job-detail", kwargs={"pk": student_job_id})
        ).json()
        staff_detail = self.api.get(
            reverse("v1:production-job-detail", kwargs={"pk": staff_job_id})
        ).json()
        assert student_detail["design_status"] == DesignStatus.NOT_STARTED
        assert staff_detail["design_status"] == DesignStatus.NOT_STARTED

        # Complete Lanyard assembly (1,000 units)
        asm_comp_res = self.api.post(
            reverse("v1:production-assembly-complete", kwargs={"pk": lanyard_job_id}),
            {"completed_assembly_quantity": 1000, "notes": "All 1,000 lanyards assembled"},
            format="json",
        )
        assert asm_comp_res.status_code == status.HTTP_200_OK
        assert asm_comp_res.json()["assembly_status"] == AssemblyStatus.COMPLETED
        assert asm_comp_res.json()["current_stage"] == ProductionStage.DISPATCH
        assert asm_comp_res.json()["is_production_completed"] is True
        assert asm_comp_res.json()["is_ready_for_dispatch"] is True

    def test_replacement_items_enter_production_and_permissions_enforced(self) -> None:
        order = self._create_multi_item_order()
        orig_order_id = order["id"]
        student_item_id = order["items"][0]["id"]

        # Create a replacement order for 10 Student IDs
        rep_res = self.api.post(
            reverse("v1:order-replacements", kwargs={"pk": orig_order_id}),
            {
                "status": "confirmed",
                "items": [
                    {
                        "original_item": student_item_id,
                        "ordered_quantity": 10,
                        "replacement_reason": "lost",
                    }
                ],
            },
            format="json",
        )
        assert rep_res.status_code == status.HTTP_201_CREATED
        rep_item = rep_res.json()["items"][0]
        assert rep_item["production_job"] is not None
        rep_job_id = rep_item["production_job"]["id"]
        assert ProductionJob.objects.filter(pk=rep_job_id).exists()

        # Verify overview endpoint
        overview_res = self.api.get(reverse("v1:production-overview"))
        assert overview_res.status_code == status.HTTP_200_OK
        assert overview_res.json()["total_active_jobs"] == 4

        # Revoke production.manage from office_worker and verify 403 Forbidden
        RolePermission.objects.create(
            role=UserRole.OFFICE_WORKER,
            permission_code="production.manage",
            is_granted=False,
        )
        forbidden_res = self.api.post(
            reverse("v1:production-design-start", kwargs={"pk": rep_job_id}),
            format="json",
        )
        assert forbidden_res.status_code == status.HTTP_403_FORBIDDEN
