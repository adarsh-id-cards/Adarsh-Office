"""Serializers for Orders, OrderItems, Replacement Orders, and Status History."""
from typing import Any

from rest_framework import serializers

from apps.catalog.models import CatalogOption
from apps.catalog.serializers import CatalogOptionSerializer

from .models import (
    AccessoryRequirement,
    AttachmentParty,
    CardOrientation,
    CardPrintingSide,
    ItemCategory,
    Order,
    OrderItem,
    OrderStatus,
    OrderStatusHistory,
    OrderType,
    ReplacementReason,
)


class OrderItemReplacementSummarySerializer(serializers.ModelSerializer):
    """Compact summary of a replacement item linked to an original order item."""

    replacement_order_id = serializers.UUIDField(source="order.id", read_only=True)
    replacement_order_number = serializers.CharField(source="order.order_number", read_only=True)
    replacement_order_date = serializers.DateField(source="order.order_date", read_only=True)
    replacement_order_status = serializers.CharField(source="order.status", read_only=True)
    replacement_order_status_label = serializers.CharField(
        source="order.get_status_display", read_only=True
    )
    replacement_reason_label = serializers.CharField(
        source="get_replacement_reason_display", read_only=True
    )
    remaining_quantity = serializers.IntegerField(read_only=True)

    class Meta:
        model = OrderItem
        fields = [
            "id",
            "replacement_order_id",
            "replacement_order_number",
            "replacement_order_date",
            "replacement_order_status",
            "replacement_order_status_label",
            "item_name",
            "ordered_quantity",
            "prepared_quantity",
            "dispatched_quantity",
            "remaining_quantity",
            "replacement_reason",
            "replacement_reason_label",
            "replacement_reason_notes",
            "created_at",
        ]
        read_only_fields = fields


