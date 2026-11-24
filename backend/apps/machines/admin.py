"""Django admin registration for Machine models."""
from django.contrib import admin

from .models import Machine, MachineAllocation


@admin.register(Machine)
class MachineAdmin(admin.ModelAdmin):
    list_display = ("machine_code", "name", "supported_size_label", "status", "current_holder")
    list_filter = ("status", "supported_size_label")
    search_fields = ("machine_code", "name")


@admin.register(MachineAllocation)
class MachineAllocationAdmin(admin.ModelAdmin):
    list_display = ("machine", "labourer", "allocated_date", "returned_date", "is_active")
    list_filter = ("is_active", "return_condition")
