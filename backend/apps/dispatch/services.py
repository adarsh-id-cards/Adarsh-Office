"""Transactional services for Packing, Dispatch, Surplus Pool, and Replacement Surplus Allocation."""
from datetime import date
from typing import Any

from django.db import transaction
from django.http import HttpRequest
from django.utils import timezone
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.audit_logs.services import record_audit_log
from apps.inventory.services import next_named_sequence
from apps.orders.models import (
    ItemCategory,
    Order,
    OrderItem,
    OrderItemStatus,
    OrderStatus,
    OrderStatusHistory,
    OrderType,
)
from apps.production.models import ProductionStage, calculate_lanyard_batch_plan
from apps.production.services import ensure_production_job_for_item

from .models import (
    ClientSurplusRecord,
    DispatchItem,
    DispatchRecord,
    OfficeSurplusPool,
    ReplacementSurplusAllocation,
)


def local_today() -> date:
    return timezone.localdate()


def _next_dispatch_number() -> str:
    return next_named_sequence(
        key="dispatch",
        prefix="DSP-",
        start_value=1000,
        model_cls=DispatchRecord,
        field_name="dispatch_number",
    )


def _next_surplus_code() -> str:
    return next_named_sequence(
        key="surplus",
        prefix="SRP-",
        start_value=1000,
        model_cls=OfficeSurplusPool,
        field_name="surplus_code",
    )


def _build_item_spec_summary(order_item: OrderItem) -> str:
    if order_item.category == ItemCategory.LANYARD:
        size = order_item.lanyard_size_option.name if order_item.lanyard_size_option else ""
        design = order_item.lanyard_design_requirements or ""
        return f"Lanyard {size} {design}".strip()
    orient = order_item.get_card_orientation_display()
    side = order_item.get_card_printing_display()
    return f"ID Card ({orient}, {side})".strip()


