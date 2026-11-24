"""Models for Lanyard Assembly Assignments, Material Issuance, and Receiving (Sections 5, 6, 7, 8)."""
from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedUUIDModel


def local_today() -> date:
    return timezone.localdate()


class AssignmentMode(models.TextChoices):
    LABOURER = "labourer", "External / Floor Labourer"
    OFFICE_ASSEMBLY = "office_assembly", "Internal Office Assembly"


class AssemblyAssignmentStatus(models.TextChoices):
    ASSIGNED = "assigned", "Assigned"
    MATERIALS_ISSUED = "materials_issued", "Materials Issued"
    IN_PROGRESS = "in_progress", "In Progress"
    PARTIALLY_RECEIVED = "partially_received", "Partially Received"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class AssemblyAssignment(TimeStampedUUIDModel):
    """Individual lanyard assembly assignment (supports single, split across labourers, or office assembly)."""

    assignment_code = models.CharField(
        max_length=48,
        unique=True,
        db_index=True,
        help_text="Human-readable assignment identifier (e.g. ASM-1001-1).",
    )
    order_item = models.ForeignKey(
        "orders.OrderItem",
        on_delete=models.CASCADE,
        related_name="assembly_assignments",
    )
    production_job = models.ForeignKey(
        "production.ProductionJob",
        on_delete=models.CASCADE,
        related_name="assembly_assignments",
    )
    assignment_mode = models.CharField(
        max_length=24,
        choices=AssignmentMode.choices,
        default=AssignmentMode.LABOURER,
        db_index=True,
    )
    labourer = models.ForeignKey(
        "labour.Labourer",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="assembly_assignments",
        help_text="Assigned labourer when assignment_mode is 'labourer' (null for 'office_assembly').",
    )
    assigned_machine = models.ForeignKey(
        "machines.Machine",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assembly_assignments",
        help_text="Compatible allocated machine used for this assignment.",
    )
    is_machine_override = models.BooleanField(
        default=False,
        help_text="True if an authorized user overrode machine compatibility check.",
    )
    machine_override_reason = models.CharField(
        max_length=255,
        blank=True,
        default="",
    )

    assigned_quantity = models.PositiveIntegerField(
        help_text="Lanyard quantity assigned in this split or full assignment.",
    )
    received_usable_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Cumulative usable assembled lanyards received so far.",
    )
    received_defective_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Cumulative defective lanyards reported during receiving.",
    )
    status = models.CharField(
        max_length=28,
        choices=AssemblyAssignmentStatus.choices,
        default=AssemblyAssignmentStatus.ASSIGNED,
        db_index=True,
    )
    is_reconciled = models.BooleanField(
        default=False,
        db_index=True,
        help_text="True once raw material consumption and closing labourer balance have been reconciled.",
    )
    assigned_date = models.DateField(default=local_today)
    completed_at = models.DateTimeField(null=True, blank=True)
    reconciled_at = models.DateTimeField(null=True, blank=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_assembly_assignments",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "pro_office_assembly_assignments"
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(assigned_quantity__gte=1),
                name="ck_assembly_assignment_qty_positive",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(assignment_mode="labourer", labourer__isnull=False)
                    | models.Q(assignment_mode="office_assembly", labourer__isnull=True)
                ),
                name="ck_assembly_assignment_mode_labourer_consistency",
            ),
        ]
        verbose_name = "Assembly Assignment"
        verbose_name_plural = "Assembly Assignments"

    def __str__(self) -> str:
        assignee = (
            self.labourer.name
            if self.assignment_mode == AssignmentMode.LABOURER and self.labourer
            else "Internal Office Assembly"
        )
        return f"{self.assignment_code} -> {assignee} ({self.assigned_quantity})"

    @property
    def pending_quantity(self) -> int:
        accounted = int(self.received_usable_quantity) + int(self.received_defective_quantity)
        return max(0, int(self.assigned_quantity) - accounted)

    def clean(self) -> None:
        super().clean()
        if self.assignment_mode == AssignmentMode.LABOURER and self.labourer_id is None:
            raise ValidationError({"labourer": "A labourer must be selected for labourer assignments."})
        if self.assignment_mode == AssignmentMode.OFFICE_ASSEMBLY and self.labourer_id is not None:
            raise ValidationError(
                {"labourer": "Labourer must be null when assignment mode is Internal Office Assembly."}
            )


