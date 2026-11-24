"""Transactional business services for Order creation, Replacements, and Lifecycle transitions."""
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import HttpRequest
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.audit_logs.services import record_audit_log
from apps.catalog.models import CatalogCategory, CatalogOption
from apps.clients.models import Client, clean_display_client_name, normalize_client_name

from .models import (
    AccessoryRequirement,
    AttachmentParty,
    ItemCategory,
    Order,
    OrderItem,
    OrderItemStatus,
    OrderSequence,
    OrderStatus,
    OrderStatusHistory,
    OrderType,
)


def resolve_or_create_client_inline(
    *,
    client_id: str | None = None,
    client_name: str | None = None,
    actor: Any = None,
    request: HttpRequest | None = None,
) -> tuple[Client, bool]:
    """Resolve an existing client by ID or normalized name, or create inline atomically.

    Returns `(client, was_created_inline)`.
    """
    if client_id:
        client = Client.objects.filter(pk=client_id).first()
        if client is None:
            raise DRFValidationError({"client_id": "Selected client does not exist."})
        if client.is_archived:
            raise DRFValidationError(
                {"client_id": f"Client '{client.name}' is archived and cannot receive new orders."}
            )
        return client, False

    raw_name = clean_display_client_name(client_name or "")
    normalized = normalize_client_name(raw_name)
    if not normalized:
        raise DRFValidationError(
            {"client": "Either an existing client or a new client name must be provided."}
        )

    existing = Client.objects.filter(normalized_name=normalized).first()
    if existing is not None:
        if existing.is_archived:
            raise DRFValidationError(
                {
                    "client_name": (
                        f"Client '{existing.name}' already exists but is currently archived. "
                        "Unarchive the client first."
                    )
                }
            )
        return existing, False

    client = Client.objects.create(
        name=raw_name,
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
    record_audit_log(
        action="CLIENT_CREATED_INLINE",
        module="clients",
        summary=f"Created client '{client.name}' inline during order creation.",
        actor=actor,
        target_type="Client",
        target_id=str(client.id),
        request=request,
    )
    return client, True


def _create_order_item_from_data(
    *,
    order: Order,
    line_number: int,
    item_data: dict[str, Any],
) -> OrderItem:
    """Validate and persist a single OrderItem and its many-to-many accessories."""
    accessory_ids = item_data.pop("accessory_ids", None) or []

    category = item_data.get("category")
    holder_req = item_data.get("holder_requirement", AccessoryRequirement.NOT_SELECTED)
    hook_req = item_data.get("hook_requirement", AccessoryRequirement.NOT_SELECTED)

    if category == ItemCategory.ID_CARD:
        hook_req = AccessoryRequirement.NOT_REQUIRED
        item_data["hook_option"] = None
        item_data["lanyard_size_option"] = None
        item_data["lanyard_design_requirements"] = ""
        item_data["lanyard_printing_specs"] = ""
    elif category == ItemCategory.LANYARD:
        item_data["card_orientation"] = ""
        item_data["card_printing"] = ""
        item_data["card_type_option"] = None
        item_data["card_type_custom_name"] = ""

    if holder_req != AccessoryRequirement.REQUIRED:
        item_data["holder_option"] = None
    if hook_req != AccessoryRequirement.REQUIRED:
        item_data["hook_option"] = None

    item = OrderItem(
        order=order,
        line_number=line_number,
        item_name=item_data.get("item_name", ""),
        category=category,
        status= (
            OrderItemStatus.CONFIRMED
            if order.status == OrderStatus.CONFIRMED
            else OrderItemStatus.PENDING
        ),
        original_item=item_data.get("original_item"),
        replacement_reason=item_data.get("replacement_reason", ""),
        replacement_reason_notes=item_data.get("replacement_reason_notes", ""),
        ordered_quantity=item_data.get("ordered_quantity", 0),
        prepared_quantity=item_data.get("prepared_quantity", 0),
        dispatched_quantity=item_data.get("dispatched_quantity", 0),
        card_orientation=item_data.get("card_orientation", ""),
        card_printing=item_data.get("card_printing", ""),
        card_type_option=item_data.get("card_type_option"),
        card_type_custom_name=item_data.get("card_type_custom_name", ""),
        lanyard_size_option=item_data.get("lanyard_size_option"),
        lanyard_design_requirements=item_data.get("lanyard_design_requirements", ""),
        lanyard_printing_specs=item_data.get("lanyard_printing_specs", ""),
        holder_requirement=holder_req,
        holder_option=item_data.get("holder_option"),
        hook_requirement=hook_req,
        hook_option=item_data.get("hook_option"),
        attachment_party=item_data.get("attachment_party", AttachmentParty.NOT_APPLICABLE),
        extra_specifications=item_data.get("extra_specifications") or {},
        notes=item_data.get("notes", ""),
    )
    try:
        item.full_clean()
    except DjangoValidationError as exc:
        raise DRFValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc

    item.save()

    if accessory_ids:
        accessories = list(
            CatalogOption.objects.active().filter(
                id__in=accessory_ids,
                category=CatalogCategory.ACCESSORY,
            )
        )
        if len(accessories) != len(set(accessory_ids)):
            raise DRFValidationError(
                {"accessory_ids": "One or more selected accessories are invalid or archived."}
            )
        item.accessories.set(accessories)

    from apps.production.services import ensure_production_job_for_item

    ensure_production_job_for_item(item, actor=order.created_by)

    return item


@transaction.atomic
def create_original_order(
    *,
    validated_data: dict[str, Any],
    actor: Any = None,
    request: HttpRequest | None = None,
) -> Order:
    """Create an Original Order and all of its items inside a single atomic transaction."""
    idempotency_key = (validated_data.get("idempotency_key") or "").strip() or None
    if idempotency_key:
        existing_order = Order.objects.filter(idempotency_key=idempotency_key).first()
        if existing_order is not None:
            return existing_order

    items_data = validated_data.get("items") or []
    if not items_data:
        raise DRFValidationError({"items": "An order must contain at least one item."})

    client, created_inline = resolve_or_create_client_inline(
        client_id=validated_data.get("client_id"),
        client_name=validated_data.get("client_name"),
        actor=actor,
        request=request,
    )

    initial_status = validated_data.get("status", OrderStatus.CONFIRMED)
    if initial_status not in {OrderStatus.DRAFT, OrderStatus.CONFIRMED}:
        raise DRFValidationError(
            {"status": "New orders can only be created in Draft or Confirmed status."}
        )

    order_number = OrderSequence.get_next_order_number()
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None

    order = Order(
        order_number=order_number,
        order_type=OrderType.ORIGINAL,
        client=client,
        order_date=validated_data.get("order_date") or Order._meta.get_field("order_date").get_default(),
        expected_completion_date=validated_data.get("expected_completion_date"),
        status=initial_status,
        notes=validated_data.get("notes", ""),
        idempotency_key=idempotency_key,
        created_by=auth_actor,
        updated_by=auth_actor,
    )
    try:
        order.full_clean()
    except DjangoValidationError as exc:
        raise DRFValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc
    order.save()

    for idx, raw_item in enumerate(items_data, start=1):
        _create_order_item_from_data(
            order=order,
            line_number=idx,
            item_data=dict(raw_item),
        )

    OrderStatusHistory.objects.create(
        order=order,
        previous_status="",
        new_status=order.status,
        changed_by=auth_actor,
        changed_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
        reason="Initial order created.",
    )

    record_audit_log(
        action="ORDER_CREATED",
        module="orders",
        summary=f"Created order {order.order_number} for '{client.name}' with {len(items_data)} item(s).",
        actor=auth_actor,
        target_type="Order",
        target_id=str(order.id),
        metadata={
            "order_number": order.order_number,
            "order_type": order.order_type,
            "client_id": str(client.id),
            "client_created_inline": created_inline,
            "item_count": len(items_data),
        },
        request=request,
    )

    return order


@transaction.atomic
def create_replacement_order(
    *,
    original_order: Order,
    validated_data: dict[str, Any],
    actor: Any = None,
    request: HttpRequest | None = None,
) -> Order:
    """Create a linked Replacement Order referencing an Original Order and its original items."""
    if original_order.order_type != OrderType.ORIGINAL:
        raise DRFValidationError(
            {"original_order": "Replacements must be created against an Original Order."}
        )
    if original_order.status == OrderStatus.CANCELLED:
        raise DRFValidationError(
            {"original_order": "Cannot create a replacement for a cancelled order."}
        )

    # Verify optional client_id matches original_order.client_id if supplied
    supplied_client_id = validated_data.get("client_id")
    if supplied_client_id and str(supplied_client_id) != str(original_order.client_id):
        raise DRFValidationError(
            {"client_id": "Replacement order client must match the original order's client."}
        )

    idempotency_key = (validated_data.get("idempotency_key") or "").strip() or None
    if idempotency_key:
        existing_order = Order.objects.filter(idempotency_key=idempotency_key).first()
        if existing_order is not None:
            return existing_order

    items_data = validated_data.get("items") or []
    if not items_data:
        raise DRFValidationError(
            {"items": "A replacement order must include at least one replacement item."}
        )

    initial_status = validated_data.get("status", OrderStatus.CONFIRMED)
    if initial_status not in {OrderStatus.DRAFT, OrderStatus.CONFIRMED}:
        raise DRFValidationError(
            {"status": "Replacement orders can only be created in Draft or Confirmed status."}
        )

    order_number = OrderSequence.get_next_order_number()
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None

    replacement_order = Order(
        order_number=order_number,
        order_type=OrderType.REPLACEMENT,
        client=original_order.client,
        original_order=original_order,
        order_date=validated_data.get("order_date") or Order._meta.get_field("order_date").get_default(),
        expected_completion_date=validated_data.get("expected_completion_date"),
        status=initial_status,
        notes=validated_data.get("notes", ""),
        idempotency_key=idempotency_key,
        created_by=auth_actor,
        updated_by=auth_actor,
    )
    try:
        replacement_order.full_clean()
    except DjangoValidationError as exc:
        raise DRFValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc
    replacement_order.save()

    for idx, raw_item in enumerate(items_data, start=1):
        original_item: OrderItem | None = raw_item.get("original_item")
        if original_item is None:
            raise DRFValidationError(
                {"items": f"Line {idx}: 'original_item_id' is required for replacement items."}
            )
        if original_item.order_id != original_order.id:
            raise DRFValidationError(
                {
                    "items": (
                        f"Line {idx}: Selected item '{original_item.item_name}' does not belong "
                        f"to original order {original_order.order_number}."
                    )
                }
            )

        # Inherit product category and specification defaults from the original item
        inherited_payload: dict[str, Any] = {
            "item_name": (raw_item.get("item_name") or "").strip() or f"{original_item.item_name} (Replacement)",
            "category": original_item.category,
            "original_item": original_item,
            "replacement_reason": raw_item.get("replacement_reason", ""),
            "replacement_reason_notes": raw_item.get("replacement_reason_notes", ""),
            "ordered_quantity": raw_item.get("ordered_quantity", 0),
            "prepared_quantity": 0,
            "dispatched_quantity": 0,
            "card_orientation": raw_item.get("card_orientation") or original_item.card_orientation,
            "card_printing": raw_item.get("card_printing") or original_item.card_printing,
            "card_type_option": raw_item.get("card_type_option", original_item.card_type_option),
            "card_type_custom_name": (
                raw_item.get("card_type_custom_name")
                if "card_type_custom_name" in raw_item
                else original_item.card_type_custom_name
            ),
            "lanyard_size_option": raw_item.get("lanyard_size_option", original_item.lanyard_size_option),
            "lanyard_design_requirements": (
                raw_item.get("lanyard_design_requirements")
                if "lanyard_design_requirements" in raw_item
                else original_item.lanyard_design_requirements
            ),
            "lanyard_printing_specs": (
                raw_item.get("lanyard_printing_specs")
                if "lanyard_printing_specs" in raw_item
                else original_item.lanyard_printing_specs
            ),
            "holder_requirement": raw_item.get("holder_requirement") or original_item.holder_requirement,
            "holder_option": raw_item.get("holder_option", original_item.holder_option),
            "hook_requirement": raw_item.get("hook_requirement") or original_item.hook_requirement,
            "hook_option": raw_item.get("hook_option", original_item.hook_option),
            "attachment_party": raw_item.get("attachment_party") or original_item.attachment_party,
            "accessory_ids": (
                raw_item["accessory_ids"]
                if "accessory_ids" in raw_item
                else list(original_item.accessories.values_list("id", flat=True))
            ),
            "extra_specifications": raw_item.get("extra_specifications") or original_item.extra_specifications,
            "notes": raw_item.get("notes", ""),
        }
        created_rep_item = _create_order_item_from_data(
            order=replacement_order,
            line_number=idx,
            item_data=inherited_payload,
        )

        surplus_pool_id = raw_item.get("surplus_pool_id")
        surplus_alloc_qty = int(raw_item.get("allocate_from_surplus_quantity") or 0)
        if surplus_pool_id and surplus_alloc_qty > 0:
            from apps.dispatch.models import OfficeSurplusPool
            from apps.dispatch.services import allocate_office_surplus_to_replacement_item

            pool = OfficeSurplusPool.objects.filter(pk=surplus_pool_id).first()
            if pool is None:
                raise DRFValidationError(
                    {"items": f"Line {idx}: Selected office surplus record was not found."}
                )
            allocate_office_surplus_to_replacement_item(
                surplus_pool=pool,
                replacement_order_item=created_rep_item,
                quantity_to_allocate=surplus_alloc_qty,
                notes=f"Allocated inline during creation of {replacement_order.order_number}.",
                actor=auth_actor,
                request=request,
            )

    OrderStatusHistory.objects.create(
        order=replacement_order,
        previous_status="",
        new_status=replacement_order.status,
        changed_by=auth_actor,
        changed_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
        reason=f"Replacement order created referencing {original_order.order_number}.",
    )

    record_audit_log(
        action="REPLACEMENT_ORDER_CREATED",
        module="orders",
        summary=(
            f"Created replacement order {replacement_order.order_number} "
            f"for original order {original_order.order_number}."
        ),
        actor=auth_actor,
        target_type="Order",
        target_id=str(replacement_order.id),
        metadata={
            "order_number": replacement_order.order_number,
            "original_order_id": str(original_order.id),
            "original_order_number": original_order.order_number,
            "client_id": str(original_order.client_id),
            "item_count": len(items_data),
        },
        request=request,
    )

    return replacement_order


@transaction.atomic
def transition_order_status(
    *,
    order: Order,
    target_status: str,
    reason: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> Order:
    """Execute a controlled order lifecycle transition with history and audit logging."""
    clean_reason = (reason or "").strip()

    if order.status == target_status:
        raise DRFValidationError({"status": f"Order is already in '{order.get_status_display()}' status."})

    if not order.can_transition_to(target_status):
        raise DRFValidationError(
            {
                "status": (
                    f"Cannot transition order from '{order.get_status_display()}' "
                    f"to '{dict(OrderStatus.choices).get(target_status, target_status)}'."
                )
            }
        )

    if target_status == OrderStatus.CANCELLED and not clean_reason:
        raise DRFValidationError(
            {"reason": "A cancellation reason is required when cancelling an order."}
        )

    previous_status = order.status
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None

    order.status = target_status
    order.updated_by = auth_actor
    update_fields = ["status", "updated_by", "updated_at"]
    if target_status == OrderStatus.CANCELLED:
        order.cancel_reason = clean_reason
        update_fields.append("cancel_reason")

    order.save(update_fields=update_fields)

    # Synchronize item statuses for major order transitions
    item_status_map = {
        OrderStatus.CONFIRMED: OrderItemStatus.CONFIRMED,
        OrderStatus.IN_PROGRESS: OrderItemStatus.IN_PROGRESS,
        OrderStatus.PARTIALLY_COMPLETED: OrderItemStatus.PARTIALLY_COMPLETED,
        OrderStatus.COMPLETED: OrderItemStatus.COMPLETED,
        OrderStatus.CANCELLED: OrderItemStatus.CANCELLED,
    }
    if target_status in item_status_map:
        order.items.exclude(status=OrderItemStatus.CANCELLED).update(
            status=item_status_map[target_status]
        )

    OrderStatusHistory.objects.create(
        order=order,
        previous_status=previous_status,
        new_status=target_status,
        changed_by=auth_actor,
        changed_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
        reason=clean_reason,
    )

    action_code = (
        "ORDER_CANCELLED"
        if target_status == OrderStatus.CANCELLED
        else "ORDER_CONFIRMED"
        if target_status == OrderStatus.CONFIRMED
        else "ORDER_STATUS_CHANGED"
    )
    record_audit_log(
        action=action_code,
        module="orders",
        summary=f"Order {order.order_number} transitioned from {previous_status} to {target_status}.",
        actor=auth_actor,
        target_type="Order",
        target_id=str(order.id),
        metadata={
            "order_number": order.order_number,
            "previous_status": previous_status,
            "new_status": target_status,
            "reason": clean_reason,
        },
        request=request,
    )

    return order
