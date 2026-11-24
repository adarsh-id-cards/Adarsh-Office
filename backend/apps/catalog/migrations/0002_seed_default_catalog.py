"""Data migration to seed default configurable specification catalog options."""
from django.db import migrations


DEFAULT_CATALOG_OPTIONS = [
    # Lanyard sizes (Section 6: 12 mm, 16 mm, 20 mm)
    {
        "category": "lanyard_size",
        "code": "lanyard_12mm",
        "name": "12 mm",
        "description": "12 mm width lanyard ribbon",
        "applicable_to": "lanyard",
        "sort_order": 1,
    },
    {
        "category": "lanyard_size",
        "code": "lanyard_16mm",
        "name": "16 mm",
        "description": "16 mm width standard lanyard ribbon",
        "applicable_to": "lanyard",
        "sort_order": 2,
    },
    {
        "category": "lanyard_size",
        "code": "lanyard_20mm",
        "name": "20 mm",
        "description": "20 mm width wide sublimation lanyard ribbon",
        "applicable_to": "lanyard",
        "sort_order": 3,
    },
    # ID Card Types (Section 5)
    {
        "category": "card_type",
        "code": "card_pvc_cr80",
        "name": "Standard PVC CR80 Card",
        "description": "Glossy fused PVC card (85.6 mm x 54 mm)",
        "applicable_to": "id_card",
        "sort_order": 1,
    },
    {
        "category": "card_type",
        "code": "card_pvc_matte",
        "name": "Matte Finish PVC Card",
        "description": "Non-glare matte finish fused PVC card",
        "applicable_to": "id_card",
        "sort_order": 2,
    },
    {
        "category": "card_type",
        "code": "card_rfid_125khz",
        "name": "RFID Proximity Card (125 kHz)",
        "description": "Contactless RFID attendance/access ID card",
        "applicable_to": "id_card",
        "sort_order": 3,
    },
    {
        "category": "card_type",
        "code": "card_mifare_1k",
        "name": "Smart Card (MIFARE 13.56 MHz)",
        "description": "Contactless smart ID card",
        "applicable_to": "id_card",
        "sort_order": 4,
    },
    # Holders (Sections 5 & 6)
    {
        "category": "holder",
        "code": "holder_soft_pvc",
        "name": "Transparent Soft PVC Holder",
        "description": "Clear flexible vinyl pouch holder",
        "applicable_to": "both",
        "sort_order": 1,
    },
    {
        "category": "holder",
        "code": "holder_rigid_crystal",
        "name": "Rigid Acrylic Crystal Holder",
        "description": "Hard transparent polycarbonate/acrylic holder",
        "applicable_to": "both",
        "sort_order": 2,
    },
    {
        "category": "holder",
        "code": "holder_moulded_coloured",
        "name": "Coloured Moulded PP Holder",
        "description": "Single/double-sided moulded plastic frame holder",
        "applicable_to": "both",
        "sort_order": 3,
    },
    # Hooks (Section 6)
    {
        "category": "hook",
        "code": "hook_dog_metal",
        "name": "Metal Dog Hook",
        "description": "Swivel trigger snap metal dog hook",
        "applicable_to": "lanyard",
        "sort_order": 1,
    },
    {
        "category": "hook",
        "code": "hook_fish_oval",
        "name": "Metal Fish / Oval Hook",
        "description": "Pressed steel clip hook",
        "applicable_to": "lanyard",
        "sort_order": 2,
    },
    {
        "category": "hook",
        "code": "hook_thumb_metal",
        "name": "Thumb Hook (Nickel Plated)",
        "description": "Standard thumb lever hook",
        "applicable_to": "lanyard",
        "sort_order": 3,
    },
    # Additional Accessories (Sections 5 & 6)
    {
        "category": "accessory",
        "code": "acc_yoyo_reel",
        "name": "Yo-Yo Retractable Badge Reel",
        "description": "Clip-on retractable badge reel",
        "applicable_to": "both",
        "sort_order": 1,
    },
    {
        "category": "accessory",
        "code": "acc_safety_breakaway",
        "name": "Safety Breakaway Buckle",
        "description": "Quick-release neck safety buckle for lanyards",
        "applicable_to": "lanyard",
        "sort_order": 2,
    },
    {
        "category": "accessory",
        "code": "acc_eyelet_punch",
        "name": "Slot Punch / Eyelet Rivet",
        "description": "Direct card slot punch with metal eyelet",
        "applicable_to": "id_card",
        "sort_order": 3,
    },
]


def seed_default_catalog_options(apps, schema_editor) -> None:
    CatalogOption = apps.get_model("catalog", "CatalogOption")
    for item in DEFAULT_CATALOG_OPTIONS:
        CatalogOption.objects.update_or_create(
            code=item["code"],
            defaults=item,
        )


def unseed_default_catalog_options(apps, schema_editor) -> None:
    CatalogOption = apps.get_model("catalog", "CatalogOption")
    codes = [item["code"] for item in DEFAULT_CATALOG_OPTIONS]
    CatalogOption.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(
            seed_default_catalog_options,
            reverse_code=unseed_default_catalog_options,
        ),
    ]
