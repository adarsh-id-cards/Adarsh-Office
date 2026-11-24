"""Serializers for authentication and user profile endpoints."""
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.db.models import Q
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    """Read-only representation of an authenticated internal user."""

    role_label = serializers.CharField(read_only=True)
    is_owner_admin = serializers.BooleanField(read_only=True)
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "full_name",
            "role",
            "role_label",
            "is_owner_admin",
            "is_active",
            "permissions",
            "last_login",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_permissions(self, obj: User) -> list[str]:
        return obj.get_effective_permissions()


class LoginSerializer(serializers.Serializer):
    """Validate credentials for session login (accepts username or email)."""

    username = serializers.CharField(
        required=True,
        trim_whitespace=True,
        help_text="Username or work email address.",
    )
    password = serializers.CharField(
        required=True,
        write_only=True,
        style={"input_type": "password"},
        trim_whitespace=False,
    )

    def validate(self, attrs: dict) -> dict:
        identifier = attrs.get("username", "").strip()
        password = attrs.get("password", "")

        if not identifier or not password:
            raise serializers.ValidationError("Both username and password are required.")

        # Allow login via either username or email (case-insensitive)
        candidate = (
            User.objects.filter(
                Q(username__iexact=identifier) | Q(email__iexact=identifier)
            )
            .only("username", "is_active")
            .first()
        )

        resolved_username = candidate.username if candidate else identifier

        if candidate and not candidate.is_active:
            raise serializers.ValidationError(
                "This user account is inactive. Please contact the administrator."
            )

        request = self.context.get("request")
        user = authenticate(request=request, username=resolved_username, password=password)

        if user is None:
            raise serializers.ValidationError("Invalid username or password.")

        if not user.is_active:
            raise serializers.ValidationError("This user account is inactive.")

        attrs["user"] = user
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    """Validate password change request for the current authenticated user."""

    current_password = serializers.CharField(
        required=True,
        write_only=True,
        trim_whitespace=False,
    )
    new_password = serializers.CharField(
        required=True,
        write_only=True,
        trim_whitespace=False,
    )
    confirm_password = serializers.CharField(
        required=True,
        write_only=True,
        trim_whitespace=False,
    )

    def validate_current_password(self, value: str) -> str:
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate(self, attrs: dict) -> dict:
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "New password and confirmation do not match."}
            )
        if attrs["current_password"] == attrs["new_password"]:
            raise serializers.ValidationError(
                {"new_password": "New password must be different from your current password."}
            )

        user = self.context["request"].user
        validate_password(attrs["new_password"], user=user)
        return attrs
