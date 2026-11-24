"""User and Role Permission models for Pro Office.

Phase 1 implements:
- Internal user accounts with UUID primary keys (`TimeStampedUUIDModel`).
- Initial roles:
  1. `owner_admin` (Owner / Admin)
  2. `office_worker` (Office Worker)
- Extensible module permission system (`RolePermission` + default role capability baseline).
- Strictly prohibits labourer login accounts.
"""
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from apps.common.models import TimeStampedUUIDModel

from .managers import UserManager


class UserRole(models.TextChoices):
    OWNER_ADMIN = "owner_admin", "Owner / Admin"
    OFFICE_WORKER = "office_worker", "Office Worker"


ROLE_DEFAULT_PERMISSIONS: dict[str, list[str]] = {
    UserRole.OWNER_ADMIN: [
        "dashboard.view",
        "clients.view",
        "clients.manage",
        "orders.view",
        "orders.manage",
        "production.view",
        "production.manage",
        "dispatch.view",
        "dispatch.manage",
        "labour.view",
        "labour.manage",
        "machines.view",
        "machines.manage",
        "inventory.view",
        "inventory.manage",
        "stock_audit.view",
        "stock_audit.manage",
        "settings.view",
        "settings.manage",
        "users.view",
        "users.manage",
        "audit_logs.view",
    ],
    UserRole.OFFICE_WORKER: [
        "dashboard.view",
        "clients.view",
        "clients.manage",
        "orders.view",
        "orders.manage",
        "production.view",
        "production.manage",
        "dispatch.view",
        "dispatch.manage",
        "labour.view",
        "labour.manage",
        "machines.view",
        "machines.manage",
        "inventory.view",
        "inventory.manage",
        "stock_audit.view",
        "stock_audit.manage",
    ],
}


class RolePermission(TimeStampedUUIDModel):
    """Extensible database-backed permission overrides per role.

    Allows future phases or administrative configuration to grant or revoke
    specific module capability codes without rewriting the authentication model.
    """

    role = models.CharField(
        max_length=32,
        choices=UserRole.choices,
        db_index=True,
        help_text="Internal role to which this permission rule applies.",
    )
    permission_code = models.CharField(
        max_length=80,
        db_index=True,
        help_text="Module capability identifier (e.g. 'orders.manage', 'audit_logs.view').",
    )
    description = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Human-readable explanation of this capability.",
    )
    is_granted = models.BooleanField(
        default=True,
        help_text="True to grant capability; False to explicitly revoke capability.",
    )

    class Meta:
        db_table = "pro_office_role_permissions"
        ordering = ["role", "permission_code"]
        constraints = [
            models.UniqueConstraint(
                fields=["role", "permission_code"],
                name="uq_role_permission_code",
            ),
            models.CheckConstraint(
                condition=models.Q(role__in=["owner_admin", "office_worker"]),
                name="ck_role_permission_valid_role",
            ),
        ]
        verbose_name = "Role Permission"
        verbose_name_plural = "Role Permissions"

    def __str__(self) -> str:
        state = "ALLOW" if self.is_granted else "DENY"
        return f"{self.role} -> {self.permission_code} ({state})"


class User(AbstractBaseUser, PermissionsMixin, TimeStampedUUIDModel):
    """Custom internal user model for Adarsh ID Cards — Pro Office."""

    username = models.CharField(
        max_length=150,
        unique=True,
        db_index=True,
        help_text="Unique login username for the office staff member or administrator.",
    )
    email = models.EmailField(
        unique=True,
        db_index=True,
        help_text="Work email address.",
    )
    full_name = models.CharField(
        max_length=150,
        help_text="Full display name of the staff member.",
    )
    role = models.CharField(
        max_length=32,
        choices=UserRole.choices,
        default=UserRole.OFFICE_WORKER,
        db_index=True,
        help_text="Primary organizational role within Pro Office.",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Designates whether this user can sign in.",
    )
    is_staff = models.BooleanField(
        default=False,
        help_text="Designates whether the user can access the Django admin site.",
    )
    last_login_ip = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="IP address recorded during the most recent login.",
    )

    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email", "full_name"]

    class Meta:
        db_table = "pro_office_users"
        ordering = ["full_name", "username"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(role__in=["owner_admin", "office_worker"]),
                name="ck_user_valid_internal_role",
            ),
        ]
        indexes = [
            models.Index(fields=["role", "is_active"], name="idx_user_role_active"),
        ]
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self) -> str:
        return f"{self.full_name} ({self.username})"

    @property
    def is_owner_admin(self) -> bool:
        return self.role == UserRole.OWNER_ADMIN or self.is_superuser

    @property
    def role_label(self) -> str:
        return dict(UserRole.choices).get(self.role, self.role)

    def get_effective_permissions(self) -> list[str]:
        """Resolve effective module permission codes for this user."""
        if not self.is_active:
            return []

        effective = set(ROLE_DEFAULT_PERMISSIONS.get(self.role, []))
        if self.is_superuser:
            effective.update(ROLE_DEFAULT_PERMISSIONS[UserRole.OWNER_ADMIN])

        overrides = RolePermission.objects.filter(role=self.role).values_list(
            "permission_code", "is_granted"
        )
        for code, is_granted in overrides:
            if is_granted:
                effective.add(code)
            else:
                effective.discard(code)

        return sorted(effective)

    def has_module_permission(self, permission_code: str) -> bool:
        """Check whether the user holds a specific Pro Office module capability."""
        if not self.is_active:
            return False
        if self.is_superuser:
            return True
        return permission_code in self.get_effective_permissions()
