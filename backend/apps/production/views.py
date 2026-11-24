"""API views for Phase 3 Production Management."""
from django.db.models import Q, QuerySet
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasModulePermission
from apps.orders.models import OrderItem, OrderStatus

from .models import (
    AssemblyStatus,
    DesignStatus,
    PrintingRun,
    PrintingStatus,
    ProductionJob,
)
from .serializers import (
    PrintingRunCompleteInputSerializer,
    PrintingRunCreateInputSerializer,
    PrintingRunSerializer,
    ProductionJobDetailSerializer,
    ProductionJobListSerializer,
)
from .services import (
    approve_design,
    complete_design,
    complete_id_card_production,
    complete_lanyard_assembly,
    complete_printing_run,
    create_printing_run,
    ensure_production_job_for_item,
    mark_lanyard_assembly_ready,
    override_lanyard_printing_plan,
    start_design,
    start_lanyard_assembly,
    submit_design_for_review,
)


def ensure_jobs_for_active_order_items() -> None:
    """Ensure every non-cancelled OrderItem has an initialized ProductionJob."""
    missing_items = OrderItem.objects.select_related(
        "order", "lanyard_size_option"
    ).filter(production_job__isnull=True)
    for item in missing_items:
        ensure_production_job_for_item(item)


def build_production_job_queryset() -> QuerySet[ProductionJob]:
    """Optimized queryset for listing and inspecting ProductionJobs without N+1 queries."""
    return (
        ProductionJob.objects.select_related(
            "order_item",
            "order_item__order",
            "order_item__order__client",
            "order_item__card_type_option",
            "order_item__lanyard_size_option",
            "order_item__holder_option",
            "order_item__hook_option",
            "design_responsible",
            "printing_responsible",
            "assembly_responsible",
            "plan_overridden_by",
        )
        .prefetch_related(
            "order_item__accessories",
            "printing_runs",
            "history",
        )
        .exclude(order_item__order__status=OrderStatus.CANCELLED)
    )


def filter_production_jobs_queryset(
    queryset: QuerySet[ProductionJob], request: Request
) -> QuerySet[ProductionJob]:
    """Apply Production Queue filters (Section 8)."""
    params = request.query_params

    search = (params.get("search") or "").strip()
    if search:
        queryset = queryset.filter(
            Q(order_item__item_name__icontains=search)
            | Q(order_item__order__order_number__icontains=search)
            | Q(order_item__order__client__name__icontains=search)
        )

    category = (params.get("category") or "").strip()
    if category:
        queryset = queryset.filter(order_item__category=category)

    client_id = (params.get("client") or params.get("client_id") or "").strip()
    if client_id:
        queryset = queryset.filter(order_item__order__client_id=client_id)

    order_number = (params.get("order_number") or "").strip()
    if order_number:
        queryset = queryset.filter(order_item__order__order_number__icontains=order_number)

    lanyard_size = (params.get("lanyard_size") or "").strip()
    if lanyard_size:
        queryset = queryset.filter(
            Q(order_item__lanyard_size_option_id=lanyard_size)
            | Q(order_item__lanyard_size_option__code=lanyard_size)
        )

    stage = (params.get("stage") or "").strip()
    if stage:
        queryset = queryset.filter(current_stage=stage)

    design_status = (params.get("design_status") or "").strip()
    if design_status:
        queryset = queryset.filter(design_status=design_status)

    printing_status = (params.get("printing_status") or "").strip()
    if printing_status:
        queryset = queryset.filter(printing_status=printing_status)

    assembly_status = (params.get("assembly_status") or "").strip()
    if assembly_status:
        queryset = queryset.filter(assembly_status=assembly_status)

    bucket = (params.get("bucket") or "").strip()
    if bucket == "awaiting_design":
        queryset = queryset.filter(design_status=DesignStatus.NOT_STARTED)
    elif bucket == "under_design":
        queryset = queryset.filter(
            design_status__in=[
                DesignStatus.IN_PROGRESS,
                DesignStatus.REVIEW_REQUIRED,
                DesignStatus.APPROVED,
            ]
        )
    elif bucket == "awaiting_printing":
        queryset = queryset.filter(
            design_status__in=[DesignStatus.APPROVED, DesignStatus.COMPLETED],
            printing_status=PrintingStatus.NOT_STARTED,
        )
    elif bucket == "currently_printing":
        queryset = queryset.filter(
            printing_status__in=[
                PrintingStatus.IN_PROGRESS,
                PrintingStatus.PARTIALLY_PRINTED,
            ]
        )
    elif bucket == "lanyards_ready_for_assembly":
        queryset = queryset.filter(
            order_item__category="lanyard",
            assembly_status__in=[
                AssemblyStatus.READY_FOR_ASSEMBLY,
                AssemblyStatus.IN_PROGRESS,
                AssemblyStatus.PARTIALLY_COMPLETED,
            ],
        )
    elif bucket == "incomplete_production":
        queryset = queryset.filter(is_production_completed=False)
    elif bucket == "ready_for_dispatch":
        queryset = queryset.filter(is_ready_for_dispatch=True)

    date_from = (params.get("date_from") or "").strip()
    if date_from:
        queryset = queryset.filter(order_item__order__order_date__gte=date_from)

    date_to = (params.get("date_to") or "").strip()
    if date_to:
        queryset = queryset.filter(order_item__order__order_date__lte=date_to)

    return queryset.order_by(
        "-order_item__order__order_date",
        "-order_item__order__created_at",
        "order_item__line_number",
    )


