"""Comprehensive tests for Phase 2 Orders, OrderItems, Specifications, Replacements, Quantities, and Lifecycle."""
import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import RolePermission, User, UserRole
from apps.catalog.models import ApplicableProduct, CatalogCategory, CatalogOption
from apps.clients.models import Client
from apps.orders.models import Order, OrderItem, OrderStatus, OrderType


@pytest.mark.django_db
class TestOrdersAndReplacements:
    def setup_method(self) -> None:
        self.user = User.objects.create_user(
            username="adarsh.staff",
            email="staff@adarshidcards.local",
            full_name="Adarsh Office Staff",
            password="SecurePassword123!",
            role=UserRole.OFFICE_WORKER,
        )
        self.api = APIClient()
        self.api.force_authenticate(user=self.user)

        # Ensure baseline catalog options exist for test assertions
        self.card_type_pvc, _ = CatalogOption.objects.get_or_create(
            code="card_pvc_cr80",
            defaults={
                "category": CatalogCategory.CARD_TYPE,
                "name": "Standard PVC CR80 Card",
                "applicable_to": ApplicableProduct.ID_CARD,
                "sort_order": 1,
            },
        )
        self.size_12mm, _ = CatalogOption.objects.get_or_create(
            code="lanyard_12mm",
            defaults={
                "category": CatalogCategory.LANYARD_SIZE,
                "name": "12 mm",
                "applicable_to": ApplicableProduct.LANYARD,
                "sort_order": 1,
            },
        )
        self.size_16mm, _ = CatalogOption.objects.get_or_create(
            code="lanyard_16mm",
            defaults={
                "category": CatalogCategory.LANYARD_SIZE,
                "name": "16 mm",
                "applicable_to": ApplicableProduct.LANYARD,
                "sort_order": 2,
            },
        )
        self.size_20mm, _ = CatalogOption.objects.get_or_create(
            code="lanyard_20mm",
            defaults={
                "category": CatalogCategory.LANYARD_SIZE,
                "name": "20 mm",
                "applicable_to": ApplicableProduct.LANYARD,
                "sort_order": 3,
            },
        )
        self.holder_soft, _ = CatalogOption.objects.get_or_create(
            code="holder_soft_pvc",
            defaults={
                "category": CatalogCategory.HOLDER,
                "name": "Transparent Soft PVC Holder",
                "applicable_to": ApplicableProduct.BOTH,
                "sort_order": 1,
            },
        )
        self.hook_dog, _ = CatalogOption.objects.get_or_create(
            code="hook_dog_metal",
            defaults={
                "category": CatalogCategory.HOOK,
                "name": "Metal Dog Hook",
                "applicable_to": ApplicableProduct.LANYARD,
                "sort_order": 1,
            },
        )
        self.acc_yoyo, _ = CatalogOption.objects.get_or_create(
            code="acc_yoyo_reel",
            defaults={
                "category": CatalogCategory.ACCESSORY,
                "name": "Yo-Yo Retractable Reel",
                "applicable_to": ApplicableProduct.BOTH,
                "sort_order": 1,
            },
        )

    def test_create_combined_order_with_inline_client_creation_and_multiple_items(self) -> None:
        url = reverse("v1:order-list-create")
        payload = {
            "client_name": "ABC Public School",
            "status": "confirmed",
            "notes": "Urgent school reopening batch",
            "items": [
                {
                    "item_name": "Student ID Cards",
                    "category": "id_card",
                    "ordered_quantity": 1000,
                    "card_orientation": "vertical",
                    "card_printing": "double_sided",
                    "card_type_option": str(self.card_type_pvc.id),
                    "holder_requirement": "required",
                    "holder_option": str(self.holder_soft.id),
                },
                {
                    "item_name": "Staff ID Cards",
                    "category": "id_card",
                    "ordered_quantity": 50,
                    "card_orientation": "horizontal",
                    "card_printing": "single_sided",
                    "holder_requirement": "not_required",
                },
                {
                    "item_name": "School Lanyards",
                    "category": "lanyard",
                    "ordered_quantity": 1000,
                    "lanyard_size_option": str(self.size_16mm.id),
                    "lanyard_design_requirements": "Navy blue with school crest",
                    "lanyard_printing_specs": "Double-sided multi-colour sublimation",
                    "hook_requirement": "required",
                    "hook_option": str(self.hook_dog.id),
                    "holder_requirement": "attach_later",
                    "attachment_party": "completed_by_adarsh",
                    "accessory_ids": [str(self.acc_yoyo.id)],
                },
            ],
        }

        res = self.api.post(url, payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        data = res.json()

        assert data["order_number"].startswith("ORD-")
        assert data["client_name"] == "ABC Public School"
        assert data["order_type"] == OrderType.ORIGINAL
        assert data["total_ordered_quantity"] == 2050
        assert len(data["items"]) == 3

        # Confirm inline client was saved once
        assert Client.objects.filter(normalized_name="abc public school").count() == 1

        # Calling again with same client_name reuses existing client without duplicating
        res2 = self.api.post(
            url,
            {
                "client_name": "  abc   PUBLIC school ",
                "items": [
                    {
                        "item_name": "Visitor Cards",
                        "category": "id_card",
                        "ordered_quantity": 25,
                        "card_orientation": "vertical",
                        "card_printing": "single_sided",
                    }
                ],
            },
            format="json",
        )
        assert res2.status_code == status.HTTP_201_CREATED
        assert Client.objects.filter(normalized_name="abc public school").count() == 1
        assert res2.json()["order_number"] != data["order_number"]

    def test_card_only_and_lanyard_only_orders_are_valid(self) -> None:
        url = reverse("v1:order-list-create")
        client = Client.objects.create(name="Metro Hospital", created_by=self.user)

        # 1. Card-only order with empty holder explicitly 'not_selected' (does not invent accessory)
        card_res = self.api.post(
            url,
            {
                "client_id": str(client.id),
                "items": [
                    {
                        "item_name": "Doctor ID Cards",
                        "category": "id_card",
                        "ordered_quantity": 120,
                        "card_orientation": "vertical",
                        "card_printing": "double_sided",
                        "holder_requirement": "not_selected",
                    }
                ],
            },
            format="json",
        )
        assert card_res.status_code == status.HTTP_201_CREATED
        card_item = card_res.json()["items"][0]
        assert card_item["holder_requirement"] == "not_selected"
        assert card_item["holder_option"] is None

        # 2. Lanyard-only order
        lanyard_res = self.api.post(
            url,
            {
                "client_id": str(client.id),
                "items": [
                    {
                        "item_name": "Printed Lanyards 20mm",
                        "category": "lanyard",
                        "ordered_quantity": 300,
                        "lanyard_size_option": str(self.size_20mm.id),
                        "hook_requirement": "not_required",
                        "holder_requirement": "not_required",
                        "attachment_party": "completed_by_client",
                    }
                ],
            },
            format="json",
        )
        assert lanyard_res.status_code == status.HTTP_201_CREATED
        lanyard_item = lanyard_res.json()["items"][0]
        assert lanyard_item["category"] == "lanyard"
        assert lanyard_item["attachment_party"] == "completed_by_client"

    def test_atomic_rollback_on_invalid_item_specification_or_quantity(self) -> None:
        url = reverse("v1:order-list-create")

        # Item 2 is missing lanyard_size_option -> entire order AND inline client must roll back
        bad_payload = {
            "client_name": "Rollback Test Institute",
            "items": [
                {
                    "item_name": "Valid Card",
                    "category": "id_card",
                    "ordered_quantity": 100,
                    "card_orientation": "vertical",
                    "card_printing": "single_sided",
                },
                {
                    "item_name": "Invalid Lanyard Without Size",
                    "category": "lanyard",
                    "ordered_quantity": 100,
                },
            ],
        }
        res = self.api.post(url, bad_payload, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert Order.objects.count() == 0
        assert Client.objects.filter(normalized_name="rollback test institute").count() == 0

        # Zero quantity rejected
        zero_qty_res = self.api.post(
            url,
            {
                "client_name": "Zero Qty School",
                "items": [
                    {
                        "item_name": "Cards",
                        "category": "id_card",
                        "ordered_quantity": 0,
                        "card_orientation": "vertical",
                        "card_printing": "single_sided",
                    }
                ],
            },
            format="json",
        )
        assert zero_qty_res.status_code == status.HTTP_400_BAD_REQUEST

    def test_replacement_order_creation_and_independent_quantity_tracking(self) -> None:
        # 1. Create Original Order #1001 for ABC Public School (1,000 Student IDs + 50 Staff IDs)
        order_url = reverse("v1:order-list-create")
        orig_res = self.api.post(
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
                ],
            },
            format="json",
        )
        assert orig_res.status_code == status.HTTP_201_CREATED
        orig_data = orig_res.json()
        orig_order_id = orig_data["id"]
        student_item_id = orig_data["items"][0]["id"]
        staff_item_id = orig_data["items"][1]["id"]

        # 2. Create Replacement Order with 10 Student IDs (lost) and 2 Staff IDs (incorrect_info)
        rep_url = reverse("v1:order-replacements", kwargs={"pk": orig_order_id})
        rep_res = self.api.post(
            rep_url,
            {
                "status": "confirmed",
                "notes": "Mid-term replacement batch",
                "items": [
                    {
                        "original_item": student_item_id,
                        "ordered_quantity": 10,
                        "replacement_reason": "lost",
                        "replacement_reason_notes": "Grade 8 & 9 students",
                    },
                    {
                        "original_item": staff_item_id,
                        "ordered_quantity": 2,
                        "replacement_reason": "incorrect_info",
                        "replacement_reason_notes": "Spelling correction on designation",
                    },
                ],
            },
            format="json",
        )
        assert rep_res.status_code == status.HTTP_201_CREATED
        rep_data = rep_res.json()
        assert rep_data["order_type"] == OrderType.REPLACEMENT
        assert rep_data["original_order"] == orig_order_id
        assert rep_data["total_ordered_quantity"] == 12
        assert len(rep_data["items"]) == 2

        # 3. Verify original order quantities remain 1,000 and 50 (NOT mutated to 1,010 and 52!)
        orig_detail_url = reverse("v1:order-detail", kwargs={"pk": orig_order_id})
        refreshed_orig = self.api.get(orig_detail_url).json()
        assert refreshed_orig["total_ordered_quantity"] == 1050
        assert refreshed_orig["total_replacement_quantity"] == 12

        student_orig_item = refreshed_orig["items"][0]
        staff_orig_item = refreshed_orig["items"][1]
        assert student_orig_item["ordered_quantity"] == 1000
        assert student_orig_item["original_ordered_quantity"] == 1000
        assert student_orig_item["replacement_quantity"] == 10
        assert len(student_orig_item["replacement_items"]) == 1

        assert staff_orig_item["ordered_quantity"] == 50
        assert staff_orig_item["original_ordered_quantity"] == 50
        assert staff_orig_item["replacement_quantity"] == 2

        # 4. Verify `/api/v1/order-items/{id}/replacements/` endpoint
        item_rep_url = reverse("v1:order-item-replacements", kwargs={"pk": student_item_id})
        item_rep_res = self.api.get(item_rep_url)
        assert item_rep_res.status_code == status.HTTP_200_OK
        assert len(item_rep_res.json()) == 1
        assert item_rep_res.json()[0]["ordered_quantity"] == 10

    def test_reject_cross_client_or_cross_order_replacement_associations(self) -> None:
        order_url = reverse("v1:order-list-create")
        order_a = self.api.post(
            order_url,
            {
                "client_name": "Client Alpha",
                "items": [
                    {
                        "item_name": "Alpha Cards",
                        "category": "id_card",
                        "ordered_quantity": 100,
                        "card_orientation": "vertical",
                        "card_printing": "single_sided",
                    }
                ],
            },
            format="json",
        ).json()
        order_b = self.api.post(
            order_url,
            {
                "client_name": "Client Beta",
                "items": [
                    {
                        "item_name": "Beta Cards",
                        "category": "id_card",
                        "ordered_quantity": 200,
                        "card_orientation": "vertical",
                        "card_printing": "single_sided",
                    }
                ],
            },
            format="json",
        ).json()

        rep_url_a = reverse("v1:order-replacements", kwargs={"pk": order_a["id"]})

        # Attempt to pass Client Beta's item into Client Alpha's replacement endpoint
        cross_item_res = self.api.post(
            rep_url_a,
            {
                "items": [
                    {
                        "original_item": order_b["items"][0]["id"],
                        "ordered_quantity": 5,
                        "replacement_reason": "damaged",
                    }
                ],
            },
            format="json",
        )
        assert cross_item_res.status_code == status.HTTP_400_BAD_REQUEST

        # Attempt to pass Client Beta's client_id with Client Alpha's order
        cross_client_res = self.api.post(
            rep_url_a,
            {
                "client_id": order_b["client"],
                "items": [
                    {
                        "original_item": order_a["items"][0]["id"],
                        "ordered_quantity": 5,
                        "replacement_reason": "damaged",
                    }
                ],
            },
            format="json",
        )
        assert cross_client_res.status_code == status.HTTP_400_BAD_REQUEST

    def test_item_dispatch_quantity_limits_and_client_profile_aggregates(self) -> None:
        order_url = reverse("v1:order-list-create")
        created = self.api.post(
            order_url,
            {
                "client_name": "Greenwood High",
                "items": [
                    {
                        "item_name": "Student IDs",
                        "category": "id_card",
                        "ordered_quantity": 100,
                        "card_orientation": "vertical",
                        "card_printing": "double_sided",
                    }
                ],
            },
            format="json",
        ).json()
        item_id = created["items"][0]["id"]
        item_update_url = reverse("v1:order-item-update", kwargs={"pk": item_id})

        # Valid partial dispatch (40 of 100)
        ok_res = self.api.patch(
            item_update_url,
            {"prepared_quantity": 60, "dispatched_quantity": 40},
            format="json",
        )
        assert ok_res.status_code == status.HTTP_200_OK
        assert ok_res.json()["dispatched_quantity"] == 40
        assert ok_res.json()["remaining_quantity"] == 60

        # Exceeding ordered quantity (105 > 100) is rejected
        exceed_res = self.api.patch(
            item_update_url,
            {"dispatched_quantity": 105},
            format="json",
        )
        assert exceed_res.status_code == status.HTTP_400_BAD_REQUEST

        # Verify client profile totals reflect ordered and dispatched quantities
        client_detail_url = reverse("v1:client-detail", kwargs={"pk": created["client"]})
        client_profile = self.api.get(client_detail_url).json()
        assert client_profile["total_ordered_quantity"] == 100
        assert client_profile["total_dispatched_quantity"] == 40

    def test_order_lifecycle_status_transitions_and_history(self) -> None:
        order_url = reverse("v1:order-list-create")
        order = self.api.post(
            order_url,
            {
                "client_name": "Lifecycle College",
                "status": "draft",
                "items": [
                    {
                        "item_name": "Faculty IDs",
                        "category": "id_card",
                        "ordered_quantity": 30,
                        "card_orientation": "horizontal",
                        "card_printing": "single_sided",
                    }
                ],
            },
            format="json",
        ).json()
        order_id = order["id"]

        # Invalid jump directly from Draft to Completed is rejected
        transition_url = reverse("v1:order-transition", kwargs={"pk": order_id})
        bad_jump = self.api.post(
            transition_url,
            {"status": OrderStatus.COMPLETED},
            format="json",
        )
        assert bad_jump.status_code == status.HTTP_400_BAD_REQUEST

        # Confirm order via /confirm/
        confirm_url = reverse("v1:order-confirm", kwargs={"pk": order_id})
        conf_res = self.api.post(
            confirm_url,
            {"reason": "Client approved proofs"},
            format="json",
        )
        assert conf_res.status_code == status.HTTP_200_OK
        assert conf_res.json()["status"] == OrderStatus.CONFIRMED

        # Cancel requires a reason
        cancel_url = reverse("v1:order-cancel", kwargs={"pk": order_id})
        no_reason_res = self.api.post(cancel_url, {"reason": ""}, format="json")
        assert no_reason_res.status_code == status.HTTP_400_BAD_REQUEST

        cancel_res = self.api.post(
            cancel_url,
            {"reason": "Client requested hold and cancellation"},
            format="json",
        )
        assert cancel_res.status_code == status.HTTP_200_OK
        assert cancel_res.json()["status"] == OrderStatus.CANCELLED

        # Verify history endpoint
        history_url = reverse("v1:order-history", kwargs={"pk": order_id})
        hist_res = self.api.get(history_url)
        assert hist_res.status_code == status.HTTP_200_OK
        assert len(hist_res.json()) == 3

    def test_idempotency_and_permission_enforcement(self) -> None:
        order_url = reverse("v1:order-list-create")
        payload = {
            "client_name": "Idempotent School",
            "idempotency_key": "idem-key-12345",
            "items": [
                {
                    "item_name": "Student Cards",
                    "category": "id_card",
                    "ordered_quantity": 50,
                    "card_orientation": "vertical",
                    "card_printing": "single_sided",
                }
            ],
        }
        res1 = self.api.post(order_url, payload, format="json")
        res2 = self.api.post(order_url, payload, format="json")
        assert res1.status_code == status.HTTP_201_CREATED
        assert res2.status_code == status.HTTP_201_CREATED
        assert res1.json()["id"] == res2.json()["id"]
        assert OrderItem.objects.filter(order_id=res1.json()["id"]).count() == 1

        # Revoke orders.manage from office_worker and verify 403 Forbidden on POST
        RolePermission.objects.create(
            role=UserRole.OFFICE_WORKER,
            permission_code="orders.manage",
            is_granted=False,
        )
        forbidden_res = self.api.post(
            order_url,
            {
                "client_name": "Blocked School",
                "items": payload["items"],
            },
            format="json",
        )
        assert forbidden_res.status_code == status.HTTP_403_FORBIDDEN
