from django.contrib import admin

from .models import Client


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ("name", "normalized_name", "is_archived", "created_by", "created_at")
    list_filter = ("is_archived",)
    search_fields = ("name", "normalized_name")
    readonly_fields = ("id", "normalized_name", "archived_at", "archived_by", "created_at", "updated_at")
