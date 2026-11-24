"""Audit log models for tracking security and operational events."""
from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedUUIDModel


class AuditLog(TimeStampedUUIDModel):
    """Immutable audit trail entry for authentication and administrative actions."""

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
        help_text="Authenticated user who triggered the action (null for system or anonymous events).",
    )
    actor_username = models.CharField(
        max_length=150,
        blank=True,
        default="",
        help_text="Snapshot of actor username at the time of the action.",
    )
    actor_role = models.CharField(
        max_length=40,
        blank=True,
        default="",
        help_text="Snapshot of actor role at the time of the action.",
    )
    action = models.CharField(
        max_length=80,
        db_index=True,
        help_text="Standardized action identifier (e.g. AUTH_LOGIN, AUTH_PASSWORD_CHANGED).",
    )
    module = models.CharField(
        max_length=60,
        db_index=True,
        help_text="Logical domain module (e.g. accounts, system).",
    )
    target_type = models.CharField(
        max_length=80,
        blank=True,
        default="",
        help_text="Entity type affected by the action.",
    )
    target_id = models.CharField(
        max_length=64,
        blank=True,
        default="",
        db_index=True,
        help_text="UUID or identifier of the affected record.",
    )
    summary = models.CharField(
        max_length=255,
        help_text="Human-readable summary of the event.",
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Structured contextual metadata (never store passwords or secrets).",
    )
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="Client IP address if initiated from an HTTP request.",
    )
    user_agent = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Truncated HTTP User-Agent string.",
    )

    class Meta:
        db_table = "pro_office_audit_logs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["-created_at", "module"], name="idx_audit_created_module"),
            models.Index(fields=["action", "-created_at"], name="idx_audit_action_created"),
        ]
        verbose_name = "Audit Log"
        verbose_name_plural = "Audit Logs"

    def __str__(self) -> str:
        actor_label = self.actor_username or "system"
        return f"[{self.action}] {actor_label} — {self.summary}"
