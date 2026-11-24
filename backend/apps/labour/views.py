"""API Views for Labourer management and Seasonal Closing (Phase 4 — Sections 3, 14)."""
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasModulePermission
from apps.inventory.models import InventoryBalance, StockMovement
from apps.inventory.serializers import (
    InventoryBalanceSerializer,
    StockMovementSerializer,
)
from apps.inventory.services import ensure_labourer_stock_location

from .models import Labourer, SeasonalClosing
from .serializers import (
    LabourerCreateUpdateSerializer,
    LabourerListSerializer,
    SeasonalClosingSerializer,
)
from .services import (
    create_labourer,
    create_seasonal_closing,
    reconcile_seasonal_closing,
)


class LabourerListCreateView(APIView):
    """GET / POST `/api/v1/labourers/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]

    @property
    def required_permission(self) -> str:
        return "labour.manage" if self.request.method == "POST" else "labour.view"

    def get(self, request: Request) -> Response:
        qs = Labourer.objects.select_related("stock_location").prefetch_related(
            "allocated_machines",
            "assembly_assignments",
        )
        active_filter = (request.query_params.get("is_active") or "").strip().lower()
        if active_filter in {"true", "1"}:
            qs = qs.filter(is_active=True, is_archived=False)
        elif active_filter in {"false", "0"}:
            qs = qs.filter(is_active=False)

        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(contact_number__icontains=search))

        size_filter = (request.query_params.get("supported_size") or "").strip()
        labourers = list(qs)

        results = LabourerListSerializer(labourers, many=True).data
        if size_filter:
            for item in results:
                item["is_compatible_with_requested_size"] = any(
                    s.lower() == size_filter.lower()
                    for s in item.get("supported_lanyard_sizes", [])
                )
        return Response({"results": results}, status=status.HTTP_200_OK)

    def post(self, request: Request) -> Response:
        serializer = LabourerCreateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        labourer = create_labourer(
            name=data["name"],
            contact_number=data.get("contact_number", ""),
            is_active=data.get("is_active", True),
            joined_date=data.get("joined_date"),
            notes=data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        return Response(
            LabourerListSerializer(labourer).data,
            status=status.HTTP_201_CREATED,
        )


class LabourerDetailView(APIView):
    """GET / PATCH `/api/v1/labourers/{id}/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]

    @property
    def required_permission(self) -> str:
        return "labour.manage" if self.request.method in {"PATCH", "PUT"} else "labour.view"

    def get(self, request: Request, labourer_id) -> Response:
        labourer = get_object_or_404(
            Labourer.objects.select_related("stock_location").prefetch_related(
                "allocated_machines",
                "machine_allocations__machine",
                "seasonal_closings__material_lines__material",
                "seasonal_closings__machine_lines__machine",
            ),
            pk=labourer_id,
        )
        loc = ensure_labourer_stock_location(labourer)
        movements = (
            StockMovement.objects.filter(
                Q(source_location=loc) | Q(destination_location=loc)
            )
            .select_related("material", "source_location", "destination_location", "packaging")
            .order_by("-created_at")[:100]
        )

        assignments_data = []
        if hasattr(labourer, "assembly_assignments"):
            from apps.assembly.serializers import AssemblyAssignmentSerializer

            assignments_qs = (
                labourer.assembly_assignments.select_related(
                    "order_item__order__client",
                    "order_item__lanyard_size_option",
                    "production_job",
                    "labourer",
                )
                .prefetch_related(
                    "material_allocations__material",
                    "material_allocations__packaging",
                    "receiving_records",
                )
                .order_by("-created_at")
            )
            assignments_data = AssemblyAssignmentSerializer(assignments_qs, many=True).data

        data = LabourerListSerializer(labourer).data
        data["assignments"] = assignments_data
        data["material_movements"] = StockMovementSerializer(movements, many=True).data
        data["seasonal_closings"] = SeasonalClosingSerializer(
            labourer.seasonal_closings.all(), many=True
        ).data
        return Response(data, status=status.HTTP_200_OK)

    def patch(self, request: Request, labourer_id) -> Response:
        labourer = get_object_or_404(Labourer, pk=labourer_id)
        for field in ["name", "contact_number", "notes"]:
            if field in request.data:
                setattr(labourer, field, request.data.get(field) or "")
        if "is_active" in request.data:
            labourer.is_active = bool(request.data.get("is_active"))
        if "joined_date" in request.data and request.data.get("joined_date"):
            labourer.joined_date = request.data.get("joined_date")
        labourer.save()
        ensure_labourer_stock_location(labourer)
        return Response(LabourerListSerializer(labourer).data, status=status.HTTP_200_OK)


class LabourerAssignmentsView(APIView):
    """GET `/api/v1/labourers/{id}/assignments/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "labour.view"

    def get(self, request: Request, labourer_id) -> Response:
        labourer = get_object_or_404(Labourer, pk=labourer_id)
        from apps.assembly.serializers import AssemblyAssignmentSerializer

        assignments_qs = (
            labourer.assembly_assignments.select_related(
                "order_item__order__client",
                "order_item__lanyard_size_option",
                "production_job",
                "labourer",
            )
            .prefetch_related(
                "material_allocations__material",
                "material_allocations__packaging",
                "receiving_records",
            )
            .order_by("-created_at")
        )
        return Response(
            {"results": AssemblyAssignmentSerializer(assignments_qs, many=True).data},
            status=status.HTTP_200_OK,
        )


