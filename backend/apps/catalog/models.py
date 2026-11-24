"""Configurable catalog models for ID card types, lanyard sizes, holders, hooks, and accessories.

Note: Phase 2 establishes the specification catalog foundation for orders without
implementing inventory stock ledger accounting (which is assigned to Phase 4).
"""
from django.db import models

from apps.common.models import ArchivableModel, TimeStampedUUIDModel


class CatalogCategory(models.TextChoices):
    CARD_TYPE = "card_type", "ID Card Type"
    LANYARD_SIZE = "lanyard_size", "Lanyard Size"
    HOLDER = "holder", "ID Card Holder"
    HOOK = "hook", "Lanyard Hook / Fitting"
    ACCESSORY = "accessory", "Additional Accessory"


class ApplicableProduct(models.TextChoices):
    ID_CARD = "id_card", "ID Card"
    LANYARD = "lanyard", "Lanyard"
    BOTH = "both", "Both ID Card & Lanyard"


class CatalogOption(TimeStampedUUIDModel, ArchivableModel):
    """Configurable catalog option for order item specifications."""

    category = models.CharField(
        max_length=32,
        choices=CatalogCategory.choices,
        db_index=True,
        help_text="Specification category (card_type, lanyard_size, holder, hook, accessory).",
    )
    code = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="Stable machine-readable code (e.g. 'lanyard_16mm', 'holder_soft_pvc').",
    )
    name = models.CharField(
        max_length=120,
        help_text="Display label shown to office staff.",
    )
    description = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Optional specification details.",
    )
    applicable_to = models.CharField(
        max_length=20,
        choices=ApplicableProduct.choices,
        default=ApplicableProduct.BOTH,
        db_index=True,
        help_text="Product category where this option can be selected.",
    )
    sort_order = models.PositiveSmallIntegerField(
        default=0,
        help_text="Display ordering within its category.",
    )
    batch_capacity = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Pieces per printing batch for lanyard sizes (e.g. 12 mm = 37, 16 mm = 30, 20 mm = 25).",
    )

    class Meta:
        db_table = "pro_office_catalog_options"
        ordering = ["category", "sort_order", "name"]
        indexes = [
            models.Index(
                fields=["category", "is_archived", "sort_order"],
                name="idx_catalog_cat_active_sort",
            ),
        ]
        verbose_name = "Catalog Option"
        verbose_name_plural = "Catalog Options"

    def __str__(self) -> str:
        return f"{self.get_category_display()}: {self.name}"
