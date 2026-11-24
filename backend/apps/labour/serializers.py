"""Serializers for Labourer and SeasonalClosing endpoints (Phase 4 — Sections 3, 14)."""
from rest_framework import serializers

from apps.inventory.models import InventoryBalance
from apps.inventory.serializers import InventoryBalanceSerializer
from apps.machines.serializers import MachineSerializer

from .models import (
    Labourer,
    SeasonalClosing,
    SeasonalClosingMachineLine,
    SeasonalClosingMaterialLine,
)


class LabourerListSerializer(serializers.ModelSerializer):
    allocated_machines = MachineSerializer(many=True, read_only=True)
    supported_lanyard_sizes = serializers.SerializerMethodField()
    material_balances = serializers.SerializerMethodField()
    active_assignments_count = serializers.SerializerMethodField()

    class Meta:
        model = Labourer
        fields = [
            "id",
            "name",
            "contact_number",
            "is_active",
            "is_archived",
            "joined_date",
            "notes",
            "allocated_machines",
            "supported_lanyard_sizes",
            "material_balances",
            "active_assignments_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_supported_lanyard_sizes(self, obj: Labourer) -> list[str]:
        sizes = {
            m.supported_size_label
            for m in obj.allocated_machines.all()
            if m.status == "allocated" and m.supported_size_label
        }
        return sorted(sizes)

    def get_material_balances(self, obj: Labourer) -> list[dict]:
        loc = getattr(obj, "stock_location", None)
        if loc is None:
            return []
        bals = InventoryBalance.objects.filter(location=loc).select_related("material", "location")
        return InventoryBalanceSerializer(bals, many=True).data

    def get_active_assignments_count(self, obj: Labourer) -> int:
        if hasattr(obj, "assembly_assignments"):
            return obj.assembly_assignments.exclude(
                status__in=["completed", "cancelled"]
            ).count()
        return 0


class LabourerCreateUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    contact_number = serializers.CharField(
        max_length=40, required=False, allow_blank=True, default=""
    )
    is_active = serializers.BooleanField(required=False, default=True)
    joined_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class SeasonalClosingMaterialLineSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source="material.name", read_only=True)
    material_code = serializers.CharField(source="material.code", read_only=True)
    base_unit = serializers.CharField(source="material.base_unit", read_only=True)

    class Meta:
        model = SeasonalClosingMaterialLine
        fields = [
            "id",
            "material",
            "material_name",
            "material_code",
            "base_unit",
            "expected_usable_balance",
            "actual_returned_usable",
            "actual_returned_defective",
            "missing_or_unexplained_quantity",
            "discrepancy_explanation",
        ]
        read_only_fields = fields


class SeasonalClosingMachineLineSerializer(serializers.ModelSerializer):
    machine_code = serializers.CharField(source="machine.machine_code", read_only=True)
    machine_name = serializers.CharField(source="machine.name", read_only=True)
    supported_size_label = serializers.CharField(
        source="machine.supported_size_label", read_only=True
    )

    class Meta:
        model = SeasonalClosingMachineLine
        fields = [
            "id",
            "machine",
            "machine_code",
            "machine_name",
            "supported_size_label",
            "was_returned",
            "return_condition",
            "notes",
        ]
        read_only_fields = fields


class SeasonalClosingSerializer(serializers.ModelSerializer):
    labourer_name = serializers.CharField(source="labourer.name", read_only=True)
    reconciled_by_username = serializers.CharField(
        source="reconciled_by.username", read_only=True, default=""
    )
    material_lines = SeasonalClosingMaterialLineSerializer(many=True, read_only=True)
    machine_lines = SeasonalClosingMachineLineSerializer(many=True, read_only=True)

    class Meta:
        model = SeasonalClosing
        fields = [
            "id",
            "closing_code",
            "labourer",
            "labourer_name",
            "season_label",
            "closing_date",
            "status",
            "reconciled_at",
            "reconciled_by",
            "reconciled_by_username",
            "notes",
            "material_lines",
            "machine_lines",
            "created_at",
        ]
        read_only_fields = fields
