"""Management command to safely bootstrap the first Owner / Admin user.

Never uses hardcoded production passwords. Reads credentials from CLI arguments
or `INITIAL_ADMIN_*` environment variables.
"""
import os

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User, UserRole
from apps.audit_logs.services import record_audit_log


class Command(BaseCommand):
    help = (
        "Create the first Owner/Admin user from CLI flags or INITIAL_ADMIN_* "
        "environment variables without hardcoded credentials."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--username",
            type=str,
            default=os.getenv("INITIAL_ADMIN_USERNAME", "").strip(),
            help="Username for the initial administrator (or set INITIAL_ADMIN_USERNAME).",
        )
        parser.add_argument(
            "--email",
            type=str,
            default=os.getenv("INITIAL_ADMIN_EMAIL", "").strip(),
            help="Email for the initial administrator (or set INITIAL_ADMIN_EMAIL).",
        )
        parser.add_argument(
            "--full-name",
            type=str,
            default=os.getenv("INITIAL_ADMIN_FULL_NAME", "System Administrator").strip(),
            help="Full display name (or set INITIAL_ADMIN_FULL_NAME).",
        )
        parser.add_argument(
            "--password",
            type=str,
            default=os.getenv("INITIAL_ADMIN_PASSWORD", ""),
            help="Password for the initial administrator (or set INITIAL_ADMIN_PASSWORD).",
        )
        parser.add_argument(
            "--if-none-exists",
            action="store_true",
            help="Exit cleanly with code 0 if an Owner/Admin user already exists.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        existing_admin = User.objects.filter(role=UserRole.OWNER_ADMIN).first()
        if existing_admin and options["if_none_exists"]:
            self.stdout.write(
                self.style.WARNING(
                    f"Owner/Admin account '{existing_admin.username}' already exists. Skipping."
                )
            )
            return

        username = (options["username"] or "").strip()
        email = (options["email"] or "").strip()
        full_name = (options["full_name"] or "System Administrator").strip()
        password = options["password"] or ""

        if not username:
            raise CommandError(
                "Missing administrator username. Provide --username or set INITIAL_ADMIN_USERNAME."
            )
        if not email:
            raise CommandError(
                "Missing administrator email. Provide --email or set INITIAL_ADMIN_EMAIL."
            )
        if not password:
            raise CommandError(
                "Missing administrator password. Provide --password or set INITIAL_ADMIN_PASSWORD. "
                "Hardcoded default passwords are not permitted."
            )

        if User.objects.filter(username__iexact=username).exists():
            raise CommandError(f"A user with username '{username}' already exists.")
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError(f"A user with email '{email}' already exists.")

        candidate = User(
            username=username,
            email=email,
            full_name=full_name,
            role=UserRole.OWNER_ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        try:
            validate_password(password, user=candidate)
        except ValidationError as exc:
            raise CommandError("; ".join(exc.messages)) from exc

        user = User.objects.create_superuser(
            username=username,
            email=email,
            password=password,
            full_name=full_name,
        )

        record_audit_log(
            action="ADMIN_BOOTSTRAPPED",
            module="accounts",
            summary=f"Initial Owner/Admin user '{user.username}' created via management command.",
            actor=user,
            target_type="User",
            target_id=str(user.id),
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully created Owner/Admin user '{user.username}' (id={user.id})."
            )
        )
