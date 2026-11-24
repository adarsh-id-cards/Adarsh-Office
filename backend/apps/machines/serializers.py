"""Serializers for Physical Machine and MachineAllocation endpoints (Phase 4 — Section 4)."""
from rest_framework import serializers

from apps.catalog.models import CatalogOption
from apps.labour.models import Labourer

from .models import (
    Machine,
    MachineAllocation,
    MachineReturnCondition,
    MachineStatus,
)


class MachineAllocationSerializer(serializers.ModelSerializer):
    machine_code = serializers.CharField(source="machine.machine_code", read_only=True)
    supported_size_label = serializers.CharField(
        source="machine.supported_size_label", read_only=True
    )
    labourer_name = serializers.CharField(source="labourer.name", read_only=True)
    issued_by_username = serializers.CharField(
        source="issued_by.username", read_only=True, default=""
    )
    returned_to_username = serializers.CharField(
        source="returned_to.username", read_only=True, default=""
    )

    class Meta:
        model = MachineAllocation
        fields = [
            "id",
            "machine",
            "machine_code",
            "supported_size_label",
            "labourer",
            "labourer_name",
            "allocated_date",
            "issued_by",
            "issued_by_username",
            "returned_date",
            "returned_to",
            "returned_to_username",
            "return_condition",
            "is_active",
            "notes",
            "created_at",
        ]
        read_only_fields = fields


class MachineSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    current_holder_name = serializers.CharField(
        source="current_holder.name", read_only=True, default=None
    )
    current_location_display = serializers.CharField(read_only=True)
    allocations = MachineAllocationSerializer(many=True, read_only=True)

    class Meta:
        model = Machine
        fields = [
            "id",
            "machine_code",
            "name",
            "machine_type",
            "supported_lanyard_size",
            "supported_size_label",
            "status",
            "status_display",
            "current_holder",
            "current_holder_name",
            "current_location_display",
            "is_archived",
            "notes",
            "allocations",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status_display",
            "current_holder",
            "current_holder_name",
            "current_location_display",
            "allocations",
            "created_at",
            "updated_at",
        ]


class MachineCreateUpdateSerializer(serializers.Serializer):
    machine_code = serializers.CharField(max_length=48)
    name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    machine_type = serializers.CharField(
        max_length=80,
        required=False,
        default="Lanyard Fitting & Assembly Press",
    )
    supported_lanyard_size = serializers.PrimaryKeyRelatedField(
        queryset=CatalogOption.objects.all(),
        required=False,
        allow_null=True,
    )
    supported_size_label = serializers.CharField(
        max_length=40,
        required=False,
        allow_blank=True,
        default="",
    )
    status = serializers.ChoiceField(
        choices=[
            MachineStatus.IN_OFFICE,
            MachineStatus.UNDER_MAINTENANCE,
            MachineStatus.DAMAGED,
            MachineStatus.RETIRED,
        ],
        required=False,
        default=MachineStatus.IN_OFFICE,
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class MachineAllocateInputSerializer(serializers.Serializer):
    labourer = serializers.PrimaryKeyRelatedField(queryset=Labourer.objects.all())
    allocated_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class MachineReturnInputSerializer(serializers.Serializer):
    returned_date = serializers.DateField(required=False, allow_null=True)
    return_condition = serializers.ChoiceField(
        choices=MachineReturnCondition.choices,
        default=MachineReturnCondition.GOOD,
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")
