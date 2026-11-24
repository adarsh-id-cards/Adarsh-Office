"""Production management models for Pro Office (Phase 3).

Architectural highlights:
1. One `ProductionJob` per `OrderItem` (`OneToOneField`), guaranteeing no duplicate active
   production jobs per item and allowing every item in a multi-item order (as well as
   replacement order items) to progress independently.
2. Separate workflow stages by item category:
   - ID Card workflow: `design` -> `printing` -> `production_completed` -> `ready_for_dispatch`
   - Lanyard workflow (strictly 4 stages): `design` -> `printing` -> `assembly` -> `dispatch`
3. Lanyard batch calculation engine using configurable catalog `batch_capacity`
   (12 mm = 37, 16 mm = 30, 20 mm = 25) with ceiling division:
   - `calculated_batches = ceil(required_qty / batch_capacity)`
   - `calculated_planned_quantity = calculated_batches * batch_capacity`
   - `calculated_expected_surplus = calculated_planned_quantity - required_qty`
   Supports authorized overrides while preserving the original calculation and reason.
4. Multiple immutable `PrintingRun` records per item, tracking gross printed, rejected/wasted,
   and successful quantities separately from expected order surplus.
"""
import math
from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedUUIDModel
from apps.orders.models import ItemCategory


def local_today() -> date:
    return timezone.localdate()


DEFAULT_LANYARD_BATCH_CAPACITIES: dict[str, int] = {
    "lanyard_12mm": 37,
    "lanyard_16mm": 30,
    "lanyard_20mm": 25,
    "12 mm": 37,
    "16 mm": 30,
    "20 mm": 25,
}


def resolve_lanyard_batch_capacity(order_item) -> int:
    """Resolve configurable pieces-per-batch capacity from the item's lanyard size catalog option."""
    if order_item.category != ItemCategory.LANYARD:
        return 1
    size_opt = order_item.lanyard_size_option
    if size_opt is not None:
        if getattr(size_opt, "batch_capacity", None) and size_opt.batch_capacity > 0:
            return int(size_opt.batch_capacity)
        if size_opt.code in DEFAULT_LANYARD_BATCH_CAPACITIES:
            return DEFAULT_LANYARD_BATCH_CAPACITIES[size_opt.code]
        if size_opt.name in DEFAULT_LANYARD_BATCH_CAPACITIES:
            return DEFAULT_LANYARD_BATCH_CAPACITIES[size_opt.name]
    return 30


def calculate_lanyard_batch_plan(required_quantity: int, batch_capacity: int) -> dict[str, int]:
    """Compute ceiling-division batch plan for lanyard printing.

    Example: required_quantity=1000, batch_capacity=30
    -> batches = ceil(1000 / 30) = 34
    -> planned_quantity = 34 * 30 = 1020
    -> expected_surplus = 1020 - 1000 = 20
    """
    safe_req = max(1, int(required_quantity))
    safe_cap = max(1, int(batch_capacity))
    batches = math.ceil(safe_req / safe_cap)
    planned_qty = batches * safe_cap
    expected_surplus = max(0, planned_qty - safe_req)
    return {
        "batch_capacity": safe_cap,
        "calculated_batches": batches,
        "calculated_planned_quantity": planned_qty,
        "calculated_expected_surplus": expected_surplus,
    }


class ProductionStage(models.TextChoices):
    # Shared stages
    DESIGN = "design", "Design"
    PRINTING = "printing", "Printing"
    # ID Card final stages (Section 3)
    PRODUCTION_COMPLETED = "production_completed", "Production Completed"
    READY_FOR_DISPATCH = "ready_for_dispatch", "Ready for Packing / Dispatch"
    # Lanyard stages 3 & 4 (Section 4: Design -> Printing -> Assembly -> Dispatch)
    ASSEMBLY = "assembly", "Assembly"
    DISPATCH = "dispatch", "Dispatch"


class DesignStatus(models.TextChoices):
    NOT_STARTED = "not_started", "Not Started"
    IN_PROGRESS = "in_progress", "In Progress"
    REVIEW_REQUIRED = "review_required", "Review Required"
    APPROVED = "approved", "Approved"
    COMPLETED = "completed", "Completed"


