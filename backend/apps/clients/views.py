"""Views for Client directory, search/autocomplete, profile, and archival."""
from django.db import transaction
from django.db.models import Count, Max, Q, QuerySet, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import generics, permissions, status
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts.permissions import HasModulePermission
from apps.audit_logs.services import record_audit_log

from .models import Client, normalize_client_name
from .serializers import ClientSerializer


def annotate_client_metrics(queryset: QuerySet[Client]) -> QuerySet[Client]:
    """Annotate client queryset with order counts, last order date, and item quantity totals."""
    active_items_filter = ~Q(orders__status="cancelled")
    orig_items_filter = active_items_filter & Q(orders__order_type="original")
    repl_items_filter = active_items_filter & Q(orders__order_type="replacement")

    return queryset.annotate(
        order_count=Count("orders", distinct=True),
        original_order_count=Count(
            "orders",
            filter=Q(orders__order_type="original"),
            distinct=True,
        ),
        replacement_order_count=Count(
            "orders",
            filter=Q(orders__order_type="replacement"),
            distinct=True,
        ),
        last_order_date=Max("orders__order_date"),
        total_original_ordered_quantity=Coalesce(
            Sum("orders__items__ordered_quantity", filter=orig_items_filter),
            Value(0),
        ),
        total_replacement_ordered_quantity=Coalesce(
            Sum("orders__items__ordered_quantity", filter=repl_items_filter),
            Value(0),
        ),
        total_ordered_quantity=Coalesce(
            Sum("orders__items__ordered_quantity", filter=active_items_filter),
            Value(0),
        ),
        total_dispatched_quantity=Coalesce(
            Sum("orders__items__dispatched_quantity", filter=active_items_filter),
            Value(0),
        ),
    )


class ClientListCreateAPIView(generics.ListCreateAPIView):
    """List/search clients or create a new client (`GET/POST /api/v1/clients/`)."""

    serializer_class = ClientSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]

    @property
    def required_permission(self) -> str:
        if self.request.method == "POST":
            return "clients.manage"
        return "clients.view"

    def get_queryset(self) -> QuerySet[Client]:
        queryset = annotate_client_metrics(Client.objects.all())

        archived_param = self.request.query_params.get("is_archived")
        include_archived = self.request.query_params.get("include_archived", "").lower() in {
            "1",
            "true",
            "yes",
        }
        if archived_param is not None:
            is_arch = archived_param.lower() in {"1", "true", "yes"}
            queryset = queryset.filter(is_archived=is_arch)
        elif not include_archived:
            queryset = queryset.filter(is_archived=False)

        search = (self.request.query_params.get("search") or "").strip()
        if search:
            normalized_query = normalize_client_name(search)
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(normalized_name__icontains=normalized_query)
            )

        return queryset.order_by("name")

    @transaction.atomic
    def perform_create(self, serializer: ClientSerializer) -> None:
        client = serializer.save(created_by=self.request.user)
        record_audit_log(
            action="CLIENT_CREATED",
            module="clients",
            summary=f"Created client '{client.name}'.",
            actor=self.request.user,
            target_type="Client",
            target_id=str(client.id),
            request=self.request,
        )


class ClientRetrieveUpdateAPIView(generics.RetrieveUpdateAPIView):
    """Retrieve a client profile or update/archive a client (`GET/PATCH /api/v1/clients/{id}/`)."""

    serializer_class = ClientSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    http_method_names = ["get", "patch", "head", "options"]

    @property
    def required_permission(self) -> str:
        if self.request.method == "PATCH":
            return "clients.manage"
        return "clients.view"

    def get_queryset(self) -> QuerySet[Client]:
        return annotate_client_metrics(Client.objects.all())

    @transaction.atomic
    def partial_update(self, request: Request, *args, **kwargs) -> Response:
        client: Client = self.get_object()
        was_archived = client.is_archived

        # Handle explicit archive/unarchive transitions cleanly
        if "is_archived" in request.data:
            target_archived = bool(request.data.get("is_archived"))
            archive_reason = str(request.data.get("archive_reason", "")).strip()
            if target_archived and not was_archived:
                client.archive(user=request.user, reason=archive_reason)
                record_audit_log(
                    action="CLIENT_ARCHIVED",
                    module="clients",
                    summary=f"Archived client '{client.name}'.",
                    actor=request.user,
                    target_type="Client",
                    target_id=str(client.id),
                    metadata={"reason": archive_reason},
                    request=request,
                )
            elif not target_archived and was_archived:
                client.unarchive()
                record_audit_log(
                    action="CLIENT_UNARCHIVED",
                    module="clients",
                    summary=f"Restored archived client '{client.name}'.",
                    actor=request.user,
                    target_type="Client",
                    target_id=str(client.id),
                    request=request,
                )

        if "name" in request.data and request.data["name"] != client.name:
            old_name = client.name
            serializer = self.get_serializer(
                client,
                data={"name": request.data["name"]},
                partial=True,
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            record_audit_log(
                action="CLIENT_UPDATED",
                module="clients",
                summary=f"Renamed client '{old_name}' to '{client.name}'.",
                actor=request.user,
                target_type="Client",
                target_id=str(client.id),
                metadata={"previous_name": old_name, "new_name": client.name},
                request=request,
            )

        refreshed = self.get_queryset().get(pk=client.pk)
        return Response(self.get_serializer(refreshed).data, status=status.HTTP_200_OK)
