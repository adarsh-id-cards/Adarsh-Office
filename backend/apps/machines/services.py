"""Transactional services for physical Machine allocation and returns (Phase 4 — Section 4)."""
from datetime import date
from typing import Any

from django.db import transaction
from django.http import HttpRequest
from django.utils import timezone
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.audit_logs.services import record_audit_log
from apps.catalog.models import CatalogCategory, CatalogOption
from apps.labour.models import Labourer

from .models import (
    Machine,
    MachineAllocation,
    MachineReturnCondition,
    MachineStatus,
)


def local_today() -> date:
    return timezone.localdate()


@transaction.atomic
def create_machine(
    *,
    machine_code: str,
    name: str,
    machine_type: str = "Lanyard Fitting & Assembly Press",
    supported_lanyard_size: CatalogOption | None = None,
    supported_size_label: str = "",
    status: str = MachineStatus.IN_OFFICE,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> Machine:
    """Create a physical Machine asset in the equipment directory."""
    clean_code = (machine_code or "").strip().upper()
    if not clean_code:
        raise DRFValidationError({"machine_code": "Machine identifier is required."})
    if Machine.objects.filter(machine_code__iexact=clean_code).exists():
        raise DRFValidationError(
            {"machine_code": f"A machine with code '{clean_code}' already exists."}
        )

    resolved_size_opt = supported_lanyard_size
    resolved_label = (supported_size_label or "").strip()

    if resolved_size_opt is not None:
        if resolved_size_opt.category != CatalogCategory.LANYARD_SIZE:
            raise DRFValidationError(
                {"supported_lanyard_size": "Selected catalog option is not a Lanyard Size."}
            )
        resolved_label = resolved_size_opt.name
    elif resolved_label:
        matched_opt = CatalogOption.objects.filter(
            category=CatalogCategory.LANYARD_SIZE,
            name__iexact=resolved_label,
        ).first()
        if matched_opt is not None:
            resolved_size_opt = matched_opt
            resolved_label = matched_opt.name

    if not resolved_label:
        raise DRFValidationError(
            {"supported_size_label": "Supported lanyard size (e.g. '12 mm', '16 mm', '20 mm') is required."}
        )

    if status == MachineStatus.ALLOCATED:
        raise DRFValidationError(
            {"status": "New machines must be created in office and allocated via the allocation workflow."}
        )

    machine = Machine(
        machine_code=clean_code,
        name=(name or "").strip() or f"{clean_code} ({resolved_label})",
        machine_type=(machine_type or "Lanyard Fitting & Assembly Press").strip(),
        supported_lanyard_size=resolved_size_opt,
        supported_size_label=resolved_label,
        status=status or MachineStatus.IN_OFFICE,
        current_holder=None,
        notes=(notes or "").strip(),
    )
    machine.full_clean()
    machine.save()

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    record_audit_log(
        action="MACHINE_CREATED",
        module="machines",
        summary=f"Registered machine '{machine.machine_code}' supporting {machine.supported_size_label}.",
        actor=auth_actor,
        target_type="Machine",
        target_id=str(machine.id),
        metadata={
            "machine_code": machine.machine_code,
            "supported_size_label": machine.supported_size_label,
            "status": machine.status,
        },
        request=request,
    )
    return machine


@transaction.atomic
def allocate_machine_to_labourer(
    *,
    machine: Machine,
    labourer: Labourer,
    allocated_date: date | None = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> MachineAllocation:
    """Allocate an in-office Machine to an active Labourer with row-level lock preventing double allocation."""
    locked_machine = Machine.objects.select_for_update().get(pk=machine.pk)

    if locked_machine.is_archived:
        raise DRFValidationError(
            {"machine": f"Machine '{locked_machine.machine_code}' is archived."}
        )
    if locked_machine.status == MachineStatus.ALLOCATED or locked_machine.current_holder_id is not None:
        holder_name = (
            locked_machine.current_holder.name
            if locked_machine.current_holder
            else "another labourer"
        )
        raise DRFValidationError(
            {
                "machine": (
                    f"Machine '{locked_machine.machine_code}' is already allocated to '{holder_name}'. "
                    "Return it to the office before allocating it to someone else."
                )
            }
        )
    if locked_machine.status != MachineStatus.IN_OFFICE:
        raise DRFValidationError(
            {
                "machine": (
                    f"Machine '{locked_machine.machine_code}' cannot be allocated while its status is "
                    f"'{locked_machine.get_status_display()}'."
                )
            }
        )

    if MachineAllocation.objects.select_for_update().filter(
        machine=locked_machine, is_active=True
    ).exists():
        raise DRFValidationError(
            {"machine": f"Machine '{locked_machine.machine_code}' already has an active allocation."}
        )

    if not labourer.is_active or labourer.is_archived:
        raise DRFValidationError(
            {"labourer": f"Labourer '{labourer.name}' is inactive and cannot be allocated machines."}
        )

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    effective_date = allocated_date or local_today()

    locked_machine.status = MachineStatus.ALLOCATED
    locked_machine.current_holder = labourer
    locked_machine.full_clean()
    locked_machine.save(update_fields=["status", "current_holder", "updated_at"])

    allocation = MachineAllocation.objects.create(
        machine=locked_machine,
        labourer=labourer,
        allocated_date=effective_date,
        issued_by=auth_actor,
        is_active=True,
        notes=(notes or "").strip(),
    )

    record_audit_log(
        action="MACHINE_ALLOCATED",
        module="machines",
        summary=(
            f"Allocated machine '{locked_machine.machine_code}' ({locked_machine.supported_size_label}) "
            f"to labourer '{labourer.name}'."
        ),
        actor=auth_actor,
        target_type="Machine",
        target_id=str(locked_machine.id),
        metadata={
            "machine_code": locked_machine.machine_code,
            "labourer_id": str(labourer.id),
            "labourer_name": labourer.name,
            "allocation_id": str(allocation.id),
        },
        request=request,
    )
    return allocation


@transaction.atomic
def return_machine_to_office(
    *,
    machine: Machine,
    returned_date: date | None = None,
    return_condition: str = MachineReturnCondition.GOOD,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> MachineAllocation:
    """Return an allocated Machine back to Main Office and update its operational status."""
    locked_machine = Machine.objects.select_for_update().get(pk=machine.pk)
    active_alloc = (
        MachineAllocation.objects.select_for_update()
        .filter(machine=locked_machine, is_active=True)
        .first()
    )

    if active_alloc is None or locked_machine.status != MachineStatus.ALLOCATED:
        raise DRFValidationError(
            {"machine": f"Machine '{locked_machine.machine_code}' is not currently allocated to a labourer."}
        )

    if return_condition not in dict(MachineReturnCondition.choices):
        raise DRFValidationError(
            {"return_condition": f"Invalid return condition '{return_condition}'."}
        )

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    effective_date = returned_date or local_today()
    previous_holder_name = active_alloc.labourer.name

    active_alloc.is_active = False
    active_alloc.returned_date = effective_date
    active_alloc.returned_to = auth_actor
    active_alloc.return_condition = return_condition
    if notes.strip():
        active_alloc.notes = (
            f"{active_alloc.notes}\nReturn: {notes.strip()}".strip()
            if active_alloc.notes
            else notes.strip()
        )
    active_alloc.save(
        update_fields=[
            "is_active",
            "returned_date",
            "returned_to",
            "return_condition",
            "notes",
            "updated_at",
        ]
    )

    if return_condition == MachineReturnCondition.GOOD:
        new_status = MachineStatus.IN_OFFICE
    elif return_condition == MachineReturnCondition.MAINTENANCE_REQUIRED:
        new_status = MachineStatus.UNDER_MAINTENANCE
    else:
        new_status = MachineStatus.DAMAGED

    locked_machine.current_holder = None
    locked_machine.status = new_status
    locked_machine.full_clean()
    locked_machine.save(update_fields=["status", "current_holder", "updated_at"])

    record_audit_log(
        action="MACHINE_RETURNED",
        module="machines",
        summary=(
            f"Returned machine '{locked_machine.machine_code}' from '{previous_holder_name}' "
            f"to office (condition: {return_condition} -> status: {new_status})."
        ),
        actor=auth_actor,
        target_type="Machine",
        target_id=str(locked_machine.id),
        metadata={
            "machine_code": locked_machine.machine_code,
            "previous_holder": previous_holder_name,
            "return_condition": return_condition,
            "new_status": new_status,
        },
        request=request,
    )
    return active_alloc
