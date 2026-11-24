"""Serializers for Weekly Physical Stock Audit endpoints (Section 13)."""
from rest_framework import serializers

from .models import StockAudit, StockAuditLine


class StockAuditLineSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source="material.name", read_only=True)
    material_code = serializers.CharField(source="material.code", read_only=True)
    material_category = serializers.CharField(source="material.category", read_only=True)
    base_unit = serializers.CharField(source="material.base_unit", read_only=True)
    adjustment_transaction_code = serializers.CharField(
        source="adjustment_movement.transaction_code", read_only=True, default=""
    )

    class Meta:
        model = StockAuditLine
        fields = [
            "id",
            "audit",
            "material",
            "material_name",
            "material_code",
            "material_category",
            "base_unit",
            "expected_usable_quantity",
            "physical_usable_quantity",
            "difference_quantity",
            "discrepancy_reason",
            "opening_office_stock",
            "stock_received",
            "returns_from_labourers",
            "transfers_to_labourers",
            "recorded_manual_consumption",
            "calculated_net_office_consumption",
            "unexplained_difference",
            "adjustment_movement",
            "adjustment_transaction_code",
        ]
        read_only_fields = fields


class StockAuditSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    lines = StockAuditLineSerializer(many=True, read_only=True)
    discrepancy_count = serializers.SerializerMethodField()

    class Meta:
        model = StockAudit
        fields = [
            "id",
            "audit_code",
            "audit_date",
            "location",
            "location_name",
            "status",
            "status_display",
            "conducted_by",
            "conducted_by_username",
            "submitted_at",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "notes",
            "discrepancy_count",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_discrepancy_count(self, obj: StockAudit) -> int:
        return sum(1 for l in obj.lines.all() if l.difference_quantity != 0)
