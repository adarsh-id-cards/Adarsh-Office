from django.urls import path

from apps.orders.views import ClientOrderListAPIView

from .views import ClientListCreateAPIView, ClientRetrieveUpdateAPIView

urlpatterns = [
    path("", ClientListCreateAPIView.as_view(), name="client-list-create"),
    path("<uuid:pk>/", ClientRetrieveUpdateAPIView.as_view(), name="client-detail"),
    path("<uuid:pk>/orders/", ClientOrderListAPIView.as_view(), name="client-order-list"),
]
