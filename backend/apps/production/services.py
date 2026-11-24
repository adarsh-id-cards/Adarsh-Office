"""Transactional domain services for Phase 3 Production Management.

Enforces:
- Independent item-level workflows for ID Cards vs. Lanyards.
- Lanyard ceiling-division batch calculation and authorized override auditing.
- Multiple partial printing runs with immutable completion records.
- Separation of printing waste (`total_rejected_quantity`) from order surplus (`expected_surplus_quantity`).
- Lanyard assembly readiness and basic dispatch readiness synchronization with `OrderItem` and `Order`.
"""
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models, transaction
from django.http import HttpRequest
from django.utils import timezone
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.audit_logs.services import record_audit_log
from apps.orders.models import ItemCategory, Order, OrderItem, OrderItemStatus, OrderStatus, OrderStatusHistory

from .models import (
    AssemblyStatus,
    DesignStatus,
    PrintingRun,
    PrintingRunStatus,
    PrintingStatus,
    ProductionJob,
    ProductionStage,
    ProductionStatusHistory,
    calculate_lanyard_batch_plan,
    local_today,
    resolve_lanyard_batch_capacity,
)


def _log_production_history(
    *,
    job: ProductionJob,
    stage: str,
    previous_status: str,
    new_status: str,
    summary: str,
    actor: Any = None,
    notes: str = "",
    metadata: dict[str, Any] | None = None,
    request: HttpRequest | None = None,
) -> ProductionStatusHistory:
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    entry = ProductionStatusHistory.objects.create(
        production_job=job,
        stage=stage,
        previous_status=previous_status,
        new_status=new_status,
        changed_by=auth_actor,
        changed_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
        summary=summary,
        notes=notes,
        metadata=metadata or {},
    )
    record_audit_log(
        action=f"PRODUCTION_{stage.upper()}_{new_status.upper()}",
        module="production",
        summary=summary,
        actor=auth_actor,
        target_type="ProductionJob",
        target_id=str(job.id),
        metadata={
            "order_id": str(job.order_item.order_id),
            "order_number": job.order_item.order.order_number,
            "order_item_id": str(job.order_item_id),
            "item_name": job.order_item.item_name,
            "stage": stage,
            "previous_status": previous_status,
            "new_status": new_status,
            **(metadata or {}),
        },
        request=request,
    )
    return entry


@transaction.atomic
def ensure_production_job_for_item(
    order_item: OrderItem,
    *,
    actor: Any = None,
) -> ProductionJob:
    """Ensure a 1:1 ProductionJob exists for an OrderItem with accurate initial batch calculations.

    Uses `get_or_create` so concurrent requests backfilling legacy items never race on the 1:1 constraint.
    """
    existing = ProductionJob.objects.filter(order_item=order_item).first()
    if existing is not None:
        return existing

    required_qty = int(order_item.ordered_quantity)
    is_lanyard = order_item.category == ItemCategory.LANYARD

    if is_lanyard:
        cap = resolve_lanyard_batch_capacity(order_item)
        plan = calculate_lanyard_batch_plan(required_qty, cap)
        assembly_init = AssemblyStatus.NOT_READY
    else:
        plan = {
            "batch_capacity": 1,
            "calculated_batches": 1,
            "calculated_planned_quantity": required_qty,
            "calculated_expected_surplus": 0,
        }
        assembly_init = AssemblyStatus.NOT_APPLICABLE

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None

    job, created = ProductionJob.objects.get_or_create(
        order_item=order_item,
        defaults={
            "current_stage": ProductionStage.DESIGN,
            "design_status": DesignStatus.NOT_STARTED,
            "printing_status": PrintingStatus.NOT_STARTED,
            "batch_capacity": plan["batch_capacity"],
            "calculated_batches": plan["calculated_batches"],
            "calculated_planned_quantity": plan["calculated_planned_quantity"],
            "calculated_expected_surplus": plan["calculated_expected_surplus"],
            "planned_batches": plan["calculated_batches"],
            "planned_printing_quantity": plan["calculated_planned_quantity"],
            "expected_surplus_quantity": plan["calculated_expected_surplus"],
            "assembly_status": assembly_init,
            "planned_assembly_quantity": required_qty if is_lanyard else 0,
        },
    )

    if created:
        ProductionStatusHistory.objects.create(
            production_job=job,
            stage="initialization",
            previous_status="",
            new_status=ProductionStage.DESIGN,
            changed_by=auth_actor,
            changed_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
            summary=f"Initialized production job for '{order_item.item_name}' ({required_qty} units).",
        )
    return job


