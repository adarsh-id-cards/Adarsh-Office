"""Inventory models for Pro Office (Phase 4 — Sections 6, 7, 9, 10, 11, 12).

Core invariants:
1. Authoritative immutable stock movement ledger (`StockMovement`).
   Balances are never maintained by arbitrary manual overwrites.
2. Separate stock locations (`StockLocation`) for Main Office and each individual Labourer.
3. Separate usable and defective balances (`InventoryBalance`) at each location, protected by
   PostgreSQL non-negative check constraints and row-level `SELECT ... FOR UPDATE` locking.
4. Issuing material to a labourer (`transfer_to_labourer`) is a location transfer — it moves
   stock from Main Office to the Labourer's location without reducing total company inventory.
5. Multiple vendor packaging configurations (`MaterialPackaging`) per material (e.g. 500/pkt vs 1,000/pkt)
   that convert to base units while preserving packet counts and vendor snapshot on every transaction.
"""
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.common.models import ArchivableModel, TimeStampedUUIDModel


class MaterialCategory(models.TextChoices):
    JOINTER = "jointer", "Jointer"
    HOOK = "hook", "Hook"
    HOLDER = "holder", "Holder"
    LANYARD_ROLL = "lanyard_roll", "Lanyard Roll"
    PVC_SHEET = "pvc_sheet", "PVC Sheet"
    CONSUMABLE = "consumable", "Printing / Assembly Consumable"


class BaseUnit(models.TextChoices):
    PIECE = "piece", "Piece"
    SHEET = "sheet", "Sheet"
    ROLL = "roll", "Roll"
    METER = "meter", "Meter"
    PACKET = "packet", "Packet"


class StockLocationType(models.TextChoices):
    MAIN_OFFICE = "main_office", "Main Office"
    LABOURER = "labourer", "Labourer"


class MovementType(models.TextChoices):
    OPENING_STOCK = "opening_stock", "Opening Stock"
    STOCK_IN = "stock_in", "Purchase / Stock Received"
    TRANSFER_TO_LABOURER = "transfer_to_labourer", "Transfer to Labourer"
    TRANSFER_TO_OFFICE = "transfer_to_office", "Return / Transfer to Office"
    INTERNAL_CONSUMPTION = "internal_consumption", "Office Internal Consumption"
    LABOUR_CONSUMPTION = "labour_consumption", "Labour Assignment Consumption"
    DEFECTIVE_MATERIAL = "defective_material", "Defective Material Recorded"
    MATERIAL_WRITE_OFF = "material_write_off", "Material Write-Off"
    STOCK_ADJUSTMENT = "stock_adjustment", "Authorized Stock Adjustment"
    AUDIT_ADJUSTMENT = "audit_adjustment", "Physical Stock Audit Adjustment"


class DefectCategory(models.TextChoices):
    RAW_MATERIAL = "raw_material", "Raw Material Defect"
    FINISHED_PRODUCT = "finished_product", "Finished Product Defect"


class DefectDiscoveryStage(models.TextChoices):
    STOCK_RECEIVING = "stock_receiving", "Stock Receiving Inspection"
    LABOUR_ASSEMBLY = "labour_assembly", "Discovered by Labourer"
    PRINTING_DAMAGE = "printing_damage", "Damaged During Printing"
    ASSEMBLY_RECEIVING = "assembly_receiving", "Assembly Receiving Inspection"
    DISPATCH_INSPECTION = "dispatch_inspection", "Packing / Dispatch Inspection"


