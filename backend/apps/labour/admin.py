"""Django admin registration for Labour models."""
from django.contrib import admin

from .models import Labourer, SeasonalClosing


@admin.register(Labourer)
class LabourerAdmin(admin.ModelAdmin):
    list_display = ("name", "contact_number", "is_active", "joined_date")
    list_filter = ("is_active",)
    search_fields = ("name", "contact_number")


@admin.register(SeasonalClosing)
class SeasonalClosingAdmin(admin.ModelAdmin):
    list_display = ("closing_code", "labourer", "season_label", "closing_date", "status")
    list_filter = ("status",)