def sync_order_and_item_from_production(job: ProductionJob, actor: Any = None) -> None:
    """Synchronize OrderItem.prepared_quantity, OrderItem.status, and derived Order.status."""
    order_item = job.order_item
    order = order_item.order

    if order.status == OrderStatus.CANCELLED:
        return

    # Update OrderItem.prepared_quantity to reflect completed production quantity
    new_prepared = job.quantity_completed
    new_item_status = order_item.status

    if job.is_production_completed:
        new_item_status = OrderItemStatus.COMPLETED
    elif (
        job.design_status != DesignStatus.NOT_STARTED
        or job.printing_status != PrintingStatus.NOT_STARTED
    ):
        if job.quantity_completed > 0:
            new_item_status = OrderItemStatus.PARTIALLY_COMPLETED
        else:
            new_item_status = OrderItemStatus.IN_PROGRESS

    if order_item.prepared_quantity != new_prepared or order_item.status != new_item_status:
        order_item.prepared_quantity = new_prepared
        order_item.status = new_item_status
        order_item.save(update_fields=["prepared_quantity", "status", "updated_at"])

    # Derive parent Order status without forcing all items to advance together
    all_items = list(order.items.select_related("production_job").all())
    if not all_items:
        return

    all_prod_completed = all(
        getattr(it, "production_job", None) is not None and it.production_job.is_production_completed
        for it in all_items
    )
    any_prod_completed = any(
        getattr(it, "production_job", None) is not None and it.production_job.is_production_completed
        for it in all_items
    )
    any_prod_started = any(
        getattr(it, "production_job", None) is not None
        and (
            it.production_job.design_status != DesignStatus.NOT_STARTED
            or it.production_job.printing_status != PrintingStatus.NOT_STARTED
        )
        for it in all_items
    )

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    previous_order_status = order.status
    target_order_status = previous_order_status

    if all_prod_completed and order.status in {
        OrderStatus.CONFIRMED,
        OrderStatus.IN_PROGRESS,
        OrderStatus.PARTIALLY_COMPLETED,
    }:
        target_order_status = OrderStatus.PARTIALLY_COMPLETED
        # Note: Full OrderStatus.COMPLETED awaits dispatch in Phase 4 unless all items are also dispatched
        if all(it.dispatched_quantity >= it.ordered_quantity for it in all_items):
            target_order_status = OrderStatus.COMPLETED
    elif any_prod_completed and order.status in {OrderStatus.CONFIRMED, OrderStatus.IN_PROGRESS}:
        target_order_status = OrderStatus.PARTIALLY_COMPLETED
    elif any_prod_started and order.status == OrderStatus.CONFIRMED:
        target_order_status = OrderStatus.IN_PROGRESS

    if target_order_status != previous_order_status:
        order.status = target_order_status
        order.updated_by = auth_actor
        order.save(update_fields=["status", "updated_by", "updated_at"])
        OrderStatusHistory.objects.create(
            order=order,
            previous_status=previous_order_status,
            new_status=target_order_status,
            changed_by=auth_actor,
            changed_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
            reason="Automatically updated from item production progress.",
        )


def _ensure_order_eligible_for_production(job: ProductionJob) -> None:
    order = job.order_item.order
    if order.status == OrderStatus.CANCELLED:
        raise DRFValidationError("Cannot perform production actions on a cancelled order.")
    if order.status == OrderStatus.DRAFT:
        raise DRFValidationError(
            "Order is currently in Draft status. Confirm the order before starting production."
        )
    if job.is_production_completed:
        raise DRFValidationError(
            "Production is already marked completed for this item and cannot be modified."
        )


# =============================================================================
# STAGE 1: DESIGN SERVICES
# =============================================================================


