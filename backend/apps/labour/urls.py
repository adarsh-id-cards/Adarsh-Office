"""URL routes for `/api/v1/labourers/*`."""
from django.urls import path

from .views import (
    LabourerAssignmentsView,
    LabourerDetailView,
    LabourerInventoryView,
    LabourerListCreateView,
)

app_name = "labour"

urlpatterns = [
    path("", LabourerListCreateView.as_view(), name="labourer-list-create"),
    path("<uuid:labourer_id>/", LabourerDetailView.as_view(), name="labourer-detail"),
    path(
        "<uuid:labourer_id>/assignments/",
        LabourerAssignmentsView.as_view(),
        name="labourer-assignments",
    ),
    path(
        "<uuid:labourer_id>/inventory/",
        LabourerInventoryView.as_view(),
        name="labourer-inventory",
    ),
]
