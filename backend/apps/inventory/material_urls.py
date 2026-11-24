from django.urls import path

from .views import MaterialListCreateAPIView, MaterialPackagingListCreateAPIView

urlpatterns = [
    path("", MaterialListCreateAPIView.as_view(), name="material-list-create"),
    path(
        "<uuid:pk>/packaging/",
        MaterialPackagingListCreateAPIView.as_view(),
        name="material-packaging-list-create",
    ),
]