@transaction.atomic
def create_dispatch_record(
    *,
    order: Order,
    items_data: list[dict[str, Any]],
    dispatch_date: date | None = None,
    packing_verified: bool = True,
    idempotency_key: str | None = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> DispatchRecord:
    """Record a partial or full Dispatch for an Order, capturing client surplus and office surplus (Section 15)."""
    clean_idem = (idempotency_key or "").strip() or None
    if clean_idem:
        existing_dsp = DispatchRecord.objects.filter(idempotency_key=clean_idem).first()
        if existing_dsp is not None:
            return existing_dsp

    locked_order = Order.objects.select_for_update(of=("self",)).select_related("client").get(pk=order.pk)
    if locked_order.status == OrderStatus.CANCELLED:
        raise DRFValidationError({"order": "Cannot dispatch a cancelled order."})
    if not items_data:
        raise DRFValidationError(
            {"items": "At least one dispatch item must be provided."}
        )

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    eff_date = dispatch_date or local_today()

    dispatch = DispatchRecord.objects.create(
        dispatch_number=_next_dispatch_number(),
        order=locked_order,
        dispatch_date=eff_date,
        packing_verified=bool(packing_verified),
        dispatched_by=auth_actor,
        dispatched_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
        idempotency_key=clean_idem,
        notes=(notes or "").strip(),
    )

    for line in items_data:
        item_id = line.get("order_item") or line.get("order_item_id")
        locked_item = (
            OrderItem.objects.select_for_update(of=("self",))
            .select_related("lanyard_size_option")
            .filter(pk=item_id, order=locked_order)
            .first()
        )
        if locked_item is None:
            raise DRFValidationError(
                {"order_item": f"Order item '{item_id}' does not belong to order {locked_order.order_number}."}
            )

        qty_for_order = int(line.get("quantity_dispatched_for_order", 0) or 0)
        extra_client = int(line.get("extra_dispatched_to_client", 0) or 0)
        extra_office = int(line.get("extra_retained_in_office", 0) or 0)
        line_notes = (line.get("notes") or "").strip()

        if qty_for_order < 0 or extra_client < 0 or extra_office < 0:
            raise DRFValidationError(
                {"quantity_dispatched_for_order": "Dispatch quantities cannot be negative."}
            )
        if (qty_for_order + extra_client + extra_office) < 1:
            raise DRFValidationError(
                {"quantity_dispatched_for_order": "Total dispatched/surplus quantity must be at least 1."}
            )

        remaining_order_qty = int(locked_item.ordered_quantity) - int(locked_item.dispatched_quantity)
        if qty_for_order > remaining_order_qty:
            raise DRFValidationError(
                {
                    "quantity_dispatched_for_order": (
                        f"Cannot dispatch {qty_for_order} for order item '{locked_item.item_name}'; "
                        f"only {remaining_order_qty} remain undelivered on the customer order "
                        "(use 'extra_dispatched_to_client' for surplus sent to client)."
                    )
                }
            )

        # Scenario E protection: never permit dispatching more order units than produced/assembled + allocated surplus
        job = ensure_production_job_for_item(locked_item)
        if locked_item.category == ItemCategory.LANYARD:
            produced_usable = int(job.completed_assembly_quantity) + int(
                locked_item.allocated_from_surplus_quantity
            )
        else:
            produced_usable = int(job.successful_printed_quantity) + int(
                locked_item.allocated_from_surplus_quantity
            )
        available_for_order_dispatch = max(
            0, produced_usable - int(locked_item.dispatched_quantity)
        )
        if qty_for_order > available_for_order_dispatch:
            raise DRFValidationError(
                {
                    "quantity_dispatched_for_order": (
                        f"Cannot dispatch {qty_for_order} usable unit(s) for '{locked_item.item_name}': "
                        f"only {available_for_order_dispatch} usable produced/surplus unit(s) are available "
                        f"(produced/assembled: {produced_usable}, already dispatched: {locked_item.dispatched_quantity})."
                    )
                }
            )

        d_item = DispatchItem.objects.create(
            dispatch_record=dispatch,
            order_item=locked_item,
            quantity_dispatched_for_order=qty_for_order,
            extra_dispatched_to_client=extra_client,
            extra_retained_in_office=extra_office,
            notes=line_notes,
        )

        locked_item.dispatched_quantity = int(locked_item.dispatched_quantity) + qty_for_order
        if locked_item.prepared_quantity < locked_item.dispatched_quantity:
            locked_item.prepared_quantity = locked_item.dispatched_quantity

        if locked_item.dispatched_quantity >= locked_item.ordered_quantity:
            locked_item.status = OrderItemStatus.COMPLETED
        elif locked_item.dispatched_quantity > 0:
            locked_item.status = OrderItemStatus.PARTIALLY_COMPLETED
        locked_item.save(
            update_fields=[
                "dispatched_quantity",
                "prepared_quantity",
                "status",
                "updated_at",
            ]
        )

        if extra_client > 0:
            ClientSurplusRecord.objects.create(
                order=locked_order,
                order_item=locked_item,
                dispatch_item=d_item,
                client=locked_order.client,
                quantity_sent=extra_client,
                dispatch_date=eff_date,
                notes=line_notes or f"Extra sent with dispatch {dispatch.dispatch_number}.",
            )

        if extra_office > 0:
            OfficeSurplusPool.objects.create(
                surplus_code=_next_surplus_code(),
                source_order=locked_order,
                source_order_item=locked_item,
                dispatch_item=d_item,
                client=locked_order.client,
                category=locked_item.category,
                item_name=locked_item.item_name,
                lanyard_size_name=(
                    locked_item.lanyard_size_option.name
                    if locked_item.lanyard_size_option
                    else ""
                ),
                specification_summary=_build_item_spec_summary(locked_item),
                initial_quantity=extra_office,
                allocated_quantity=0,
                remaining_quantity=extra_office,
                notes=line_notes or f"Retained in office from dispatch {dispatch.dispatch_number}.",
            )

    # Refresh parent order status based on all items' dispatched quantities
    all_items = list(locked_order.items.exclude(status=OrderItemStatus.CANCELLED))
    if all_items:
        all_completed = all(
            int(it.dispatched_quantity) >= int(it.ordered_quantity) for it in all_items
        )
        any_dispatched = any(int(it.dispatched_quantity) > 0 for it in all_items)
        prev_status = locked_order.status

        if all_completed and locked_order.status != OrderStatus.COMPLETED:
            locked_order.status = OrderStatus.COMPLETED
            locked_order.updated_by = auth_actor
            locked_order.save(update_fields=["status", "updated_by", "updated_at"])
            OrderStatusHistory.objects.create(
                order=locked_order,
                previous_status=prev_status,
                new_status=OrderStatus.COMPLETED,
                changed_by=auth_actor,
                changed_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
                reason=f"All order items fully dispatched ({dispatch.dispatch_number}).",
            )
        elif (
            any_dispatched
            and not all_completed
            and locked_order.status
            in {OrderStatus.DRAFT, OrderStatus.CONFIRMED, OrderStatus.IN_PROGRESS}
        ):
            locked_order.status = OrderStatus.PARTIALLY_COMPLETED
            locked_order.updated_by = auth_actor
            locked_order.save(update_fields=["status", "updated_by", "updated_at"])
            OrderStatusHistory.objects.create(
                order=locked_order,
                previous_status=prev_status,
                new_status=OrderStatus.PARTIALLY_COMPLETED,
                changed_by=auth_actor,
                changed_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
                reason=f"Partial dispatch recorded ({dispatch.dispatch_number}).",
            )

    record_audit_log(
        action="DISPATCH_RECORDED",
        module="dispatch",
        summary=f"Recorded dispatch '{dispatch.dispatch_number}' for order {locked_order.order_number}.",
        actor=auth_actor,
        target_type="DispatchRecord",
        target_id=str(dispatch.id),
        metadata={
            "dispatch_number": dispatch.dispatch_number,
            "order_id": str(locked_order.id),
            "order_number": locked_order.order_number,
            "order_status": locked_order.status,
        },
        request=request,
    )
    return dispatch


@transaction.atomic
def allocate_office_surplus_to_replacement_item(
    *,
    surplus_pool: OfficeSurplusPool,
    replacement_order_item: OrderItem,
    quantity_to_allocate: int,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> ReplacementSurplusAllocation:
    """Explicitly allocate retained Office Surplus stock to a Replacement Order item (Section 16).

    Example:
    - Previous office surplus for Client A lanyard: 10 pieces
    - Replacement order requires: 8 pieces
    - User allocates 8 pieces from office surplus -> remaining office surplus becomes 2.
    """
    locked_pool = OfficeSurplusPool.objects.select_for_update().get(pk=surplus_pool.pk)
    locked_rep_item = (
        OrderItem.objects.select_for_update(of=("self",))
        .select_related("order")
        .get(pk=replacement_order_item.pk)
    )

    if locked_rep_item.order.order_type != OrderType.REPLACEMENT:
        raise DRFValidationError(
            {"replacement_order_item": "Office surplus can only be allocated to items in a Replacement Order."}
        )
    if locked_pool.client_id != locked_rep_item.order.client_id:
        raise DRFValidationError(
            {"surplus_pool": "Office surplus pool record belongs to a different client."}
        )

    qty = int(quantity_to_allocate or 0)
    if qty < 1:
        raise DRFValidationError(
            {"quantity_to_allocate": "Quantity to allocate from surplus must be at least 1."}
        )
    if qty > int(locked_pool.remaining_quantity):
        raise DRFValidationError(
            {
                "quantity_to_allocate": (
                    f"Only {locked_pool.remaining_quantity} piece(s) remain in office surplus "
                    f"'{locked_pool.surplus_code}', cannot allocate {qty}."
                )
            }
        )

    unallocated_needed = int(locked_rep_item.ordered_quantity) - int(
        locked_rep_item.allocated_from_surplus_quantity
    )
    if qty > unallocated_needed:
        raise DRFValidationError(
            {
                "quantity_to_allocate": (
                    f"Replacement item '{locked_rep_item.item_name}' requires only "
                    f"{unallocated_needed} more piece(s), cannot allocate {qty}."
                )
            }
        )

    locked_pool.allocated_quantity = int(locked_pool.allocated_quantity) + qty
    locked_pool.remaining_quantity = int(locked_pool.remaining_quantity) - qty
    locked_pool.save(
        update_fields=["allocated_quantity", "remaining_quantity", "updated_at"]
    )

    locked_rep_item.allocated_from_surplus_quantity = (
        int(locked_rep_item.allocated_from_surplus_quantity) + qty
    )
    locked_rep_item.prepared_quantity = max(
        int(locked_rep_item.prepared_quantity),
        int(locked_rep_item.allocated_from_surplus_quantity),
    )
    locked_rep_item.save(
        update_fields=[
            "allocated_from_surplus_quantity",
            "prepared_quantity",
            "updated_at",
        ]
    )

    # Update the replacement item's ProductionJob readiness and net remaining production required
    job = ensure_production_job_for_item(locked_rep_item)
    remaining_to_produce = max(
        0,
        int(locked_rep_item.ordered_quantity)
        - int(locked_rep_item.allocated_from_surplus_quantity),
    )
    if remaining_to_produce == 0:
        job.is_production_completed = True
        job.production_completed_at = timezone.now()
        job.is_ready_for_dispatch = True
        job.ready_for_packing_quantity = locked_rep_item.ordered_quantity
        job.planned_batches = 0
        job.planned_printing_quantity = 0
        job.planned_assembly_quantity = 0
        job.current_stage = (
            ProductionStage.DISPATCH
            if locked_rep_item.category == ItemCategory.LANYARD
            else ProductionStage.READY_FOR_DISPATCH
        )
        job.notes = (
            f"{job.notes}\nFulfilled {qty} pcs from Office Surplus {locked_pool.surplus_code}.".strip()
        )
        job.save()
    else:
        # Scenario H: Only remaining unfulfilled quantity requires new production
        if locked_rep_item.category == ItemCategory.LANYARD:
            net_plan = calculate_lanyard_batch_plan(remaining_to_produce, job.batch_capacity)
            job.calculated_batches = net_plan["calculated_batches"]
            job.calculated_planned_quantity = net_plan["calculated_planned_quantity"]
            job.calculated_expected_surplus = net_plan["calculated_expected_surplus"]
            job.planned_batches = net_plan["calculated_batches"]
            job.planned_printing_quantity = net_plan["calculated_planned_quantity"]
            job.expected_surplus_quantity = net_plan["calculated_expected_surplus"]
            job.planned_assembly_quantity = remaining_to_produce
        else:
            job.calculated_planned_quantity = remaining_to_produce
            job.planned_printing_quantity = remaining_to_produce
        job.ready_for_packing_quantity = max(
            int(job.ready_for_packing_quantity),
            int(locked_rep_item.allocated_from_surplus_quantity),
        )
        job.is_ready_for_dispatch = job.ready_for_packing_quantity > 0
        job.notes = (
            f"{job.notes}\nAllocated {qty} pcs from Office Surplus {locked_pool.surplus_code}; "
            f"{remaining_to_produce} pcs remaining for new production.".strip()
        )
        job.save()

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    allocation = ReplacementSurplusAllocation.objects.create(
        surplus_pool=locked_pool,
        replacement_order=locked_rep_item.order,
        replacement_order_item=locked_rep_item,
        quantity_allocated=qty,
        allocated_by=auth_actor,
        allocated_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
        notes=(notes or "").strip(),
    )

    record_audit_log(
        action="OFFICE_SURPLUS_ALLOCATED",
        module="dispatch",
        summary=(
            f"Allocated {qty} pcs from office surplus '{locked_pool.surplus_code}' "
            f"to replacement order {locked_rep_item.order.order_number} ({locked_rep_item.item_name})."
        ),
        actor=auth_actor,
        target_type="OfficeSurplusPool",
        target_id=str(locked_pool.id),
        metadata={
            "surplus_code": locked_pool.surplus_code,
            "replacement_order_number": locked_rep_item.order.order_number,
            "quantity_allocated": qty,
            "remaining_surplus": locked_pool.remaining_quantity,
        },
        request=request,
    )
    return allocation
