"""Comprehensive tests for authentication, roles, permissions, and admin bootstrap."""
from io import StringIO

import pytest
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.core.management.base import CommandError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import RolePermission, User, UserRole
from apps.audit_logs.models import AuditLog


@pytest.mark.django_db
class TestAccountsAndAuthentication:
    def test_user_model_uses_uuid_and_prevents_labourer_accounts(self) -> None:
        user = User.objects.create_user(
            username="priya.sharma",
            email="priya@adarshidcards.local",
            full_name="Priya Sharma",
            password="OfficePassword123!",
            role=UserRole.OFFICE_WORKER,
        )
        assert user.id is not None
        assert len(str(user.id)) == 36
        assert user.role == UserRole.OFFICE_WORKER
        assert not user.is_owner_admin
        assert "orders.view" in user.get_effective_permissions()
        assert "users.manage" not in user.get_effective_permissions()

        with pytest.raises(ValidationError):
            User.objects.create_user(
                username="labour.one",
                email="labour@adarshidcards.local",
                full_name="Labour Worker",
                password="OfficePassword123!",
                role="labourer",
            )

    def test_role_permission_overrides_work_dynamically(self) -> None:
        worker = User.objects.create_user(
            username="rahul.verma",
            email="rahul@adarshidcards.local",
            full_name="Rahul Verma",
            password="OfficePassword123!",
            role=UserRole.OFFICE_WORKER,
        )
        assert not worker.has_module_permission("audit_logs.view")

        RolePermission.objects.create(
            role=UserRole.OFFICE_WORKER,
            permission_code="audit_logs.view",
            description="Grant audit log visibility to office workers",
            is_granted=True,
        )
        assert worker.has_module_permission("audit_logs.view")

    def test_login_me_and_logout_flow_with_session_and_audit_log(self) -> None:
        User.objects.create_user(
            username="adarsh.admin",
            email="admin@adarshidcards.local",
            full_name="Adarsh Owner",
            password="StrongAdminPassword123!",
            role=UserRole.OWNER_ADMIN,
        )
        client = APIClient()

        # 1. Unauthenticated /me/ returns 403
        me_url = reverse("v1:auth-me")
        unauth_res = client.get(me_url)
        assert unauth_res.status_code == status.HTTP_403_FORBIDDEN
        assert unauth_res.json()["status"] == "error"

        # 2. Login succeeds and sets session cookie
        login_url = reverse("v1:auth-login")
        login_res = client.post(
            login_url,
            {"username": "adarsh.admin", "password": "StrongAdminPassword123!"},
            format="json",
        )
        assert login_res.status_code == status.HTTP_200_OK
        assert login_res.json()["user"]["username"] == "adarsh.admin"
        assert login_res.json()["user"]["role"] == UserRole.OWNER_ADMIN
        assert "csrfToken" in login_res.json()

        # 3. Authenticated /me/ returns current user profile
        auth_me_res = client.get(me_url)
        assert auth_me_res.status_code == status.HTTP_200_OK
        assert auth_me_res.json()["user"]["email"] == "admin@adarshidcards.local"

        # 4. Logout terminates session
        logout_url = reverse("v1:auth-logout")
        logout_res = client.post(logout_url, format="json")
        assert logout_res.status_code == status.HTTP_200_OK

        # 5. Subsequent /me/ is rejected
        post_logout_res = client.get(me_url)
        assert post_logout_res.status_code == status.HTTP_403_FORBIDDEN

        # 6. Audit logs recorded for login and logout
        actions = list(AuditLog.objects.values_list("action", flat=True))
        assert "AUTH_LOGIN" in actions
        assert "AUTH_LOGOUT" in actions

    def test_invalid_login_records_failed_audit_event(self) -> None:
        client = APIClient()
        login_url = reverse("v1:auth-login")
        res = client.post(
            login_url,
            {"username": "unknown.user", "password": "WrongPassword123!"},
            format="json",
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.json()["status"] == "error"
        assert AuditLog.objects.filter(action="AUTH_LOGIN_FAILED").exists()

    def test_password_change_updates_password_and_keeps_session(self) -> None:
        user = User.objects.create_user(
            username="office.user",
            email="office@adarshidcards.local",
            full_name="Office User",
            password="InitialPassword123!",
            role=UserRole.OFFICE_WORKER,
        )
        client = APIClient()
        client.login(username="office.user", password="InitialPassword123!")

        change_url = reverse("v1:auth-password-change")
        res = client.post(
            change_url,
            {
                "current_password": "InitialPassword123!",
                "new_password": "UpdatedPassword456!",
                "confirm_password": "UpdatedPassword456!",
            },
            format="json",
        )
        assert res.status_code == status.HTTP_200_OK

        user.refresh_from_db()
        assert user.check_password("UpdatedPassword456!")
        assert AuditLog.objects.filter(action="AUTH_PASSWORD_CHANGED", actor=user).exists()

    def test_user_list_restricted_to_owner_admin(self) -> None:
        admin = User.objects.create_user(
            username="admin.boss",
            email="boss@adarshidcards.local",
            full_name="Admin Boss",
            password="StrongPassword123!",
            role=UserRole.OWNER_ADMIN,
        )
        worker = User.objects.create_user(
            username="worker.one",
            email="worker1@adarshidcards.local",
            full_name="Worker One",
            password="StrongPassword123!",
            role=UserRole.OFFICE_WORKER,
        )
        url = reverse("v1:auth-user-list")
        client = APIClient()

        client.force_authenticate(user=worker)
        forbidden_res = client.get(url)
        assert forbidden_res.status_code == status.HTTP_403_FORBIDDEN

        client.force_authenticate(user=admin)
        ok_res = client.get(url)
        assert ok_res.status_code == status.HTTP_200_OK
        assert ok_res.json()["count"] == 2

    def test_create_initial_admin_management_command(self) -> None:
        # Refuses to run without password
        with pytest.raises(CommandError):
            call_command(
                "create_initial_admin",
                username="first.admin",
                email="first@adarshidcards.local",
                password="",
            )

        out = StringIO()
        call_command(
            "create_initial_admin",
            username="first.admin",
            email="first@adarshidcards.local",
            full_name="First Admin",
            password="BootstrapPassword123!",
            stdout=out,
        )
        created = User.objects.get(username="first.admin")
        assert created.role == UserRole.OWNER_ADMIN
        assert created.is_superuser
        assert AuditLog.objects.filter(action="ADMIN_BOOTSTRAPPED", actor=created).exists()
