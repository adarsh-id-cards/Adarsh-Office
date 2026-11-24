"""Read-only API views for inspecting system audit logs."""
from django.db.models import QuerySet
from rest_framework import generics, permissions

from apps.accounts.permissions import HasModulePermission

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogListAPIView(generics.ListAPIView):
    """List recent audit log entries (`GET /api/v1/audit-logs/`).

    Restricted to Owner/Admin or roles granted `audit_logs.view`.
    Supports optional query filtering by `module` and `action`.
    """

    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "audit_logs.view"

    def get_queryset(self) -> QuerySet[AuditLog]:
        queryset = AuditLog.objects.select_related("actor").all()
        module = self.request.query_params.get("module")
        action = self.request.query_params.get("action")
        if module:
            queryset = queryset.filter(module=module)
        if action:
            queryset = queryset.filter(action=action)
        return queryset