class AssignmentMaterialAllocation(TimeStampedUUIDModel):
    """Raw material requirement, issuance, and consumption reconciliation line for an AssemblyAssignment.

    Tracks the exact Section 6 & 7 business math:
    - `required_quantity` (e.g. 600)
    - `opening_labour_balance` (e.g. 400)
    - `additional_needed_quantity` = max(0, required_quantity - opening_labour_balance) (e.g. 200)
    - `packaging` & `packets_issued` (e.g. 1 packet of 500 -> `issued_quantity` = 500)
    - `total_available_after_issue` = opening_labour_balance + issued_quantity (e.g. 900)
    - `expected_remaining_balance` = max(0, total_available_after_issue - required_quantity) (e.g. 300)
    - Upon reconciliation: `consumed_quantity`, `defective_quantity`, `returned_to_office_quantity`,
      and `closing_labour_balance`.
    """

    assignment = models.ForeignKey(
        AssemblyAssignment,
        on_delete=models.CASCADE,
        related_name="material_allocations",
    )
    material = models.ForeignKey(
        "inventory.Material",
        on_delete=models.PROTECT,
        related_name="assignment_allocations",
    )
    required_quantity = models.PositiveIntegerField(
        help_text="Base units required for this assignment.",
    )
    opening_labour_balance = models.PositiveIntegerField(
        default=0,
        help_text="Usable balance already held by the labourer before issuing new stock.",
    )
    additional_needed_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Additional base units needed after accounting for existing labourer balance.",
    )
    packaging = models.ForeignKey(
        "inventory.MaterialPackaging",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assignment_allocations",
    )
    packets_issued = models.PositiveIntegerField(
        default=0,
        help_text="Number of packages issued in this allocation.",
    )
    units_per_package_snapshot = models.PositiveIntegerField(
        null=True,
        blank=True,
    )
    issued_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Total new base units transferred from Main Office to the labourer.",
    )
    is_override = models.BooleanField(
        default=False,
        help_text="True if issued quantity was manually overridden or partially issued.",
    )
    override_reason = models.CharField(
        max_length=255,
        blank=True,
        default="",
    )

    # Reconciliation fields (Section 8)
    consumed_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Base units consumed in completed assembly.",
    )
    defective_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Raw material units reported defective during assembly.",
    )
    returned_to_office_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Usable units physically returned to Main Office (0 when retained by labourer).",
    )
    closing_labour_balance = models.PositiveIntegerField(
        default=0,
        help_text="Remaining usable balance retained by the labourer after reconciliation.",
    )
    is_reconciled = models.BooleanField(default=False)
    stock_movement = models.ForeignKey(
        "inventory.StockMovement",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assignment_material_allocations",
    )
    notes = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "pro_office_assignment_material_allocations"
        ordering = ["material__name", "created_at"]
        verbose_name = "Assignment Material Allocation"
        verbose_name_plural = "Assignment Material Allocations"

    @property
    def total_available_after_issue(self) -> int:
        return int(self.opening_labour_balance) + int(self.issued_quantity)

    @property
    def expected_remaining_balance(self) -> int:
        return max(0, self.total_available_after_issue - int(self.required_quantity))


class AssemblyReceivingRecord(TimeStampedUUIDModel):
    """Partial or full delivery record of assembled lanyards for an AssemblyAssignment (Section 8)."""

    assignment = models.ForeignKey(
        AssemblyAssignment,
        on_delete=models.CASCADE,
        related_name="receiving_records",
    )
    received_date = models.DateField(default=local_today)
    usable_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Good assembled lanyards received in this batch.",
    )
    defective_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Defective or damaged lanyards reported in this batch.",
    )
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assembly_receiving_records",
    )
    received_by_username = models.CharField(max_length=150, blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "pro_office_assembly_receiving_records"
        ordering = ["created_at"]
        verbose_name = "Assembly Receiving Record"
        verbose_name_plural = "Assembly Receiving Records"
