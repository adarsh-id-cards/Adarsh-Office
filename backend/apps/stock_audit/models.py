"""Models for Weekly Physical Stock Audits (Phase 4 — Section 13)."""
from datetime import date

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedUUIDModel


def local_today() -> date:
    return timezone.localdate()


class StockAuditStatus(models.TextChoices):
    DRAFT = "draft", "Draft / Counting"
    SUBMITTED = "submitted", "Submitted for Review"
    APPROVED = "approved", "Approved & Reconciled"


class StockAudit(TimeStampedUUIDModel):
    """Physical stock audit session comparing system expected balances with actual counted quantities."""

    audit_code = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        help_text="Unique stock audit reference (e.g. AUD-1001).",
    )
    audit_date = models.DateField(default=local_today, db_index=True)
    location = models.ForeignKey(
        "inventory.StockLocation",
        on_delete=models.PROTECT,
        related_name="stock_audits",
    )
    status = models.CharField(
        max_length=24,
        choices=StockAuditStatus.choices,
        default=StockAuditStatus.DRAFT,
        db_index=True,
    )
    conducted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="conducted_stock_audits",
    )
    conducted_by_username = models.CharField(max_length=150, blank=True, default="")
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_stock_audits",
    )
    approved_by_username = models.CharField(max_length=150, blank=True, default="")
    approved_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "pro_office_stock_audits"
        ordering = ["-audit_date", "-created_at"]
        verbose_name = "Stock Audit"
        verbose_name_plural = "Stock Audits"

    def __str__(self) -> str:
        return f"{self.audit_code} ({self.audit_date}) [{self.status}]"


class StockAuditLine(TimeStampedUUIDModel):
    """Individual material line in a Physical Stock Audit, including Section 11 consumption formula."""

    audit = models.ForeignKey(
        StockAudit,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    material = models.ForeignKey(
        "inventory.Material",
        on_delete=models.PROTECT,
        related_name="audit_lines",
    )
    expected_usable_quantity = models.IntegerField(
        default=0,
        help_text="System expected usable quantity at this location.",
    )
    physical_usable_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Actual physical counted usable quantity.",
    )
    difference_quantity = models.IntegerField(
        default=0,
        help_text="Signed variance (physical_usable_quantity - expected_usable_quantity).",
    )
    discrepancy_reason = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Mandatory reason when difference_quantity != 0.",
    )

    # Section 11 Office Consumption Reconciliation breakdown
    opening_office_stock = models.IntegerField(default=0)
    stock_received = models.IntegerField(default=0)
    returns_from_labourers = models.IntegerField(default=0)
    transfers_to_labourers = models.IntegerField(default=0)
    recorded_manual_consumption = models.IntegerField(default=0)
    calculated_net_office_consumption = models.IntegerField(default=0)
    unexplained_difference = models.IntegerField(default=0)

    adjustment_movement = models.ForeignKey(
        "inventory.StockMovement",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_adjustment_lines",
    )

    class Meta:
        db_table = "pro_office_stock_audit_lines"
        ordering = ["material__category", "material__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["audit", "material"],
                name="uq_stock_audit_line_audit_material",
            ),
        ]
        verbose_name = "Stock Audit Line"
        verbose_name_plural = "Stock Audit Lines"
