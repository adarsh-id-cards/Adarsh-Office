"""Django admin registration for Stock Audit models."""
from django.contrib import admin

from .models import StockAudit, StockAuditLine


@admin.register(StockAudit)
class StockAuditAdmin(admin.ModelAdmin):
    list_display = ("audit_code", "audit_date", "location", "status", "conducted_by_username")
    list_filter = ("status",)


@admin.register(StockAuditLine)
class StockAuditLineAdmin(admin.ModelAdmin):
    list_display = (
        "audit",
        "material",
        "expected_usable_quantity",
        "physical_usable_quantity",
        "difference_quantity",
    )
