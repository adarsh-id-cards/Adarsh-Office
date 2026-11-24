"""API Views for Lanyard Assembly Queue, Split Assignments, Material Issuance, Receiving & Reconciliation."""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasModulePermission
from apps.inventory.models import Material, MaterialPackaging
from apps.labour.models import Labourer
from apps.machines.models import Machine
from apps.orders.models import ItemCategory, OrderItem
from apps.production.models import ProductionJob
from apps.production.services import ensure_production_job_for_item

from .models import AssemblyAssignment, AssignmentMode
from .serializers import AssemblyAssignmentSerializer
from .services import (
    calculate_material_issuance_preview,
    create_assembly_assignment,
    get_order_item_assembly_capacity,
    issue_materials_for_assignment,
    reconcile_assignment_materials,
    record_assembly_receiving,
)


class AssemblyQueueView(APIView):
    """GET `/api/v1/assembly/queue/` — Assembly-ready lanyard items with capacity & split assignment status."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "production.view"

    def get(self, request: Request) -> Response:
        lanyard_items = OrderItem.objects.filter(
            category=ItemCategory.LANYARD
        ).select_related(
            "order__client",
            "lanyard_size_option",
            "hook_option",
            "holder_option",
        )
        for item in lanyard_items:
            ensure_production_job_for_item(item)

        jobs = (
            ProductionJob.objects.filter(order_item__category=ItemCategory.LANYARD)
            .select_related(
                "order_item__order__client",
                "order_item__lanyard_size_option",
                "order_item__hook_option",
                "order_item__holder_option",
            )
            .prefetch_related(
                "assembly_assignments__labourer",
                "assembly_assignments__assigned_machine",
                "assembly_assignments__material_allocations__material",
                "assembly_assignments__receiving_records",
            )
            .order_by("-created_at")
        )

        only_ready = (request.query_params.get("ready_only") or "").strip().lower()
        if only_ready in {"true", "1"}:
            jobs = jobs.filter(is_assembly_ready=True)

        results = []
        for job in jobs:
            item = job.order_item
            cap = get_order_item_assembly_capacity(item, job)
            assignments = list(job.assembly_assignments.all())
            results.append(
                {
                    "production_job_id": str(job.id),
                    "order_item_id": str(item.id),
                    "order_id": str(item.order_id),
                    "order_number": item.order.order_number,
                    "client_name": item.order.client.name,
                    "item_name": item.item_name,
                    "lanyard_size_name": (
                        item.lanyard_size_option.name if item.lanyard_size_option else ""
                    ),
                    "hook_requirement": item.hook_requirement,
                    "hook_option_name": item.hook_option.name if item.hook_option else "",
                    "holder_requirement": item.holder_requirement,
                    "holder_option_name": (
                        item.holder_option.name if item.holder_option else ""
                    ),
                    "attachment_party": item.attachment_party,
                    "is_assembly_ready": job.is_assembly_ready,
                    "assembly_status": job.assembly_status,
                    "completed_assembly_quantity": job.completed_assembly_quantity,
                    **cap,
                    "assignments": AssemblyAssignmentSerializer(
                        assignments, many=True
                    ).data,
                }
            )

        return Response({"results": results}, status=status.HTTP_200_OK)


class AssemblyAssignmentListCreateView(APIView):
    """GET / POST `/api/v1/assembly/assignments/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]

    @property
    def required_permission(self) -> str:
        return "production.manage" if self.request.method == "POST" else "production.view"

    def get(self, request: Request) -> Response:
        qs = (
            AssemblyAssignment.objects.select_related(
                "order_item__order__client",
                "order_item__lanyard_size_option",
                "production_job",
                "labourer",
                "assigned_machine",
            )
            .prefetch_related(
                "material_allocations__material",
                "material_allocations__packaging",
                "receiving_records",
            )
            .order_by("-created_at")
        )
        order_item_id = (request.query_params.get("order_item") or "").strip()
        if order_item_id:
            qs = qs.filter(order_item_id=order_item_id)

        job_id = (request.query_params.get("production_job") or "").strip()
        if job_id:
            qs = qs.filter(production_job_id=job_id)

        labourer_id = (request.query_params.get("labourer") or "").strip()
        if labourer_id:
            qs = qs.filter(labourer_id=labourer_id)

        return Response(
            {"results": AssemblyAssignmentSerializer(qs, many=True).data},
            status=status.HTTP_200_OK,
        )

    def post(self, request: Request) -> Response:
        order_item_id = request.data.get("order_item") or request.data.get("order_item_id")
        job_id = request.data.get("production_job") or request.data.get("production_job_id")
        if order_item_id:
            order_item = get_object_or_404(OrderItem, pk=order_item_id)
        elif job_id:
            job = get_object_or_404(ProductionJob, pk=job_id)
            order_item = job.order_item
        else:
            return Response(
                {"order_item": ["Order item or production job ID is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        assignment_mode = request.data.get("assignment_mode", AssignmentMode.LABOURER)
        labourer = None
        if request.data.get("labourer"):
            labourer = get_object_or_404(Labourer, pk=request.data.get("labourer"))

        machine = None
        if request.data.get("assigned_machine"):
            machine = get_object_or_404(Machine, pk=request.data.get("assigned_machine"))

        assignment = create_assembly_assignment(
            order_item=order_item,
            assigned_quantity=int(request.data.get("assigned_quantity") or 0),
            assignment_mode=assignment_mode,
            labourer=labourer,
            assigned_machine=machine,
            is_machine_override=bool(request.data.get("is_machine_override", False)),
            machine_override_reason=request.data.get("machine_override_reason", ""),
            assigned_date=request.data.get("assigned_date"),
            notes=request.data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        return Response(
            AssemblyAssignmentSerializer(assignment).data,
            status=status.HTTP_201_CREATED,
        )


class AssemblyAssignmentDetailView(APIView):
    """GET `/api/v1/assembly/assignments/{id}/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "production.view"

    def get(self, request: Request, assignment_id) -> Response:
        assignment = get_object_or_404(
            AssemblyAssignment.objects.select_related(
                "order_item__order__client",
                "order_item__lanyard_size_option",
                "production_job",
                "labourer",
                "assigned_machine",
            ).prefetch_related(
                "material_allocations__material",
                "material_allocations__packaging",
                "receiving_records",
            ),
            pk=assignment_id,
        )
        return Response(
            AssemblyAssignmentSerializer(assignment).data,
            status=status.HTTP_200_OK,
        )


