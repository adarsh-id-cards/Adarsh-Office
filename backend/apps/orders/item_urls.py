from django.urls import path

from .views import OrderItemQuantityUpdateAPIView, OrderItemReplacementsListAPIView

urlpatterns = [
    path("<uuid:pk>/", OrderItemQuantityUpdateAPIView.as_view(), name="order-item-update"),
    path(
        "<uuid:pk>/replacements/",
        OrderItemReplacementsListAPIView.as_view(),
        name="order-item-replacements",
    ),
]
