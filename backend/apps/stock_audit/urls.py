"""URL routes for `/api/v1/audits/*`."""
from django.urls import path

from .views import (
    StockAuditApproveView,
    StockAuditCountsUpdateView,
    StockAuditDetailView,
    StockAuditListCreateView,
    StockAuditSubmitView,
)

app_name = "stock_audit"

urlpatterns = [
    path("", StockAuditListCreateView.as_view(), name="audit-list-create"),
    path("<uuid:audit_id>/", StockAuditDetailView.as_view(), name="audit-detail"),
    path(
        "<uuid:audit_id>/counts/",
        StockAuditCountsUpdateView.as_view(),
        name="audit-counts",
    ),
    path(
        "<uuid:audit_id>/submit/",
        StockAuditSubmitView.as_view(),
        name="audit-submit",
    ),
    path(
        "<uuid:audit_id>/approve/",
        StockAuditApproveView.as_view(),
        name="audit-approve",
    ),
]
