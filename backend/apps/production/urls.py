from django.urls import path

from .views import (
    DesignApproveAPIView,
    DesignCompleteAPIView,
    DesignReviewAPIView,
    DesignStartAPIView,
    JobAssemblyCompleteAPIView,
    JobAssemblyOverviewAPIView,
    JobAssemblyReadyAPIView,
    JobAssemblyStartAPIView,
    JobCompleteProductionAPIView,
    JobPrintingRunListCreateAPIView,
    PrintingPlanOverrideAPIView,
    ProductionJobDetailAPIView,
    ProductionJobListAPIView,
    ProductionOverviewAPIView,
)

urlpatterns = [
    path("overview/", ProductionOverviewAPIView.as_view(), name="production-overview"),
    path("queue/", ProductionJobListAPIView.as_view(), name="production-queue"),
    path("jobs/", ProductionJobListAPIView.as_view(), name="production-job-list"),
    path("jobs/<uuid:pk>/", ProductionJobDetailAPIView.as_view(), name="production-job-detail"),
    # Stage 1: Design
    path("jobs/<uuid:pk>/design/start/", DesignStartAPIView.as_view(), name="production-design-start"),
    path("jobs/<uuid:pk>/design/review/", DesignReviewAPIView.as_view(), name="production-design-review"),
    path("jobs/<uuid:pk>/design/approve/", DesignApproveAPIView.as_view(), name="production-design-approve"),
    path("jobs/<uuid:pk>/design/complete/", DesignCompleteAPIView.as_view(), name="production-design-complete"),
    # Stage 2: Printing & Batch Plan Override
    path(
        "jobs/<uuid:pk>/printing-plan/override/",
        PrintingPlanOverrideAPIView.as_view(),
        name="production-printing-plan-override",
    ),
    path(
        "jobs/<uuid:pk>/printing-runs/",
        JobPrintingRunListCreateAPIView.as_view(),
        name="production-job-printing-runs",
    ),
    # Stage 3 (Lanyards): Assembly
    path("jobs/<uuid:pk>/assembly/", JobAssemblyOverviewAPIView.as_view(), name="production-assembly-overview"),
    path("jobs/<uuid:pk>/assembly/ready/", JobAssemblyReadyAPIView.as_view(), name="production-assembly-ready"),
    path("jobs/<uuid:pk>/assembly/start/", JobAssemblyStartAPIView.as_view(), name="production-assembly-start"),
    path("jobs/<uuid:pk>/assembly/complete/", JobAssemblyCompleteAPIView.as_view(), name="production-assembly-complete"),
    # ID Card Completion & Dispatch Readiness
    path("jobs/<uuid:pk>/complete/", JobCompleteProductionAPIView.as_view(), name="production-job-complete"),
]
