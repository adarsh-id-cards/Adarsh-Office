"""Models for Packing, Dispatch, Office Surplus Pool, and Client Surplus (Sections 15, 16)."""
from datetime import date

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedUUIDModel


def local_today() -> date:
    return timezone.localdate()


class DispatchRecord(TimeStampedUUIDModel):
    """Order packing and dispatch record supporting partial and multi-stage dispatches."""

    dispatch_number = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        help_text="Unique dispatch reference number (e.g. DSP-1001).",
    )
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.PROTECT,
        related_name="dispatches",
    )
    dispatch_date = models.DateField(default=local_today, db_index=True)
    packing_verified = models.BooleanField(
        default=True,
        help_text="True when packing count and quality were verified before dispatch.",
    )
    dispatched_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_dispatches",
    )
    dispatched_by_username = models.CharField(max_length=150, blank=True, default="")
    idempotency_key = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        unique=True,
        help_text="Optional client-supplied idempotency key preventing duplicate dispatch submissions.",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "pro_office_dispatch_records"
        ordering = ["-dispatch_date", "-created_at"]
        verbose_name = "Dispatch Record"
        verbose_name_plural = "Dispatch Records"

    def __str__(self) -> str:
        return f"{self.dispatch_number} ({self.order.order_number})"


class DispatchItem(TimeStampedUUIDModel):
    """Line item within a DispatchRecord tracking order dispatch, extra sent to client, and office surplus.

    Example from Section 15:
    - Order quantity: 1,000
    - Printed/assembled quantity: 1,020
    - `quantity_dispatched_for_order`: 1,000
    - `extra_dispatched_to_client`: 10
    - `extra_retained_in_office`: 10
    """

    dispatch_record = models.ForeignKey(
        DispatchRecord,
        on_delete=models.CASCADE,
        related_name="items",
    )
    order_item = models.ForeignKey(
        "orders.OrderItem",
        on_delete=models.PROTECT,
        related_name="dispatch_items",
    )
    quantity_dispatched_for_order = models.PositiveIntegerField(
        help_text="Quantity dispatched towards the authorized customer order quantity.",
    )
    extra_dispatched_to_client = models.PositiveIntegerField(
        default=0,
        help_text="Extra surplus pieces sent directly to the client beyond ordered quantity.",
    )
    extra_retained_in_office = models.PositiveIntegerField(
        default=0,
        help_text="Extra surplus pieces retained in the Office Surplus Pool for future replacements.",
    )
    notes = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "pro_office_dispatch_items"
        ordering = ["created_at"]
        verbose_name = "Dispatch Item"
        verbose_name_plural = "Dispatch Items"


class OfficeSurplusPool(TimeStampedUUIDModel):
    """Retained finished surplus stock held inside Adarsh Office for future Replacement Orders (Section 15 & 16)."""

    surplus_code = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        help_text="Unique surplus record identifier (e.g. SRP-1001).",
    )
    source_order = models.ForeignKey(
        "orders.Order",
        on_delete=models.PROTECT,
        related_name="generated_office_surplus",
    )
    source_order_item = models.ForeignKey(
        "orders.OrderItem",
        on_delete=models.PROTECT,
        related_name="office_surplus_records",
    )
    dispatch_item = models.OneToOneField(
        DispatchItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="office_surplus_pool_record",
    )
    client = models.ForeignKey(
        "clients.Client",
        on_delete=models.PROTECT,
        related_name="office_surplus_pool",
    )
    category = models.CharField(max_length=24, db_index=True)
    item_name = models.CharField(max_length=150)
    lanyard_size_name = models.CharField(max_length=40, blank=True, default="")
    specification_summary = models.CharField(max_length=255, blank=True, default="")

    initial_quantity = models.PositiveIntegerField(
        help_text="Initial surplus quantity retained in office.",
    )
    allocated_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Quantity subsequently allocated to replacement orders.",
    )
    remaining_quantity = models.PositiveIntegerField(
        help_text="Remaining available surplus quantity in office.",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "pro_office_surplus_pool"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(remaining_quantity__gte=0),
                name="ck_office_surplus_remaining_non_neg",
            ),
        ]
        verbose_name = "Office Surplus Pool Record"
        verbose_name_plural = "Office Surplus Pool Records"

    def __str__(self) -> str:
        return f"{self.surplus_code} ({self.client.name} - {self.item_name}: {self.remaining_quantity} rem)"


class ClientSurplusRecord(TimeStampedUUIDModel):
    """Record of extra printed/assembled items sent directly to the client with an order dispatch."""

    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.PROTECT,
        related_name="client_surplus_records",
    )
    order_item = models.ForeignKey(
        "orders.OrderItem",
        on_delete=models.PROTECT,
        related_name="client_surplus_records",
    )
    dispatch_item = models.OneToOneField(
        DispatchItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="client_surplus_record",
    )
    client = models.ForeignKey(
        "clients.Client",
        on_delete=models.PROTECT,
        related_name="client_surplus_records",
    )
    quantity_sent = models.PositiveIntegerField()
    dispatch_date = models.DateField(default=local_today)
    notes = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "pro_office_client_surplus_records"
        ordering = ["-dispatch_date", "-created_at"]
        verbose_name = "Client Surplus Record"
        verbose_name_plural = "Client Surplus Records"


class ReplacementSurplusAllocation(TimeStampedUUIDModel):
    """Allocation of retained `OfficeSurplusPool` stock to a Replacement Order item (Section 16)."""

    surplus_pool = models.ForeignKey(
        OfficeSurplusPool,
        on_delete=models.PROTECT,
        related_name="allocations",
    )
    replacement_order = models.ForeignKey(
        "orders.Order",
        on_delete=models.CASCADE,
        related_name="surplus_allocations",
    )
    replacement_order_item = models.ForeignKey(
        "orders.OrderItem",
        on_delete=models.CASCADE,
        related_name="surplus_allocations",
    )
    quantity_allocated = models.PositiveIntegerField()
    allocated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="surplus_allocations",
    )
    allocated_by_username = models.CharField(max_length=150, blank=True, default="")
    notes = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "pro_office_replacement_surplus_allocations"
        ordering = ["-created_at"]
        verbose_name = "Replacement Surplus Allocation"
        verbose_name_plural = "Replacement Surplus Allocations"
