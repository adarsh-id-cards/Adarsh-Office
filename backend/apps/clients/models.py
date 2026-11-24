"""Client model for Pro Office (Adarsh ID Cards).

Design principles (Section 2):
- Simple database of client names without unnecessary CRM fields (no GST, no addresses, no emails).
- Client name is the primary business identifier.
- Names are normalized (`normalized_name`) for case- and whitespace-insensitive duplicate detection
  while preserving the clean display format (`name`).
- Supports explicit archival (`ArchivableModel`) without deleting historical order links.
"""
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.common.models import ArchivableModel, TimeStampedUUIDModel


def clean_display_client_name(raw_name: str) -> str:
    """Collapse internal redundant whitespace while preserving original casing."""
    if not raw_name:
        return ""
    return " ".join(raw_name.strip().split())


def normalize_client_name(raw_name: str) -> str:
    """Normalize client name for duplicate detection (trimmed, single-spaced, lowercased)."""
    return clean_display_client_name(raw_name).lower()


class Client(TimeStampedUUIDModel, ArchivableModel):
    """Client entity identified primarily by name."""

    name = models.CharField(
        max_length=200,
        db_index=True,
        help_text="Display name of the client (e.g. 'ABC Public School').",
    )
    normalized_name = models.CharField(
        max_length=200,
        unique=True,
        db_index=True,
        editable=False,
        help_text="Lowercased, whitespace-normalized name for duplicate prevention.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_clients",
        help_text="Staff user who created this client record.",
    )

    class Meta:
        db_table = "pro_office_clients"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["normalized_name"],
                name="uq_client_normalized_name",
            ),
            models.CheckConstraint(
                condition=~models.Q(normalized_name=""),
                name="ck_client_normalized_name_non_empty",
            ),
        ]
        indexes = [
            models.Index(
                fields=["is_archived", "name"],
                name="idx_client_archived_name",
            ),
        ]
        verbose_name = "Client"
        verbose_name_plural = "Clients"

    def __str__(self) -> str:
        return self.name

    def clean(self) -> None:
        super().clean()
        self.name = clean_display_client_name(self.name)
        self.normalized_name = normalize_client_name(self.name)
        if not self.normalized_name:
            raise ValidationError({"name": "Client name cannot be blank."})

        duplicate = (
            Client.objects.filter(normalized_name=self.normalized_name)
            .exclude(pk=self.pk)
            .first()
        )
        if duplicate is not None:
            status_note = " (currently archived)" if duplicate.is_archived else ""
            raise ValidationError(
                {
                    "name": f"A client with a matching name '{duplicate.name}' already exists{status_note}."
                }
            )

    def save(self, *args, **kwargs) -> None:
        self.name = clean_display_client_name(self.name)
        self.normalized_name = normalize_client_name(self.name)
        self.full_clean()
        super().save(*args, **kwargs)
