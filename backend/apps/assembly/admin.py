"""Django admin registration for Assembly models."""
from django.contrib import admin

from .models import (
    AssemblyAssignment,
    AssemblyReceivingRecord,
    AssignmentMaterialAllocation,
)


@admin.register(AssemblyAssignment)
class AssemblyAssignmentAdmin(admin.ModelAdmin):
    list_display = (
        "assignment_code",
        "order_item",
        "assignment_mode",
        "labourer",
        "assigned_quantity",
        "received_usable_quantity",
        "status",
    )
    list_filter = ("assignment_mode", "status", "is_reconciled")


@admin.register(AssignmentMaterialAllocation)
class AssignmentMaterialAllocationAdmin(admin.ModelAdmin):
    list_display = (
        "assignment",
        "material",
        "required_quantity",
        "opening_labour_balance",
        "issued_quantity",
        "closing_labour_balance",
    )


@admin.register(AssemblyReceivingRecord)
class AssemblyReceivingRecordAdmin(admin.ModelAdmin):
    list_display = ("assignment", "received_date", "usable_quantity", "defective_quantity")
