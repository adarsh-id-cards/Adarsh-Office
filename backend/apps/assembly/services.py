"""Transactional services for Lanyard Assembly Assignment, Material Issuance, Receiving & Reconciliation."""

import math
from datetime import date
from typing import Any

from django.db import models, transaction
from django.http import HttpRequest
from django.utils import timezone
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.audit_logs.services import record_audit_log
from apps.inventory.models import (
    DefectCategory,
    DefectDiscoveryStage,
    DefectiveRecord,
    Material,
    MaterialPackaging,
    MovementType,
)
from apps.inventory.services import (
    ensure_labourer_stock_location,
    get_main_office_location,
    get_usable_balance,
    record_material_consumption_or_defect,
    return_material_from_labourer,
    transfer_material_to_labourer,
)
from apps.labour.models import Labourer
from apps.machines.models import Machine, MachineStatus
from apps.orders.models import ItemCategory, OrderItem
from apps.production.models import (
    AssemblyStatus,
    ProductionJob,
    ProductionStage,
    ProductionStatusHistory,
)
from apps.production.services import ensure_production_job_for_item

from .models import (
    AssemblyAssignment,
    AssemblyAssignmentStatus,
    AssemblyReceivingRecord,
    AssignmentMaterialAllocation,
    AssignmentMode,
)


def local_today() -> date:
    return timezone.localdate()


def get_order_item_assembly_capacity(
    order_item: OrderItem, job: ProductionJob
) -> dict[str, int]:
    """Compute allocatable and remaining unassigned quantities for a Lanyard OrderItem."""
    required_assembly = max(
        int(order_item.ordered_quantity),
        int(job.planned_assembly_quantity or 0),
    )
    printed_qty = int(job.successful_printed_quantity or 0)
    max_allocatable = min(printed_qty, required_assembly)

    assigned_total = (
        AssemblyAssignment.objects.filter(order_item=order_item)
        .exclude(status=AssemblyAssignmentStatus.CANCELLED)
        .aggregate(s=models.Sum("assigned_quantity"))["s"]
        or 0
    )
    assigned_total = int(assigned_total)
    unassigned = max(0, max_allocatable - assigned_total)

    return {
        "ordered_quantity": int(order_item.ordered_quantity),
        "successful_printed_quantity": printed_qty,
        "max_allocatable_quantity": max_allocatable,
        "total_assigned_quantity": assigned_total,
        "unassigned_quantity": unassigned,
    }


def _next_assignment_code(order_item: OrderItem) -> str:
    base = f"ASM-{order_item.order.order_number.replace('ORD-', '')}-L{order_item.line_number}"
    seq = AssemblyAssignment.objects.filter(order_item=order_item).count() + 1
    while AssemblyAssignment.objects.filter(assignment_code=f"{base}-{seq}").exists():
        seq += 1
    return f"{base}-{seq}"


def sync_production_job_from_assignments(
    job: ProductionJob, actor: Any = None
) -> ProductionJob:
    """Synchronize `ProductionJob` Stage 3 & 4 assembly metrics from its active `AssemblyAssignment` rows."""
    active_qs = AssemblyAssignment.objects.filter(production_job=job).exclude(
        status=AssemblyAssignmentStatus.CANCELLED
    )
    agg = active_qs.aggregate(
        total_assigned=models.Sum("assigned_quantity"),
        total_usable=models.Sum("received_usable_quantity"),
    )
    total_assigned = int(agg["total_assigned"] or 0)
    total_usable = int(agg["total_usable"] or 0)

    prev_status = job.assembly_status
    job.completed_assembly_quantity = total_usable

    if total_assigned > 0 and job.assembly_started_at is None:
        job.assembly_started_at = timezone.now()

    req_qty = int(job.order_item.ordered_quantity)
    if total_usable >= req_qty and req_qty > 0:
        job.assembly_status = AssemblyStatus.COMPLETED
        if job.assembly_completed_at is None:
            job.assembly_completed_at = timezone.now()
        job.is_production_completed = True
        if job.production_completed_at is None:
            job.production_completed_at = timezone.now()
        job.is_ready_for_dispatch = True
        job.ready_for_packing_quantity = total_usable
        job.current_stage = ProductionStage.DISPATCH
    elif total_usable > 0:
        job.assembly_status = AssemblyStatus.PARTIALLY_COMPLETED
        job.current_stage = ProductionStage.ASSEMBLY
        job.ready_for_packing_quantity = total_usable
        job.is_ready_for_dispatch = True
    elif total_assigned > 0:
        job.assembly_status = AssemblyStatus.IN_PROGRESS
        job.current_stage = ProductionStage.ASSEMBLY

    job.save()

    order_item = job.order_item
    if order_item.prepared_quantity != total_usable:
        order_item.prepared_quantity = total_usable
        order_item.save(update_fields=["prepared_quantity", "updated_at"])

    if prev_status != job.assembly_status:
        auth_actor = actor if getattr(actor, "is_authenticated", False) else None
        ProductionStatusHistory.objects.create(
            production_job=job,
            stage="assembly",
            previous_status=prev_status,
            new_status=job.assembly_status,
            changed_by=auth_actor,
            changed_by_username=getattr(auth_actor, "username", "")
            if auth_actor
            else "",
            summary=(
                f"Assembly progress updated: {total_usable}/{req_qty} usable received "
                f"({total_assigned} assigned)."
            ),
        )

    return job