class ProductionOverviewAPIView(APIView):
    """Return operational counts for the Production Overview dashboard (`GET /api/v1/production/overview/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "production.view"

    def get(self, request: Request, *args, **kwargs) -> Response:
        ensure_jobs_for_active_order_items()
        base_qs = ProductionJob.objects.exclude(
            order_item__order__status__in=[OrderStatus.CANCELLED, OrderStatus.DRAFT]
        )

        return Response(
            {
                "total_active_jobs": base_qs.count(),
                "awaiting_design": base_qs.filter(design_status=DesignStatus.NOT_STARTED).count(),
                "under_design": base_qs.filter(
                    design_status__in=[
                        DesignStatus.IN_PROGRESS,
                        DesignStatus.REVIEW_REQUIRED,
                        DesignStatus.APPROVED,
                    ]
                ).count(),
                "awaiting_printing": base_qs.filter(
                    design_status__in=[DesignStatus.APPROVED, DesignStatus.COMPLETED],
                    printing_status=PrintingStatus.NOT_STARTED,
                ).count(),
                "currently_printing": base_qs.filter(
                    printing_status__in=[
                        PrintingStatus.IN_PROGRESS,
                        PrintingStatus.PARTIALLY_PRINTED,
                    ]
                ).count(),
                "lanyards_ready_for_assembly": base_qs.filter(
                    order_item__category="lanyard",
                    assembly_status__in=[
                        AssemblyStatus.READY_FOR_ASSEMBLY,
                        AssemblyStatus.IN_PROGRESS,
                        AssemblyStatus.PARTIALLY_COMPLETED,
                    ],
                ).count(),
                "incomplete_production": base_qs.filter(is_production_completed=False).count(),
                "ready_for_dispatch": base_qs.filter(is_ready_for_dispatch=True).count(),
            },
            status=status.HTTP_200_OK,
        )


class ProductionJobListAPIView(generics.ListAPIView):
    """List and filter production jobs (`GET /api/v1/production/jobs/` & `/api/v1/production/queue/`)."""

    serializer_class = ProductionJobListSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "production.view"

    def get_queryset(self) -> QuerySet[ProductionJob]:
        ensure_jobs_for_active_order_items()
        return filter_production_jobs_queryset(build_production_job_queryset(), self.request)


class ProductionJobDetailAPIView(generics.RetrieveAPIView):
    """Retrieve full details for a single ProductionJob (`GET /api/v1/production/jobs/{id}/`)."""

    serializer_class = ProductionJobDetailSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "production.view"

    def get_queryset(self) -> QuerySet[ProductionJob]:
        return build_production_job_queryset()


class DesignStartAPIView(APIView):
    """Start design work on a ProductionJob (`POST /api/v1/production/jobs/{id}/design/start/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "production.manage"

    def post(self, request: Request, pk: str, *args, **kwargs) -> Response:
        job = get_object_or_404(build_production_job_queryset(), pk=pk)
        start_design(
            job=job,
            notes=str(request.data.get("notes", "")),
            design_reference=str(request.data.get("design_reference", "")),
            actor=request.user,
            request=request,
        )
        refreshed = build_production_job_queryset().get(pk=job.pk)
        return Response(ProductionJobDetailSerializer(refreshed).data, status=status.HTTP_200_OK)


class DesignReviewAPIView(APIView):
    """Mark design as Review Required (`POST /api/v1/production/jobs/{id}/design/review/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "production.manage"

    def post(self, request: Request, pk: str, *args, **kwargs) -> Response:
        job = get_object_or_404(build_production_job_queryset(), pk=pk)
        submit_design_for_review(
            job=job,
            notes=str(request.data.get("notes", "")),
            design_reference=str(request.data.get("design_reference", "")),
            actor=request.user,
            request=request,
        )
        refreshed = build_production_job_queryset().get(pk=job.pk)
        return Response(ProductionJobDetailSerializer(refreshed).data, status=status.HTTP_200_OK)


class DesignApproveAPIView(APIView):
    """Approve design on a ProductionJob (`POST /api/v1/production/jobs/{id}/design/approve/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "production.manage"

    def post(self, request: Request, pk: str, *args, **kwargs) -> Response:
        job = get_object_or_404(build_production_job_queryset(), pk=pk)
        approve_design(
            job=job,
            notes=str(request.data.get("notes", "")),
            design_reference=str(request.data.get("design_reference", "")),
            actor=request.user,
            request=request,
        )
        refreshed = build_production_job_queryset().get(pk=job.pk)
        return Response(ProductionJobDetailSerializer(refreshed).data, status=status.HTTP_200_OK)


class DesignCompleteAPIView(APIView):
    """Complete design on a ProductionJob (`POST /api/v1/production/jobs/{id}/design/complete/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "production.manage"

    def post(self, request: Request, pk: str, *args, **kwargs) -> Response:
        job = get_object_or_404(build_production_job_queryset(), pk=pk)
        complete_design(
            job=job,
            notes=str(request.data.get("notes", "")),
            design_reference=str(request.data.get("design_reference", "")),
            actor=request.user,
            request=request,
        )
        refreshed = build_production_job_queryset().get(pk=job.pk)
        return Response(ProductionJobDetailSerializer(refreshed).data, status=status.HTTP_200_OK)


class PrintingPlanOverrideAPIView(APIView):
    """Override calculated lanyard batch printing plan with mandatory reason (`POST /api/v1/production/jobs/{id}/printing-plan/override/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "production.manage"

    def post(self, request: Request, pk: str, *args, **kwargs) -> Response:
        job = get_object_or_404(build_production_job_queryset(), pk=pk)
        planned_batches = int(request.data.get("planned_batches", 0))
        raw_qty = request.data.get("planned_printing_quantity")
        planned_qty = int(raw_qty) if raw_qty is not None else None
        override_reason = str(request.data.get("override_reason", ""))

        override_lanyard_printing_plan(
            job=job,
            planned_batches=planned_batches,
            planned_printing_quantity=planned_qty,
            override_reason=override_reason,
            actor=request.user,
            request=request,
        )
        refreshed = build_production_job_queryset().get(pk=job.pk)
        return Response(ProductionJobDetailSerializer(refreshed).data, status=status.HTTP_200_OK)


class JobPrintingRunListCreateAPIView(APIView):
    """List or record printing runs for a ProductionJob (`GET/POST /api/v1/production/jobs/{id}/printing-runs/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]

    @property
    def required_permission(self) -> str:
        if self.request.method == "POST":
            return "production.manage"
        return "production.view"

    def get(self, request: Request, pk: str, *args, **kwargs) -> Response:
        job = get_object_or_404(ProductionJob, pk=pk)
        runs = job.printing_runs.order_by("run_number", "created_at")
        return Response(PrintingRunSerializer(runs, many=True).data, status=status.HTTP_200_OK)

    def post(self, request: Request, pk: str, *args, **kwargs) -> Response:
        job = get_object_or_404(build_production_job_queryset(), pk=pk)
        serializer = PrintingRunCreateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        create_printing_run(
            job=job,
            validated_data=serializer.validated_data,
            actor=request.user,
            request=request,
        )
        refreshed = build_production_job_queryset().get(pk=job.pk)
        return Response(
            ProductionJobDetailSerializer(refreshed).data,
            status=status.HTTP_201_CREATED,
        )


class PrintingRunCompleteAPIView(APIView):
    """Complete an in-progress PrintingRun (`POST /api/v1/printing-runs/{id}/complete/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "production.manage"

    def post(self, request: Request, pk: str, *args, **kwargs) -> Response:
        run = get_object_or_404(
            PrintingRun.objects.select_related("production_job__order_item__order"),
            pk=pk,
        )
        serializer = PrintingRunCompleteInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        complete_printing_run(
            run=run,
            actual_printed_quantity=data.get("actual_printed_quantity"),
            rejected_quantity=data.get("rejected_quantity"),
            successful_quantity=data.get("successful_quantity"),
            notes=data.get("notes"),
            actor=request.user,
            request=request,
        )
        refreshed = build_production_job_queryset().get(pk=run.production_job_id)
        return Response(ProductionJobDetailSerializer(refreshed).data, status=status.HTTP_200_OK)


class JobAssemblyOverviewAPIView(APIView):
    """Inspect assembly readiness and status for a ProductionJob (`GET /api/v1/production/jobs/{id}/assembly/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "production.view"

    def get(self, request: Request, pk: str, *args, **kwargs) -> Response:
        job = get_object_or_404(build_production_job_queryset(), pk=pk)
        return Response(
            {
                "production_job_id": str(job.id),
                "category": job.order_item.category,
                "assembly_status": job.assembly_status,
                "assembly_status_label": job.get_assembly_status_display(),
                "is_assembly_ready": job.is_assembly_ready,
                "required_quantity": job.required_quantity,
                "successful_printed_quantity": job.successful_printed_quantity,
                "planned_assembly_quantity": job.planned_assembly_quantity,
                "completed_assembly_quantity": job.completed_assembly_quantity,
                "assembly_started_at": job.assembly_started_at,
                "assembly_completed_at": job.assembly_completed_at,
                "assembly_notes": job.assembly_notes,
            },
            status=status.HTTP_200_OK,
        )


class JobAssemblyReadyAPIView(APIView):
    """Mark a Lanyard job Ready for Assembly (`POST /api/v1/production/jobs/{id}/assembly/ready/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "production.manage"

    def post(self, request: Request, pk: str, *args, **kwargs) -> Response:
        job = get_object_or_404(build_production_job_queryset(), pk=pk)
        raw_qty = request.data.get("planned_assembly_quantity")
        planned_qty = int(raw_qty) if raw_qty is not None else None
        mark_lanyard_assembly_ready(
            job=job,
            planned_assembly_quantity=planned_qty,
            notes=str(request.data.get("notes", "")),
            actor=request.user,
            request=request,
        )
        refreshed = build_production_job_queryset().get(pk=job.pk)
        return Response(ProductionJobDetailSerializer(refreshed).data, status=status.HTTP_200_OK)


class JobAssemblyStartAPIView(APIView):
    """Start or update partial progress on Lanyard Assembly (`POST /api/v1/production/jobs/{id}/assembly/start/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "production.manage"

    def post(self, request: Request, pk: str, *args, **kwargs) -> Response:
        job = get_object_or_404(build_production_job_queryset(), pk=pk)
        raw_qty = request.data.get("completed_assembly_quantity")
        comp_qty = int(raw_qty) if raw_qty is not None else None
        start_lanyard_assembly(
            job=job,
            completed_assembly_quantity=comp_qty,
            notes=str(request.data.get("notes", "")),
            actor=request.user,
            request=request,
        )
        refreshed = build_production_job_queryset().get(pk=job.pk)
        return Response(ProductionJobDetailSerializer(refreshed).data, status=status.HTTP_200_OK)


class JobAssemblyCompleteAPIView(APIView):
    """Complete Lanyard Assembly and advance to Stage 4 Dispatch readiness (`POST /api/v1/production/jobs/{id}/assembly/complete/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "production.manage"

    def post(self, request: Request, pk: str, *args, **kwargs) -> Response:
        job = get_object_or_404(build_production_job_queryset(), pk=pk)
        raw_qty = request.data.get("completed_assembly_quantity")
        comp_qty = int(raw_qty) if raw_qty is not None else None
        complete_lanyard_assembly(
            job=job,
            completed_assembly_quantity=comp_qty,
            notes=str(request.data.get("notes", "")),
            actor=request.user,
            request=request,
        )
        refreshed = build_production_job_queryset().get(pk=job.pk)
        return Response(ProductionJobDetailSerializer(refreshed).data, status=status.HTTP_200_OK)


class JobCompleteProductionAPIView(APIView):
    """Mark an ID Card item as Production Completed and Ready for Packing/Dispatch (`POST /api/v1/production/jobs/{id}/complete/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "production.manage"

    def post(self, request: Request, pk: str, *args, **kwargs) -> Response:
        job = get_object_or_404(build_production_job_queryset(), pk=pk)
        raw_qty = request.data.get("ready_for_packing_quantity")
        packing_qty = int(raw_qty) if raw_qty is not None else None
        complete_id_card_production(
            job=job,
            ready_for_packing_quantity=packing_qty,
            notes=str(request.data.get("notes", "")),
            actor=request.user,
            request=request,
        )
        refreshed = build_production_job_queryset().get(pk=job.pk)
        return Response(ProductionJobDetailSerializer(refreshed).data, status=status.HTTP_200_OK)