class OrderItemReadSerializer(serializers.ModelSerializer):
    """Detailed read serializer for OrderItem with independent original & replacement quantity metrics."""

    category_label = serializers.CharField(source="get_category_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    card_orientation_label = serializers.CharField(
        source="get_card_orientation_display", read_only=True
    )
    card_printing_label = serializers.CharField(
        source="get_card_printing_display", read_only=True
    )
    holder_requirement_label = serializers.CharField(
        source="get_holder_requirement_display", read_only=True
    )
    hook_requirement_label = serializers.CharField(
        source="get_hook_requirement_display", read_only=True
    )
    attachment_party_label = serializers.CharField(
        source="get_attachment_party_display", read_only=True
    )
    replacement_reason_label = serializers.CharField(
        source="get_replacement_reason_display", read_only=True
    )

    card_type_option_detail = CatalogOptionSerializer(source="card_type_option", read_only=True)
    lanyard_size_option_detail = CatalogOptionSerializer(
        source="lanyard_size_option", read_only=True
    )
    holder_option_detail = CatalogOptionSerializer(source="holder_option", read_only=True)
    hook_option_detail = CatalogOptionSerializer(source="hook_option", read_only=True)
    accessories_detail = CatalogOptionSerializer(source="accessories", many=True, read_only=True)

    original_item_name = serializers.CharField(source="original_item.item_name", read_only=True, default="")
    original_item_ordered_quantity = serializers.IntegerField(
        source="original_item.ordered_quantity", read_only=True, default=None
    )

    # Explicit independent quantity metrics (Section 9)
    original_ordered_quantity = serializers.SerializerMethodField()
    replacement_quantity = serializers.SerializerMethodField()
    replacement_dispatched_quantity = serializers.SerializerMethodField()
    remaining_quantity = serializers.IntegerField(read_only=True)
    replacement_items = serializers.SerializerMethodField()
    production_job = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = [
            "id",
            "order",
            "line_number",
            "item_name",
            "category",
            "category_label",
            "status",
            "status_label",
            "original_item",
            "original_item_name",
            "original_item_ordered_quantity",
            "replacement_reason",
            "replacement_reason_label",
            "replacement_reason_notes",
            "ordered_quantity",
            "allocated_from_surplus_quantity",
            "original_ordered_quantity",
            "replacement_quantity",
            "prepared_quantity",
            "dispatched_quantity",
            "replacement_dispatched_quantity",
            "remaining_quantity",
            "card_orientation",
            "card_orientation_label",
            "card_printing",
            "card_printing_label",
            "card_type_option",
            "card_type_option_detail",
            "card_type_custom_name",
            "lanyard_size_option",
            "lanyard_size_option_detail",
            "lanyard_design_requirements",
            "lanyard_printing_specs",
            "holder_requirement",
            "holder_requirement_label",
            "holder_option",
            "holder_option_detail",
            "hook_requirement",
            "hook_requirement_label",
            "hook_option",
            "hook_option_detail",
            "attachment_party",
            "attachment_party_label",
            "accessories_detail",
            "extra_specifications",
            "notes",
            "replacement_items",
            "production_job",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def _active_replacements(self, obj: OrderItem) -> list[OrderItem]:
        prefetched = getattr(obj, "_prefetched_objects_cache", {}).get("replacement_items")
        if prefetched is not None:
            return [item for item in prefetched if item.order.status != OrderStatus.CANCELLED]
        return list(
            obj.replacement_items.select_related("order").exclude(
                order__status=OrderStatus.CANCELLED
            )
        )

    def get_original_ordered_quantity(self, obj: OrderItem) -> int:
        if obj.order.order_type == OrderType.ORIGINAL:
            return obj.ordered_quantity
        return 0

    def get_replacement_quantity(self, obj: OrderItem) -> int:
        if obj.order.order_type == OrderType.REPLACEMENT:
            return obj.ordered_quantity
        return sum(rep.ordered_quantity for rep in self._active_replacements(obj))

    def get_replacement_dispatched_quantity(self, obj: OrderItem) -> int:
        if obj.order.order_type == OrderType.REPLACEMENT:
            return obj.dispatched_quantity
        return sum(rep.dispatched_quantity for rep in self._active_replacements(obj))

    def get_replacement_items(self, obj: OrderItem) -> list[dict]:
        if obj.order.order_type != OrderType.ORIGINAL:
            return []
        prefetched = getattr(obj, "_prefetched_objects_cache", {}).get("replacement_items")
        items = (
            list(prefetched)
            if prefetched is not None
            else list(obj.replacement_items.select_related("order").all())
        )
        return OrderItemReplacementSummarySerializer(items, many=True).data

    def get_production_job(self, obj: OrderItem) -> dict[str, Any] | None:
        from apps.production.serializers import ProductionJobSummarySerializer
        from apps.production.services import ensure_production_job_for_item

        job = getattr(obj, "production_job", None)
        if job is None:
            job = ensure_production_job_for_item(obj)
        return ProductionJobSummarySerializer(job).data


class OrderItemCreateInputSerializer(serializers.Serializer):
    """Input serializer for creating an item inside an Original Order."""

    item_name = serializers.CharField(max_length=150, trim_whitespace=True)
    category = serializers.ChoiceField(choices=ItemCategory.choices)
    ordered_quantity = serializers.IntegerField(min_value=1)

    # ID Card fields
    card_orientation = serializers.ChoiceField(
        choices=[("", "None")] + list(CardOrientation.choices),
        required=False,
        allow_blank=True,
        default="",
    )
    card_printing = serializers.ChoiceField(
        choices=[("", "None")] + list(CardPrintingSide.choices),
        required=False,
        allow_blank=True,
        default="",
    )
    card_type_option = serializers.PrimaryKeyRelatedField(
        queryset=CatalogOption.objects.active(),
        required=False,
        allow_null=True,
        default=None,
    )
    card_type_custom_name = serializers.CharField(
        max_length=120,
        required=False,
        allow_blank=True,
        default="",
    )

    # Lanyard fields
    lanyard_size_option = serializers.PrimaryKeyRelatedField(
        queryset=CatalogOption.objects.active(),
        required=False,
        allow_null=True,
        default=None,
    )
    lanyard_design_requirements = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        default="",
    )
    lanyard_printing_specs = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        default="",
    )

    # Holder, Hook & Attachment decisions
    holder_requirement = serializers.ChoiceField(
        choices=AccessoryRequirement.choices,
        required=False,
        default=AccessoryRequirement.NOT_SELECTED,
    )
    holder_option = serializers.PrimaryKeyRelatedField(
        queryset=CatalogOption.objects.active(),
        required=False,
        allow_null=True,
        default=None,
    )
    hook_requirement = serializers.ChoiceField(
        choices=AccessoryRequirement.choices,
        required=False,
        default=AccessoryRequirement.NOT_SELECTED,
    )
    hook_option = serializers.PrimaryKeyRelatedField(
        queryset=CatalogOption.objects.active(),
        required=False,
        allow_null=True,
        default=None,
    )
    attachment_party = serializers.ChoiceField(
        choices=AttachmentParty.choices,
        required=False,
        default=AttachmentParty.NOT_APPLICABLE,
    )
    accessory_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        default=list,
    )
    extra_specifications = serializers.DictField(
        required=False,
        default=dict,
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )


