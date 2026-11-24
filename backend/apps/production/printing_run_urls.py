from django.urls import path

from .views import PrintingRunCompleteAPIView

urlpatterns = [
    path("<uuid:pk>/complete/", PrintingRunCompleteAPIView.as_view(), name="printing-run-complete"),
]
