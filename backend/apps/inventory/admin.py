from django.contrib import admin

from .models import (
    DefectiveRecord,
    InventoryBalance,
    Material,
    MaterialPackaging,
    StockLocation,
    StockMovement,
)


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "category", "base_unit", "minimum_stock_level", "is_active")
    list_filter = ("category", "base_unit", "is_active")
    search_fields = ("name", "code")


@admin.register(MaterialPackaging)
class MaterialPackagingAdmin(admin.ModelAdmin):
    list_display = ("material", "package_name", "units_per_package", "vendor_label", "is_active")


@admin.register(StockLocation)
class StockLocationAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "location_type", "labourer", "is_active")


@admin.register(InventoryBalance)
class InventoryBalanceAdmin(admin.ModelAdmin):
    list_display = ("location", "material", "usable_quantity", "defective_quantity", "updated_at")
    readonly_fields = ("usable_quantity", "defective_quantity", "updated_at")


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = (
        "transaction_code",
        "movement_type",
        "material",
        "quantity",
        "source_location",
        "destination_location",
        "created_at",
    )
    readonly_fields = [f.name for f in StockMovement._meta.fields]


@admin.register(DefectiveRecord)
class DefectiveRecordAdmin(admin.ModelAdmin):
    list_display = ("created_at", "defect_category", "discovery_stage", "material", "quantity", "reason")
