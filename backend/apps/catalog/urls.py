from django.urls import path

from .views import (
    AccessoryCatalogListAPIView,
    CardTypeCatalogListAPIView,
    CatalogOverviewAPIView,
    LanyardSizeCatalogListAPIView,
)

urlpatterns = [
    path("", CatalogOverviewAPIView.as_view(), name="catalog-overview"),
    path("card-types/", CardTypeCatalogListAPIView.as_view(), name="catalog-card-types"),
    path("lanyard-sizes/", LanyardSizeCatalogListAPIView.as_view(), name="catalog-lanyard-sizes"),
    path("accessories/", AccessoryCatalogListAPIView.as_view(), name="catalog-accessories"),
]
