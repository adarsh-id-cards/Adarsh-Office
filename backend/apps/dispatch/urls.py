"""URL routes for `/api/v1/dispatch/*`."""
from django.urls import path

from .views import (
    DispatchDetailView,
    DispatchListCreateView,
    DispatchQueueView,
)

app_name = "dispatch"

urlpatterns = [
    path("", DispatchListCreateView.as_view(), name="dispatch-list-create"),
    path("queue/", DispatchQueueView.as_view(), name="dispatch-queue"),
    path("<uuid:dispatch_id>/", DispatchDetailView.as_view(), name="dispatch-detail"),
    path("<uuid:dispatch_id>/items/", DispatchDetailView.as_view(), name="dispatch-items"),
]
