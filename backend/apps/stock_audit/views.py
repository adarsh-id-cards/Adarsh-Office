"""API Views for Weekly Physical Stock Audits (`/api/v1/audits/*`)."""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasModulePermission
from apps.inventory.models import StockLocation

from .models import StockAudit
from .serializers import StockAuditSerializer
from .services import (
    approve_stock_audit,
    create_stock_audit,
    submit_stock_audit,
    update_stock_audit_counts,
)


class StockAuditListCreateView(APIView):
    """GET / POST `/api/v1/audits/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]

    @property
    def required_permission(self) -> str:
        return "stock_audit.manage" if self.request.method == "POST" else "stock_audit.view"

    def get(self, request: Request) -> Response:
        qs = StockAudit.objects.select_related("location").prefetch_related(
            "lines__material", "lines__adjustment_movement"
        )
        return Response(
            {"results": StockAuditSerializer(qs, many=True).data},
            status=status.HTTP_200_OK,
        )

    def post(self, request: Request) -> Response:
        loc_id = request.data.get("location")
        location = StockLocation.objects.filter(pk=loc_id).first() if loc_id else None
        audit = create_stock_audit(
            location=location,
            audit_date=request.data.get("audit_date"),
            notes=request.data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        return Response(
            StockAuditSerializer(audit).data,
            status=status.HTTP_201_CREATED,
        )


class StockAuditDetailView(APIView):
    """GET `/api/v1/audits/{id}/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "stock_audit.view"

    def get(self, request: Request, audit_id) -> Response:
        audit = get_object_or_404(
            StockAudit.objects.select_related("location").prefetch_related(
                "lines__material", "lines__adjustment_movement"
            ),
            pk=audit_id,
        )
        return Response(StockAuditSerializer(audit).data, status=status.HTTP_200_OK)


class StockAuditCountsUpdateView(APIView):
    """POST `/api/v1/audits/{id}/counts/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "stock_audit.manage"

    def post(self, request: Request, audit_id) -> Response:
        audit = get_object_or_404(StockAudit, pk=audit_id)
        counts = request.data.get("counts") or request.data.get("lines") or []
        updated = update_stock_audit_counts(
            audit=audit,
            counts=counts,
            notes=request.data.get("notes"),
            actor=request.user,
            request=request,
        )
        return Response(StockAuditSerializer(updated).data, status=status.HTTP_200_OK)


class StockAuditSubmitView(APIView):
    """POST `/api/v1/audits/{id}/submit/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "stock_audit.manage"

    def post(self, request: Request, audit_id) -> Response:
        audit = get_object_or_404(StockAudit, pk=audit_id)
        if request.data.get("counts") or request.data.get("lines"):
            update_stock_audit_counts(
                audit=audit,
                counts=request.data.get("counts") or request.data.get("lines"),
                actor=request.user,
                request=request,
            )
        submitted = submit_stock_audit(
            audit=audit,
            notes=request.data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        return Response(StockAuditSerializer(submitted).data, status=status.HTTP_200_OK)


class StockAuditApproveView(APIView):
    """POST `/api/v1/audits/{id}/approve/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "stock_audit.manage"

    def post(self, request: Request, audit_id) -> Response:
        audit = get_object_or_404(StockAudit, pk=audit_id)
        if request.data.get("counts") or request.data.get("lines"):
            update_stock_audit_counts(
                audit=audit,
                counts=request.data.get("counts") or request.data.get("lines"),
                actor=request.user,
                request=request,
            )
        approved = approve_stock_audit(
            audit=audit,
            notes=request.data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        return Response(StockAuditSerializer(approved).data, status=status.HTTP_200_OK)
