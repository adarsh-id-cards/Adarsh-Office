"""Transactional inventory ledger services for Pro Office (Phase 4).

All stock changes flow through this service module using `transaction.atomic()` and
`SELECT ... FOR UPDATE` row locking on `InventoryBalance` and `StockMovementSequence`.
"""

from typing import Any

from django.db import models, transaction
from django.http import HttpRequest
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.audit_logs.services import record_audit_log
from apps.labour.models import Labourer

from .models import (
    DefectCategory,
    DefectDiscoveryStage,
    DefectiveRecord,
    InventoryBalance,
    Material,
    MaterialPackaging,
    MovementType,
    StockLocation,
    StockLocationType,
    StockMovement,
    StockMovementSequence,
)


def next_named_sequence(
    *,
    key: str,
    prefix: str,
    start_value: int,
    model_cls: type[models.Model],
    field_name: str,
) -> str:
    """Atomically allocate a unique sequential code under a row-locked counter entry."""
    with transaction.atomic():
        seq, _ = StockMovementSequence.objects.select_for_update().get_or_create(
            key=key,
            defaults={"last_value": start_value},
        )
        while True:
            seq.last_value += 1
            candidate = f"{prefix}{seq.last_value}"
            if not model_cls.objects.filter(**{field_name: candidate}).exists():
                seq.save(update_fields=["last_value"])
                return candidate


def next_movement_code() -> str:
    """Atomically allocate the next unique sequential stock movement code (`MOV-10001`)."""
    return next_named_sequence(
        key="default",
        prefix="MOV-",
        start_value=10000,
        model_cls=StockMovement,
        field_name="transaction_code",
    )


def get_main_office_location() -> StockLocation:
    """Ensure and return the singleton Main Office StockLocation."""
    loc, _ = StockLocation.objects.get_or_create(
        code="MAIN_OFFICE",
        defaults={
            "name": "Main Office Inventory",
            "location_type": StockLocationType.MAIN_OFFICE,
            "is_active": True,
        },
    )
    return loc


def ensure_labourer_stock_location(labourer: Labourer) -> StockLocation:
    """Ensure and return the dedicated StockLocation for a specific Labourer."""
    existing = StockLocation.objects.filter(labourer=labourer).first()
    if existing is not None:
        if existing.name != f"Labourer: {labourer.name}":
            existing.name = f"Labourer: {labourer.name}"
            existing.save(update_fields=["name", "updated_at"])
        return existing

    code = f"LABOUR_{str(labourer.id).replace('-', '')[:12].upper()}"
    loc, _ = StockLocation.objects.get_or_create(
        labourer=labourer,
        defaults={
            "code": code,
            "name": f"Labourer: {labourer.name}",
            "location_type": StockLocationType.LABOURER,
            "is_active": True,
        },
    )
    return loc


def get_or_create_locked_balance(
    material: Material,
    location: StockLocation,
) -> InventoryBalance:
    """Fetch and row-lock the InventoryBalance for `(material, location)`."""
    balance, _ = InventoryBalance.objects.select_for_update().get_or_create(
        material=material,
        location=location,
        defaults={
            "usable_quantity": 0,
            "defective_quantity": 0,
        },
    )
    return balance


def get_usable_balance(material: Material, location: StockLocation) -> int:
    bal = InventoryBalance.objects.filter(material=material, location=location).first()
    return int(bal.usable_quantity) if bal else 0


