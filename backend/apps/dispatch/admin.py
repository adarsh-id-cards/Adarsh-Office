"""Django admin registration for Dispatch & Surplus models."""
from django.contrib import admin

from .models import (
    ClientSurplusRecord,
    DispatchItem,
    DispatchRecord,
    OfficeSurplusPool,
    ReplacementSurplusAllocation,
)


@admin.register(DispatchRecord)
class DispatchRecordAdmin(admin.ModelAdmin):
    list_display = ("dispatch_number", "order", "dispatch_date", "packing_verified")


@admin.register(DispatchItem)
class DispatchItemAdmin(admin.ModelAdmin):
    list_display = (
        "dispatch_record",
        "order_item",
        "quantity_dispatched_for_order",
        "extra_dispatched_to_client",
        "extra_retained_in_office",
    )


@admin.register(OfficeSurplusPool)
class OfficeSurplusPoolAdmin(admin.ModelAdmin):
    list_display = (
        "surplus_code",
        "client",
        "item_name",
        "initial_quantity",
        "allocated_quantity",
        "remaining_quantity",
    )


@admin.register(ClientSurplusRecord)
class ClientSurplusRecordAdmin(admin.ModelAdmin):
    list_display = ("order", "client", "order_item", "quantity_sent", "dispatch_date")


@admin.register(ReplacementSurplusAllocation)
class ReplacementSurplusAllocationAdmin(admin.ModelAdmin):
    list_display = (
        "surplus_pool",
        "replacement_order",
        "replacement_order_item",
        "quantity_allocated",
    )
