"""Views for Orders, OrderItems, Replacement Orders, and Status Transitions."""
from django.db import transaction
from django.db.models import Count, Prefetch, Q, QuerySet, Sum, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasModulePermission
from apps.audit_logs.services import record_audit_log
from apps.clients.models import Client

from .models import Order, OrderItem, OrderStatus, OrderStatusHistory
from .serializers import (
    OrderCreateSerializer,
    OrderDetailSerializer,
    OrderItemQuantityUpdateSerializer,
    OrderItemReadSerializer,
    OrderItemReplacementSummarySerializer,
    OrderListSerializer,
    OrderStatusHistorySerializer,
    OrderUpdateSerializer,
    ReplacementOrderCreateSerializer,
)
from .services import (
    create_original_order,
    create_replacement_order,
    transition_order_status,
)


def build_order_list_queryset() -> QuerySet[Order]:
    """Optimized queryset for listing orders with item counts and quantity totals (no N+1)."""
    return (
        Order.objects.select_related(
            "client",
            "original_order",
            "created_by",
            "updated_by",
        )
        .prefetch_related("items", "items__production_job")
        .annotate(
            item_count=Count("items", distinct=True),
            total_ordered_quantity=Coalesce(Sum("items__ordered_quantity"), Value(0)),
            total_dispatched_quantity=Coalesce(Sum("items__dispatched_quantity"), Value(0)),
            replacement_orders_count=Count("replacement_orders", distinct=True),
        )
    )


def build_order_detail_queryset() -> QuerySet[Order]:
    """Optimized queryset for retrieving a full order detail graph without N+1 queries."""
    items_prefetch = Prefetch(
        "items",
        queryset=OrderItem.objects.select_related(
            "order",
            "original_item",
            "card_type_option",
            "lanyard_size_option",
            "holder_option",
            "hook_option",
            "production_job",
        ).prefetch_related(
            "accessories",
            Prefetch(
                "replacement_items",
                queryset=OrderItem.objects.select_related("order").order_by("-created_at"),
            ),
        ),
    )
    replacement_orders_prefetch = Prefetch(
        "replacement_orders",
        queryset=Order.objects.prefetch_related("items").order_by("-order_date", "-created_at"),
    )
    return Order.objects.select_related(
        "client",
        "original_order",
        "created_by",
        "updated_by",
    ).prefetch_related(
        items_prefetch,
        replacement_orders_prefetch,
        "status_history",
    )


def filter_orders_queryset(queryset: QuerySet[Order], request: Request) -> QuerySet[Order]:
    """Apply search and filter query parameters consistently."""
    params = request.query_params

    search = (params.get("search") or "").strip()
    if search:
        queryset = queryset.filter(
            Q(order_number__icontains=search)
            | Q(client__name__icontains=search)
            | Q(items__item_name__icontains=search)
        ).distinct()

    client_id = (params.get("client") or params.get("client_id") or "").strip()
    if client_id:
        queryset = queryset.filter(client_id=client_id)

    status_param = (params.get("status") or "").strip()
    if status_param:
        queryset = queryset.filter(status=status_param)

    order_type = (params.get("order_type") or "").strip()
    if order_type:
        queryset = queryset.filter(order_type=order_type)

    date_from = (params.get("date_from") or "").strip()
    if date_from:
        queryset = queryset.filter(order_date__gte=date_from)

    date_to = (params.get("date_to") or "").strip()
    if date_to:
        queryset = queryset.filter(order_date__lte=date_to)

    return queryset.order_by("-order_date", "-created_at")


