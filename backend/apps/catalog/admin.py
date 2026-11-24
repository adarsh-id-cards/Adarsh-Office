from django.contrib import admin

from .models import CatalogOption


@admin.register(CatalogOption)
class CatalogOptionAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "category", "applicable_to", "sort_order", "is_archived")
    list_filter = ("category", "applicable_to", "is_archived")
    search_fields = ("name", "code", "description")
    ordering = ("category", "sort_order", "name")
