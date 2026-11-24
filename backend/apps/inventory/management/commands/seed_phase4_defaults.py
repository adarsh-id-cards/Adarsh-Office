"""Management command to idempotently seed configurable Phase 4 materials & vendor packagings."""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.inventory.models import (
    BaseUnit,
    Material,
    MaterialCategory,
    MaterialPackaging,
)
from apps.inventory.services import get_main_office_location


DEFAULT_MATERIALS = [
    {
        "code": "MAT-JOINTER-16MM",
        "name": "Jointer 16 mm",
        "category": MaterialCategory.JOINTER,
        "base_unit": BaseUnit.PIECE,
        "supported_size_label": "16 mm",
        "minimum_stock_level": 1000,
        "packagings": [
            {"package_name": "Packet of 500", "units_per_package": 500, "vendor_label": "Vendor B", "is_default": True},
            {"package_name": "Box of 1,000", "units_per_package": 1000, "vendor_label": "Vendor A", "is_default": False},
        ],
    },
    {
        "code": "MAT-JOINTER-12MM",
        "name": "Jointer 12 mm",
        "category": MaterialCategory.JOINTER,
        "base_unit": BaseUnit.PIECE,
        "supported_size_label": "12 mm",
        "minimum_stock_level": 500,
        "packagings": [
            {"package_name": "Packet of 500", "units_per_package": 500, "vendor_label": "Vendor B", "is_default": True},
        ],
    },
    {
        "code": "MAT-JOINTER-20MM",
        "name": "Jointer 20 mm",
        "category": MaterialCategory.JOINTER,
        "base_unit": BaseUnit.PIECE,
        "supported_size_label": "20 mm",
        "minimum_stock_level": 500,
        "packagings": [
            {"package_name": "Packet of 500", "units_per_package": 500, "vendor_label": "Vendor B", "is_default": True},
        ],
    },
    {
        "code": "MAT-HOOK-DOG",
        "name": "Metal Dog Hook",
        "category": MaterialCategory.HOOK,
        "base_unit": BaseUnit.PIECE,
        "supported_size_label": "",
        "minimum_stock_level": 1000,
        "packagings": [
            {"package_name": "Packet of 500", "units_per_package": 500, "vendor_label": "Vendor B", "is_default": True},
            {"package_name": "Box of 1,000", "units_per_package": 1000, "vendor_label": "Vendor A", "is_default": False},
        ],
    },
    {
        "code": "MAT-HOLDER-STD",
        "name": "Standard ID Card Holder",
        "category": MaterialCategory.HOLDER,
        "base_unit": BaseUnit.PIECE,
        "supported_size_label": "",
        "minimum_stock_level": 500,
        "packagings": [
            {"package_name": "Packet of 100", "units_per_package": 100, "vendor_label": "Standard Supply", "is_default": True},
            {"package_name": "Carton of 1,000", "units_per_package": 1000, "vendor_label": "Bulk Supply", "is_default": False},
        ],
    },
    {
        "code": "MAT-LANYARD-ROLL-16MM",
        "name": "Satin Lanyard Roll 16 mm",
        "category": MaterialCategory.LANYARD_ROLL,
        "base_unit": BaseUnit.ROLL,
        "supported_size_label": "16 mm",
        "minimum_stock_level": 10,
        "packagings": [
            {"package_name": "Bundle of 10 Rolls", "units_per_package": 10, "vendor_label": "Roll Mill", "is_default": True},
        ],
    },
    {
        "code": "MAT-PVC-SHEET-A4",
        "name": "PVC Card Sheet (A4)",
        "category": MaterialCategory.PVC_SHEET,
        "base_unit": BaseUnit.SHEET,
        "supported_size_label": "",
        "minimum_stock_level": 100,
        "packagings": [
            {"package_name": "Pack of 50 Sheets", "units_per_package": 50, "vendor_label": "Card Media", "is_default": True},
        ],
    },
]


class Command(BaseCommand):
    help = "Seed configurable Phase 4 raw materials, vendor packaging options, and Main Office location."

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        get_main_office_location()
        created_mats = 0
        created_pkgs = 0

        for item in DEFAULT_MATERIALS:
            pkgs = item["packagings"]
            mat, created = Material.objects.get_or_create(
                code=item["code"],
                defaults={
                    "name": item["name"],
                    "category": item["category"],
                    "base_unit": item["base_unit"],
                    "supported_size_label": item["supported_size_label"],
                    "minimum_stock_level": item["minimum_stock_level"],
                },
            )
            if created:
                created_mats += 1
            for pkg in pkgs:
                _, pkg_created = MaterialPackaging.objects.get_or_create(
                    material=mat,
                    package_name=pkg["package_name"],
                    units_per_package=pkg["units_per_package"],
                    defaults={
                        "vendor_label": pkg["vendor_label"],
                        "is_default": pkg["is_default"],
                    },
                )
                if pkg_created:
                    created_pkgs += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded Phase 4 defaults: {created_mats} material(s), {created_pkgs} packaging option(s)."
            )
        )