class OrderListCreateAPIView(generics.ListCreateAPIView):
    """List/filter orders or create a new Original Order (`GET/POST /api/v1/orders/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]

    @property
    def required_permission(self) -> str:
        if self.request.method == "POST":
            return "orders.manage"
        return "orders.view"

    def get_queryset(self) -> QuerySet[Order]:
        return filter_orders_queryset(build_order_list_queryset(), self.request)

    def get_serializer_class(self):
        if self.request.method == "POST":
            return OrderCreateSerializer
        return OrderListSerializer

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = create_original_order(
            validated_data=serializer.validated_data,
            actor=request.user,
            request=request,
        )
        detailed = build_order_detail_queryset().get(pk=order.pk)
        return Response(
            OrderDetailSerializer(detailed).data,
            status=status.HTTP_201_CREATED,
        )


class OrderRetrieveUpdateAPIView(generics.RetrieveUpdateAPIView):
    """Retrieve order details or update permitted metadata (`GET/PATCH /api/v1/orders/{id}/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    http_method_names = ["get", "patch", "head", "options"]

    @property
    def required_permission(self) -> str:
        if self.request.method == "PATCH":
            return "orders.manage"
        return "orders.view"

    def get_queryset(self) -> QuerySet[Order]:
        return build_order_detail_queryset()

    def get_serializer_class(self):
        if self.request.method == "PATCH":
            return OrderUpdateSerializer
        return OrderDetailSerializer

    @transaction.atomic
    def partial_update(self, request: Request, *args, **kwargs) -> Response:
        order: Order = self.get_object()
        serializer = OrderUpdateSerializer(order, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)

        record_audit_log(
            action="ORDER_UPDATED",
            module="orders",
            summary=f"Updated order {order.order_number} details.",
            actor=request.user,
            target_type="Order",
            target_id=str(order.id),
            request=request,
        )

        refreshed = self.get_queryset().get(pk=order.pk)
        return Response(OrderDetailSerializer(refreshed).data, status=status.HTTP_200_OK)


class OrderConfirmAPIView(APIView):
    """Transition a Draft order to Confirmed status (`POST /api/v1/orders/{id}/confirm/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "orders.manage"

    def post(self, request: Request, pk: str, *args, **kwargs) -> Response:
        order = get_object_or_404(Order, pk=pk)
        reason = str(request.data.get("reason", "Order confirmed.")).strip()
        transition_order_status(
            order=order,
            target_status=OrderStatus.CONFIRMED,
            reason=reason,
            actor=request.user,
            request=request,
        )
        refreshed = build_order_detail_queryset().get(pk=order.pk)
        return Response(OrderDetailSerializer(refreshed).data, status=status.HTTP_200_OK)


class OrderCancelAPIView(APIView):
    """Cancel an order with a mandatory reason (`POST /api/v1/orders/{id}/cancel/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "orders.manage"

    def post(self, request: Request, pk: str, *args, **kwargs) -> Response:
        order = get_object_or_404(Order, pk=pk)
        reason = str(request.data.get("reason", "")).strip()
        transition_order_status(
            order=order,
            target_status=OrderStatus.CANCELLED,
            reason=reason,
            actor=request.user,
            request=request,
        )
        refreshed = build_order_detail_queryset().get(pk=order.pk)
        return Response(OrderDetailSerializer(refreshed).data, status=status.HTTP_200_OK)


class OrderStatusTransitionAPIView(APIView):
    """Controlled lifecycle status transition endpoint (`POST /api/v1/orders/{id}/transition/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "orders.manage"

    def post(self, request: Request, pk: str, *args, **kwargs) -> Response:
        order = get_object_or_404(Order, pk=pk)
        target_status = str(request.data.get("status", "")).strip()
        reason = str(request.data.get("reason", "")).strip()
        transition_order_status(
            order=order,
            target_status=target_status,
            reason=reason,
            actor=request.user,
            request=request,
        )
        refreshed = build_order_detail_queryset().get(pk=order.pk)
        return Response(OrderDetailSerializer(refreshed).data, status=status.HTTP_200_OK)


class OrderHistoryListAPIView(generics.ListAPIView):
    """Retrieve status transition history for an order (`GET /api/v1/orders/{id}/history/`)."""

    serializer_class = OrderStatusHistorySerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "orders.view"
    pagination_class = None

    def get_queryset(self) -> QuerySet[OrderStatusHistory]:
        order = get_object_or_404(Order, pk=self.kwargs["pk"])
        return order.status_history.select_related("changed_by").order_by("-created_at")


class OrderReplacementsListCreateAPIView(APIView):
    """List or create Replacement Orders for an Original Order (`GET/POST /api/v1/orders/{id}/replacements/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]

    @property
    def required_permission(self) -> str:
        if self.request.method == "POST":
            return "orders.manage"
        return "orders.view"

    def get(self, request: Request, pk: str, *args, **kwargs) -> Response:
        original_order = get_object_or_404(Order, pk=pk)
        replacements = (
            build_order_list_queryset()
            .filter(original_order=original_order)
            .order_by("-order_date", "-created_at")
        )
        return Response(OrderListSerializer(replacements, many=True).data)

    def post(self, request: Request, pk: str, *args, **kwargs) -> Response:
        original_order = get_object_or_404(
            Order.objects.select_related("client"),
            pk=pk,
        )
        serializer = ReplacementOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        replacement_order = create_replacement_order(
            original_order=original_order,
            validated_data=serializer.validated_data,
            actor=request.user,
            request=request,
        )
        detailed = build_order_detail_queryset().get(pk=replacement_order.pk)
        return Response(
            OrderDetailSerializer(detailed).data,
            status=status.HTTP_201_CREATED,
        )


class OrderItemReplacementsListAPIView(generics.ListAPIView):
    """List replacement item records referencing a specific Original OrderItem (`GET /api/v1/order-items/{id}/replacements/`)."""

    serializer_class = OrderItemReplacementSummarySerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "orders.view"
    pagination_class = None

    def get_queryset(self) -> QuerySet[OrderItem]:
        original_item = get_object_or_404(OrderItem, pk=self.kwargs["pk"])
        return original_item.replacement_items.select_related("order").order_by("-created_at")


class OrderItemQuantityUpdateAPIView(generics.UpdateAPIView):
    """Update validated production prepared/dispatched quantities on an OrderItem (`PATCH /api/v1/order-items/{id}/`)."""

    serializer_class = OrderItemQuantityUpdateSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "orders.manage"
    http_method_names = ["patch", "options"]
    queryset = OrderItem.objects.select_related(
        "order",
        "original_item",
        "card_type_option",
        "lanyard_size_option",
        "holder_option",
        "hook_option",
    ).prefetch_related("accessories", "replacement_items__order")

    @transaction.atomic
    def partial_update(self, request: Request, *args, **kwargs) -> Response:
        item: OrderItem = self.get_object()
        serializer = self.get_serializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        record_audit_log(
            action="ORDER_ITEM_QUANTITIES_UPDATED",
            module="orders",
            summary=(
                f"Updated quantities on '{item.item_name}' ({item.order.order_number}): "
                f"prepared={item.prepared_quantity}, dispatched={item.dispatched_quantity}."
            ),
            actor=request.user,
            target_type="OrderItem",
            target_id=str(item.id),
            metadata={
                "order_id": str(item.order_id),
                "order_number": item.order.order_number,
                "ordered_quantity": item.ordered_quantity,
                "prepared_quantity": item.prepared_quantity,
                "dispatched_quantity": item.dispatched_quantity,
            },
            request=request,
        )

        refreshed = self.get_queryset().get(pk=item.pk)
        return Response(OrderItemReadSerializer(refreshed).data, status=status.HTTP_200_OK)


class ClientOrderListAPIView(generics.ListAPIView):
    """List orders belonging to a specific client (`GET /api/v1/clients/{id}/orders/`)."""

    serializer_class = OrderListSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "orders.view"

    def get_queryset(self) -> QuerySet[Order]:
        client = get_object_or_404(Client, pk=self.kwargs["pk"])
        queryset = build_order_list_queryset().filter(client=client)
        return filter_orders_queryset(queryset, self.request)