def verify_ledger_reconciliation(
    material: Material, location: StockLocation
) -> dict[str, Any]:
    """Recompute usable and defective balances purely from the immutable StockMovement ledger."""
    out_agg = StockMovement.objects.filter(
        material=material, source_location=location
    ).aggregate(
        u=models.Sum("source_usable_delta"),
        d=models.Sum("source_defective_delta"),
    )
    in_agg = StockMovement.objects.filter(
        material=material, destination_location=location
    ).aggregate(
        u=models.Sum("destination_usable_delta"),
        d=models.Sum("destination_defective_delta"),
    )
    ledger_usable = int(out_agg["u"] or 0) + int(in_agg["u"] or 0)
    ledger_defective = int(out_agg["d"] or 0) + int(in_agg["d"] or 0)

    bal = InventoryBalance.objects.filter(material=material, location=location).first()
    proj_usable = int(bal.usable_quantity) if bal else 0
    proj_defective = int(bal.defective_quantity) if bal else 0

    return {
        "material_id": str(material.id),
        "location_id": str(location.id),
        "ledger_usable_quantity": ledger_usable,
        "projected_usable_quantity": proj_usable,
        "ledger_defective_quantity": ledger_defective,
        "projected_defective_quantity": proj_defective,
        "is_reconciled": (ledger_usable == proj_usable)
        and (ledger_defective == proj_defective),
    }