class OrderItemQuantityUpdateSerializer(serializers.ModelSerializer):
    """Validated serializer for updating item production prepared/dispatched quantities and notes."""

    class Meta:
        model = OrderItem
        fields = [
            "prepared_quantity",
            "dispatched_quantity",
            "notes",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        instance: OrderItem = self.instance
        if instance.order.status == OrderStatus.CANCELLED:
            raise serializers.ValidationError("Cannot modify item quantities on a cancelled order.")

        dispatched = attrs.get("dispatched_quantity", instance.dispatched_quantity)
        prepared = attrs.get("prepared_quantity", instance.prepared_quantity)

        if prepared < 0:
            raise serializers.ValidationError(
                {"prepared_quantity": "Prepared quantity cannot be negative."}
            )
        if dispatched < 0:
            raise serializers.ValidationError(
                {"dispatched_quantity": "Dispatched quantity cannot be negative."}
            )
        if dispatched > instance.ordered_quantity:
            raise serializers.ValidationError(
                {
                    "dispatched_quantity": (
                        f"Dispatched quantity ({dispatched}) cannot exceed the authorized "
                        f"ordered quantity ({instance.ordered_quantity})."
                    )
                }
            )
        return attrs


class ReplacementItemCreateInputSerializer(serializers.Serializer):
    """Input serializer for a replacement item referencing an original OrderItem."""

    original_item = serializers.PrimaryKeyRelatedField(
        queryset=OrderItem.objects.select_related("order").all(),
    )
    item_name = serializers.CharField(
        max_length=150,
        required=False,
        allow_blank=True,
        default="",
    )
    ordered_quantity = serializers.IntegerField(min_value=1)
    replacement_reason = serializers.ChoiceField(choices=ReplacementReason.choices)
    replacement_reason_notes = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        default="",
    )
    surplus_pool_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    allocate_from_surplus_quantity = serializers.IntegerField(
        required=False, min_value=0, default=0
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )


class OrderStatusHistorySerializer(serializers.ModelSerializer):
    previous_status_label = serializers.SerializerMethodField()
    new_status_label = serializers.CharField(source="get_new_status_display", read_only=True)

    class Meta:
        model = OrderStatusHistory
        fields = [
            "id",
            "order",
            "previous_status",
            "previous_status_label",
            "new_status",
            "new_status_label",
            "changed_by",
            "changed_by_username",
            "reason",
            "created_at",
        ]
        read_only_fields = fields

    def get_previous_status_label(self, obj: OrderStatusHistory) -> str:
        if not obj.previous_status:
            return "Initial"
        return dict(OrderStatus.choices).get(obj.previous_status, obj.previous_status)


class LinkedOrderSummarySerializer(serializers.ModelSerializer):
    """Compact summary for navigating between Original and Replacement orders."""

    status_label = serializers.CharField(source="get_status_display", read_only=True)
    order_type_label = serializers.CharField(source="get_order_type_display", read_only=True)
    total_ordered_quantity = serializers.SerializerMethodField()
    total_dispatched_quantity = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "order_type",
            "order_type_label",
            "order_date",
            "status",
            "status_label",
            "total_ordered_quantity",
            "total_dispatched_quantity",
            "created_at",
        ]
        read_only_fields = fields

    def get_total_ordered_quantity(self, obj: Order) -> int:
        return sum(item.ordered_quantity for item in obj.items.all())

    def get_total_dispatched_quantity(self, obj: Order) -> int:
        return sum(item.dispatched_quantity for item in obj.items.all())


