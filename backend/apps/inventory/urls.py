from django.urls import path

from .views import (
    DefectiveRecordListCreateAPIView,
    InventoryBalanceListAPIView,
    InventoryReconcileAPIView,
    InventoryTransferAPIView,
    OfficeConsumptionAPIView,
    StockInAPIView,
    StockMovementListAPIView,
)

urlpatterns = [
    path("balances/", InventoryBalanceListAPIView.as_view(), name="inventory-balances"),
    path("reconcile/", InventoryReconcileAPIView.as_view(), name="inventory-reconcile"),
    path("movements/", StockMovementListAPIView.as_view(), name="inventory-movements"),
    path("stock-in/", StockInAPIView.as_view(), name="inventory-stock-in"),
    path("transfers/", InventoryTransferAPIView.as_view(), name="inventory-transfers"),
    path("consumption/", OfficeConsumptionAPIView.as_view(), name="inventory-consumption"),
    path("defects/", DefectiveRecordListCreateAPIView.as_view(), name="inventory-defects"),
]
