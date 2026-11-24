"""Serializers for Lanyard Assembly Assignment, Material Issuance, and Receiving (Sections 5, 6, 7, 8)."""
from rest_framework import serializers

from .models import (
    AssemblyAssignment,
    AssemblyReceivingRecord,
    AssignmentMaterialAllocation,
)


class AssignmentMaterialAllocationSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source="material.name", read_only=True)
    material_code = serializers.CharField(source="material.code", read_only=True)
    base_unit = serializers.CharField(source="material.base_unit", read_only=True)
    package_name = serializers.CharField(
        source="packaging.package_name", read_only=True, default=""
    )
    total_available_after_issue = serializers.IntegerField(read_only=True)
    expected_remaining_balance = serializers.IntegerField(read_only=True)

    class Meta:
        model = AssignmentMaterialAllocation
        fields = [
            "id",
            "assignment",
            "material",
            "material_name",
            "material_code",
            "base_unit",
            "required_quantity",
            "opening_labour_balance",
            "additional_needed_quantity",
            "packaging",
            "package_name",
            "packets_issued",
            "units_per_package_snapshot",
            "issued_quantity",
            "total_available_after_issue",
            "expected_remaining_balance",
            "is_override",
            "override_reason",
            "consumed_quantity",
            "defective_quantity",
            "returned_to_office_quantity",
            "closing_labour_balance",
            "is_reconciled",
            "stock_movement",
            "notes",
            "created_at",
        ]
        read_only_fields = fields


class AssemblyReceivingRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssemblyReceivingRecord
        fields = [
            "id",
            "assignment",
            "received_date",
            "usable_quantity",
            "defective_quantity",
            "received_by",
            "received_by_username",
            "notes",
            "created_at",
        ]
        read_only_fields = fields


class AssemblyAssignmentSerializer(serializers.ModelSerializer):
    order_id = serializers.UUIDField(source="order_item.order_id", read_only=True)
    order_number = serializers.CharField(
        source="order_item.order.order_number", read_only=True
    )
    client_name = serializers.CharField(
        source="order_item.order.client.name", read_only=True
    )
    item_name = serializers.CharField(source="order_item.item_name", read_only=True)
    lanyard_size_name = serializers.CharField(
        source="order_item.lanyard_size_option.name", read_only=True, default=""
    )
    labourer_name = serializers.CharField(
        source="labourer.name", read_only=True, default="Internal Office Assembly"
    )
    assigned_machine_code = serializers.CharField(
        source="assigned_machine.machine_code", read_only=True, default=""
    )
    pending_quantity = serializers.IntegerField(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    material_allocations = AssignmentMaterialAllocationSerializer(
        many=True, read_only=True
    )
    receiving_records = AssemblyReceivingRecordSerializer(many=True, read_only=True)

    class Meta:
        model = AssemblyAssignment
        fields = [
            "id",
            "assignment_code",
            "order_id",
            "order_number",
            "client_name",
            "order_item",
            "production_job",
            "item_name",
            "lanyard_size_name",
            "assignment_mode",
            "labourer",
            "labourer_name",
            "assigned_machine",
            "assigned_machine_code",
            "is_machine_override",
            "machine_override_reason",
            "assigned_quantity",
            "received_usable_quantity",
            "received_defective_quantity",
            "pending_quantity",
            "status",
            "status_display",
            "is_reconciled",
            "assigned_date",
            "completed_at",
            "reconciled_at",
            "notes",
            "material_allocations",
            "receiving_records",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
