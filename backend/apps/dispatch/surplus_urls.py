"""URL routes for `/api/v1/surplus/*`."""
from django.urls import path

from .views import (
    ClientSurplusRecordListView,
    OfficeSurplusAllocateView,
    OfficeSurplusPoolListView,
)

app_name = "surplus"

urlpatterns = [
    path("office/", OfficeSurplusPoolListView.as_view(), name="office-surplus-list"),
    path(
        "office/<uuid:surplus_id>/allocate/",
        OfficeSurplusAllocateView.as_view(),
        name="office-surplus-allocate",
    ),
    path("clients/", ClientSurplusRecordListView.as_view(), name="client-surplus-list"),
]
