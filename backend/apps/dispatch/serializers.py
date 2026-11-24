"""Serializers for Packing, Dispatch, Office Surplus Pool, and Client Surplus (Sections 15, 16)."""
from rest_framework import serializers

from .models import (
    ClientSurplusRecord,
    DispatchItem,
    DispatchRecord,
    OfficeSurplusPool,
    ReplacementSurplusAllocation,
)


class DispatchItemSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="order_item.item_name", read_only=True)
    category = serializers.CharField(source="order_item.category", read_only=True)
    ordered_quantity = serializers.IntegerField(
        source="order_item.ordered_quantity", read_only=True
    )

    class Meta:
        model = DispatchItem
        fields = [
            "id",
            "dispatch_record",
            "order_item",
            "item_name",
            "category",
            "ordered_quantity",
            "quantity_dispatched_for_order",
            "extra_dispatched_to_client",
            "extra_retained_in_office",
            "notes",
            "created_at",
        ]
        read_only_fields = fields


class DispatchRecordSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    order_type = serializers.CharField(source="order.order_type", read_only=True)
    order_status = serializers.CharField(source="order.status", read_only=True)
    client_id = serializers.UUIDField(source="order.client_id", read_only=True)
    client_name = serializers.CharField(source="order.client.name", read_only=True)
    items = DispatchItemSerializer(many=True, read_only=True)

    class Meta:
        model = DispatchRecord
        fields = [
            "id",
            "dispatch_number",
            "order",
            "order_number",
            "order_type",
            "order_status",
            "client_id",
            "client_name",
            "dispatch_date",
            "packing_verified",
            "dispatched_by",
            "dispatched_by_username",
            "notes",
            "items",
            "created_at",
        ]
        read_only_fields = fields


class ReplacementSurplusAllocationSerializer(serializers.ModelSerializer):
    surplus_code = serializers.CharField(
        source="surplus_pool.surplus_code", read_only=True
    )
    replacement_order_number = serializers.CharField(
        source="replacement_order.order_number", read_only=True
    )
    replacement_item_name = serializers.CharField(
        source="replacement_order_item.item_name", read_only=True
    )

    class Meta:
        model = ReplacementSurplusAllocation
        fields = [
            "id",
            "surplus_pool",
            "surplus_code",
            "replacement_order",
            "replacement_order_number",
            "replacement_order_item",
            "replacement_item_name",
            "quantity_allocated",
            "allocated_by",
            "allocated_by_username",
            "notes",
            "created_at",
        ]
        read_only_fields = fields


class OfficeSurplusPoolSerializer(serializers.ModelSerializer):
    source_order_number = serializers.CharField(
        source="source_order.order_number", read_only=True
    )
    client_name = serializers.CharField(source="client.name", read_only=True)
    allocations = ReplacementSurplusAllocationSerializer(many=True, read_only=True)

    class Meta:
        model = OfficeSurplusPool
        fields = [
            "id",
            "surplus_code",
            "source_order",
            "source_order_number",
            "source_order_item",
            "dispatch_item",
            "client",
            "client_name",
            "category",
            "item_name",
            "lanyard_size_name",
            "specification_summary",
            "initial_quantity",
            "allocated_quantity",
            "remaining_quantity",
            "notes",
            "allocations",
            "created_at",
        ]
        read_only_fields = fields


class ClientSurplusRecordSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    item_name = serializers.CharField(source="order_item.item_name", read_only=True)
    category = serializers.CharField(source="order_item.category", read_only=True)
    client_name = serializers.CharField(source="client.name", read_only=True)

    class Meta:
        model = ClientSurplusRecord
        fields = [
            "id",
            "order",
            "order_number",
            "order_item",
            "item_name",
            "category",
            "dispatch_item",
            "client",
            "client_name",
            "quantity_sent",
            "dispatch_date",
            "notes",
            "created_at",
        ]
        read_only_fields = fields
