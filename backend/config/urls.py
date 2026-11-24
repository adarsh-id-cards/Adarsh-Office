"""Root URL configuration for Pro Office backend.

All REST API endpoints are versioned under `/api/v1/`.
"""
from django.contrib import admin
from django.urls import include, path

api_v1_patterns = [
    path("", include("apps.common.urls")),
    path("auth/", include("apps.accounts.urls")),
    path("audit-logs/", include("apps.audit_logs.urls")),
    path("catalog/", include("apps.catalog.urls")),
    path("clients/", include("apps.clients.urls")),
    path("orders/", include("apps.orders.urls")),
    path("order-items/", include("apps.orders.item_urls")),
    path("production/", include("apps.production.urls")),
    path("printing-runs/", include("apps.production.printing_run_urls")),
    path("labourers/", include("apps.labour.urls")),
    path("seasonal-closings/", include("apps.labour.seasonal_urls")),
    path("machines/", include("apps.machines.urls")),
    path("materials/", include("apps.inventory.material_urls")),
    path("inventory/", include("apps.inventory.urls")),
    path("assembly/", include("apps.assembly.urls")),
    path("audits/", include("apps.stock_audit.urls")),
    path("dispatch/", include("apps.dispatch.urls")),
    path("surplus/", include("apps.dispatch.surplus_urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include((api_v1_patterns, "v1"), namespace="v1")),
]
