"""Serializers for Phase 3 Production Management."""
from typing import Any

from rest_framework import serializers

from apps.catalog.serializers import CatalogOptionSerializer
from apps.orders.models import OrderItem

from .models import (
    PrintingRun,
    ProductionJob,
    ProductionStatusHistory,
)


class PrintingRunSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = PrintingRun
        fields = [
            "id",
            "production_job",
            "order_item",
            "run_number",
            "run_identifier",
            "status",
            "status_label",
            "run_date",
            "completed_at",
            "planned_batches",
            "planned_quantity",
            "actual_printed_quantity",
            "rejected_quantity",
            "successful_quantity",
            "responsible_user",
            "responsible_username",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class PrintingRunCreateInputSerializer(serializers.Serializer):
    run_date = serializers.DateField(required=False)
    planned_batches = serializers.IntegerField(min_value=1, required=False)
    planned_quantity = serializers.IntegerField(min_value=1, required=False)
    actual_printed_quantity = serializers.IntegerField(min_value=0)
    rejected_quantity = serializers.IntegerField(min_value=0, required=False, default=0)
    successful_quantity = serializers.IntegerField(
        min_value=0, required=False, allow_null=True, default=None
    )
    complete_immediately = serializers.BooleanField(required=False, default=True)
    idempotency_key = serializers.CharField(
        max_length=64, required=False, allow_blank=True, default=""
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class PrintingRunCompleteInputSerializer(serializers.Serializer):
    actual_printed_quantity = serializers.IntegerField(min_value=1, required=False)
    rejected_quantity = serializers.IntegerField(min_value=0, required=False)
    successful_quantity = serializers.IntegerField(
        min_value=0, required=False, allow_null=True, default=None
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ProductionStatusHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductionStatusHistory
        fields = [
            "id",
            "production_job",
            "stage",
            "previous_status",
            "new_status",
            "changed_by",
            "changed_by_username",
            "summary",
            "notes",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class ProductionOrderItemContextSerializer(serializers.ModelSerializer):
    """Order and specification context embedded inside a ProductionJob response."""

    order_id = serializers.UUIDField(source="order.id", read_only=True)
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    order_type = serializers.CharField(source="order.order_type", read_only=True)
    order_type_label = serializers.CharField(source="order.get_order_type_display", read_only=True)
    order_date = serializers.DateField(source="order.order_date", read_only=True)
    order_status = serializers.CharField(source="order.status", read_only=True)
    order_status_label = serializers.CharField(source="order.get_status_display", read_only=True)
    client_id = serializers.UUIDField(source="order.client.id", read_only=True)
    client_name = serializers.CharField(source="order.client.name", read_only=True)

    category_label = serializers.CharField(source="get_category_display", read_only=True)
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

    class Meta:
        model = OrderItem
        fields = [
            "id",
            "order_id",
            "order_number",
            "order_type",
            "order_type_label",
            "order_date",
            "order_status",
            "order_status_label",
            "client_id",
            "client_name",
            "line_number",
            "item_name",
            "category",
            "category_label",
            "ordered_quantity",
            "prepared_quantity",
            "dispatched_quantity",
            "remaining_quantity",
            "replacement_reason",
            "replacement_reason_label",
            "replacement_reason_notes",
            "card_orientation",
            "card_orientation_label",
            "card_printing",
            "card_printing_label",
            "card_type_option_detail",
            "card_type_custom_name",
            "lanyard_size_option",
            "lanyard_size_option_detail",
            "lanyard_design_requirements",
            "lanyard_printing_specs",
            "holder_requirement",
            "holder_requirement_label",
            "holder_option_detail",
            "hook_requirement",
            "hook_requirement_label",
            "hook_option_detail",
            "attachment_party",
            "attachment_party_label",
            "accessories_detail",
            "notes",
        ]
        read_only_fields = fields


class ProductionJobSummarySerializer(serializers.ModelSerializer):
    """Lightweight summary embedded directly on OrderItem responses."""

    current_stage_label = serializers.CharField(source="get_current_stage_display", read_only=True)
    design_status_label = serializers.CharField(source="get_design_status_display", read_only=True)
    printing_status_label = serializers.CharField(
        source="get_printing_status_display", read_only=True
    )
    assembly_status_label = serializers.CharField(
        source="get_assembly_status_display", read_only=True
    )
    required_quantity = serializers.IntegerField(read_only=True)
    production_quantity_available = serializers.IntegerField(read_only=True)
    quantity_completed = serializers.IntegerField(read_only=True)
    quantity_pending = serializers.IntegerField(read_only=True)
    actual_printed_surplus = serializers.IntegerField(read_only=True)

    class Meta:
        model = ProductionJob
        fields = [
            "id",
            "current_stage",
            "current_stage_label",
            "design_status",
            "design_status_label",
            "printing_status",
            "printing_status_label",
            "assembly_status",
            "assembly_status_label",
            "is_assembly_ready",
            "is_production_completed",
            "is_ready_for_dispatch",
            "batch_capacity",
            "calculated_batches",
            "calculated_planned_quantity",
            "calculated_expected_surplus",
            "planned_batches",
            "planned_printing_quantity",
            "expected_surplus_quantity",
            "is_plan_overridden",
            "total_printed_quantity",
            "total_rejected_quantity",
            "successful_printed_quantity",
            "planned_assembly_quantity",
            "completed_assembly_quantity",
            "ready_for_packing_quantity",
            "required_quantity",
            "production_quantity_available",
            "quantity_completed",
            "quantity_pending",
            "actual_printed_surplus",
            "updated_at",
        ]
        read_only_fields = fields


class ProductionJobListSerializer(serializers.ModelSerializer):
    """Compact serializer for the Production Queue & Overview tables."""

    item = ProductionOrderItemContextSerializer(source="order_item", read_only=True)
    current_stage_label = serializers.CharField(source="get_current_stage_display", read_only=True)
    design_status_label = serializers.CharField(source="get_design_status_display", read_only=True)
    printing_status_label = serializers.CharField(
        source="get_printing_status_display", read_only=True
    )
    assembly_status_label = serializers.CharField(
        source="get_assembly_status_display", read_only=True
    )
    design_responsible_username = serializers.CharField(
        source="design_responsible.username", read_only=True, default=""
    )
    printing_responsible_username = serializers.CharField(
        source="printing_responsible.username", read_only=True, default=""
    )
    assembly_responsible_username = serializers.CharField(
        source="assembly_responsible.username", read_only=True, default=""
    )
    printing_runs_count = serializers.SerializerMethodField()

    required_quantity = serializers.IntegerField(read_only=True)
    production_quantity_available = serializers.IntegerField(read_only=True)
    quantity_completed = serializers.IntegerField(read_only=True)
    quantity_pending = serializers.IntegerField(read_only=True)
    actual_printed_surplus = serializers.IntegerField(read_only=True)

    class Meta:
        model = ProductionJob
        fields = [
            "id",
            "order_item",
            "item",
            "current_stage",
            "current_stage_label",
            "design_status",
            "design_status_label",
            "design_started_at",
            "design_approved_at",
            "design_completed_at",
            "design_responsible_username",
            "printing_status",
            "printing_status_label",
            "printing_started_at",
            "printing_completed_at",
            "printing_responsible_username",
            "printing_runs_count",
            "batch_capacity",
            "calculated_batches",
            "calculated_planned_quantity",
            "calculated_expected_surplus",
            "planned_batches",
            "planned_printing_quantity",
            "expected_surplus_quantity",
            "is_plan_overridden",
            "plan_override_reason",
            "total_printed_quantity",
            "total_rejected_quantity",
            "successful_printed_quantity",
            "assembly_status",
            "assembly_status_label",
            "is_assembly_ready",
            "planned_assembly_quantity",
            "completed_assembly_quantity",
            "assembly_started_at",
            "assembly_completed_at",
            "assembly_responsible_username",
            "is_production_completed",
            "production_completed_at",
            "is_ready_for_dispatch",
            "ready_for_packing_quantity",
            "required_quantity",
            "production_quantity_available",
            "quantity_completed",
            "quantity_pending",
            "actual_printed_surplus",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_printing_runs_count(self, obj: ProductionJob) -> int:
        prefetched = getattr(obj, "_prefetched_objects_cache", {}).get("printing_runs")
        if prefetched is not None:
            return len(prefetched)
        return obj.printing_runs.count()


class ProductionJobDetailSerializer(ProductionJobListSerializer):
    """Full ProductionJob detail including printing runs, notes, and status history."""

    printing_runs = PrintingRunSerializer(many=True, read_only=True)
    history = ProductionStatusHistorySerializer(many=True, read_only=True)
    workflow_stages = serializers.SerializerMethodField()

    class Meta(ProductionJobListSerializer.Meta):
        fields = ProductionJobListSerializer.Meta.fields + [
            "design_notes",
            "design_reference",
            "printing_notes",
            "assembly_notes",
            "notes",
            "workflow_stages",
            "printing_runs",
            "history",
        ]
        read_only_fields = fields

    def get_workflow_stages(self, obj: ProductionJob) -> list[dict[str, Any]]:
        """Return category-specific step timeline metadata for the UI."""
        if obj.order_item.category == "id_card":
            return [
                {
                    "key": "design",
                    "label": "1. Design",
                    "status": obj.design_status,
                    "status_label": obj.get_design_status_display(),
                    "is_completed": obj.design_status == "completed",
                    "is_active": obj.current_stage == "design",
                },
                {
                    "key": "printing",
                    "label": "2. Printing",
                    "status": obj.printing_status,
                    "status_label": obj.get_printing_status_display(),
                    "is_completed": obj.printing_status == "completed",
                    "is_active": obj.current_stage == "printing",
                },
                {
                    "key": "production_completed",
                    "label": "3. Production Completed",
                    "status": "completed" if obj.is_production_completed else "pending",
                    "status_label": "Completed" if obj.is_production_completed else "Pending",
                    "is_completed": obj.is_production_completed,
                    "is_active": obj.current_stage == "production_completed",
                },
                {
                    "key": "ready_for_dispatch",
                    "label": "4. Ready for Packing / Dispatch",
                    "status": "ready" if obj.is_ready_for_dispatch else "pending",
                    "status_label": (
                        f"Ready ({obj.ready_for_packing_quantity} pcs)"
                        if obj.is_ready_for_dispatch
                        else "Pending"
                    ),
                    "is_completed": obj.is_ready_for_dispatch,
                    "is_active": obj.current_stage == "ready_for_dispatch",
                },
            ]

        # Strictly 4 business stages for Lanyards (Section 4): Design, Printing, Assembly, Dispatch
        return [
            {
                "key": "design",
                "label": "1. Design",
                "status": obj.design_status,
                "status_label": obj.get_design_status_display(),
                "is_completed": obj.design_status == "completed",
                "is_active": obj.current_stage == "design",
            },
            {
                "key": "printing",
                "label": "2. Printing",
                "status": obj.printing_status,
                "status_label": obj.get_printing_status_display(),
                "is_completed": obj.printing_status == "completed",
                "is_active": obj.current_stage == "printing",
            },
            {
                "key": "assembly",
                "label": "3. Assembly",
                "status": obj.assembly_status,
                "status_label": obj.get_assembly_status_display(),
                "is_completed": obj.assembly_status == "completed",
                "is_active": obj.current_stage == "assembly",
            },
            {
                "key": "dispatch",
                "label": "4. Dispatch",
                "status": "ready" if obj.is_ready_for_dispatch else "pending",
                "status_label": (
                    f"Ready for Packing ({obj.ready_for_packing_quantity} pcs)"
                    if obj.is_ready_for_dispatch
                    else "Pending Assembly"
                ),
                "is_completed": obj.is_ready_for_dispatch,
                "is_active": obj.current_stage == "dispatch",
            },
        ]