class AssemblyIssueMaterialsView(APIView):
    """POST `/api/v1/assembly/assignments/{id}/issue-materials/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "inventory.manage"

    def post(self, request: Request, assignment_id) -> Response:
        assignment = get_object_or_404(AssemblyAssignment, pk=assignment_id)

        # Support either `lines: [...]` or a single line directly in request.data
        lines = request.data.get("lines")
        if not lines and (request.data.get("material") or request.data.get("material_id")):
            lines = [request.data]

        if request.data.get("preview_only"):
            previews = []
            for line in lines or []:
                mat = get_object_or_404(
                    Material, pk=line.get("material") or line.get("material_id")
                )
                pkg_id = line.get("packaging") or line.get("packaging_id")
                pkg = MaterialPackaging.objects.filter(pk=pkg_id).first() if pkg_id else None
                previews.append(
                    calculate_material_issuance_preview(
                        assignment=assignment,
                        material=mat,
                        required_quantity=line.get("required_quantity"),
                        packaging=pkg,
                        packets_issued=line.get("packets_issued"),
                        issued_quantity=line.get("issued_quantity"),
                    )
                )
            return Response({"previews": previews}, status=status.HTTP_200_OK)

        issue_materials_for_assignment(
            assignment=assignment,
            lines=lines or [],
            notes=request.data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        assignment.refresh_from_db()
        return Response(
            AssemblyAssignmentSerializer(assignment).data,
            status=status.HTTP_200_OK,
        )


class AssemblyReceivingCreateView(APIView):
    """POST `/api/v1/assembly/assignments/{id}/receiving/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "production.manage"

    def post(self, request: Request, assignment_id) -> Response:
        assignment = get_object_or_404(AssemblyAssignment, pk=assignment_id)
        record_assembly_receiving(
            assignment=assignment,
            usable_quantity=int(request.data.get("usable_quantity") or 0),
            defective_quantity=int(request.data.get("defective_quantity") or 0),
            received_date=request.data.get("received_date"),
            notes=request.data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        assignment.refresh_from_db()
        return Response(
            AssemblyAssignmentSerializer(assignment).data,
            status=status.HTTP_200_OK,
        )


class AssemblyReconcileMaterialsView(APIView):
    """POST `/api/v1/assembly/assignments/{id}/reconcile/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "inventory.manage"

    def post(self, request: Request, assignment_id) -> Response:
        assignment = get_object_or_404(AssemblyAssignment, pk=assignment_id)
        reconciled = reconcile_assignment_materials(
            assignment=assignment,
            material_reconciliations=request.data.get("material_reconciliations"),
            notes=request.data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        return Response(
            AssemblyAssignmentSerializer(reconciled).data,
            status=status.HTTP_200_OK,
        )
