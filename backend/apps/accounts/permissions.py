"""DRF permission classes for Pro Office role and capability checks."""
from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.views import APIView


class IsOwnerAdmin(permissions.BasePermission):
    """Allow access only to authenticated users with the Owner / Admin role."""

    message = "This action requires Owner / Admin privileges."

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and getattr(user, "is_owner_admin", False)
        )


class HasModulePermission(permissions.BasePermission):
    """Verify the authenticated user possesses the view's `required_permission` code."""

    message = "You do not have permission to perform this action."

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False

        required_permission = getattr(view, "required_permission", None)
        if not required_permission:
            return True

        return bool(
            hasattr(user, "has_module_permission")
            and user.has_module_permission(required_permission)
        )