class Material(TimeStampedUUIDModel, ArchivableModel):
    """Configurable raw material or consumable tracked in base units."""

    code = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="Unique material code (e.g. MAT-JOINTER-16MM).",
    )
    name = models.CharField(
        max_length=150,
        unique=True,
        db_index=True,
        help_text="Material name (e.g. 'Jointer 16 mm', 'Metal Dog Hook').",
    )
    category = models.CharField(
        max_length=32,
        choices=MaterialCategory.choices,
        db_index=True,
    )
    base_unit = models.CharField(
        max_length=20,
        choices=BaseUnit.choices,
        default=BaseUnit.PIECE,
        help_text="Consistent base unit used for all stock balances and ledger movements.",
    )
    supported_size_label = models.CharField(
        max_length=40,
        blank=True,
        default="",
        db_index=True,
        help_text="Optional lanyard size association (e.g. '12 mm', '16 mm', '20 mm').",
    )
    minimum_stock_level = models.PositiveIntegerField(
        default=0,
        help_text="Optional reorder alert threshold in base units.",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "pro_office_materials"
        ordering = ["category", "name"]
        verbose_name = "Material"
        verbose_name_plural = "Materials"

    def __str__(self) -> str:
        return f"{self.name} ({self.base_unit})"

    def clean(self) -> None:
        super().clean()
        self.name = (self.name or "").strip()
        self.code = (self.code or "").strip().upper()
        if not self.name:
            raise ValidationError({"name": "Material name is required."})
        if not self.code:
            raise ValidationError({"code": "Material code is required."})


class MaterialPackaging(TimeStampedUUIDModel):
    """Vendor packaging configuration attached to a Material (Section 10).

    Example: Jointer -> Vendor A (1,000 per packet), Vendor B (500 per packet).
    """

    material = models.ForeignKey(
        Material,
        on_delete=models.CASCADE,
        related_name="packagings",
    )
    package_name = models.CharField(
        max_length=120,
        help_text="Display name (e.g. 'Packet of 500', 'Box of 1,000').",
    )
    units_per_package = models.PositiveIntegerField(
        help_text="Number of base units contained in one package.",
    )
    vendor_label = models.CharField(
        max_length=120,
        blank=True,
        default="",
        help_text="Optional vendor identifier (e.g. 'Vendor A', 'Vendor B').",
    )
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "pro_office_material_packagings"
        ordering = ["material", "units_per_package", "package_name"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(units_per_package__gte=1),
                name="ck_packaging_units_per_pkg_positive",
            ),
        ]
        verbose_name = "Material Packaging"
        verbose_name_plural = "Material Packagings"

    def __str__(self) -> str:
        vendor = f" [{self.vendor_label}]" if self.vendor_label else ""
        return f"{self.material.name} — {self.package_name} ({self.units_per_package} {self.material.base_unit}s){vendor}"


class StockLocation(TimeStampedUUIDModel):
    """Distinct inventory storage location (Main Office or an individual Labourer)."""

    code = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="Unique location code ('MAIN_OFFICE' or 'LABOURER_<id>').",
    )
    name = models.CharField(
        max_length=150,
    )
    location_type = models.CharField(
        max_length=24,
        choices=StockLocationType.choices,
        db_index=True,
    )
    labourer = models.OneToOneField(
        "labour.Labourer",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="stock_location",
    )
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "pro_office_stock_locations"
        ordering = ["location_type", "name"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(location_type="main_office", labourer__isnull=True)
                    | models.Q(location_type="labourer", labourer__isnull=False)
                ),
                name="ck_stock_location_labourer_consistency",
            ),
        ]
        verbose_name = "Stock Location"
        verbose_name_plural = "Stock Locations"

    def __str__(self) -> str:
        return self.name


class InventoryBalance(TimeStampedUUIDModel):
    """Projected usable and defective stock balance for a (Material, StockLocation) pair.

    Updated exclusively inside atomic ledger transactions with `SELECT ... FOR UPDATE`.
    """

    material = models.ForeignKey(
        Material,
        on_delete=models.PROTECT,
        related_name="balances",
    )
    location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        related_name="balances",
    )
    usable_quantity = models.IntegerField(
        default=0,
        help_text="Current usable stock in base units.",
    )
    defective_quantity = models.IntegerField(
        default=0,
        help_text="Current defective/damaged stock at this location in base units.",
    )

    class Meta:
        db_table = "pro_office_inventory_balances"
        ordering = ["location", "material__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["material", "location"],
                name="uq_inventory_balance_material_location",
            ),
            models.CheckConstraint(
                condition=models.Q(usable_quantity__gte=0),
                name="ck_inventory_balance_usable_non_negative",
            ),
            models.CheckConstraint(
                condition=models.Q(defective_quantity__gte=0),
                name="ck_inventory_balance_defective_non_negative",
            ),
        ]
        verbose_name = "Inventory Balance"
        verbose_name_plural = "Inventory Balances"

    def __str__(self) -> str:
        return f"{self.location.name} | {self.material.name}: {self.usable_quantity} usable ({self.defective_quantity} def)"