class PrintingStatus(models.TextChoices):
    NOT_STARTED = "not_started", "Not Started"
    IN_PROGRESS = "in_progress", "In Progress"
    PARTIALLY_PRINTED = "partially_printed", "Partially Printed"
    COMPLETED = "completed", "Completed"


class AssemblyStatus(models.TextChoices):
    NOT_APPLICABLE = "not_applicable", "Not Applicable"
    NOT_READY = "not_ready", "Not Ready"
    READY_FOR_ASSEMBLY = "ready_for_assembly", "Ready for Assembly"
    IN_PROGRESS = "in_progress", "In Progress"
    PARTIALLY_COMPLETED = "partially_completed", "Partially Completed"
    COMPLETED = "completed", "Completed"


class PrintingRunStatus(models.TextChoices):
    IN_PROGRESS = "in_progress", "In Progress"
    COMPLETED = "completed", "Completed"


class ProductionJob(TimeStampedUUIDModel):
    """Independent production job tracking an individual OrderItem through floor stages."""

    order_item = models.OneToOneField(
        "orders.OrderItem",
        on_delete=models.CASCADE,
        related_name="production_job",
        help_text="The order line item tracked by this production job (1:1).",
    )
    current_stage = models.CharField(
        max_length=32,
        choices=ProductionStage.choices,
        default=ProductionStage.DESIGN,
        db_index=True,
        help_text="Active production workflow stage for this item.",
    )

    # --- Stage 1: Design ---
    design_status = models.CharField(
        max_length=30,
        choices=DesignStatus.choices,
        default=DesignStatus.NOT_STARTED,
        db_index=True,
    )
    design_started_at = models.DateTimeField(null=True, blank=True)
    design_approved_at = models.DateTimeField(null=True, blank=True)
    design_completed_at = models.DateTimeField(null=True, blank=True)
    design_responsible = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="design_production_jobs",
    )
    design_notes = models.TextField(blank=True, default="")
    design_reference = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Optional artwork reference code, filename, or proof link.",
    )

    # --- Stage 2: Printing & Lanyard Batch Plan ---
    printing_status = models.CharField(
        max_length=30,
        choices=PrintingStatus.choices,
        default=PrintingStatus.NOT_STARTED,
        db_index=True,
    )
    printing_started_at = models.DateTimeField(null=True, blank=True)
    printing_completed_at = models.DateTimeField(null=True, blank=True)
    printing_responsible = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="printing_production_jobs",
    )

    # Batch calculation fields (preserve system calculation even if overridden)
    batch_capacity = models.PositiveSmallIntegerField(
        default=1,
        help_text="Pieces per batch (37 for 12mm, 30 for 16mm, 25 for 20mm; 1 for ID Card).",
    )
    calculated_batches = models.PositiveIntegerField(
        default=1,
        help_text="System ceiling-division calculated minimum batches.",
    )
    calculated_planned_quantity = models.PositiveIntegerField(
        default=1,
        help_text="System calculated planned printing quantity (calculated_batches * batch_capacity).",
    )
    calculated_expected_surplus = models.PositiveIntegerField(
        default=0,
        help_text="System calculated expected surplus above customer ordered quantity.",
    )

    # Effective printing plan (defaults to calculated values; can be overridden with reason)
    planned_batches = models.PositiveIntegerField(
        default=1,
        help_text="Effective planned batch count.",
    )
    planned_printing_quantity = models.PositiveIntegerField(
        default=1,
        help_text="Effective planned printing quantity.",
    )
    expected_surplus_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Expected surplus based on effective planned printing quantity.",
    )
    is_plan_overridden = models.BooleanField(
        default=False,
        help_text="True if an authorized user overrode the system batch calculation.",
    )
    plan_override_reason = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Reason recorded when overriding the calculated batch plan.",
    )
    plan_overridden_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="overridden_production_jobs",
    )

    # Cumulative printing output across runs (waste tracked separately from surplus)
    total_printed_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Gross quantity printed across all completed printing runs.",
    )
    total_rejected_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Total rejected/wasted pieces across all printing runs.",
    )
    successful_printed_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Total successful/usable pieces printed across all printing runs.",
    )
    printing_notes = models.TextField(blank=True, default="")

    # --- Stage 3 (Lanyards Only): Assembly ---
    assembly_status = models.CharField(
        max_length=30,
        choices=AssemblyStatus.choices,
        default=AssemblyStatus.NOT_APPLICABLE,
        db_index=True,
    )
    is_assembly_ready = models.BooleanField(
        default=False,
        db_index=True,
        help_text="True when lanyard printing is sufficient and ready for assembly.",
    )
    planned_assembly_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Planned quantity entering lanyard assembly.",
    )
    completed_assembly_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Quantity completed in lanyard assembly.",
    )
    assembly_started_at = models.DateTimeField(null=True, blank=True)
    assembly_completed_at = models.DateTimeField(null=True, blank=True)
    assembly_responsible = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assembly_production_jobs",
    )
    assembly_notes = models.TextField(blank=True, default="")

    # --- Completion & Basic Dispatch Readiness (Sections 3, 4, 6) ---
    is_production_completed = models.BooleanField(
        default=False,
        db_index=True,
        help_text="True when item production requirements are satisfied.",
    )
    production_completed_at = models.DateTimeField(null=True, blank=True)
    is_ready_for_dispatch = models.BooleanField(
        default=False,
        db_index=True,
        help_text="True when item is ready for packing and dispatch.",
    )
    ready_for_packing_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Quantity verified ready for packing/dispatch.",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "pro_office_production_jobs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["current_stage", "design_status"],
                name="idx_prod_stage_design",
            ),
            models.Index(
                fields=["printing_status", "assembly_status"],
                name="idx_prod_print_assembly",
            ),
            models.Index(
                fields=["is_ready_for_dispatch", "is_production_completed"],
                name="idx_prod_dispatch_ready",
            ),
        ]
        verbose_name = "Production Job"
        verbose_name_plural = "Production Jobs"

    def __str__(self) -> str:
        return f"ProductionJob({self.order_item.order.order_number} - {self.order_item.item_name})"

    @property
    def required_quantity(self) -> int:
        return int(self.order_item.ordered_quantity)

    @property
    def production_quantity_available(self) -> int:
        """Quantity currently available from production."""
        if self.order_item.category == ItemCategory.ID_CARD:
            return int(self.successful_printed_quantity)
        # For lanyards: once assembly has completed units, use completed_assembly_quantity;
        # otherwise reflect successful printed units available for assembly.
        if self.completed_assembly_quantity > 0 or self.assembly_status == AssemblyStatus.COMPLETED:
            return int(self.completed_assembly_quantity)
        return int(self.successful_printed_quantity)

    @property
    def quantity_completed(self) -> int:
        """Customer-order-eligible completed quantity (capped at required_quantity)."""
        if self.order_item.category == ItemCategory.ID_CARD:
            return min(self.required_quantity, int(self.successful_printed_quantity))
        return min(self.required_quantity, int(self.completed_assembly_quantity))

    @property
    def quantity_pending(self) -> int:
        """Remaining quantity still pending production completion."""
        return max(0, self.required_quantity - self.quantity_completed)

    @property
    def actual_printed_surplus(self) -> int:
        """Actual good printed pieces exceeding the customer ordered quantity (distinct from waste)."""
        return max(0, int(self.successful_printed_quantity) - self.required_quantity)