@transaction.atomic
def record_stock_in(
    *,
    material: Material,
    packaging: MaterialPackaging | None = None,
    package_count: int | None = None,
    quantity: int | None = None,
    defective_quantity: int = 0,
    movement_type: str = MovementType.STOCK_IN,
    idempotency_key: str | None = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> StockMovement:
    """Record stock received (or opening stock) into Main Office inventory with packaging conversion."""
    clean_idem = (idempotency_key or "").strip() or None
    if clean_idem:
        existing = StockMovement.objects.filter(idempotency_key=clean_idem).first()
        if existing is not None:
            return existing

    if movement_type not in {MovementType.STOCK_IN, MovementType.OPENING_STOCK}:
        raise DRFValidationError({"movement_type": "Invalid stock-in movement type."})

    units_per_pkg_snap: int | None = None
    vendor_snap = ""
    resolved_pkg_count: int | None = None

    if packaging is not None:
        if packaging.material_id != material.id:
            raise DRFValidationError(
                {
                    "packaging": "Selected packaging does not belong to the chosen material."
                }
            )
        if not package_count or int(package_count) < 1:
            raise DRFValidationError(
                {
                    "package_count": "Package count must be at least 1 when packaging is selected."
                }
            )
        resolved_pkg_count = int(package_count)
        units_per_pkg_snap = int(packaging.units_per_package)
        vendor_snap = packaging.vendor_label
        total_qty = resolved_pkg_count * units_per_pkg_snap
    else:
        if not quantity or int(quantity) < 1:
            raise DRFValidationError(
                {"quantity": "Total base unit quantity must be at least 1."}
            )
        total_qty = int(quantity)

    def_qty = int(defective_quantity or 0)
    if def_qty < 0:
        raise DRFValidationError(
            {"defective_quantity": "Defective quantity cannot be negative."}
        )
    if def_qty > total_qty:
        raise DRFValidationError(
            {
                "defective_quantity": "Defective quantity cannot exceed total received quantity."
            }
        )

    usable_qty = total_qty - def_qty
    office_loc = get_main_office_location()
    balance = get_or_create_locked_balance(material, office_loc)

    balance.usable_quantity += usable_qty
    balance.defective_quantity += def_qty
    balance.save(update_fields=["usable_quantity", "defective_quantity", "updated_at"])

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    tx_code = next_movement_code()

    movement = StockMovement.objects.create(
        transaction_code=tx_code,
        material=material,
        movement_type=movement_type,
        quantity=total_qty,
        usable_quantity=usable_qty,
        defective_quantity=def_qty,
        source_location=None,
        destination_location=office_loc,
        source_usable_delta=0,
        source_defective_delta=0,
        destination_usable_delta=usable_qty,
        destination_defective_delta=def_qty,
        packaging=packaging,
        package_count=resolved_pkg_count,
        units_per_package_snapshot=units_per_pkg_snap,
        vendor_label_snapshot=vendor_snap,
        idempotency_key=clean_idem,
        created_by=auth_actor,
        created_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
        notes=notes.strip(),
    )

    if def_qty > 0:
        DefectiveRecord.objects.create(
            defect_category=DefectCategory.RAW_MATERIAL,
            discovery_stage=DefectDiscoveryStage.STOCK_RECEIVING,
            material=material,
            location=office_loc,
            stock_movement=movement,
            quantity=def_qty,
            reason=notes.strip()
            or "Defective raw material discovered during stock-in.",
            recorded_by=auth_actor,
            recorded_by_username=getattr(auth_actor, "username", "")
            if auth_actor
            else "",
        )

    record_audit_log(
        action="INVENTORY_STOCK_IN",
        module="inventory",
        summary=(
            f"Recorded {movement_type} {tx_code} for '{material.name}': "
            f"+{usable_qty} usable, +{def_qty} defective at Main Office."
        ),
        actor=auth_actor,
        target_type="StockMovement",
        target_id=str(movement.id),
        metadata={
            "transaction_code": tx_code,
            "material_id": str(material.id),
            "total_quantity": total_qty,
            "usable_quantity": usable_qty,
            "defective_quantity": def_qty,
            "package_count": resolved_pkg_count,
            "units_per_package": units_per_pkg_snap,
        },
        request=request,
    )
    return movement


@transaction.atomic
def transfer_material_to_labourer(
    *,
    material: Material,
    labourer: Labourer,
    packaging: MaterialPackaging | None = None,
    package_count: int | None = None,
    quantity: int | None = None,
    related_order: Any = None,
    related_assignment: Any = None,
    idempotency_key: str | None = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> StockMovement:
    """Transfer usable raw material from Main Office to a Labourer's StockLocation.

    Does not reduce total company inventory; moves usable stock from Main Office to Labourer.
    """
    clean_idem = (idempotency_key or "").strip() or None
    if clean_idem:
        existing = StockMovement.objects.filter(idempotency_key=clean_idem).first()
        if existing is not None:
            return existing

    if not labourer.is_active or labourer.is_archived:
        raise DRFValidationError(
            {
                "labourer": f"Labourer '{labourer.name}' is inactive and cannot receive material."
            }
        )

    units_per_pkg_snap: int | None = None
    vendor_snap = ""
    resolved_pkg_count: int | None = None

    if packaging is not None and package_count and int(package_count) >= 1:
        if packaging.material_id != material.id:
            raise DRFValidationError(
                {
                    "packaging": "Selected packaging does not belong to the chosen material."
                }
            )
        resolved_pkg_count = int(package_count)
        units_per_pkg_snap = int(packaging.units_per_package)
        vendor_snap = packaging.vendor_label
        transfer_qty = resolved_pkg_count * units_per_pkg_snap
    elif quantity and int(quantity) >= 1:
        transfer_qty = int(quantity)
        if packaging is not None:
            units_per_pkg_snap = int(packaging.units_per_package)
            vendor_snap = packaging.vendor_label
            resolved_pkg_count = int(package_count) if package_count else None
    else:
        raise DRFValidationError(
            {
                "quantity": "Provide either a valid package count or a positive base-unit quantity."
            }
        )

    office_loc = get_main_office_location()
    labour_loc = ensure_labourer_stock_location(labourer)

    # Lock both balances in deterministic location ID order to prevent deadlocks
    first_loc, second_loc = sorted([office_loc, labour_loc], key=lambda x: str(x.id))
    get_or_create_locked_balance(material, first_loc)
    get_or_create_locked_balance(material, second_loc)

    office_bal = InventoryBalance.objects.select_for_update().get(
        material=material, location=office_loc
    )
    labour_bal = InventoryBalance.objects.select_for_update().get(
        material=material, location=labour_loc
    )

    if office_bal.usable_quantity < transfer_qty:
        raise DRFValidationError(
            {
                "quantity": (
                    f"Insufficient usable stock of '{material.name}' at Main Office "
                    f"(available: {office_bal.usable_quantity}, requested: {transfer_qty})."
                )
            }
        )

    office_bal.usable_quantity -= transfer_qty
    labour_bal.usable_quantity += transfer_qty
    office_bal.save(update_fields=["usable_quantity", "updated_at"])
    labour_bal.save(update_fields=["usable_quantity", "updated_at"])

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    tx_code = next_movement_code()

    movement = StockMovement.objects.create(
        transaction_code=tx_code,
        material=material,
        movement_type=MovementType.TRANSFER_TO_LABOURER,
        quantity=transfer_qty,
        usable_quantity=transfer_qty,
        defective_quantity=0,
        source_location=office_loc,
        destination_location=labour_loc,
        source_usable_delta=-transfer_qty,
        source_defective_delta=0,
        destination_usable_delta=transfer_qty,
        destination_defective_delta=0,
        packaging=packaging,
        package_count=resolved_pkg_count,
        units_per_package_snapshot=units_per_pkg_snap,
        vendor_label_snapshot=vendor_snap,
        related_order=related_order,
        related_assignment=related_assignment,
        idempotency_key=clean_idem,
        created_by=auth_actor,
        created_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
        notes=notes.strip(),
    )

    record_audit_log(
        action="INVENTORY_TRANSFER_TO_LABOURER",
        module="inventory",
        summary=(
            f"Issued {transfer_qty} {material.base_unit}(s) of '{material.name}' "
            f"to labourer '{labourer.name}' ({tx_code})."
        ),
        actor=auth_actor,
        target_type="StockMovement",
        target_id=str(movement.id),
        metadata={
            "transaction_code": tx_code,
            "material_id": str(material.id),
            "labourer_id": str(labourer.id),
            "quantity": transfer_qty,
            "package_count": resolved_pkg_count,
        },
        request=request,
    )
    return movement


@transaction.atomic
def return_material_from_labourer(
    *,
    material: Material,
    labourer: Labourer,
    usable_quantity: int,
    defective_quantity: int = 0,
    related_assignment: Any = None,
    idempotency_key: str | None = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> StockMovement:
    """Transfer usable and/or defective raw material from a Labourer back to Main Office."""
    clean_idem = (idempotency_key or "").strip() or None
    if clean_idem:
        existing = StockMovement.objects.filter(idempotency_key=clean_idem).first()
        if existing is not None:
            return existing

    u_qty = int(usable_quantity or 0)
    d_qty = int(defective_quantity or 0)
    total_returned = u_qty + d_qty
    if u_qty < 0 or d_qty < 0 or total_returned < 1:
        raise DRFValidationError(
            {"quantity": "Returned quantity (usable + defective) must be at least 1."}
        )

    office_loc = get_main_office_location()
    labour_loc = ensure_labourer_stock_location(labourer)

    first_loc, second_loc = sorted([office_loc, labour_loc], key=lambda x: str(x.id))
    get_or_create_locked_balance(material, first_loc)
    get_or_create_locked_balance(material, second_loc)

    office_bal = InventoryBalance.objects.select_for_update().get(
        material=material, location=office_loc
    )
    labour_bal = InventoryBalance.objects.select_for_update().get(
        material=material, location=labour_loc
    )

    if labour_bal.usable_quantity < total_returned:
        raise DRFValidationError(
            {
                "quantity": (
                    f"Labourer '{labourer.name}' holds only {labour_bal.usable_quantity} "
                    f"usable '{material.name}', cannot return {total_returned}."
                )
            }
        )

    labour_bal.usable_quantity -= total_returned
    office_bal.usable_quantity += u_qty
    office_bal.defective_quantity += d_qty
    labour_bal.save(update_fields=["usable_quantity", "updated_at"])
    office_bal.save(
        update_fields=["usable_quantity", "defective_quantity", "updated_at"]
    )

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    tx_code = next_movement_code()

    movement = StockMovement.objects.create(
        transaction_code=tx_code,
        material=material,
        movement_type=MovementType.TRANSFER_TO_OFFICE,
        quantity=total_returned,
        usable_quantity=u_qty,
        defective_quantity=d_qty,
        source_location=labour_loc,
        destination_location=office_loc,
        source_usable_delta=-total_returned,
        source_defective_delta=0,
        destination_usable_delta=u_qty,
        destination_defective_delta=d_qty,
        related_assignment=related_assignment,
        idempotency_key=clean_idem,
        created_by=auth_actor,
        created_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
        notes=notes.strip(),
    )

    if d_qty > 0:
        DefectiveRecord.objects.create(
            defect_category=DefectCategory.RAW_MATERIAL,
            discovery_stage=DefectDiscoveryStage.LABOUR_ASSEMBLY,
            material=material,
            location=office_loc,
            related_assignment=related_assignment,
            stock_movement=movement,
            quantity=d_qty,
            reason=notes.strip()
            or f"Defective material returned by labourer {labourer.name}.",
            recorded_by=auth_actor,
            recorded_by_username=getattr(auth_actor, "username", "")
            if auth_actor
            else "",
        )

    return movement


@transaction.atomic
def record_material_consumption_or_defect(
    *,
    material: Material,
    location: StockLocation,
    consumed_quantity: int = 0,
    defective_quantity: int = 0,
    movement_type: str = MovementType.INTERNAL_CONSUMPTION,
    discovery_stage: str = DefectDiscoveryStage.PRINTING_DAMAGE,
    related_order: Any = None,
    related_assignment: Any = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> list[StockMovement]:
    """Record usable material consumption and/or raw-material defects at a specific location."""
    c_qty = int(consumed_quantity or 0)
    d_qty = int(defective_quantity or 0)
    total_deduct = c_qty + d_qty

    if c_qty < 0 or d_qty < 0 or total_deduct < 1:
        raise DRFValidationError(
            {"quantity": "Consumption or defective quantity must be at least 1."}
        )

    bal = get_or_create_locked_balance(material, location)
    if bal.usable_quantity < total_deduct:
        raise DRFValidationError(
            {
                "quantity": (
                    f"Insufficient usable balance of '{material.name}' at '{location.name}' "
                    f"(available: {bal.usable_quantity}, required: {total_deduct})."
                )
            }
        )

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    created_movements: list[StockMovement] = []

    if c_qty > 0:
        bal.usable_quantity -= c_qty
        tx_code = next_movement_code()
        mov = StockMovement.objects.create(
            transaction_code=tx_code,
            material=material,
            movement_type=movement_type,
            quantity=c_qty,
            usable_quantity=c_qty,
            defective_quantity=0,
            source_location=location,
            destination_location=None,
            source_usable_delta=-c_qty,
            source_defective_delta=0,
            destination_usable_delta=0,
            destination_defective_delta=0,
            related_order=related_order,
            related_assignment=related_assignment,
            created_by=auth_actor,
            created_by_username=getattr(auth_actor, "username", "")
            if auth_actor
            else "",
            notes=notes.strip(),
        )
        created_movements.append(mov)

    if d_qty > 0:
        bal.usable_quantity -= d_qty
        bal.defective_quantity += d_qty
        tx_code = next_movement_code()
        def_mov = StockMovement.objects.create(
            transaction_code=tx_code,
            material=material,
            movement_type=MovementType.DEFECTIVE_MATERIAL,
            quantity=d_qty,
            usable_quantity=0,
            defective_quantity=d_qty,
            source_location=location,
            destination_location=location,
            source_usable_delta=-d_qty,
            source_defective_delta=0,
            destination_usable_delta=0,
            destination_defective_delta=d_qty,
            related_order=related_order,
            related_assignment=related_assignment,
            created_by=auth_actor,
            created_by_username=getattr(auth_actor, "username", "")
            if auth_actor
            else "",
            notes=notes.strip(),
        )
        DefectiveRecord.objects.create(
            defect_category=DefectCategory.RAW_MATERIAL,
            discovery_stage=discovery_stage,
            material=material,
            location=location,
            related_order=related_order,
            related_assignment=related_assignment,
            stock_movement=def_mov,
            quantity=d_qty,
            reason=notes.strip() or "Defective raw material recorded.",
            recorded_by=auth_actor,
            recorded_by_username=getattr(auth_actor, "username", "")
            if auth_actor
            else "",
        )
        created_movements.append(def_mov)

    bal.save(update_fields=["usable_quantity", "defective_quantity", "updated_at"])

    record_audit_log(
        action="INVENTORY_CONSUMPTION_RECORDED",
        module="inventory",
        summary=(
            f"Recorded consumption/defect for '{material.name}' at '{location.name}': "
            f"consumed={c_qty}, defective={d_qty}."
        ),
        actor=auth_actor,
        target_type="Material",
        target_id=str(material.id),
        request=request,
    )
    return created_movements


def compute_office_consumption_formula(
    material: Material,
    closing_physical_stock: int | None = None,
) -> dict[str, Any]:
    """Compute Section 11 Automatic Office Consumption Reconciliation formula.

    Formula:
    Net Office Consumption =
      Opening Office Stock
      + Stock Received
      + Returns from Labourers
      - Transfers to Labourers
      - Closing Physical Office Stock

    Clearly distinguishes:
    - Recorded manual consumption (`internal_consumption`, `defective_material`, `material_write_off`)
    - Calculated net consumption
    - Unexplained difference (`calculated_net_consumption - recorded_consumption`)
    """
    office_loc = get_main_office_location()

    opening = (
        StockMovement.objects.filter(
            material=material,
            destination_location=office_loc,
            movement_type=MovementType.OPENING_STOCK,
        ).aggregate(s=models.Sum("destination_usable_delta"))["s"]
        or 0
    )
    received = (
        StockMovement.objects.filter(
            material=material,
            destination_location=office_loc,
            movement_type=MovementType.STOCK_IN,
        ).aggregate(s=models.Sum("destination_usable_delta"))["s"]
        or 0
    )
    returns_from_labour = (
        StockMovement.objects.filter(
            material=material,
            destination_location=office_loc,
            movement_type=MovementType.TRANSFER_TO_OFFICE,
        ).aggregate(s=models.Sum("destination_usable_delta"))["s"]
        or 0
    )
    transfers_to_labour = abs(
        StockMovement.objects.filter(
            material=material,
            source_location=office_loc,
            movement_type=MovementType.TRANSFER_TO_LABOURER,
        ).aggregate(s=models.Sum("source_usable_delta"))["s"]
        or 0
    )
    recorded_consumption = abs(
        StockMovement.objects.filter(
            material=material,
            source_location=office_loc,
            movement_type__in=[
                MovementType.INTERNAL_CONSUMPTION,
                MovementType.DEFECTIVE_MATERIAL,
                MovementType.MATERIAL_WRITE_OFF,
            ],
        ).aggregate(s=models.Sum("source_usable_delta"))["s"]
        or 0
    )

    system_office_stock = get_usable_balance(material, office_loc)
    effective_closing = (
        int(closing_physical_stock)
        if closing_physical_stock is not None
        else system_office_stock
    )

    calculated_net_consumption = (
        int(opening)
        + int(received)
        + int(returns_from_labour)
        - int(transfers_to_labour)
        - effective_closing
    )
    unexplained_difference = calculated_net_consumption - int(recorded_consumption)

    return {
        "material_id": str(material.id),
        "material_name": material.name,
        "base_unit": material.base_unit,
        "opening_office_stock": int(opening),
        "stock_received": int(received),
        "returns_from_labourers": int(returns_from_labour),
        "transfers_to_labourers": int(transfers_to_labour),
        "system_expected_office_stock": system_office_stock,
        "closing_physical_office_stock": effective_closing,
        "recorded_manual_consumption": int(recorded_consumption),
        "calculated_net_office_consumption": calculated_net_consumption,
        "unexplained_difference": unexplained_difference,
    }
