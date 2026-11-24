"""Comprehensive tests for Phase 2 Client Management (`apps.clients`)."""
import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User, UserRole
from apps.audit_logs.models import AuditLog
from apps.clients.models import Client


@pytest.mark.django_db
class TestClientManagement:
    def setup_method(self) -> None:
        self.user = User.objects.create_user(
            username="office.worker",
            email="worker@adarshidcards.local",
            full_name="Office Worker",
            password="SecurePassword123!",
            role=UserRole.OFFICE_WORKER,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_create_client_and_preserve_display_format(self) -> None:
        url = reverse("v1:client-list-create")
        res = self.client.post(
            url,
            {"name": "  ABC   Public School  "},
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED
        data = res.json()
        assert data["name"] == "ABC Public School"
        assert data["normalized_name"] == "abc public school"
        assert data["is_archived"] is False
        assert data["order_count"] == 0
        assert AuditLog.objects.filter(action="CLIENT_CREATED", target_id=data["id"]).exists()

    def test_duplicate_client_detection_across_case_and_whitespace(self) -> None:
        Client.objects.create(name="St. Xavier High School", created_by=self.user)

        url = reverse("v1:client-list-create")
        dup_res = self.client.post(
            url,
            {"name": "  st.   xavier  HIGH school "},
            format="json",
        )
        assert dup_res.status_code == status.HTTP_400_BAD_REQUEST
        body = dup_res.json()
        assert body["status"] == "error"
        assert "St. Xavier High School" in body["error"]["message"]
        assert Client.objects.count() == 1

    def test_search_clients_and_filter_archived(self) -> None:
        c1 = Client.objects.create(name="Delhi Public School", created_by=self.user)
        c2 = Client.objects.create(name="National Law College", created_by=self.user)
        c3 = Client.objects.create(name="Delhi Metro Corp", created_by=self.user)
        c3.archive(user=self.user, reason="Contract ended")

        url = reverse("v1:client-list-create")

        # Default list excludes archived clients
        list_res = self.client.get(url)
        assert list_res.status_code == status.HTTP_200_OK
        assert list_res.json()["count"] == 2

        # Search for 'Delhi' among active clients
        search_res = self.client.get(url, {"search": "delhi"})
        assert search_res.status_code == status.HTTP_200_OK
        assert search_res.json()["count"] == 1
        assert search_res.json()["results"][0]["id"] == str(c1.id)

        # Include archived clients in search
        all_delhi_res = self.client.get(url, {"search": "delhi", "include_archived": "true"})
        assert all_delhi_res.status_code == status.HTTP_200_OK
        assert all_delhi_res.json()["count"] == 2
        assert c2.id is not None

    def test_archive_and_unarchive_client_via_patch(self) -> None:
        client_obj = Client.objects.create(name="Sunrise Academy", created_by=self.user)
        url = reverse("v1:client-detail", kwargs={"pk": client_obj.id})

        # Archive
        arch_res = self.client.patch(
            url,
            {"is_archived": True, "archive_reason": "School merged"},
            format="json",
        )
        assert arch_res.status_code == status.HTTP_200_OK
        assert arch_res.json()["is_archived"] is True
        assert arch_res.json()["archive_reason"] == "School merged"
        assert AuditLog.objects.filter(action="CLIENT_ARCHIVED", target_id=str(client_obj.id)).exists()

        # Unarchive
        unarch_res = self.client.patch(
            url,
            {"is_archived": False},
            format="json",
        )
        assert unarch_res.status_code == status.HTTP_200_OK
        assert unarch_res.json()["is_archived"] is False
        assert AuditLog.objects.filter(action="CLIENT_UNARCHIVED", target_id=str(client_obj.id)).exists()