class StockMovementSequence(models.Model):
    """Row-locked counter generating unique sequential movement codes (`MOV-10001`)."""

    key = models.CharField(max_length=32, primary_key=True, default="default")
    last_value = models.PositiveIntegerField(default=10000)

    class Meta:
        db_table = "pro_office_stock_movement_sequences"


class StockMovement(TimeStampedUUIDModel):
    """Immutable inventory ledger entry recording every stock change."""

    transaction_code = models.CharField(
        max_length=48,
        unique=True,
        db_index=True,
        help_text="Unique sequential transaction code (e.g. MOV-10001).",
    )
    material = models.ForeignKey(
        Material,
        on_delete=models.PROTECT,
        related_name="movements",
    )
    movement_type = models.CharField(
        max_length=36,
        choices=MovementType.choices,
        db_index=True,
    )
    quantity = models.PositiveIntegerField(
        help_text="Total base units involved in this movement.",
    )
    defective_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Defective base units included in this transaction (if any).",
    )
    usable_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Usable base units moved in this transaction.",
    )

    source_location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="outgoing_movements",
    )
    destination_location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="incoming_movements",
    )

    # Signed ledger deltas for exact balance reconstruction
    source_usable_delta = models.IntegerField(default=0)
    source_defective_delta = models.IntegerField(default=0)
    destination_usable_delta = models.IntegerField(default=0)
    destination_defective_delta = models.IntegerField(default=0)

    # Preserved packaging snapshot (Section 10)
    packaging = models.ForeignKey(
        MaterialPackaging,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="movements",
    )
    package_count = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of packages entered when using packaging conversion.",
    )
    units_per_package_snapshot = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Snapshot of units per package at the time of transaction.",
    )
    vendor_label_snapshot = models.CharField(
        max_length=120,
        blank=True,
        default="",
    )

    # Traceability links
    related_order = models.ForeignKey(
        "orders.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_movements",
    )
    related_assignment = models.ForeignKey(
        "assembly.AssemblyAssignment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_movements",
    )
    related_audit = models.ForeignKey(
        "stock_audit.StockAudit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_movements",
    )
    idempotency_key = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        unique=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_stock_movements",
    )
    created_by_username = models.CharField(
        max_length=150,
        blank=True,
        default="",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "pro_office_stock_movements"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1),
                name="ck_stock_movement_quantity_positive",
            ),
        ]
        indexes = [
            models.Index(
                fields=["material", "-created_at"],
                name="idx_stock_mov_mat_created",
            ),
            models.Index(
                fields=["movement_type", "-created_at"],
                name="idx_stock_mov_type_created",
            ),
        ]
        verbose_name = "Stock Movement"
        verbose_name_plural = "Stock Movements"

    def __str__(self) -> str:
        return f"{self.transaction_code} [{self.movement_type}] {self.material.name}: {self.quantity}"


class DefectiveRecord(TimeStampedUUIDModel):
    """Explicit record of raw-material or finished-product defects discovered at any stage (Section 12)."""

    defect_category = models.CharField(
        max_length=24,
        choices=DefectCategory.choices,
        default=DefectCategory.RAW_MATERIAL,
        db_index=True,
    )
    discovery_stage = models.CharField(
        max_length=32,
        choices=DefectDiscoveryStage.choices,
        db_index=True,
    )
    material = models.ForeignKey(
        Material,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="defect_records",
    )
    location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="defect_records",
    )
    related_order = models.ForeignKey(
        "orders.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="defect_records",
    )
    related_order_item = models.ForeignKey(
        "orders.OrderItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="defect_records",
    )
    related_assignment = models.ForeignKey(
        "assembly.AssemblyAssignment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="defect_records",
    )
    stock_movement = models.ForeignKey(
        StockMovement,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="defect_records",
    )
    quantity = models.PositiveIntegerField()
    reason = models.CharField(max_length=255)
    disposition = models.CharField(
        max_length=40,
        default="quarantined",
        help_text="Disposition of defective stock (quarantined, written_off, returned_to_vendor).",
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    recorded_by_username = models.CharField(max_length=150, blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "pro_office_defective_records"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1),
                name="ck_defective_record_qty_positive",
            ),
        ]
        verbose_name = "Defective Record"
        verbose_name_plural = "Defective Records"
