"""Physical Machine and MachineAllocation models for Pro Office (Section 4).

Business rules:
- Machines are physical assets owned by Adarsh supporting specific lanyard sizes (12 mm, 16 mm, 20 mm, etc.).
- A labourer may hold multiple machines, but a machine can NEVER be allocated to multiple labourers simultaneously.
- Machine compatibility for lanyard assembly is derived from actual allocated active machines.
"""
from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.catalog.models import CatalogCategory
from apps.common.models import ArchivableModel, TimeStampedUUIDModel


def local_today() -> date:
    return timezone.localdate()


class MachineStatus(models.TextChoices):
    IN_OFFICE = "in_office", "In Office"
    ALLOCATED = "allocated", "Allocated to Labourer"
    UNDER_MAINTENANCE = "under_maintenance", "Under Maintenance"
    DAMAGED = "damaged", "Damaged"
    RETIRED = "retired", "Retired"


class MachineReturnCondition(models.TextChoices):
    GOOD = "good", "Good / Operational"
    MAINTENANCE_REQUIRED = "maintenance_required", "Under Maintenance"
    DAMAGED = "damaged", "Damaged"


class Machine(TimeStampedUUIDModel, ArchivableModel):
    """Physical equipment asset owned by Adarsh ID Cards."""

    machine_code = models.CharField(
        max_length=48,
        unique=True,
        db_index=True,
        help_text="Unique machine identifier (e.g. MCH-16MM-01).",
    )
    name = models.CharField(
        max_length=150,
        help_text="Descriptive machine name.",
    )
    machine_type = models.CharField(
        max_length=80,
        default="Lanyard Fitting & Assembly Press",
        help_text="Category or type of equipment.",
    )
    supported_lanyard_size = models.ForeignKey(
        "catalog.CatalogOption",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="compatible_machines",
        help_text="Catalog lanyard size option supported by this machine (12 mm, 16 mm, 20 mm).",
    )
    supported_size_label = models.CharField(
        max_length=40,
        db_index=True,
        help_text="Normalized supported size label (e.g. '12 mm', '16 mm', '20 mm').",
    )
    status = models.CharField(
        max_length=30,
        choices=MachineStatus.choices,
        default=MachineStatus.IN_OFFICE,
        db_index=True,
    )
    current_holder = models.ForeignKey(
        "labour.Labourer",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="allocated_machines",
        help_text="Labourer currently holding this machine (null when in office).",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "pro_office_machines"
        ordering = ["machine_code"]
        constraints = [
            models.UniqueConstraint(
                fields=["machine_code"],
                name="uq_machine_code",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(status="allocated", current_holder__isnull=False)
                    | (~models.Q(status="allocated") & models.Q(current_holder__isnull=True))
                ),
                name="ck_machine_status_holder_consistency",
            ),
        ]
        indexes = [
            models.Index(
                fields=["status", "supported_size_label"],
                name="idx_machine_status_size",
            ),
        ]
        verbose_name = "Machine"
        verbose_name_plural = "Machines"

    def __str__(self) -> str:
        return f"{self.machine_code} ({self.supported_size_label})"

    @property
    def current_location_display(self) -> str:
        if self.status == MachineStatus.ALLOCATED and self.current_holder:
            return f"Labourer: {self.current_holder.name}"
        if self.status == MachineStatus.UNDER_MAINTENANCE:
            return "Maintenance Workshop"
        if self.status == MachineStatus.RETIRED:
            return "Retired Storage"
        return "Main Office"

    def clean(self) -> None:
        super().clean()
        self.machine_code = (self.machine_code or "").strip().upper()
        if not self.machine_code:
            raise ValidationError({"machine_code": "Machine identifier is required."})

        if self.supported_lanyard_size is not None:
            if self.supported_lanyard_size.category != CatalogCategory.LANYARD_SIZE:
                raise ValidationError(
                    {"supported_lanyard_size": "Selected catalog option is not a Lanyard Size."}
                )
            self.supported_size_label = self.supported_lanyard_size.name
        else:
            self.supported_size_label = (self.supported_size_label or "").strip()

        if not self.supported_size_label:
            raise ValidationError(
                {"supported_size_label": "Supported lanyard size (e.g. 12 mm, 16 mm, 20 mm) is required."}
            )


class MachineAllocation(TimeStampedUUIDModel):
    """Historical and active allocation record linking a Machine to a Labourer."""

    machine = models.ForeignKey(
        Machine,
        on_delete=models.CASCADE,
        related_name="allocations",
    )
    labourer = models.ForeignKey(
        "labour.Labourer",
        on_delete=models.PROTECT,
        related_name="machine_allocations",
    )
    allocated_date = models.DateField(default=local_today)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issued_machine_allocations",
    )
    returned_date = models.DateField(null=True, blank=True)
    returned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="received_machine_returns",
    )
    return_condition = models.CharField(
        max_length=30,
        choices=[("", "Active")] + list(MachineReturnCondition.choices),
        blank=True,
        default="",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="True while the machine remains with the labourer.",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "pro_office_machine_allocations"
        ordering = ["-allocated_date", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["machine"],
                condition=models.Q(is_active=True),
                name="uq_machine_single_active_allocation",
            ),
        ]
        verbose_name = "Machine Allocation"
        verbose_name_plural = "Machine Allocations"

    def __str__(self) -> str:
        state = "Active" if self.is_active else f"Returned ({self.return_condition})"
        return f"{self.machine.machine_code} -> {self.labourer.name} [{state}]"
