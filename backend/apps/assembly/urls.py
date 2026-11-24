"""URL routes for `/api/v1/assembly/*`."""
from django.urls import path

from .views import (
    AssemblyAssignmentDetailView,
    AssemblyAssignmentListCreateView,
    AssemblyIssueMaterialsView,
    AssemblyQueueView,
    AssemblyReceivingCreateView,
    AssemblyReconcileMaterialsView,
)

app_name = "assembly"

urlpatterns = [
    path("queue/", AssemblyQueueView.as_view(), name="assembly-queue"),
    path(
        "assignments/",
        AssemblyAssignmentListCreateView.as_view(),
        name="assembly-assignment-list-create",
    ),
    path(
        "assignments/<uuid:assignment_id>/",
        AssemblyAssignmentDetailView.as_view(),
        name="assembly-assignment-detail",
    ),
    path(
        "assignments/<uuid:assignment_id>/issue-materials/",
        AssemblyIssueMaterialsView.as_view(),
        name="assembly-issue-materials",
    ),
    path(
        "assignments/<uuid:assignment_id>/receiving/",
        AssemblyReceivingCreateView.as_view(),
        name="assembly-receiving-create",
    ),
    path(
        "assignments/<uuid:assignment_id>/reconcile/",
        AssemblyReconcileMaterialsView.as_view(),
        name="assembly-reconcile-materials",
    ),
]
