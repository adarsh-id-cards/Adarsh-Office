"""Tests for the AuditLog foundation and API endpoint."""
import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User, UserRole
from apps.audit_logs.models import AuditLog
from apps.audit_logs.services import record_audit_log


@pytest.mark.django_db
class TestAuditLogs:
    def test_record_audit_log_snapshots_actor_details(self) -> None:
        user = User.objects.create_user(
            username="office.staff",
            email="staff@adarshidcards.local",
            full_name="Adarsh Office Staff",
            password="SecurePassword123!",
            role=UserRole.OFFICE_WORKER,
        )
        entry = record_audit_log(
            action="SYSTEM_TEST",
            module="system",
            summary="Verified audit log creation",
            actor=user,
            target_type="User",
            target_id=str(user.id),
            metadata={"phase": 1},
        )

        assert entry.id is not None
        assert entry.actor == user
        assert entry.actor_username == "office.staff"
        assert entry.actor_role == UserRole.OFFICE_WORKER
        assert entry.metadata == {"phase": 1}

    def test_audit_log_list_requires_authentication(self) -> None:
        client = APIClient()
        url = reverse("v1:audit-log-list")
        response = client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_authenticated_user_can_list_and_filter_audit_logs(self) -> None:
        admin = User.objects.create_user(
            username="owner.admin",
            email="owner@adarshidcards.local",
            full_name="Adarsh Owner",
            password="SecurePassword123!",
            role=UserRole.OWNER_ADMIN,
        )
        record_audit_log(
            action="AUTH_LOGIN",
            module="accounts",
            summary="User logged in",
            actor=admin,
        )
        record_audit_log(
            action="HEALTH_CHECK",
            module="system",
            summary="System check",
            actor=admin,
        )

        client = APIClient()
        client.force_authenticate(user=admin)
        url = reverse("v1:audit-log-list")

        response = client.get(url, {"module": "accounts"})
        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert payload["count"] == 1
        assert payload["results"][0]["action"] == "AUTH_LOGIN"
        assert AuditLog.objects.count() == 2
