"""Views for Central Inventory, Materials, Packaging, Stock-In, Transfers, Consumption, and Defects."""
from django.db.models import Q, QuerySet, Sum, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasModulePermission
from apps.audit_logs.services import record_audit_log
from apps.labour.models import Labourer

from .models import (
    DefectDiscoveryStage,
    DefectiveRecord,
    InventoryBalance,
    Material,
    MaterialPackaging,
    MovementType,
    StockLocation,
    StockLocationType,
    StockMovement,
)
from .serializers import (
    DefectiveRecordSerializer,
    InventoryBalanceSerializer,
    MaterialPackagingSerializer,
    MaterialSerializer,
    StockInCreateInputSerializer,
    StockMovementSerializer,
)
from .services import (
    compute_office_consumption_formula,
    ensure_labourer_stock_location,
    get_main_office_location,
    record_material_consumption_or_defect,
    record_stock_in,
    return_material_from_labourer,
    transfer_material_to_labourer,
    verify_ledger_reconciliation,
)


def annotate_material_balances(queryset: QuerySet[Material]) -> QuerySet[Material]:
    """Annotate Material queryset with Main Office and Labourer stock totals without N+1 queries."""
    return queryset.prefetch_related("packagings").annotate(
        office_usable_stock=Coalesce(
            Sum(
                "balances__usable_quantity",
                filter=Q(balances__location__location_type=StockLocationType.MAIN_OFFICE),
            ),
            Value(0),
        ),
        office_defective_stock=Coalesce(
            Sum(
                "balances__defective_quantity",
                filter=Q(balances__location__location_type=StockLocationType.MAIN_OFFICE),
            ),
            Value(0),
        ),
        labour_usable_stock=Coalesce(
            Sum(
                "balances__usable_quantity",
                filter=Q(balances__location__location_type=StockLocationType.LABOURER),
            ),
            Value(0),
        ),
    )


class MaterialListCreateAPIView(generics.ListCreateAPIView):
    """List or create raw material catalog records (`GET/POST /api/v1/materials/`)."""

    serializer_class = MaterialSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]

    @property
    def required_permission(self) -> str:
        if self.request.method == "POST":
            return "inventory.manage"
        return "inventory.view"

    def get_queryset(self) -> QuerySet[Material]:
        get_main_office_location()
        qs = annotate_material_balances(Material.objects.filter(is_archived=False))
        category = (self.request.query_params.get("category") or "").strip()
        search = (self.request.query_params.get("search") or "").strip()
        if category:
            qs = qs.filter(category=category)
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search))
        return qs.order_by("category", "name")

    def perform_create(self, serializer: MaterialSerializer) -> None:
        mat = serializer.save()
        record_audit_log(
            action="MATERIAL_CREATED",
            module="inventory",
            summary=f"Created material '{mat.name}' ({mat.code}).",
            actor=self.request.user,
            target_type="Material",
            target_id=str(mat.id),
            request=self.request,
        )


class MaterialPackagingListCreateAPIView(generics.ListCreateAPIView):
    """List or add vendor packaging configurations for a Material (`GET/POST /api/v1/materials/{id}/packaging/`)."""

    serializer_class = MaterialPackagingSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    pagination_class = None

    @property
    def required_permission(self) -> str:
        if self.request.method == "POST":
            return "inventory.manage"
        return "inventory.view"

    def get_queryset(self) -> QuerySet[MaterialPackaging]:
        material = get_object_or_404(Material, pk=self.kwargs["pk"])
        return material.packagings.filter(is_active=True).order_by("units_per_package")

    def perform_create(self, serializer: MaterialPackagingSerializer) -> None:
        material = get_object_or_404(Material, pk=self.kwargs["pk"])
        pkg = serializer.save(material=material)
        record_audit_log(
            action="MATERIAL_PACKAGING_CREATED",
            module="inventory",
            summary=f"Added packaging '{pkg.package_name}' ({pkg.units_per_package} units) for '{material.name}'.",
            actor=self.request.user,
            target_type="MaterialPackaging",
            target_id=str(pkg.id),
            request=self.request,
        )


