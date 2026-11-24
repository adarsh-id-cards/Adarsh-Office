"""URL routes for `/api/v1/machines/*`."""
from django.urls import path

from .views import (
    MachineAllocateView,
    MachineDetailView,
    MachineListCreateView,
    MachineReturnView,
)

app_name = "machines"

urlpatterns = [
    path("", MachineListCreateView.as_view(), name="machine-list-create"),
    path("<uuid:machine_id>/", MachineDetailView.as_view(), name="machine-detail"),
    path(
        "<uuid:machine_id>/allocations/",
        MachineAllocateView.as_view(),
        name="machine-allocate",
    ),
    path(
        "<uuid:machine_id>/return/",
        MachineReturnView.as_view(),
        name="machine-return",
    ),
]
