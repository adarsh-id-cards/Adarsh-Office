"""Custom UserManager for Pro Office internal user accounts."""
from typing import Any

from django.contrib.auth.base_user import BaseUserManager
from django.core.exceptions import ValidationError


class UserManager(BaseUserManager):
    """Manager for internal Pro Office accounts (`owner_admin`, `office_worker`).

    Note: Labourers do not have login accounts and must never be created as `User` rows.
    """

    use_in_migrations = True

    def _create_user(
        self,
        username: str,
        email: str,
        password: str | None,
        **extra_fields: Any,
    ):
        if not username or not username.strip():
            raise ValueError("The username field must be set.")
        if not email or not email.strip():
            raise ValueError("The email field must be set.")

        role = extra_fields.get("role", "office_worker")
        if role not in {"owner_admin", "office_worker"}:
            raise ValidationError(
                f"Invalid user role '{role}'. Only internal roles ('owner_admin', 'office_worker') are permitted."
            )

        normalized_email = self.normalize_email(email.strip()).lower()
        clean_username = username.strip()

        user = self.model(
            username=clean_username,
            email=normalized_email,
            **extra_fields,
        )
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.full_clean()
        user.save(using=self._db)
        return user

    def create_user(
        self,
        username: str,
        email: str,
        password: str | None = None,
        **extra_fields: Any,
    ):
        extra_fields.setdefault("role", "office_worker")
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(username, email, password, **extra_fields)

    def create_superuser(
        self,
        username: str,
        email: str,
        password: str | None = None,
        **extra_fields: Any,
    ):
        if not password:
            raise ValueError("Superusers must have a password.")
        extra_fields["role"] = "owner_admin"
        extra_fields["is_staff"] = True
        extra_fields["is_superuser"] = True
        extra_fields.setdefault("full_name", "Owner / Administrator")
        return self._create_user(username, email, password, **extra_fields)