class InventoryBalanceListAPIView(generics.ListAPIView):
    """List current inventory balances across Main Office and Labourers (`GET /api/v1/inventory/balances/`)."""

    serializer_class = InventoryBalanceSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "inventory.view"
    pagination_class = None

    def get_queryset(self) -> QuerySet[InventoryBalance]:
        get_main_office_location()
        qs = InventoryBalance.objects.select_related("material", "location").all()
        loc_type = (self.request.query_params.get("location_type") or "").strip()
        labourer_id = (self.request.query_params.get("labourer") or "").strip()
        material_id = (self.request.query_params.get("material") or "").strip()
        if loc_type:
            qs = qs.filter(location__location_type=loc_type)
        if labourer_id:
            qs = qs.filter(location__labourer_id=labourer_id)
        if material_id:
            qs = qs.filter(material_id=material_id)
        return qs.order_by("location__location_type", "location__name", "material__name")


class StockMovementListAPIView(generics.ListAPIView):
    """List immutable stock ledger movements (`GET /api/v1/inventory/movements/`)."""

    serializer_class = StockMovementSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "inventory.view"

    def get_queryset(self) -> QuerySet[StockMovement]:
        qs = StockMovement.objects.select_related(
            "material",
            "source_location",
            "destination_location",
            "packaging",
            "created_by",
        ).all()
        material_id = (self.request.query_params.get("material") or "").strip()
        movement_type = (self.request.query_params.get("movement_type") or "").strip()
        labourer_id = (self.request.query_params.get("labourer") or "").strip()
        if material_id:
            qs = qs.filter(material_id=material_id)
        if movement_type:
            qs = qs.filter(movement_type=movement_type)
        if labourer_id:
            qs = qs.filter(
                Q(source_location__labourer_id=labourer_id)
                | Q(destination_location__labourer_id=labourer_id)
            )
        return qs.order_by("-created_at")


