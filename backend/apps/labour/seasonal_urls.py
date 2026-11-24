"""URL routes for `/api/v1/seasonal-closings/*`."""
from django.urls import path

from .views import SeasonalClosingListCreateView, SeasonalClosingReconcileView

app_name = "seasonal_closings"

urlpatterns = [
    path("", SeasonalClosingListCreateView.as_view(), name="seasonal-closing-list-create"),
    path(
        "<uuid:closing_id>/reconcile/",
        SeasonalClosingReconcileView.as_view(),
        name="seasonal-closing-reconcile",
    ),
]
