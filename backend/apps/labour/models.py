"""Labourer and Seasonal Closing models for Pro Office (Phase 4).

Business rules (Sections 2, 3, 14):
- Labourers do NOT log into Pro Office; office employees manage their records.
- Only name, optional contact number, active/inactive status, joined date, and notes are required.
- Labourers hold allocated machines and retain usable raw-material balances between assignments.
- At the end of the season, `SeasonalClosing` reconciles physical returned materials and machines.
"""
from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.common.models import ArchivableModel, TimeStampedUUIDModel


def local_today() -> date:
    return timezone.localdate()


def clean_labourer_name(raw_name: str) -> str:
    if not raw_name:
        return ""
    return " ".join(raw_name.strip().split())


def normalize_labourer_name(raw_name: str) -> str:
    return clean_labourer_name(raw_name).lower()


class Labourer(TimeStampedUUIDModel, ArchivableModel):
    """Floor or external labourer managed by office staff (never a login user)."""

    name = models.CharField(
        max_length=150,
        db_index=True,
        help_text="Display name of the labourer.",
    )
    normalized_name = models.CharField(
        max_length=150,
        unique=True,
        db_index=True,
        editable=False,
    )
    contact_number = models.CharField(
        max_length=40,
        blank=True,
        default="",
        help_text="Optional phone or contact number.",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Whether the labourer is currently active for work assignments.",
    )
    joined_date = models.DateField(
        default=local_today,
        help_text="Date when the labourer started working with Adarsh.",
    )
    notes = models.TextField(
        blank=True,
        default="",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_labourers",
    )

    class Meta:
        db_table = "pro_office_labourers"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["normalized_name"],
                name="uq_labourer_normalized_name",
            ),
            models.CheckConstraint(
                condition=~models.Q(normalized_name=""),
                name="ck_labourer_normalized_name_non_empty",
            ),
        ]
        verbose_name = "Labourer"
        verbose_name_plural = "Labourers"

    def __str__(self) -> str:
        return self.name

    def clean(self) -> None:
        super().clean()
        self.name = clean_labourer_name(self.name)
        self.normalized_name = normalize_labourer_name(self.name)
        if not self.normalized_name:
            raise ValidationError({"name": "Labourer name cannot be blank."})

        dup = (
            Labourer.objects.filter(normalized_name=self.normalized_name)
            .exclude(pk=self.pk)
            .first()
        )
        if dup is not None:
            raise ValidationError(
                {"name": f"A labourer named '{dup.name}' already exists."}
            )

    def save(self, *args, **kwargs) -> None:
        self.name = clean_labourer_name(self.name)
        self.normalized_name = normalize_labourer_name(self.name)
        if self.is_archived:
            self.is_active = False
        self.full_clean()
        super().save(*args, **kwargs)


class SeasonalClosingStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    RECONCILED = "reconciled", "Reconciled & Closed"


class SeasonalClosing(TimeStampedUUIDModel):
    """End-of-season recovery and reconciliation of a labourer's machines and materials (Section 14)."""

    closing_code = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        help_text="Unique seasonal closing reference (e.g. SCL-1001).",
    )
    labourer = models.ForeignKey(
        Labourer,
        on_delete=models.PROTECT,
        related_name="seasonal_closings",
    )
    season_label = models.CharField(
        max_length=80,
        default="Annual Production Season",
    )
    closing_date = models.DateField(default=local_today)
    status = models.CharField(
        max_length=24,
        choices=SeasonalClosingStatus.choices,
        default=SeasonalClosingStatus.DRAFT,
        db_index=True,
    )
    reconciled_at = models.DateTimeField(null=True, blank=True)
    reconciled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reconciled_seasonal_closings",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "pro_office_seasonal_closings"
        ordering = ["-closing_date", "-created_at"]
        verbose_name = "Seasonal Closing"
        verbose_name_plural = "Seasonal Closings"

    def __str__(self) -> str:
        return f"{self.closing_code} — {self.labourer.name}"


class SeasonalClosingMaterialLine(TimeStampedUUIDModel):
    """Material balance vs. actual physical returned quantities during seasonal closing."""

    seasonal_closing = models.ForeignKey(
        SeasonalClosing,
        on_delete=models.CASCADE,
        related_name="material_lines",
    )
    material = models.ForeignKey(
        "inventory.Material",
        on_delete=models.PROTECT,
        related_name="seasonal_closing_lines",
    )
    expected_usable_balance = models.PositiveIntegerField(
        default=0,
        help_text="System-calculated usable balance held by the labourer before closing.",
    )
    actual_returned_usable = models.PositiveIntegerField(
        default=0,
        help_text="Actual usable pieces physically returned to the office.",
    )
    actual_returned_defective = models.PositiveIntegerField(
        default=0,
        help_text="Defective pieces physically returned to the office.",
    )
    missing_or_unexplained_quantity = models.IntegerField(
        default=0,
        help_text="Difference (expected_usable_balance - actual_returned_usable - actual_returned_defective).",
    )
    discrepancy_explanation = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Explanation for any missing, damaged, or excess returned material.",
    )

    class Meta:
        db_table = "pro_office_seasonal_closing_materials"
        ordering = ["material__name"]


class SeasonalClosingMachineLine(TimeStampedUUIDModel):
    """Machine return and condition verification during seasonal closing."""

    seasonal_closing = models.ForeignKey(
        SeasonalClosing,
        on_delete=models.CASCADE,
        related_name="machine_lines",
    )
    machine = models.ForeignKey(
        "machines.Machine",
        on_delete=models.PROTECT,
        related_name="seasonal_closing_lines",
    )
    was_returned = models.BooleanField(default=True)
    return_condition = models.CharField(
        max_length=30,
        choices=[
            ("good", "Good / Operational"),
            ("damaged", "Damaged"),
            ("missing", "Missing / Not Returned"),
        ],
        default="good",
    )
    notes = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "pro_office_seasonal_closing_machines"
        ordering = ["machine__machine_code"]
