from django.contrib import admin

from .models import PrintingRun, ProductionJob, ProductionStatusHistory


class PrintingRunInline(admin.TabularInline):
    model = PrintingRun
    extra = 0
    readonly_fields = ("id", "run_identifier", "completed_at", "created_at", "updated_at")


class ProductionStatusHistoryInline(admin.TabularInline):
    model = ProductionStatusHistory
    extra = 0
    readonly_fields = (
        "id",
        "stage",
        "previous_status",
        "new_status",
        "changed_by",
        "changed_by_username",
        "summary",
        "created_at",
    )


@admin.register(ProductionJob)
class ProductionJobAdmin(admin.ModelAdmin):
    list_display = (
        "order_item",
        "current_stage",
        "design_status",
        "printing_status",
        "assembly_status",
        "successful_printed_quantity",
        "is_production_completed",
        "is_ready_for_dispatch",
    )
    list_filter = (
        "current_stage",
        "design_status",
        "printing_status",
        "assembly_status",
        "is_production_completed",
        "is_ready_for_dispatch",
    )
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = [PrintingRunInline, ProductionStatusHistoryInline]