@transaction.atomic
def start_design(
    *,
    job: ProductionJob,
    notes: str = "",
    design_reference: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> ProductionJob:
    """Transition item design to In Progress (or Review Required)."""
    _ensure_order_eligible_for_production(job)

    if job.design_status == DesignStatus.COMPLETED:
        raise DRFValidationError({"design_status": "Design is already completed for this item."})

    prev = job.design_status
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None

    job.design_status = DesignStatus.IN_PROGRESS
    if not job.design_started_at:
        job.design_started_at = timezone.now()
    if auth_actor:
        job.design_responsible = auth_actor
    if notes.strip():
        job.design_notes = notes.strip()
    if design_reference.strip():
        job.design_reference = design_reference.strip()

    job.current_stage = ProductionStage.DESIGN
    job.save()

    _log_production_history(
        job=job,
        stage="design",
        previous_status=prev,
        new_status=job.design_status,
        summary=f"Started design for '{job.order_item.item_name}'.",
        actor=auth_actor,
        notes=notes.strip(),
        request=request,
    )
    sync_order_and_item_from_production(job, actor=auth_actor)
    return job


@transaction.atomic
def submit_design_for_review(
    *,
    job: ProductionJob,
    notes: str = "",
    design_reference: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> ProductionJob:
    """Mark item design as Review Required."""
    _ensure_order_eligible_for_production(job)
    if job.design_status == DesignStatus.COMPLETED:
        raise DRFValidationError({"design_status": "Design is already completed."})

    prev = job.design_status
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    if not job.design_started_at:
        job.design_started_at = timezone.now()
    job.design_status = DesignStatus.REVIEW_REQUIRED
    if auth_actor:
        job.design_responsible = auth_actor
    if notes.strip():
        job.design_notes = notes.strip()
    if design_reference.strip():
        job.design_reference = design_reference.strip()
    job.save()

    _log_production_history(
        job=job,
        stage="design",
        previous_status=prev,
        new_status=job.design_status,
        summary=f"Marked design for '{job.order_item.item_name}' as Review Required.",
        actor=auth_actor,
        notes=notes.strip(),
        request=request,
    )
    return job


@transaction.atomic
def approve_design(
    *,
    job: ProductionJob,
    notes: str = "",
    design_reference: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> ProductionJob:
    """Approve item design."""
    _ensure_order_eligible_for_production(job)
    if job.design_status == DesignStatus.COMPLETED:
        raise DRFValidationError({"design_status": "Design is already completed."})

    prev = job.design_status
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    now = timezone.now()

    if not job.design_started_at:
        job.design_started_at = now
    job.design_approved_at = now
    job.design_status = DesignStatus.APPROVED
    if auth_actor:
        job.design_responsible = auth_actor
    if notes.strip():
        job.design_notes = notes.strip()
    if design_reference.strip():
        job.design_reference = design_reference.strip()
    job.save()

    _log_production_history(
        job=job,
        stage="design",
        previous_status=prev,
        new_status=job.design_status,
        summary=f"Approved design for '{job.order_item.item_name}'.",
        actor=auth_actor,
        notes=notes.strip(),
        request=request,
    )
    sync_order_and_item_from_production(job, actor=auth_actor)
    return job


@transaction.atomic
def complete_design(
    *,
    job: ProductionJob,
    notes: str = "",
    design_reference: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> ProductionJob:
    """Complete item design and advance current_stage to Printing."""
    _ensure_order_eligible_for_production(job)

    if job.design_status == DesignStatus.NOT_STARTED:
        raise DRFValidationError(
            {"design_status": "Design must be started or approved before marking it completed."}
        )

    prev = job.design_status
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    now = timezone.now()

    if not job.design_started_at:
        job.design_started_at = now
    if not job.design_approved_at:
        job.design_approved_at = now
    job.design_completed_at = now
    job.design_status = DesignStatus.COMPLETED
    if auth_actor:
        job.design_responsible = auth_actor
    if notes.strip():
        job.design_notes = notes.strip()
    if design_reference.strip():
        job.design_reference = design_reference.strip()

    if job.current_stage == ProductionStage.DESIGN:
        job.current_stage = ProductionStage.PRINTING

    job.save()

    _log_production_history(
        job=job,
        stage="design",
        previous_status=prev,
        new_status=job.design_status,
        summary=f"Completed design for '{job.order_item.item_name}'. Item ready for printing.",
        actor=auth_actor,
        notes=notes.strip(),
        request=request,
    )
    sync_order_and_item_from_production(job, actor=auth_actor)
    return job


# =============================================================================
# STAGE 2: PRINTING & BATCH PLAN OVERRIDE SERVICES
# =============================================================================


@transaction.atomic
def override_lanyard_printing_plan(
    *,
    job: ProductionJob,
    planned_batches: int,
    planned_printing_quantity: int | None = None,
    override_reason: str,
    actor: Any = None,
    request: HttpRequest | None = None,
) -> ProductionJob:
    """Allow an authorized user to override the calculated lanyard batch plan while preserving original calculation."""
    _ensure_order_eligible_for_production(job)

    clean_reason = (override_reason or "").strip()
    if not clean_reason:
        raise DRFValidationError(
            {"override_reason": "A reason is required when overriding the calculated printing batch plan."}
        )
    if planned_batches < 1:
        raise DRFValidationError({"planned_batches": "Planned batches must be at least 1."})

    effective_qty = (
        int(planned_printing_quantity)
        if planned_printing_quantity is not None
        else int(planned_batches) * int(job.batch_capacity)
    )
    if effective_qty < job.required_quantity:
        raise DRFValidationError(
            {
                "planned_printing_quantity": (
                    f"Planned printing quantity ({effective_qty}) cannot be less than "
                    f"the customer required quantity ({job.required_quantity})."
                )
            }
        )

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    prev_batches = job.planned_batches
    prev_qty = job.planned_printing_quantity

    job.planned_batches = int(planned_batches)
    job.planned_printing_quantity = effective_qty
    job.expected_surplus_quantity = max(0, effective_qty - job.required_quantity)
    job.is_plan_overridden = True
    job.plan_override_reason = clean_reason
    job.plan_overridden_by = auth_actor
    job.save()

    _log_production_history(
        job=job,
        stage="printing_plan",
        previous_status=f"{prev_batches} batches ({prev_qty})",
        new_status=f"{job.planned_batches} batches ({job.planned_printing_quantity})",
        summary=(
            f"Overrode printing batch plan for '{job.order_item.item_name}' "
            f"to {job.planned_batches} batches ({job.planned_printing_quantity} pcs)."
        ),
        actor=auth_actor,
        notes=clean_reason,
        metadata={
            "calculated_batches": job.calculated_batches,
            "calculated_planned_quantity": job.calculated_planned_quantity,
            "planned_batches": job.planned_batches,
            "planned_printing_quantity": job.planned_printing_quantity,
            "expected_surplus_quantity": job.expected_surplus_quantity,
            "override_reason": clean_reason,
        },
        request=request,
    )
    return job


def _recalculate_job_printing_totals(job: ProductionJob) -> None:
    """Recalculate total printed, rejected, and successful quantities from completed runs."""
    aggregates = job.printing_runs.filter(status=PrintingRunStatus.COMPLETED).aggregate(
        gross=models.Sum("actual_printed_quantity"),
        rejected=models.Sum("rejected_quantity"),
        successful=models.Sum("successful_quantity"),
    )
    job.total_printed_quantity = int(aggregates["gross"] or 0)
    job.total_rejected_quantity = int(aggregates["rejected"] or 0)
    job.successful_printed_quantity = int(aggregates["successful"] or 0)


@transaction.atomic
def create_printing_run(
    *,
    job: ProductionJob,
    validated_data: dict[str, Any],
    actor: Any = None,
    request: HttpRequest | None = None,
) -> PrintingRun:
    """Create a printing run for a ProductionJob (supports immediate completion or in-progress)."""
    _ensure_order_eligible_for_production(job)

    if job.design_status not in {DesignStatus.APPROVED, DesignStatus.COMPLETED}:
        raise DRFValidationError(
            {
                "design_status": (
                    "Design must be Approved or Completed before recording printing runs."
                )
            }
        )

    idempotency_key = (validated_data.get("idempotency_key") or "").strip() or None
    if idempotency_key:
        existing_run = PrintingRun.objects.filter(idempotency_key=idempotency_key).first()
        if existing_run is not None:
            return existing_run

    # Lock job row to allocate sequential run_number safely
    locked_job = ProductionJob.objects.select_for_update().get(pk=job.pk)
    last_run_num = (
        locked_job.printing_runs.aggregate(max_num=models.Max("run_number"))["max_num"] or 0
    )
    next_run_num = last_run_num + 1

    order_num_suffix = job.order_item.order.order_number.replace("ORD-", "")
    run_identifier = f"PRN-{order_num_suffix}-L{job.order_item.line_number}-R{next_run_num}"

    is_lanyard = job.order_item.category == ItemCategory.LANYARD
    planned_batches = int(validated_data.get("planned_batches") or 1)
    planned_quantity = int(
        validated_data.get("planned_quantity")
        or (planned_batches * job.batch_capacity if is_lanyard else job.required_quantity)
    )

    actual_printed = int(validated_data.get("actual_printed_quantity", 0))
    rejected = int(validated_data.get("rejected_quantity", 0))
    if "successful_quantity" in validated_data and validated_data["successful_quantity"] is not None:
        successful = int(validated_data["successful_quantity"])
    else:
        successful = max(0, actual_printed - rejected)

    mark_completed = bool(validated_data.get("complete_immediately", True))
    run_status = PrintingRunStatus.COMPLETED if mark_completed else PrintingRunStatus.IN_PROGRESS

    if mark_completed and actual_printed < 1:
        raise DRFValidationError(
            {"actual_printed_quantity": "Actual printed quantity must be at least 1 to complete a run."}
        )

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    now = timezone.now()

    run = PrintingRun(
        production_job=locked_job,
        order_item=job.order_item,
        run_number=next_run_num,
        run_identifier=run_identifier,
        status=run_status,
        run_date=validated_data.get("run_date") or local_today(),
        completed_at=now if mark_completed else None,
        planned_batches=planned_batches,
        planned_quantity=planned_quantity,
        actual_printed_quantity=actual_printed,
        rejected_quantity=rejected,
        successful_quantity=successful,
        idempotency_key=idempotency_key,
        responsible_user=auth_actor,
        responsible_username=getattr(auth_actor, "username", "") if auth_actor else "",
        notes=(validated_data.get("notes") or "").strip(),
    )
    try:
        run.full_clean()
    except DjangoValidationError as exc:
        raise DRFValidationError(
            exc.message_dict if hasattr(exc, "message_dict") else exc.messages
        ) from exc
    run.save()

    # Update parent ProductionJob printing timestamps, status, and totals
    prev_print_status = locked_job.printing_status
    if not locked_job.printing_started_at:
        locked_job.printing_started_at = now
    if auth_actor:
        locked_job.printing_responsible = auth_actor
    if locked_job.current_stage == ProductionStage.DESIGN:
        locked_job.current_stage = ProductionStage.PRINTING

    _recalculate_job_printing_totals(locked_job)

    if locked_job.successful_printed_quantity >= locked_job.required_quantity:
        locked_job.printing_status = PrintingStatus.COMPLETED
        if not locked_job.printing_completed_at:
            locked_job.printing_completed_at = now
        # For lanyards, once printing meets required quantity, assembly can become ready
        if is_lanyard and locked_job.assembly_status == AssemblyStatus.NOT_READY:
            locked_job.assembly_status = AssemblyStatus.READY_FOR_ASSEMBLY
            locked_job.is_assembly_ready = True
            locked_job.current_stage = ProductionStage.ASSEMBLY
    elif locked_job.successful_printed_quantity > 0:
        locked_job.printing_status = PrintingStatus.PARTIALLY_PRINTED
    else:
        locked_job.printing_status = PrintingStatus.IN_PROGRESS

    locked_job.save()

    _log_production_history(
        job=locked_job,
        stage="printing",
        previous_status=prev_print_status,
        new_status=locked_job.printing_status,
        summary=(
            f"Recorded printing run {run.run_identifier}: "
            f"{run.successful_quantity} good, {run.rejected_quantity} rejected/wasted "
            f"(cumulative good: {locked_job.successful_printed_quantity}/{locked_job.required_quantity})."
        ),
        actor=auth_actor,
        notes=run.notes,
        metadata={
            "run_id": str(run.id),
            "run_identifier": run.run_identifier,
            "actual_printed_quantity": run.actual_printed_quantity,
            "rejected_quantity": run.rejected_quantity,
            "successful_quantity": run.successful_quantity,
            "cumulative_successful": locked_job.successful_printed_quantity,
        },
        request=request,
    )
    sync_order_and_item_from_production(locked_job, actor=auth_actor)
    return run


@transaction.atomic
def complete_printing_run(
    *,
    run: PrintingRun,
    actual_printed_quantity: int | None = None,
    rejected_quantity: int | None = None,
    successful_quantity: int | None = None,
    notes: str | None = None,
    actor: Any = None,
    request: HttpRequest | None = None,
) -> PrintingRun:
    """Complete an in-progress PrintingRun and lock it as an immutable historical record."""
    job = run.production_job
    _ensure_order_eligible_for_production(job)

    if run.status == PrintingRunStatus.COMPLETED:
        raise DRFValidationError(
            {"status": f"Printing run {run.run_identifier} is already completed and immutable."}
        )

    if actual_printed_quantity is not None:
        run.actual_printed_quantity = int(actual_printed_quantity)
    if rejected_quantity is not None:
        run.rejected_quantity = int(rejected_quantity)
    if successful_quantity is not None:
        run.successful_quantity = int(successful_quantity)
    else:
        run.successful_quantity = max(0, run.actual_printed_quantity - run.rejected_quantity)

    if run.actual_printed_quantity < 1:
        raise DRFValidationError(
            {"actual_printed_quantity": "Actual printed quantity must be at least 1 to complete a run."}
        )

    if notes is not None and notes.strip():
        run.notes = notes.strip()

    now = timezone.now()
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    run.status = PrintingRunStatus.COMPLETED
    run.completed_at = now
    if auth_actor:
        run.responsible_user = auth_actor
        run.responsible_username = getattr(auth_actor, "username", "")

    try:
        run.full_clean()
    except DjangoValidationError as exc:
        raise DRFValidationError(
            exc.message_dict if hasattr(exc, "message_dict") else exc.messages
        ) from exc
    run.save()

    prev_print_status = job.printing_status
    _recalculate_job_printing_totals(job)
    is_lanyard = job.order_item.category == ItemCategory.LANYARD

    if job.successful_printed_quantity >= job.required_quantity:
        job.printing_status = PrintingStatus.COMPLETED
        if not job.printing_completed_at:
            job.printing_completed_at = now
        if is_lanyard and job.assembly_status == AssemblyStatus.NOT_READY:
            job.assembly_status = AssemblyStatus.READY_FOR_ASSEMBLY
            job.is_assembly_ready = True
            job.current_stage = ProductionStage.ASSEMBLY
    elif job.successful_printed_quantity > 0:
        job.printing_status = PrintingStatus.PARTIALLY_PRINTED

    job.save()

    _log_production_history(
        job=job,
        stage="printing",
        previous_status=prev_print_status,
        new_status=job.printing_status,
        summary=(
            f"Completed printing run {run.run_identifier}: "
            f"{run.successful_quantity} good, {run.rejected_quantity} rejected."
        ),
        actor=auth_actor,
        notes=run.notes,
        request=request,
    )
    sync_order_and_item_from_production(job, actor=auth_actor)
    return run


# =============================================================================
# STAGE 3 (LANYARDS): ASSEMBLY READINESS & PROGRESS SERVICES
# =============================================================================


def _ensure_lanyard_job(job: ProductionJob) -> None:
    if job.order_item.category != ItemCategory.LANYARD:
        raise DRFValidationError(
            {"category": "Assembly stage applies only to Lanyard items, not ID Card items."}
        )


@transaction.atomic
def mark_lanyard_assembly_ready(
    *,
    job: ProductionJob,
    planned_assembly_quantity: int | None = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> ProductionJob:
    """Mark a Lanyard item as Ready for Assembly when sufficient printed quantity exists."""
    _ensure_order_eligible_for_production(job)
    _ensure_lanyard_job(job)

    target_qty = (
        int(planned_assembly_quantity)
        if planned_assembly_quantity is not None
        else job.required_quantity
    )
    if target_qty < 1:
        raise DRFValidationError(
            {"planned_assembly_quantity": "Planned assembly quantity must be at least 1."}
        )
    if job.successful_printed_quantity < target_qty:
        raise DRFValidationError(
            {
                "successful_printed_quantity": (
                    f"Cannot mark ready for assembly: successful printed quantity "
                    f"({job.successful_printed_quantity}) is less than planned assembly "
                    f"quantity ({target_qty})."
                )
            }
        )

    prev = job.assembly_status
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None

    job.assembly_status = AssemblyStatus.READY_FOR_ASSEMBLY
    job.is_assembly_ready = True
    job.planned_assembly_quantity = target_qty
    job.current_stage = ProductionStage.ASSEMBLY
    if notes.strip():
        job.assembly_notes = notes.strip()
    job.save()

    _log_production_history(
        job=job,
        stage="assembly",
        previous_status=prev,
        new_status=job.assembly_status,
        summary=f"Marked lanyard '{job.order_item.item_name}' Ready for Assembly ({target_qty} pcs).",
        actor=auth_actor,
        notes=notes.strip(),
        request=request,
    )
    sync_order_and_item_from_production(job, actor=auth_actor)
    return job


@transaction.atomic
def start_lanyard_assembly(
    *,
    job: ProductionJob,
    completed_assembly_quantity: int | None = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> ProductionJob:
    """Start or update partial progress on Lanyard Assembly (Phase 3 readiness level)."""
    _ensure_order_eligible_for_production(job)
    _ensure_lanyard_job(job)

    if not job.is_assembly_ready and job.successful_printed_quantity < 1:
        raise DRFValidationError(
            {"assembly_status": "Lanyard item must have printed stock and be ready before starting assembly."}
        )

    prev = job.assembly_status
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    now = timezone.now()

    if not job.assembly_started_at:
        job.assembly_started_at = now
    job.is_assembly_ready = True
    if auth_actor:
        job.assembly_responsible = auth_actor

    if completed_assembly_quantity is not None:
        comp_qty = int(completed_assembly_quantity)
        if comp_qty < 0:
            raise DRFValidationError(
                {"completed_assembly_quantity": "Completed assembly quantity cannot be negative."}
            )
        if comp_qty > job.successful_printed_quantity:
            raise DRFValidationError(
                {
                    "completed_assembly_quantity": (
                        f"Completed assembly quantity ({comp_qty}) cannot exceed "
                        f"successful printed quantity ({job.successful_printed_quantity})."
                    )
                }
            )
        job.completed_assembly_quantity = comp_qty

    if job.completed_assembly_quantity > 0 and job.completed_assembly_quantity < job.required_quantity:
        job.assembly_status = AssemblyStatus.PARTIALLY_COMPLETED
    else:
        job.assembly_status = AssemblyStatus.IN_PROGRESS

    job.current_stage = ProductionStage.ASSEMBLY
    if notes.strip():
        job.assembly_notes = notes.strip()
    job.save()

    _log_production_history(
        job=job,
        stage="assembly",
        previous_status=prev,
        new_status=job.assembly_status,
        summary=(
            f"Lanyard assembly in progress for '{job.order_item.item_name}' "
            f"(assembled: {job.completed_assembly_quantity}/{job.required_quantity})."
        ),
        actor=auth_actor,
        notes=notes.strip(),
        request=request,
    )
    sync_order_and_item_from_production(job, actor=auth_actor)
    return job


@transaction.atomic
def complete_lanyard_assembly(
    *,
    job: ProductionJob,
    completed_assembly_quantity: int | None = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> ProductionJob:
    """Complete Lanyard Assembly and advance lanyard item to Stage 4: Dispatch readiness."""
    _ensure_order_eligible_for_production(job)
    _ensure_lanyard_job(job)

    final_qty = (
        int(completed_assembly_quantity)
        if completed_assembly_quantity is not None
        else max(job.completed_assembly_quantity, job.required_quantity)
    )

    if final_qty < job.required_quantity:
        raise DRFValidationError(
            {
                "completed_assembly_quantity": (
                    f"Cannot mark assembly complete: assembled quantity ({final_qty}) "
                    f"is less than customer required quantity ({job.required_quantity})."
                )
            }
        )
    if final_qty > job.successful_printed_quantity:
        raise DRFValidationError(
            {
                "completed_assembly_quantity": (
                    f"Assembled quantity ({final_qty}) cannot exceed successful printed "
                    f"quantity ({job.successful_printed_quantity})."
                )
            }
        )

    prev = job.assembly_status
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    now = timezone.now()

    if not job.assembly_started_at:
        job.assembly_started_at = now
    job.assembly_completed_at = now
    job.assembly_status = AssemblyStatus.COMPLETED
    job.is_assembly_ready = True
    job.completed_assembly_quantity = final_qty
    if auth_actor:
        job.assembly_responsible = auth_actor
    if notes.strip():
        job.assembly_notes = notes.strip()

    # Lanyard Stage 4 is Dispatch (basic dispatch readiness)
    job.current_stage = ProductionStage.DISPATCH
    job.is_production_completed = True
    job.production_completed_at = now
    job.is_ready_for_dispatch = True
    job.ready_for_packing_quantity = job.required_quantity
    job.save()

    _log_production_history(
        job=job,
        stage="assembly",
        previous_status=prev,
        new_status=job.assembly_status,
        summary=(
            f"Completed lanyard assembly for '{job.order_item.item_name}' ({final_qty} pcs). "
            f"Advanced to Dispatch stage ({job.ready_for_packing_quantity} ready for packing)."
        ),
        actor=auth_actor,
        notes=notes.strip(),
        request=request,
    )
    sync_order_and_item_from_production(job, actor=auth_actor)
    return job


# =============================================================================
# ID CARD COMPLETION & DISPATCH READINESS SERVICES (Sections 3 & 6)
# =============================================================================


@transaction.atomic
def complete_id_card_production(
    *,
    job: ProductionJob,
    ready_for_packing_quantity: int | None = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> ProductionJob:
    """Mark an ID Card item as Production Completed and Ready for Packing/Dispatch."""
    _ensure_order_eligible_for_production(job)

    if job.order_item.category != ItemCategory.ID_CARD:
        raise DRFValidationError(
            {"category": "Use lanyard assembly completion for Lanyard items."}
        )
    if job.design_status not in {DesignStatus.APPROVED, DesignStatus.COMPLETED}:
        raise DRFValidationError(
            {"design_status": "ID Card design must be Approved or Completed first."}
        )
    if job.successful_printed_quantity < job.required_quantity:
        raise DRFValidationError(
            {
                "successful_printed_quantity": (
                    f"Cannot complete ID card production: successful printed quantity "
                    f"({job.successful_printed_quantity}) is less than required customer "
                    f"quantity ({job.required_quantity})."
                )
            }
        )

    packing_qty = (
        int(ready_for_packing_quantity)
        if ready_for_packing_quantity is not None
        else job.required_quantity
    )
    if packing_qty < 1 or packing_qty > job.successful_printed_quantity:
        raise DRFValidationError(
            {
                "ready_for_packing_quantity": (
                    f"Ready for packing quantity ({packing_qty}) must be between 1 and "
                    f"{job.successful_printed_quantity}."
                )
            }
        )

    prev_stage = job.current_stage
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    now = timezone.now()

    job.design_status = DesignStatus.COMPLETED
    if not job.design_completed_at:
        job.design_completed_at = now
    job.printing_status = PrintingStatus.COMPLETED
    if not job.printing_completed_at:
        job.printing_completed_at = now

    job.is_production_completed = True
    job.production_completed_at = now
    job.is_ready_for_dispatch = True
    job.ready_for_packing_quantity = packing_qty
    job.current_stage = ProductionStage.READY_FOR_DISPATCH
    if notes.strip():
        job.notes = notes.strip()
    job.save()

    _log_production_history(
        job=job,
        stage="completion",
        previous_status=prev_stage,
        new_status=ProductionStage.READY_FOR_DISPATCH,
        summary=(
            f"Marked ID card production completed for '{job.order_item.item_name}' "
            f"({packing_qty} ready for packing/dispatch)."
        ),
        actor=auth_actor,
        notes=notes.strip(),
        request=request,
    )
    sync_order_and_item_from_production(job, actor=auth_actor)
    return job
