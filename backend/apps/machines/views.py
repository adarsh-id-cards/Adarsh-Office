"""API Views for physical Machine management (Phase 4 — Section 4)."""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasModulePermission

from .models import Machine, MachineStatus
from .serializers import (
    MachineAllocateInputSerializer,
    MachineCreateUpdateSerializer,
    MachineReturnInputSerializer,
    MachineSerializer,
)
from .services import (
    allocate_machine_to_labourer,
    create_machine,
    return_machine_to_office,
)


class MachineListCreateView(APIView):
    """GET / POST `/api/v1/machines/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]

    @property
    def required_permission(self) -> str:
        return "machines.manage" if self.request.method == "POST" else "machines.view"

    def get(self, request: Request) -> Response:
        qs = Machine.objects.select_related(
            "current_holder", "supported_lanyard_size"
        ).prefetch_related("allocations__labourer", "allocations__issued_by", "allocations__returned_to")

        status_filter = (request.query_params.get("status") or "").strip()
        if status_filter:
            qs = qs.filter(status=status_filter)

        size_filter = (request.query_params.get("supported_size") or "").strip()
        if size_filter:
            qs = qs.filter(supported_size_label__iexact=size_filter)

        holder_filter = (request.query_params.get("holder") or "").strip()
        if holder_filter:
            qs = qs.filter(current_holder_id=holder_filter)

        machines = list(qs)
        counts = {
            "total": len(machines),
            "in_office": sum(1 for m in machines if m.status == MachineStatus.IN_OFFICE),
            "allocated": sum(1 for m in machines if m.status == MachineStatus.ALLOCATED),
            "under_maintenance": sum(
                1 for m in machines if m.status == MachineStatus.UNDER_MAINTENANCE
            ),
            "damaged": sum(1 for m in machines if m.status == MachineStatus.DAMAGED),
        }
        return Response(
            {
                "summary": counts,
                "results": MachineSerializer(machines, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request: Request) -> Response:
        serializer = MachineCreateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        machine = create_machine(
            machine_code=data["machine_code"],
            name=data.get("name", ""),
            machine_type=data.get("machine_type", "Lanyard Fitting & Assembly Press"),
            supported_lanyard_size=data.get("supported_lanyard_size"),
            supported_size_label=data.get("supported_size_label", ""),
            status=data.get("status", MachineStatus.IN_OFFICE),
            notes=data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        return Response(MachineSerializer(machine).data, status=status.HTTP_201_CREATED)


class MachineDetailView(APIView):
    """GET / PATCH `/api/v1/machines/{id}/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]

    @property
    def required_permission(self) -> str:
        return "machines.manage" if self.request.method in {"PATCH", "PUT"} else "machines.view"

    def get(self, request: Request, machine_id) -> Response:
        machine = get_object_or_404(
            Machine.objects.select_related(
                "current_holder", "supported_lanyard_size"
            ).prefetch_related("allocations__labourer"),
            pk=machine_id,
        )
        return Response(MachineSerializer(machine).data, status=status.HTTP_200_OK)

    def patch(self, request: Request, machine_id) -> Response:
        machine = get_object_or_404(Machine, pk=machine_id)
        for field in ["name", "machine_type", "supported_size_label", "notes"]:
            if field in request.data:
                setattr(machine, field, (request.data.get(field) or "").strip())
        if "status" in request.data:
            new_status = request.data.get("status")
            if machine.status == MachineStatus.ALLOCATED and new_status != MachineStatus.ALLOCATED:
                return Response(
                    {"status": ["Use the machine return endpoint to return an allocated machine."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if new_status == MachineStatus.ALLOCATED and machine.status != MachineStatus.ALLOCATED:
                return Response(
                    {"status": ["Use the machine allocation endpoint to allocate a machine."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            machine.status = new_status
        machine.full_clean()
        machine.save()
        return Response(MachineSerializer(machine).data, status=status.HTTP_200_OK)


class MachineAllocateView(APIView):
    """POST `/api/v1/machines/{id}/allocations/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "machines.manage"

    def post(self, request: Request, machine_id) -> Response:
        machine = get_object_or_404(Machine, pk=machine_id)
        serializer = MachineAllocateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        allocate_machine_to_labourer(
            machine=machine,
            labourer=data["labourer"],
            allocated_date=data.get("allocated_date"),
            notes=data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        machine.refresh_from_db()
        return Response(MachineSerializer(machine).data, status=status.HTTP_200_OK)


class MachineReturnView(APIView):
    """POST `/api/v1/machines/{id}/return/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "machines.manage"

    def post(self, request: Request, machine_id) -> Response:
        machine = get_object_or_404(Machine, pk=machine_id)
        serializer = MachineReturnInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        return_machine_to_office(
            machine=machine,
            returned_date=data.get("returned_date"),
            return_condition=data.get("return_condition", "good"),
            notes=data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        machine.refresh_from_db()
        return Response(MachineSerializer(machine).data, status=status.HTTP_200_OK)
