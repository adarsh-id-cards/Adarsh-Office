from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import RolePermission, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "full_name", "email", "role", "is_active", "is_staff", "last_login")
    list_filter = ("role", "is_active", "is_staff")
    search_fields = ("username", "full_name", "email")
    ordering = ("full_name", "username")
    readonly_fields = ("id", "created_at", "updated_at", "last_login", "last_login_ip")

    fieldsets = (
        (None, {"fields": ("id", "username", "password")}),
        ("Personal Info", {"fields": ("full_name", "email")}),
        ("Role & Access", {"fields": ("role", "is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Audit Timestamps", {"fields": ("last_login", "last_login_ip", "created_at", "updated_at")}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("username", "email", "full_name", "role", "password1", "password2", "is_active", "is_staff"),
            },
        ),
    )


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ("role", "permission_code", "is_granted", "description", "updated_at")
    list_filter = ("role", "is_granted")
    search_fields = ("permission_code", "description")