class StockInAPIView(APIView):
    """Record stock received or opening stock (`POST /api/v1/inventory/stock-in/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "inventory.manage"

    def post(self, request: Request, *args, **kwargs) -> Response:
        serializer = StockInCreateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        movement = record_stock_in(
            material=data["material"],
            packaging=data.get("packaging"),
            package_count=data.get("package_count"),
            quantity=data.get("quantity"),
            defective_quantity=data.get("defective_quantity", 0),
            movement_type=data.get("movement_type", MovementType.STOCK_IN),
            idempotency_key=data.get("idempotency_key"),
            notes=data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        return Response(
            StockMovementSerializer(movement).data,
            status=status.HTTP_201_CREATED,
        )


class InventoryTransferAPIView(APIView):
    """Transfer raw materials between Main Office and a Labourer (`POST /api/v1/inventory/transfers/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "inventory.manage"

    def post(self, request: Request, *args, **kwargs) -> Response:
        material = get_object_or_404(Material, pk=request.data.get("material"))
        labourer = get_object_or_404(Labourer, pk=request.data.get("labourer"))
        direction = str(request.data.get("direction", "to_labourer")).strip()

        if direction == "to_office":
            usable_qty = int(request.data.get("usable_quantity", request.data.get("quantity", 0)))
            def_qty = int(request.data.get("defective_quantity", 0))
            movement = return_material_from_labourer(
                material=material,
                labourer=labourer,
                usable_quantity=usable_qty,
                defective_quantity=def_qty,
                idempotency_key=request.data.get("idempotency_key"),
                notes=str(request.data.get("notes", "")),
                actor=request.user,
                request=request,
            )
        else:
            pkg_id = request.data.get("packaging")
            packaging = get_object_or_404(MaterialPackaging, pk=pkg_id) if pkg_id else None
            pkg_count = request.data.get("package_count")
            raw_qty = request.data.get("quantity")

            movement = transfer_material_to_labourer(
                material=material,
                labourer=labourer,
                packaging=packaging,
                package_count=int(pkg_count) if pkg_count is not None else None,
                quantity=int(raw_qty) if raw_qty is not None else None,
                idempotency_key=request.data.get("idempotency_key"),
                notes=str(request.data.get("notes", "")),
                actor=request.user,
                request=request,
            )

        return Response(
            StockMovementSerializer(movement).data,
            status=status.HTTP_201_CREATED,
        )


class OfficeConsumptionAPIView(APIView):
    """Inspect automatic office consumption reconciliation or record manual office consumption (`GET/POST /api/v1/inventory/consumption/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]

    @property
    def required_permission(self) -> str:
        if self.request.method == "POST":
            return "inventory.manage"
        return "inventory.view"

    def get(self, request: Request, *args, **kwargs) -> Response:
        material_id = (request.query_params.get("material") or "").strip()
        raw_closing = request.query_params.get("closing_physical_stock")
        closing_val = int(raw_closing) if raw_closing is not None and raw_closing != "" else None

        if material_id:
            mat = get_object_or_404(Material, pk=material_id)
            return Response(compute_office_consumption_formula(mat, closing_val))

        summaries = [
            compute_office_consumption_formula(mat)
            for mat in Material.objects.filter(is_archived=False).order_by("category", "name")
        ]
        return Response(summaries)

    def post(self, request: Request, *args, **kwargs) -> Response:
        material = get_object_or_404(Material, pk=request.data.get("material"))
        quantity = int(request.data.get("quantity", 0))
        reason = str(request.data.get("reason", request.data.get("notes", ""))).strip()
        if not reason:
            return Response(
                {
                    "status": "error",
                    "error": {
                        "code": "validation_error",
                        "message": "A reason is required for manual office consumption entries.",
                        "details": {"reason": ["Reason is required."]},
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        office_loc = get_main_office_location()
        movements = record_material_consumption_or_defect(
            material=material,
            location=office_loc,
            consumed_quantity=quantity,
            defective_quantity=0,
            movement_type=MovementType.INTERNAL_CONSUMPTION,
            notes=reason,
            actor=request.user,
            request=request,
        )
        return Response(
            StockMovementSerializer(movements[0]).data,
            status=status.HTTP_201_CREATED,
        )


class DefectiveRecordListCreateAPIView(APIView):
    """List or record defective materials / products (`GET/POST /api/v1/inventory/defects/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]

    @property
    def required_permission(self) -> str:
        if self.request.method == "POST":
            return "inventory.manage"
        return "inventory.view"

    def get(self, request: Request, *args, **kwargs) -> Response:
        qs = DefectiveRecord.objects.select_related(
            "material", "location", "related_order"
        ).all()
        category = (request.query_params.get("defect_category") or "").strip()
        stage = (request.query_params.get("discovery_stage") or "").strip()
        if category:
            qs = qs.filter(defect_category=category)
        if stage:
            qs = qs.filter(discovery_stage=stage)
        return Response(DefectiveRecordSerializer(qs[:100], many=True).data)

    def post(self, request: Request, *args, **kwargs) -> Response:
        material_id = request.data.get("material")
        material = get_object_or_404(Material, pk=material_id)
        qty = int(request.data.get("quantity", 0))
        reason = str(request.data.get("reason", "")).strip()
        stage = str(
            request.data.get("discovery_stage", DefectDiscoveryStage.PRINTING_DAMAGE)
        ).strip()
        labourer_id = request.data.get("labourer")

        if not reason:
            return Response(
                {
                    "status": "error",
                    "error": {
                        "code": "validation_error",
                        "message": "Defect reason is required.",
                        "details": {"reason": ["Defect reason is required."]},
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if labourer_id:
            labourer = get_object_or_404(Labourer, pk=labourer_id)
            target_loc = ensure_labourer_stock_location(labourer)
        else:
            target_loc = get_main_office_location()

        movements = record_material_consumption_or_defect(
            material=material,
            location=target_loc,
            consumed_quantity=0,
            defective_quantity=qty,
            discovery_stage=stage,
            notes=reason,
            actor=request.user,
            request=request,
        )
        defect_rec = DefectiveRecord.objects.filter(stock_movement=movements[-1]).first()
        return Response(
            DefectiveRecordSerializer(defect_rec).data,
            status=status.HTTP_201_CREATED,
        )


class InventoryReconcileAPIView(APIView):
    """Independently verify projected InventoryBalance vs. immutable StockMovement ledger (`GET /api/v1/inventory/reconcile/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "inventory.view"

    def get(self, request: Request, *args, **kwargs) -> Response:
        balances = InventoryBalance.objects.select_related("material", "location").all()
        checks = [verify_ledger_reconciliation(b.material, b.location) for b in balances]
        all_ok = all(c["is_reconciled"] for c in checks)
        return Response(
            {
                "all_reconciled": all_ok,
                "checked_pairs": len(checks),
                "results": checks,
            },
            status=status.HTTP_200_OK,
        )
