"""Reusable abstract base models for Pro Office.

Design decisions:
1. `TimeStampedUUIDModel` is the standard base model for business and system entities.
   It provides a UUIDv4 primary key and timezone-aware `created_at` / `updated_at` timestamps.
2. Soft deletion is intentionally NOT applied globally to all models. Financial, audit,
   and transactional records should remain immutable or use explicit status transitions.
3. For master-data records in future phases (e.g., Clients, Machines, Raw Materials) that
   cannot be hard-deleted once referenced by historical orders, `ArchivableModel` provides
   an explicit opt-in archival strategy without polluting query semantics everywhere.
"""
import uuid
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone


class TimeStampedUUIDModel(models.Model):
    """Abstract base model with UUID primary key and audit timestamps."""

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text="Unique UUIDv4 identifier for this record.",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="Timestamp when this record was created.",
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="Timestamp when this record was last updated.",
    )

    class Meta:
        abstract = True
        ordering = ["-created_at"]


class ArchivableQuerySet(models.QuerySet):
    """QuerySet helpers for explicitly archivable master-data models."""

    def active(self) -> "ArchivableQuerySet":
        return self.filter(is_archived=False)

    def archived(self) -> "ArchivableQuerySet":
        return self.filter(is_archived=True)


class ArchivableModel(models.Model):
    """Opt-in archival mixin for master-data entities in future modules.

    Do not apply to immutable logs or transactional ledger lines.
    """

    is_archived = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Indicates whether this record has been archived from active selection.",
    )
    archived_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when the record was archived.",
    )
    archived_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text="User who archived this record.",
    )
    archive_reason = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Optional reason for archiving this record.",
    )

    objects = ArchivableQuerySet.as_manager()

    class Meta:
        abstract = True

    def archive(self, user: Any = None, reason: str = "") -> None:
        """Mark the record as archived with timestamp and actor."""
        self.is_archived = True
        self.archived_at = timezone.now()
        self.archived_by = user
        self.archive_reason = reason
        self.save(
            update_fields=[
                "is_archived",
                "archived_at",
                "archived_by",
                "archive_reason",
            ]
        )

    def unarchive(self) -> None:
        """Restore an archived record to active status."""
        self.is_archived = False
        self.archived_at = None
        self.archived_by = None
        self.archive_reason = ""
        self.save(
            update_fields=[
                "is_archived",
                "archived_at",
                "archived_by",
                "archive_reason",
            ]
        )
