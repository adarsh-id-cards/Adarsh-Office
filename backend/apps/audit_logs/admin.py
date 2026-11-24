from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "action", "module", "actor_username", "actor_role", "summary", "ip_address")
    list_filter = ("module", "action", "actor_role")
    search_fields = ("actor_username", "summary", "target_id", "action")
    readonly_fields = (
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
        "user_agent",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False
