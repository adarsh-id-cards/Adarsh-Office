"""API Views for Packing, Dispatch, Office Surplus Pool, and Client Surplus (Sections 15, 16)."""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasModulePermission
from apps.orders.models import Order, OrderItem, OrderStatus
from apps.production.services import ensure_production_job_for_item

from .models import (
    ClientSurplusRecord,
    DispatchRecord,
    OfficeSurplusPool,
)
from .serializers import (
    ClientSurplusRecordSerializer,
    DispatchRecordSerializer,
    OfficeSurplusPoolSerializer,
)
from .services import (
    allocate_office_surplus_to_replacement_item,
    create_dispatch_record,
)


class DispatchQueueView(APIView):
    """GET `/api/v1/dispatch/queue/` — Orders & items ready for packing and partial/full dispatch."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "dispatch.view"

    def get(self, request: Request) -> Response:
        items_qs = (
            OrderItem.objects.exclude(order__status=OrderStatus.CANCELLED)
            .select_related(
                "order__client",
                "lanyard_size_option",
                "hook_option",
                "holder_option",
                "production_job",
            )
            .order_by("-order__order_date", "line_number")
        )
        queue = []
        for item in items_qs:
            job = getattr(item, "production_job", None) or ensure_production_job_for_item(item)
            if item.category == "lanyard":
                available_produced = int(job.completed_assembly_quantity) + int(
                    item.allocated_from_surplus_quantity
                )
            else:
                available_produced = int(job.successful_printed_quantity) + int(
                    item.allocated_from_surplus_quantity
                )
            remaining_order_qty = max(
                0, int(item.ordered_quantity) - int(item.dispatched_quantity)
            )
            surplus_available = max(
                0,
                max(int(job.successful_printed_quantity), available_produced)
                - int(item.ordered_quantity),
            )

            queue.append(
                {
                    "order_item_id": str(item.id),
                    "order_id": str(item.order_id),
                    "order_number": item.order.order_number,
                    "order_type": item.order.order_type,
                    "order_status": item.order.status,
                    "client_id": str(item.order.client_id),
                    "client_name": item.order.client.name,
                    "item_name": item.item_name,
                    "category": item.category,
                    "lanyard_size_name": (
                        item.lanyard_size_option.name if item.lanyard_size_option else ""
                    ),
                    "ordered_quantity": int(item.ordered_quantity),
                    "allocated_from_surplus_quantity": int(
                        item.allocated_from_surplus_quantity
                    ),
                    "produced_quantity": available_produced,
                    "dispatched_quantity": int(item.dispatched_quantity),
                    "remaining_order_quantity": remaining_order_qty,
                    "estimated_surplus_quantity": surplus_available,
                    "is_ready_for_dispatch": bool(
                        job.is_ready_for_dispatch
                        or available_produced > int(item.dispatched_quantity)
                    ),
                    "current_stage": job.current_stage,
                }
            )
        return Response({"results": queue}, status=status.HTTP_200_OK)


class DispatchListCreateView(APIView):
    """GET / POST `/api/v1/dispatch/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]

    @property
    def required_permission(self) -> str:
        return "dispatch.manage" if self.request.method == "POST" else "dispatch.view"

    def get(self, request: Request) -> Response:
        qs = DispatchRecord.objects.select_related("order__client").prefetch_related(
            "items__order_item"
        )
        order_id = (request.query_params.get("order") or "").strip()
        if order_id:
            qs = qs.filter(order_id=order_id)
        return Response(
            {"results": DispatchRecordSerializer(qs, many=True).data},
            status=status.HTTP_200_OK,
        )

    def post(self, request: Request) -> Response:
        order_id = request.data.get("order") or request.data.get("order_id")
        items = request.data.get("items")
        if not items and (
            request.data.get("order_item") or request.data.get("order_item_id")
        ):
            items = [request.data]
            if not order_id:
                oi = get_object_or_404(
                    OrderItem,
                    pk=request.data.get("order_item")
                    or request.data.get("order_item_id"),
                )
                order_id = oi.order_id

        order = get_object_or_404(Order, pk=order_id)
        dispatch = create_dispatch_record(
            order=order,
            items_data=items or [],
            dispatch_date=request.data.get("dispatch_date"),
            packing_verified=bool(request.data.get("packing_verified", True)),
            idempotency_key=request.data.get("idempotency_key"),
            notes=request.data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        return Response(
            DispatchRecordSerializer(dispatch).data,
            status=status.HTTP_201_CREATED,
        )


class DispatchDetailView(APIView):
    """GET `/api/v1/dispatch/{id}/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "dispatch.view"

    def get(self, request: Request, dispatch_id) -> Response:
        dispatch = get_object_or_404(
            DispatchRecord.objects.select_related("order__client").prefetch_related(
                "items__order_item"
            ),
            pk=dispatch_id,
        )
        return Response(
            DispatchRecordSerializer(dispatch).data,
            status=status.HTTP_200_OK,
        )


class OfficeSurplusPoolListView(APIView):
    """GET `/api/v1/surplus/office/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "dispatch.view"

    def get(self, request: Request) -> Response:
        qs = OfficeSurplusPool.objects.select_related(
            "source_order", "source_order_item", "client"
        ).prefetch_related(
            "allocations__replacement_order",
            "allocations__replacement_order_item",
        )
        client_id = (request.query_params.get("client") or "").strip()
        if client_id:
            qs = qs.filter(client_id=client_id)

        available_only = (request.query_params.get("available_only") or "").strip().lower()
        if available_only in {"true", "1"}:
            qs = qs.filter(remaining_quantity__gt=0)

        return Response(
            {"results": OfficeSurplusPoolSerializer(qs, many=True).data},
            status=status.HTTP_200_OK,
        )


class OfficeSurplusAllocateView(APIView):
    """POST `/api/v1/surplus/office/{id}/allocate/` — Allocate retained office surplus to a replacement order item."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "dispatch.manage"

    def post(self, request: Request, surplus_id) -> Response:
        pool = get_object_or_404(OfficeSurplusPool, pk=surplus_id)
        rep_item_id = (
            request.data.get("replacement_order_item")
            or request.data.get("replacement_order_item_id")
            or request.data.get("order_item")
        )
        rep_item = get_object_or_404(OrderItem, pk=rep_item_id)
        qty = int(
            request.data.get("quantity_to_allocate")
            or request.data.get("quantity")
            or 0
        )

        allocate_office_surplus_to_replacement_item(
            surplus_pool=pool,
            replacement_order_item=rep_item,
            quantity_to_allocate=qty,
            notes=request.data.get("notes", ""),
            actor=request.user,
            request=request,
        )
        pool.refresh_from_db()
        return Response(
            OfficeSurplusPoolSerializer(pool).data,
            status=status.HTTP_200_OK,
        )


class ClientSurplusRecordListView(APIView):
    """GET `/api/v1/surplus/clients/`."""

    permission_classes = [IsAuthenticated, HasModulePermission]
    required_permission = "dispatch.view"

    def get(self, request: Request) -> Response:
        qs = ClientSurplusRecord.objects.select_related(
            "order", "order_item", "client"
        )
        client_id = (request.query_params.get("client") or "").strip()
        if client_id:
            qs = qs.filter(client_id=client_id)
        return Response(
            {"results": ClientSurplusRecordSerializer(qs, many=True).data},
            status=status.HTTP_200_OK,
        )