class OrderListSerializer(serializers.ModelSerializer):
    """Compact serializer for the Orders directory table."""

    client_name = serializers.CharField(source="client.name", read_only=True)
    order_type_label = serializers.CharField(source="get_order_type_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    original_order_number = serializers.CharField(
        source="original_order.order_number", read_only=True, default=None
    )
    created_by_username = serializers.CharField(
        source="created_by.username", read_only=True, default=""
    )
    item_count = serializers.IntegerField(read_only=True, default=0)
    total_ordered_quantity = serializers.IntegerField(read_only=True, default=0)
    total_dispatched_quantity = serializers.IntegerField(read_only=True, default=0)
    replacement_orders_count = serializers.IntegerField(read_only=True, default=0)
    items_summary = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "order_type",
            "order_type_label",
            "client",
            "client_name",
            "original_order",
            "original_order_number",
            "order_date",
            "expected_completion_date",
            "status",
            "status_label",
            "item_count",
            "total_ordered_quantity",
            "total_dispatched_quantity",
            "replacement_orders_count",
            "items_summary",
            "notes",
            "created_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_items_summary(self, obj: Order) -> list[dict[str, Any]]:
        return [
            {
                "id": str(item.id),
                "item_name": item.item_name,
                "category": item.category,
                "category_label": item.get_category_display(),
                "ordered_quantity": item.ordered_quantity,
                "dispatched_quantity": item.dispatched_quantity,
            }
            for item in obj.items.all()
        ]


class OrderDetailSerializer(serializers.ModelSerializer):
    """Full order representation including items, replacement history, and status history."""

    client_name = serializers.CharField(source="client.name", read_only=True)
    client_is_archived = serializers.BooleanField(source="client.is_archived", read_only=True)
    order_type_label = serializers.CharField(source="get_order_type_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    allowed_transitions = serializers.ListField(
        child=serializers.CharField(),
        read_only=True,
    )
    original_order_number = serializers.CharField(
        source="original_order.order_number", read_only=True, default=None
    )
    created_by_username = serializers.CharField(
        source="created_by.username", read_only=True, default=""
    )
    updated_by_username = serializers.CharField(
        source="updated_by.username", read_only=True, default=""
    )

    items = OrderItemReadSerializer(many=True, read_only=True)
    status_history = OrderStatusHistorySerializer(many=True, read_only=True)
    replacement_orders = LinkedOrderSummarySerializer(many=True, read_only=True)

    total_ordered_quantity = serializers.SerializerMethodField()
    total_prepared_quantity = serializers.SerializerMethodField()
    total_dispatched_quantity = serializers.SerializerMethodField()
    total_remaining_quantity = serializers.SerializerMethodField()
    total_replacement_quantity = serializers.SerializerMethodField()
    production_progress = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "order_type",
            "order_type_label",
            "client",
            "client_name",
            "client_is_archived",
            "original_order",
            "original_order_number",
            "order_date",
            "expected_completion_date",
            "status",
            "status_label",
            "allowed_transitions",
            "notes",
            "cancel_reason",
            "total_ordered_quantity",
            "total_prepared_quantity",
            "total_dispatched_quantity",
            "total_remaining_quantity",
            "total_replacement_quantity",
            "production_progress",
            "items",
            "replacement_orders",
            "status_history",
            "created_by",
            "created_by_username",
            "updated_by",
            "updated_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_total_ordered_quantity(self, obj: Order) -> int:
        return sum(item.ordered_quantity for item in obj.items.all())

    def get_total_prepared_quantity(self, obj: Order) -> int:
        return sum(item.prepared_quantity for item in obj.items.all())

    def get_total_dispatched_quantity(self, obj: Order) -> int:
        return sum(item.dispatched_quantity for item in obj.items.all())

    def get_total_remaining_quantity(self, obj: Order) -> int:
        return sum(item.remaining_quantity for item in obj.items.all())

    def get_total_replacement_quantity(self, obj: Order) -> int:
        if obj.order_type == OrderType.REPLACEMENT:
            return sum(item.ordered_quantity for item in obj.items.all())
        total = 0
        for rep_order in obj.replacement_orders.all():
            if rep_order.status != OrderStatus.CANCELLED:
                total += sum(item.ordered_quantity for item in rep_order.items.all())
        return total

    def get_production_progress(self, obj: Order) -> dict[str, Any]:
        """Derive overall order production progress directly from individual item states (Section 7)."""
        from apps.production.services import ensure_production_job_for_item

        items = list(obj.items.all())
        total_items = len(items)
        design_completed = 0
        printing_completed = 0
        assembly_applicable = 0
        assembly_completed = 0
        production_completed = 0
        ready_for_dispatch = 0

        for item in items:
            job = getattr(item, "production_job", None) or ensure_production_job_for_item(item)
            if job.design_status in {"approved", "completed"}:
                design_completed += 1
            if job.printing_status == "completed":
                printing_completed += 1
            if item.category == "lanyard":
                assembly_applicable += 1
                if job.assembly_status == "completed":
                    assembly_completed += 1
            if job.is_production_completed:
                production_completed += 1
            if job.is_ready_for_dispatch:
                ready_for_dispatch += 1

        if total_items == 0:
            summary_label = "No Items"
        elif ready_for_dispatch == total_items:
            summary_label = f"All Items Ready for Dispatch ({ready_for_dispatch}/{total_items})"
        elif production_completed > 0:
            summary_label = f"Partially Completed ({production_completed}/{total_items} Items Ready)"
        elif printing_completed > 0:
            summary_label = f"Printing / Assembly In Progress ({printing_completed}/{total_items} Printed)"
        elif design_completed > 0:
            summary_label = f"Design Approved ({design_completed}/{total_items} Items)"
        else:
            summary_label = "Awaiting Design / Printing"

        return {
            "total_items": total_items,
            "design_completed_items": design_completed,
            "printing_completed_items": printing_completed,
            "assembly_applicable_items": assembly_applicable,
            "assembly_completed_items": assembly_completed,
            "production_completed_items": production_completed,
            "ready_for_dispatch_items": ready_for_dispatch,
            "summary_label": summary_label,
        }


