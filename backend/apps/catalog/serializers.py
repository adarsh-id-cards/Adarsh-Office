"""Serializers for specification catalog options."""
from rest_framework import serializers

from .models import CatalogOption


class CatalogOptionSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = CatalogOption
        fields = [
            "id",
            "category",
            "category_label",
            "code",
            "name",
            "description",
            "applicable_to",
            "sort_order",
            "batch_capacity",
            "is_archived",
        ]
        read_only_fields = fields