class LabourerInventoryView(APIView):
    """GET `/api/v1/labourers/{id}/inventory/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "labour.view"

    def get(self, request: Request, labourer_id) -> Response:
        labourer = get_object_or_404(Labourer, pk=labourer_id)
        loc = ensure_labourer_stock_location(labourer)
        balances = InventoryBalance.objects.filter(location=loc).select_related(
            "material", "location"
        )
        movements = (
            StockMovement.objects.filter(
                Q(source_location=loc) | Q(destination_location=loc)
            )
            .select_related("material", "source_location", "destination_location", "packaging")
            .order_by("-created_at")[:100]
        )
        return Response(
            {
                "labourer_id": str(labourer.id),
                "labourer_name": labourer.name,
                "location_id": str(loc.id),
                "balances": InventoryBalanceSerializer(balances, many=True).data,
                "movements": StockMovementSerializer(movements, many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class SeasonalClosingListCreateView(APIView):
    """GET / POST `/api/v1/seasonal-closings/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]

    @property
    def required_permission(self) -> str:
        return "labour.manage" if self.request.method == "POST" else "labour.view"

    def get(self, request: Request) -> Response:
        qs = SeasonalClosing.objects.select_related(
            "labourer", "reconciled_by"
        ).prefetch_related("material_lines__material", "machine_lines__machine")
        labourer_id = (request.query_params.get("labourer") or "").strip()
        if labourer_id:
            qs = qs.filter(labourer_id=labourer_id)
        return Response(
            {"results": SeasonalClosingSerializer(qs, many=True).data},
            status=status.HTTP_200_OK,
        )

    def post(self, request: Request) -> Response:
        labourer = get_object_or_404(Labourer, pk=request.data.get("labourer"))
        closing = create_seasonal_closing(
            labourer=labourer,
            season_label=request.data.get("season_label", "Annual Production Season"),
            closing_date=request.data.get("closing_date"),
            notes=request.data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        return Response(
            SeasonalClosingSerializer(closing).data,
            status=status.HTTP_201_CREATED,
        )


class SeasonalClosingReconcileView(APIView):
    """POST `/api/v1/seasonal-closings/{id}/reconcile/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "labour.manage"

    def post(self, request: Request, closing_id) -> Response:
        closing = get_object_or_404(SeasonalClosing, pk=closing_id)
        reconciled = reconcile_seasonal_closing(
            closing=closing,
            material_lines=request.data.get("material_lines"),
            machine_lines=request.data.get("machine_lines"),
            mark_labourer_inactive=bool(request.data.get("mark_labourer_inactive", False)),
            notes=request.data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        return Response(
            SeasonalClosingSerializer(reconciled).data,
            status=status.HTTP_200_OK,
        )