@transaction.atomic
def create_assembly_assignment(
    *,
    order_item: OrderItem,
    assigned_quantity: int,
    assignment_mode: str = AssignmentMode.LABOURER,
    labourer: Labourer | None = None,
    assigned_machine: Machine | None = None,
    is_machine_override: bool = False,
    machine_override_reason: str = "",
    assigned_date: date | None = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> AssemblyAssignment:
    """Create a full, split, or internal-office AssemblyAssignment with row-level lock and machine check."""
    locked_item = (
        OrderItem.objects.select_for_update(of=("self",))
        .select_related("order", "lanyard_size_option")
        .get(pk=order_item.pk)
    )
    if locked_item.category != ItemCategory.LANYARD:
        raise DRFValidationError(
            {"order_item": "Assembly assignments apply only to Lanyard order items."}
        )

    job = ensure_production_job_for_item(locked_item)
    job = ProductionJob.objects.select_for_update().get(pk=job.pk)

    qty = int(assigned_quantity or 0)
    if qty < 1:
        raise DRFValidationError(
            {"assigned_quantity": "Assigned quantity must be at least 1."}
        )

    cap = get_order_item_assembly_capacity(locked_item, job)
    if qty > cap["unassigned_quantity"]:
        raise DRFValidationError(
            {
                "assigned_quantity": (
                    f"Cannot assign {qty} lanyards. Only {cap['unassigned_quantity']} remain unassigned "
                    f"(allocatable: {cap['max_allocatable_quantity']}, already assigned: {cap['total_assigned_quantity']})."
                )
            }
        )

    required_size_label = (
        locked_item.lanyard_size_option.name if locked_item.lanyard_size_option else ""
    )
    resolved_machine: Machine | None = assigned_machine

    if assignment_mode == AssignmentMode.LABOURER:
        if labourer is None:
            raise DRFValidationError(
                {
                    "labourer": "A labourer is required when assignment_mode is 'labourer'."
                }
            )
        if not labourer.is_active or labourer.is_archived:
            raise DRFValidationError(
                {
                    "labourer": f"Labourer '{labourer.name}' is inactive and cannot be assigned work."
                }
            )

        compatible_machines = list(
            Machine.objects.filter(
                current_holder=labourer,
                status=MachineStatus.ALLOCATED,
                supported_size_label__iexact=required_size_label,
            )
        )
        if resolved_machine is not None:
            if (
                resolved_machine.current_holder_id != labourer.id
                or resolved_machine.status != MachineStatus.ALLOCATED
            ):
                raise DRFValidationError(
                    {
                        "assigned_machine": (
                            f"Machine '{resolved_machine.machine_code}' is not currently allocated to '{labourer.name}'."
                        )
                    }
                )
            if (
                required_size_label
                and resolved_machine.supported_size_label.lower()
                != required_size_label.lower()
                and not is_machine_override
            ):
                raise DRFValidationError(
                    {
                        "assigned_machine": (
                            f"Machine '{resolved_machine.machine_code}' supports {resolved_machine.supported_size_label}, "
                            f"not {required_size_label}."
                        )
                    }
                )
        elif compatible_machines:
            resolved_machine = compatible_machines[0]
        else:
            if not is_machine_override or not (machine_override_reason or "").strip():
                raise DRFValidationError(
                    {
                        "labourer": (
                            f"Labourer '{labourer.name}' does not hold an allocated machine supporting "
                            f"'{required_size_label}'. Allocate a compatible machine or confirm an explicit override with reason."
                        )
                    }
                )
        ensure_labourer_stock_location(labourer)
    elif assignment_mode == AssignmentMode.OFFICE_ASSEMBLY:
        labourer = None
        resolved_machine = None
    else:
        raise DRFValidationError(
            {"assignment_mode": f"Invalid assignment mode '{assignment_mode}'."}
        )

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    code = _next_assignment_code(locked_item)

    assignment = AssemblyAssignment.objects.create(
        assignment_code=code,
        order_item=locked_item,
        production_job=job,
        assignment_mode=assignment_mode,
        labourer=labourer,
        assigned_machine=resolved_machine,
        is_machine_override=bool(is_machine_override),
        machine_override_reason=(machine_override_reason or "").strip(),
        assigned_quantity=qty,
        status=AssemblyAssignmentStatus.ASSIGNED,
        assigned_date=assigned_date or local_today(),
        assigned_by=auth_actor,
        notes=(notes or "").strip(),
    )

    sync_production_job_from_assignments(job, actor=auth_actor)

    assignee_label = (
        labourer.name
        if assignment_mode == AssignmentMode.LABOURER and labourer
        else "Internal Office Assembly"
    )
    record_audit_log(
        action="ASSEMBLY_ASSIGNMENT_CREATED",
        module="assembly",
        summary=(
            f"Created assembly assignment '{code}' for {locked_item.order.order_number} "
            f"({locked_item.item_name}): {qty} pcs -> {assignee_label}."
        ),
        actor=auth_actor,
        target_type="AssemblyAssignment",
        target_id=str(assignment.id),
        metadata={
            "assignment_code": code,
            "order_item_id": str(locked_item.id),
            "assignment_mode": assignment_mode,
            "labourer_id": str(labourer.id) if labourer else None,
            "assigned_quantity": qty,
        },
        request=request,
    )
    return assignment


def calculate_material_issuance_preview(
    *,
    assignment: AssemblyAssignment,
    material: Material,
    required_quantity: int | None = None,
    packaging: MaterialPackaging | None = None,
    packets_issued: int | None = None,
    issued_quantity: int | None = None,
) -> dict[str, int]:
    """Calculate Section 6 & 7 labour material balance math for a material line.

    Example from specification:
    - Assignment requires: 600 jointers
    - Existing labourer balance: 400 jointers
    - Additional needed: 200 jointers
    - Packet size: 500
    - Issued: 1 packet = 500
    - Total available after issue: 900
    - Expected remaining balance after assignment: 300
    """
    req_qty = int(
        required_quantity
        if required_quantity is not None
        else assignment.assigned_quantity
    )
    if assignment.assignment_mode == AssignmentMode.LABOURER and assignment.labourer:
        labour_loc = ensure_labourer_stock_location(assignment.labourer)
        opening_balance = get_usable_balance(material, labour_loc)
    else:
        opening_balance = 0

    additional_needed = max(0, req_qty - opening_balance)

    resolved_packets = 0
    units_per_pkg = int(packaging.units_per_package) if packaging else 0

    if packaging is not None:
        if packets_issued is not None:
            resolved_packets = max(0, int(packets_issued))
        elif issued_quantity is None:
            resolved_packets = (
                math.ceil(additional_needed / units_per_pkg)
                if additional_needed > 0 and units_per_pkg > 0
                else 0
            )
        resolved_issued = (
            resolved_packets * units_per_pkg
            if packets_issued is not None or issued_quantity is None
            else int(issued_quantity)
        )
    else:
        resolved_issued = (
            int(issued_quantity) if issued_quantity is not None else additional_needed
        )

    total_available = opening_balance + resolved_issued
    expected_remaining = max(0, total_available - req_qty)

    return {
        "required_quantity": req_qty,
        "opening_labour_balance": opening_balance,
        "additional_needed_quantity": additional_needed,
        "packets_issued": resolved_packets,
        "units_per_package": units_per_pkg,
        "issued_quantity": resolved_issued,
        "total_available_after_issue": total_available,
        "expected_remaining_balance": expected_remaining,
    }


@transaction.atomic
def issue_materials_for_assignment(
    *,
    assignment: AssemblyAssignment,
    lines: list[dict[str, Any]],
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> list[AssignmentMaterialAllocation]:
    """Issue raw materials for an AssemblyAssignment, transferring stock from Main Office to Labourer."""
    locked_assignment = (
        AssemblyAssignment.objects.select_for_update(of=("self",))
        .select_related("order_item__order", "labourer", "production_job")
        .get(pk=assignment.pk)
    )
    if locked_assignment.status == AssemblyAssignmentStatus.CANCELLED:
        raise DRFValidationError(
            {"status": "Cannot issue materials for a cancelled assignment."}
        )
    if not lines:
        raise DRFValidationError(
            {"lines": "At least one material allocation line is required."}
        )

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    created_allocations: list[AssignmentMaterialAllocation] = []

    for line in lines:
        mat_id = line.get("material") or line.get("material_id")
        material = Material.objects.filter(pk=mat_id).first()
        if material is None:
            raise DRFValidationError({"material": f"Material '{mat_id}' not found."})

        pkg_id = line.get("packaging") or line.get("packaging_id")
        packaging = (
            MaterialPackaging.objects.filter(pk=pkg_id).first() if pkg_id else None
        )
        if packaging is not None and packaging.material_id != material.id:
            raise DRFValidationError(
                {
                    "packaging": f"Packaging '{packaging.package_name}' does not belong to '{material.name}'."
                }
            )

        req_qty = int(
            line.get("required_quantity") or locked_assignment.assigned_quantity
        )
        packets_in = line.get("packets_issued")
        qty_in = line.get("issued_quantity")
        is_override = bool(line.get("is_override", False))
        override_reason = (line.get("override_reason") or "").strip()

        preview = calculate_material_issuance_preview(
            assignment=locked_assignment,
            material=material,
            required_quantity=req_qty,
            packaging=packaging,
            packets_issued=int(packets_in) if packets_in is not None else None,
            issued_quantity=int(qty_in) if qty_in is not None else None,
        )

        issued_qty = preview["issued_quantity"]
        packets_count = preview["packets_issued"]
        movement = None

        if (
            issued_qty > 0
            and locked_assignment.assignment_mode == AssignmentMode.LABOURER
            and locked_assignment.labourer is not None
        ):
            movement = transfer_material_to_labourer(
                material=material,
                labourer=locked_assignment.labourer,
                packaging=packaging,
                package_count=packets_count
                if packaging and packets_count > 0
                else None,
                quantity=issued_qty,
                related_order=locked_assignment.order_item.order,
                related_assignment=locked_assignment,
                notes=(
                    line.get("notes")
                    or notes
                    or f"Material issued for assignment {locked_assignment.assignment_code}."
                ),
                actor=auth_actor,
                request=request,
            )

        allocation = AssignmentMaterialAllocation.objects.create(
            assignment=locked_assignment,
            material=material,
            required_quantity=preview["required_quantity"],
            opening_labour_balance=preview["opening_labour_balance"],
            additional_needed_quantity=preview["additional_needed_quantity"],
            packaging=packaging,
            packets_issued=packets_count,
            units_per_package_snapshot=preview["units_per_package"] or None,
            issued_quantity=issued_qty,
            is_override=is_override,
            override_reason=override_reason,
            closing_labour_balance=preview["total_available_after_issue"],
            stock_movement=movement,
            notes=(line.get("notes") or notes or "").strip(),
        )
        created_allocations.append(allocation)

    if locked_assignment.status == AssemblyAssignmentStatus.ASSIGNED:
        locked_assignment.status = AssemblyAssignmentStatus.MATERIALS_ISSUED
        locked_assignment.save(update_fields=["status", "updated_at"])

    return created_allocations


@transaction.atomic
def record_assembly_receiving(
    *,
    assignment: AssemblyAssignment,
    usable_quantity: int,
    defective_quantity: int = 0,
    received_date: date | None = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> AssemblyReceivingRecord:
    """Record a partial or full receiving batch of assembled lanyards (Section 8)."""
    locked_assignment = (
        AssemblyAssignment.objects.select_for_update(of=("self",))
        .select_related("order_item__order", "production_job", "labourer")
        .get(pk=assignment.pk)
    )
    if locked_assignment.status == AssemblyAssignmentStatus.CANCELLED:
        raise DRFValidationError(
            {"status": "Cannot receive lanyards for a cancelled assignment."}
        )

    u_qty = int(usable_quantity or 0)
    d_qty = int(defective_quantity or 0)
    if u_qty < 0 or d_qty < 0 or (u_qty + d_qty) < 1:
        raise DRFValidationError(
            {
                "usable_quantity": "Received quantity (usable + defective) must be at least 1."
            }
        )

    new_total_usable = int(locked_assignment.received_usable_quantity) + u_qty
    new_total_defective = int(locked_assignment.received_defective_quantity) + d_qty

    if (new_total_usable + new_total_defective) > int(
        locked_assignment.assigned_quantity
    ):
        raise DRFValidationError(
            {
                "usable_quantity": (
                    f"Total received ({new_total_usable + new_total_defective}) cannot exceed "
                    f"assigned quantity ({locked_assignment.assigned_quantity})."
                )
            }
        )

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    rec = AssemblyReceivingRecord.objects.create(
        assignment=locked_assignment,
        received_date=received_date or local_today(),
        usable_quantity=u_qty,
        defective_quantity=d_qty,
        received_by=auth_actor,
        received_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
        notes=(notes or "").strip(),
    )

    locked_assignment.received_usable_quantity = new_total_usable
    locked_assignment.received_defective_quantity = new_total_defective

    if (new_total_usable + new_total_defective) >= int(
        locked_assignment.assigned_quantity
    ):
        locked_assignment.status = AssemblyAssignmentStatus.COMPLETED
        locked_assignment.completed_at = timezone.now()
    else:
        locked_assignment.status = AssemblyAssignmentStatus.PARTIALLY_RECEIVED

    locked_assignment.save(
        update_fields=[
            "received_usable_quantity",
            "received_defective_quantity",
            "status",
            "completed_at",
            "updated_at",
        ]
    )

    if d_qty > 0:
        loc = (
            ensure_labourer_stock_location(locked_assignment.labourer)
            if locked_assignment.labourer
            else get_main_office_location()
        )
        DefectiveRecord.objects.create(
            defect_category=DefectCategory.FINISHED_PRODUCT,
            discovery_stage=DefectDiscoveryStage.ASSEMBLY_RECEIVING,
            location=loc,
            related_order=locked_assignment.order_item.order,
            related_order_item=locked_assignment.order_item,
            related_assignment=locked_assignment,
            quantity=d_qty,
            reason=(notes or "").strip()
            or f"Defective assembled lanyards in {locked_assignment.assignment_code}.",
            recorded_by=auth_actor,
            recorded_by_username=getattr(auth_actor, "username", "")
            if auth_actor
            else "",
        )

    sync_production_job_from_assignments(
        locked_assignment.production_job, actor=auth_actor
    )

    record_audit_log(
        action="ASSEMBLY_RECEIVED",
        module="assembly",
        summary=(
            f"Received assembly delivery for '{locked_assignment.assignment_code}': "
            f"{u_qty} usable, {d_qty} defective (pending: {locked_assignment.pending_quantity})."
        ),
        actor=auth_actor,
        target_type="AssemblyAssignment",
        target_id=str(locked_assignment.id),
        metadata={
            "assignment_code": locked_assignment.assignment_code,
            "usable_quantity": u_qty,
            "defective_quantity": d_qty,
            "pending_quantity": locked_assignment.pending_quantity,
        },
        request=request,
    )
    return rec


@transaction.atomic
def reconcile_assignment_materials(
    *,
    assignment: AssemblyAssignment,
    material_reconciliations: list[dict[str, Any]] | None = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> AssemblyAssignment:
    """Reconcile raw material consumption, defects, and remaining labourer balance for an assignment (Section 8).

    Remaining usable materials are retained in the labourer's `InventoryBalance` for future assignments
    and NEVER reset to zero.
    """
    locked_assignment = (
        AssemblyAssignment.objects.select_for_update(of=("self",))
        .select_related("order_item__order", "labourer", "production_job")
        .get(pk=assignment.pk)
    )
    if locked_assignment.is_reconciled:
        raise DRFValidationError(
            {
                "status": f"Assignment '{locked_assignment.assignment_code}' is already reconciled."
            }
        )

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    is_labour = (
        locked_assignment.assignment_mode == AssignmentMode.LABOURER
        and locked_assignment.labourer is not None
    )
    target_location = (
        ensure_labourer_stock_location(locked_assignment.labourer)
        if is_labour
        else get_main_office_location()
    )
    consumption_mov_type = (
        MovementType.LABOUR_CONSUMPTION
        if is_labour
        else MovementType.INTERNAL_CONSUMPTION
    )

    input_map: dict[str, dict[str, Any]] = {}
    for item in material_reconciliations or []:
        key = str(
            item.get("allocation_id")
            or item.get("material_id")
            or item.get("material")
            or ""
        )
        if key:
            input_map[key] = item

    allocations = list(
        locked_assignment.material_allocations.select_related("material").all()
    )

    for alloc in allocations:
        payload = input_map.get(str(alloc.id)) or input_map.get(str(alloc.material_id))
        default_consumed = (
            int(locked_assignment.received_usable_quantity)
            if locked_assignment.received_usable_quantity > 0
            else int(alloc.required_quantity)
        )
        consumed_qty = int(
            payload.get("consumed_quantity", default_consumed)
            if payload is not None
            else default_consumed
        )
        defective_qty = int(
            payload.get("defective_quantity", 0) if payload is not None else 0
        )
        returned_qty = int(
            payload.get("returned_to_office_quantity", 0) if payload is not None else 0
        )

        if (consumed_qty + defective_qty) > 0:
            record_material_consumption_or_defect(
                material=alloc.material,
                location=target_location,
                consumed_quantity=consumed_qty,
                defective_quantity=defective_qty,
                movement_type=consumption_mov_type,
                discovery_stage=DefectDiscoveryStage.LABOUR_ASSEMBLY,
                related_order=locked_assignment.order_item.order,
                related_assignment=locked_assignment,
                notes=(
                    notes
                    or f"Assembly reconciliation for {locked_assignment.assignment_code}."
                ),
                actor=auth_actor,
                request=request,
            )

        if returned_qty > 0 and is_labour and locked_assignment.labourer is not None:
            return_material_from_labourer(
                material=alloc.material,
                labourer=locked_assignment.labourer,
                usable_quantity=returned_qty,
                defective_quantity=0,
                related_assignment=locked_assignment,
                notes=f"Returned after assignment {locked_assignment.assignment_code}.",
                actor=auth_actor,
                request=request,
            )

        closing_bal = get_usable_balance(alloc.material, target_location)
        alloc.consumed_quantity = consumed_qty
        alloc.defective_quantity = defective_qty
        alloc.returned_to_office_quantity = returned_qty
        alloc.closing_labour_balance = closing_bal
        alloc.is_reconciled = True
        alloc.save()

    locked_assignment.is_reconciled = True
    locked_assignment.reconciled_at = timezone.now()
    if (
        locked_assignment.status != AssemblyAssignmentStatus.COMPLETED
        and (
            locked_assignment.received_usable_quantity
            + locked_assignment.received_defective_quantity
        )
        >= locked_assignment.assigned_quantity
    ):
        locked_assignment.status = AssemblyAssignmentStatus.COMPLETED
        locked_assignment.completed_at = timezone.now()
    locked_assignment.save(
        update_fields=[
            "is_reconciled",
            "reconciled_at",
            "status",
            "completed_at",
            "updated_at",
        ]
    )

    record_audit_log(
        action="ASSEMBLY_MATERIALS_RECONCILED",
        module="assembly",
        summary=f"Reconciled raw materials for assembly assignment '{locked_assignment.assignment_code}'.",
        actor=auth_actor,
        target_type="AssemblyAssignment",
        target_id=str(locked_assignment.id),
        request=request,
    )
    return locked_assignment