class PrintingRun(TimeStampedUUIDModel):
    """Individual printing batch/run record for an OrderItem (`ProductionJob`).

    Once `status == 'completed'`, the run record is immutable to preserve production history.
    """

    production_job = models.ForeignKey(
        ProductionJob,
        on_delete=models.CASCADE,
        related_name="printing_runs",
    )
    order_item = models.ForeignKey(
        "orders.OrderItem",
        on_delete=models.CASCADE,
        related_name="printing_runs",
    )
    run_number = models.PositiveSmallIntegerField(
        default=1,
        help_text="1-based sequential run number for this item.",
    )
    run_identifier = models.CharField(
        max_length=48,
        unique=True,
        db_index=True,
        help_text="Human-readable unique run identifier (e.g. PRN-1001-L1-R1).",
    )
    status = models.CharField(
        max_length=24,
        choices=PrintingRunStatus.choices,
        default=PrintingRunStatus.IN_PROGRESS,
        db_index=True,
    )
    run_date = models.DateField(
        default=local_today,
        db_index=True,
    )
    completed_at = models.DateTimeField(null=True, blank=True)

    planned_batches = models.PositiveIntegerField(
        default=1,
        help_text="Number of batches planned for this run.",
    )
    planned_quantity = models.PositiveIntegerField(
        default=1,
        help_text="Quantity planned for this printing run.",
    )
    actual_printed_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Gross pieces printed in this run (successful + rejected).",
    )
    rejected_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Pieces rejected or wasted during this printing run.",
    )
    successful_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Good/usable pieces produced in this printing run.",
    )

    idempotency_key = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        unique=True,
        help_text="Optional idempotency key preventing duplicate run submissions.",
    )
    responsible_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="printing_runs",
    )
    responsible_username = models.CharField(
        max_length=150,
        blank=True,
        default="",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "pro_office_printing_runs"
        ordering = ["run_number", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["production_job", "run_number"],
                name="uq_printing_run_job_run_number",
            ),
            models.CheckConstraint(
                condition=models.Q(planned_batches__gte=1),
                name="ck_printing_run_planned_batches_pos",
            ),
            models.CheckConstraint(
                condition=models.Q(planned_quantity__gte=1),
                name="ck_printing_run_planned_qty_pos",
            ),
            models.CheckConstraint(
                condition=models.Q(actual_printed_quantity__gte=0),
                name="ck_printing_run_actual_qty_non_neg",
            ),
            models.CheckConstraint(
                condition=models.Q(rejected_quantity__gte=0),
                name="ck_printing_run_rejected_qty_non_neg",
            ),
            models.CheckConstraint(
                condition=models.Q(successful_quantity__gte=0),
                name="ck_printing_run_successful_qty_non_neg",
            ),
        ]
        verbose_name = "Printing Run"
        verbose_name_plural = "Printing Runs"

    def __str__(self) -> str:
        return f"{self.run_identifier} ({self.successful_quantity} good / {self.rejected_quantity} waste)"

    def clean(self) -> None:
        super().clean()
        if self.planned_batches < 1:
            raise ValidationError({"planned_batches": "Planned batches must be at least 1."})
        if self.planned_quantity < 1:
            raise ValidationError({"planned_quantity": "Planned quantity must be at least 1."})
        if self.actual_printed_quantity < 0:
            raise ValidationError({"actual_printed_quantity": "Actual printed quantity cannot be negative."})
        if self.rejected_quantity < 0:
            raise ValidationError({"rejected_quantity": "Rejected quantity cannot be negative."})
        if self.successful_quantity < 0:
            raise ValidationError({"successful_quantity": "Successful quantity cannot be negative."})
        if self.rejected_quantity > self.actual_printed_quantity:
            raise ValidationError(
                {"rejected_quantity": "Rejected quantity cannot exceed actual printed quantity."}
            )
        if self.actual_printed_quantity != (self.successful_quantity + self.rejected_quantity):
            raise ValidationError(
                {
                    "actual_printed_quantity": (
                        f"Actual printed quantity ({self.actual_printed_quantity}) must equal "
                        f"successful quantity ({self.successful_quantity}) + rejected quantity ({self.rejected_quantity})."
                    )
                }
            )


class ProductionStatusHistory(TimeStampedUUIDModel):
    """Immutable timeline log of production stage, design, printing, and assembly transitions."""

    production_job = models.ForeignKey(
        ProductionJob,
        on_delete=models.CASCADE,
        related_name="history",
    )
    stage = models.CharField(
        max_length=32,
        db_index=True,
        help_text="Workflow stage affected (design, printing, assembly, completion, dispatch_readiness).",
    )
    previous_status = models.CharField(
        max_length=40,
        blank=True,
        default="",
    )
    new_status = models.CharField(
        max_length=40,
    )
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="production_history_events",
    )
    changed_by_username = models.CharField(
        max_length=150,
        blank=True,
        default="",
    )
    summary = models.CharField(max_length=255)
    notes = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "pro_office_production_status_history"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["production_job", "-created_at"],
                name="idx_prod_hist_job_created",
            ),
        ]
        verbose_name = "Production Status History"
        verbose_name_plural = "Production Status Histories"

    def __str__(self) -> str:
        return f"[{self.stage}] {self.previous_status or 'init'} -> {self.new_status}"
