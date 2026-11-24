"""Data migration to configure lanyard printing batch capacities (12mm=37, 16mm=30, 20mm=25)."""
from django.db import migrations


LANYARD_CAPACITIES = {
    "lanyard_12mm": 37,
    "lanyard_16mm": 30,
    "lanyard_20mm": 25,
}


def set_lanyard_capacities(apps, schema_editor) -> None:
    CatalogOption = apps.get_model("catalog", "CatalogOption")
    for code, capacity in LANYARD_CAPACITIES.items():
        CatalogOption.objects.filter(code=code).update(batch_capacity=capacity)


def clear_lanyard_capacities(apps, schema_editor) -> None:
    CatalogOption = apps.get_model("catalog", "CatalogOption")
    CatalogOption.objects.filter(code__in=list(LANYARD_CAPACITIES.keys())).update(
        batch_capacity=None
    )


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0003_catalogoption_batch_capacity"),
    ]

    operations = [
        migrations.RunPython(
            set_lanyard_capacities,
            reverse_code=clear_lanyard_capacities,
        ),
    ]