class OrderCreateSerializer(serializers.Serializer):
    """Input serializer for creating a new Original Order with inline client support."""

    client_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    client_name = serializers.CharField(
        max_length=200,
        required=False,
        allow_blank=True,
        default="",
    )
    order_date = serializers.DateField(required=False)
    expected_completion_date = serializers.DateField(required=False, allow_null=True, default=None)
    status = serializers.ChoiceField(
        choices=[OrderStatus.DRAFT, OrderStatus.CONFIRMED],
        required=False,
        default=OrderStatus.CONFIRMED,
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    idempotency_key = serializers.CharField(
        max_length=64,
        required=False,
        allow_blank=True,
        default="",
    )
    items = OrderItemCreateInputSerializer(many=True, allow_empty=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not attrs.get("client_id") and not (attrs.get("client_name") or "").strip():
            raise serializers.ValidationError(
                {"client": "Please select an existing client or enter a new client name."}
            )
        order_date = attrs.get("order_date")
        expected = attrs.get("expected_completion_date")
        if order_date and expected and expected < order_date:
            raise serializers.ValidationError(
                {
                    "expected_completion_date": (
                        "Expected completion date cannot be earlier than the order date."
                    )
                }
            )
        return attrs


class OrderUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating permitted order fields (`notes`, `expected_completion_date`, `order_date`)."""

    class Meta:
        model = Order
        fields = [
            "order_date",
            "expected_completion_date",
            "notes",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        instance: Order = self.instance
        if instance.status in {OrderStatus.COMPLETED, OrderStatus.CANCELLED}:
            raise serializers.ValidationError(
                f"Cannot edit an order that is already {instance.get_status_display().lower()}."
            )
        order_date = attrs.get("order_date", instance.order_date)
        expected = attrs.get("expected_completion_date", instance.expected_completion_date)
        if order_date and expected and expected < order_date:
            raise serializers.ValidationError(
                {
                    "expected_completion_date": (
                        "Expected completion date cannot be earlier than the order date."
                    )
                }
            )
        return attrs


class ReplacementOrderCreateSerializer(serializers.Serializer):
    """Input serializer for creating a Replacement Order against an Original Order."""

    client_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    order_date = serializers.DateField(required=False)
    expected_completion_date = serializers.DateField(required=False, allow_null=True, default=None)
    status = serializers.ChoiceField(
        choices=[OrderStatus.DRAFT, OrderStatus.CONFIRMED],
        required=False,
        default=OrderStatus.CONFIRMED,
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    idempotency_key = serializers.CharField(
        max_length=64,
        required=False,
        allow_blank=True,
        default="",
    )
    items = ReplacementItemCreateInputSerializer(many=True, allow_empty=False)
