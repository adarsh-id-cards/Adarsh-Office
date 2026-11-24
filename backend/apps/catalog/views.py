"""API views for retrieving configurable product specification catalogs."""
from django.db.models import QuerySet
from rest_framework import generics, permissions
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasModulePermission

from .models import CatalogCategory, CatalogOption
from .serializers import CatalogOptionSerializer


class CatalogOverviewAPIView(APIView):
    """Return all active catalog options grouped by specification category (`GET /api/v1/catalog/`)."""

    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "orders.view"

    def get(self, request: Request, *args, **kwargs) -> Response:
        options = CatalogOption.objects.active().order_by("category", "sort_order", "name")
        serialized = CatalogOptionSerializer(options, many=True).data

        grouped: dict[str, list[dict]] = {
            "card_types": [],
            "lanyard_sizes": [],
            "holders": [],
            "hooks": [],
            "accessories": [],
        }
        category_map = {
            CatalogCategory.CARD_TYPE: "card_types",
            CatalogCategory.LANYARD_SIZE: "lanyard_sizes",
            CatalogCategory.HOLDER: "holders",
            CatalogCategory.HOOK: "hooks",
            CatalogCategory.ACCESSORY: "accessories",
        }
        for item in serialized:
            bucket = category_map.get(item["category"])
            if bucket:
                grouped[bucket].append(item)

        return Response(grouped)


class CardTypeCatalogListAPIView(generics.ListAPIView):
    """List active ID card type catalog options (`GET /api/v1/catalog/card-types/`)."""

    serializer_class = CatalogOptionSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "orders.view"
    pagination_class = None

    def get_queryset(self) -> QuerySet[CatalogOption]:
        return CatalogOption.objects.active().filter(category=CatalogCategory.CARD_TYPE)


class LanyardSizeCatalogListAPIView(generics.ListAPIView):
    """List active lanyard size catalog options (`GET /api/v1/catalog/lanyard-sizes/`)."""

    serializer_class = CatalogOptionSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "orders.view"
    pagination_class = None

    def get_queryset(self) -> QuerySet[CatalogOption]:
        return CatalogOption.objects.active().filter(category=CatalogCategory.LANYARD_SIZE)


class AccessoryCatalogListAPIView(generics.ListAPIView):
    """List active holder, hook, and accessory options (`GET /api/v1/catalog/accessories/`)."""

    serializer_class = CatalogOptionSerializer
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    required_permission = "orders.view"
    pagination_class = None

    def get_queryset(self) -> QuerySet[CatalogOption]:
        queryset = CatalogOption.objects.active().filter(
            category__in=[
                CatalogCategory.HOLDER,
                CatalogCategory.HOOK,
                CatalogCategory.ACCESSORY,
            ]
        )
        category = self.request.query_params.get("category")
        applicable_to = self.request.query_params.get("applicable_to")
        if category:
            queryset = queryset.filter(category=category)
        if applicable_to:
            queryset = queryset.filter(applicable_to__in=[applicable_to, "both"])
        return queryset
