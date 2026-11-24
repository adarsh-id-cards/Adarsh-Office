"""Serializers for Client directory, inline creation, and profile views."""
from rest_framework import serializers

from .models import Client, clean_display_client_name, normalize_client_name


class ClientSerializer(serializers.ModelSerializer):
    """Standard serializer for Client list and inline selection."""

    order_count = serializers.IntegerField(read_only=True, default=0)
    original_order_count = serializers.IntegerField(read_only=True, default=0)
    replacement_order_count = serializers.IntegerField(read_only=True, default=0)
    last_order_date = serializers.DateField(read_only=True, default=None)
    total_original_ordered_quantity = serializers.IntegerField(read_only=True, default=0)
    total_replacement_ordered_quantity = serializers.IntegerField(read_only=True, default=0)
    total_ordered_quantity = serializers.IntegerField(read_only=True, default=0)
    total_dispatched_quantity = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Client
        fields = [
            "id",
            "name",
            "normalized_name",
            "is_archived",
            "archived_at",
            "archive_reason",
            "order_count",
            "original_order_count",
            "replacement_order_count",
            "last_order_date",
            "total_original_ordered_quantity",
            "total_replacement_ordered_quantity",
            "total_ordered_quantity",
            "total_dispatched_quantity",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "normalized_name",
            "archived_at",
            "order_count",
            "original_order_count",
            "replacement_order_count",
            "last_order_date",
            "total_original_ordered_quantity",
            "total_replacement_ordered_quantity",
            "total_ordered_quantity",
            "total_dispatched_quantity",
            "created_at",
            "updated_at",
        ]

    def validate_name(self, value: str) -> str:
        clean_name = clean_display_client_name(value)
        normalized = normalize_client_name(clean_name)
        if not normalized:
            raise serializers.ValidationError("Client name cannot be blank.")

        queryset = Client.objects.filter(normalized_name=normalized)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)

        existing = queryset.first()
        if existing is not None:
            archived_note = " (archived)" if existing.is_archived else ""
            raise serializers.ValidationError(
                f"A client named '{existing.name}'{archived_note} already exists."
            )
        return clean_name
