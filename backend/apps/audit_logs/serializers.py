"""Serializers for audit log viewing."""
from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            "id",
            "actor",
            "actor_username",
            "actor_role",
            "action",
            "module",
            "target_type",
            "target_id",
            "summary",
            "metadata",
            "ip_address",
            "created_at",
        ]
        read_only_fields = fields
