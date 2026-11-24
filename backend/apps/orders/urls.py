from django.urls import path

from .views import (
    OrderCancelAPIView,
    OrderConfirmAPIView,
    OrderHistoryListAPIView,
    OrderListCreateAPIView,
    OrderReplacementsListCreateAPIView,
    OrderRetrieveUpdateAPIView,
    OrderStatusTransitionAPIView,
)

urlpatterns = [
    path("", OrderListCreateAPIView.as_view(), name="order-list-create"),
    path("<uuid:pk>/", OrderRetrieveUpdateAPIView.as_view(), name="order-detail"),
    path("<uuid:pk>/confirm/", OrderConfirmAPIView.as_view(), name="order-confirm"),
    path("<uuid:pk>/cancel/", OrderCancelAPIView.as_view(), name="order-cancel"),
    path("<uuid:pk>/transition/", OrderStatusTransitionAPIView.as_view(), name="order-transition"),
    path("<uuid:pk>/history/", OrderHistoryListAPIView.as_view(), name="order-history"),
    path(
        "<uuid:pk>/replacements/",
        OrderReplacementsListCreateAPIView.as_view(),
        name="order-replacements",
    ),
]
