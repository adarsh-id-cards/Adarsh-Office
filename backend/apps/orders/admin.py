from django.contrib import admin

from .models import Order, OrderItem, OrderSequence, OrderStatusHistory


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ("id", "created_at", "updated_at")


class OrderStatusHistoryInline(admin.TabularInline):
    model = OrderStatusHistory
    extra = 0
    readonly_fields = (
        "id",
        "previous_status",
        "new_status",
        "changed_by",
        "changed_by_username",
        "reason",
        "created_at",
    )


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "order_number",
        "order_type",
        "client",
        "original_order",
        "order_date",
        "status",
        "created_by",
    )
    list_filter = ("order_type", "status", "order_date")
    search_fields = ("order_number", "client__name", "notes")
    readonly_fields = ("id", "order_number", "created_at", "updated_at")
    inlines = [OrderItemInline, OrderStatusHistoryInline]


@admin.register(OrderSequence)
class OrderSequenceAdmin(admin.ModelAdmin):
    list_display = ("key", "last_value")
