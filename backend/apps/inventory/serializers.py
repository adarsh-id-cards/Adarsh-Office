"""Serializers for Central Inventory, Materials, Packaging, Balances, Movements, and Defects."""
from rest_framework import serializers

from .models import (
    DefectCategory,
    DefectDiscoveryStage,
    DefectiveRecord,
    InventoryBalance,
    Material,
    MaterialPackaging,
    MovementType,
    StockLocation,
    StockMovement,
)


class MaterialPackagingSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaterialPackaging
        fields = [
            "id",
            "material",
            "package_name",
            "units_per_package",
            "vendor_label",
            "is_default",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "material", "created_at", "updated_at"]


class MaterialSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    base_unit_label = serializers.CharField(source="get_base_unit_display", read_only=True)
    packagings = MaterialPackagingSerializer(many=True, read_only=True)
    office_usable_stock = serializers.IntegerField(read_only=True, default=0)
    office_defective_stock = serializers.IntegerField(read_only=True, default=0)
    labour_usable_stock = serializers.IntegerField(read_only=True, default=0)
    total_company_usable_stock = serializers.SerializerMethodField()

    class Meta:
        model = Material
        fields = [
            "id",
            "code",
            "name",
            "category",
            "category_label",
            "base_unit",
            "base_unit_label",
            "supported_size_label",
            "minimum_stock_level",
            "is_active",
            "is_archived",
            "notes",
            "office_usable_stock",
            "office_defective_stock",
            "labour_usable_stock",
            "total_company_usable_stock",
            "packagings",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "office_usable_stock",
            "office_defective_stock",
            "labour_usable_stock",
            "total_company_usable_stock",
            "packagings",
            "created_at",
            "updated_at",
        ]

    def get_total_company_usable_stock(self, obj: Material) -> int:
        return int(getattr(obj, "office_usable_stock", 0) or 0) + int(
            getattr(obj, "labour_usable_stock", 0) or 0
        )


class StockLocationSerializer(serializers.ModelSerializer):
    location_type_label = serializers.CharField(
        source="get_location_type_display", read_only=True
    )
    labourer_name = serializers.CharField(
        source="labourer.name", read_only=True, default=""
    )

    class Meta:
        model = StockLocation
        fields = [
            "id",
            "code",
            "name",
            "location_type",
            "location_type_label",
            "labourer",
            "labourer_name",
            "is_active",
        ]
        read_only_fields = fields


class InventoryBalanceSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source="material.name", read_only=True)
    material_code = serializers.CharField(source="material.code", read_only=True)
    material_category = serializers.CharField(source="material.category", read_only=True)
    material_category_label = serializers.CharField(
        source="material.get_category_display", read_only=True
    )
    base_unit = serializers.CharField(source="material.base_unit", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)
    location_type = serializers.CharField(source="location.location_type", read_only=True)
    labourer_id = serializers.UUIDField(
        source="location.labourer_id", read_only=True, default=None
    )

    class Meta:
        model = InventoryBalance
        fields = [
            "id",
            "material",
            "material_name",
            "material_code",
            "material_category",
            "material_category_label",
            "base_unit",
            "location",
            "location_name",
            "location_type",
            "labourer_id",
            "usable_quantity",
            "defective_quantity",
            "updated_at",
        ]
        read_only_fields = fields


class StockMovementSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source="material.name", read_only=True)
    base_unit = serializers.CharField(source="material.base_unit", read_only=True)
    movement_type_label = serializers.CharField(
        source="get_movement_type_display", read_only=True
    )
    source_location_name = serializers.CharField(
        source="source_location.name", read_only=True, default=""
    )
    destination_location_name = serializers.CharField(
        source="destination_location.name", read_only=True, default=""
    )
    package_name = serializers.CharField(
        source="packaging.package_name", read_only=True, default=""
    )

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "transaction_code",
            "material",
            "material_name",
            "base_unit",
            "movement_type",
            "movement_type_label",
            "quantity",
            "usable_quantity",
            "defective_quantity",
            "source_location",
            "source_location_name",
            "destination_location",
            "destination_location_name",
            "source_usable_delta",
            "destination_usable_delta",
            "packaging",
            "package_name",
            "package_count",
            "units_per_package_snapshot",
            "vendor_label_snapshot",
            "related_order",
            "related_assignment",
            "related_audit",
            "created_by",
            "created_by_username",
            "notes",
            "created_at",
        ]
        read_only_fields = fields


class StockInCreateInputSerializer(serializers.Serializer):
    material = serializers.PrimaryKeyRelatedField(queryset=Material.objects.all())
    packaging = serializers.PrimaryKeyRelatedField(
        queryset=MaterialPackaging.objects.all(),
        required=False,
        allow_null=True,
        default=None,
    )
    package_count = serializers.IntegerField(
        min_value=1, required=False, allow_null=True, default=None
    )
    quantity = serializers.IntegerField(
        min_value=1, required=False, allow_null=True, default=None
    )
    defective_quantity = serializers.IntegerField(min_value=0, required=False, default=0)
    movement_type = serializers.ChoiceField(
        choices=[MovementType.STOCK_IN, MovementType.OPENING_STOCK],
        required=False,
        default=MovementType.STOCK_IN,
    )
    idempotency_key = serializers.CharField(
        max_length=64, required=False, allow_blank=True, default=""
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class DefectiveRecordSerializer(serializers.ModelSerializer):
    defect_category_label = serializers.CharField(
        source="get_defect_category_display", read_only=True
    )
    discovery_stage_label = serializers.CharField(
        source="get_discovery_stage_display", read_only=True
    )
    material_name = serializers.CharField(
        source="material.name", read_only=True, default=""
    )
    location_name = serializers.CharField(
        source="location.name", read_only=True, default=""
    )
    order_number = serializers.CharField(
        source="related_order.order_number", read_only=True, default=""
    )

    class Meta:
        model = DefectiveRecord
        fields = [
            "id",
            "defect_category",
            "defect_category_label",
            "discovery_stage",
            "discovery_stage_label",
            "material",
            "material_name",
            "location",
            "location_name",
            "related_order",
            "order_number",
            "related_order_item",
            "related_assignment",
            "stock_movement",
            "quantity",
            "reason",
            "disposition",
            "recorded_by",
            "recorded_by_username",
            "notes",
            "created_at",
        ]
        read_only_fields = fields
