"""Services for Labourer management and End-of-Season Seasonal Closing (Sections 3, 14)."""

from datetime import date
from typing import Any

from django.db import transaction
from django.http import HttpRequest
from django.utils import timezone
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.audit_logs.services import record_audit_log
from apps.inventory.models import (
    InventoryBalance,
    Material,
    MovementType,
    StockMovement,
)
from apps.inventory.services import (
    ensure_labourer_stock_location,
    get_or_create_locked_balance,
    next_movement_code,
    next_named_sequence,
    return_material_from_labourer,
)
from apps.machines.models import Machine, MachineReturnCondition
from apps.machines.services import return_machine_to_office

from .models import (
    Labourer,
    SeasonalClosing,
    SeasonalClosingMachineLine,
    SeasonalClosingMaterialLine,
    SeasonalClosingStatus,
)


def local_today() -> date:
    return timezone.localdate()


@transaction.atomic
def create_labourer(
    *,
    name: str,
    contact_number: str = "",
    is_active: bool = True,
    joined_date: date | None = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> Labourer:
    """Create a new Labourer record and initialize their dedicated StockLocation."""
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    labourer = Labourer(
        name=name,
        contact_number=(contact_number or "").strip(),
        is_active=is_active,
        joined_date=joined_date or local_today(),
        notes=(notes or "").strip(),
        created_by=auth_actor,
    )
    labourer.save()
    ensure_labourer_stock_location(labourer)

    record_audit_log(
        action="LABOURER_CREATED",
        module="labour",
        summary=f"Created labourer profile '{labourer.name}'.",
        actor=auth_actor,
        target_type="Labourer",
        target_id=str(labourer.id),
        metadata={"name": labourer.name, "is_active": labourer.is_active},
        request=request,
    )
    return labourer


@transaction.atomic
def create_seasonal_closing(
    *,
    labourer: Labourer,
    season_label: str = "Annual Production Season",
    closing_date: date | None = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> SeasonalClosing:
    """Create a Seasonal Closing snapshot of a labourer's expected material balances and machines (Section 14)."""
    closing_code = next_named_sequence(
        key="seasonal_closing",
        prefix="SCL-",
        start_value=1000,
        model_cls=SeasonalClosing,
        field_name="closing_code",
    )

    closing = SeasonalClosing.objects.create(
        closing_code=closing_code,
        labourer=labourer,
        season_label=(season_label or "Annual Production Season").strip(),
        closing_date=closing_date or local_today(),
        status=SeasonalClosingStatus.DRAFT,
        notes=(notes or "").strip(),
    )

    labour_loc = ensure_labourer_stock_location(labourer)
    balances = InventoryBalance.objects.filter(location=labour_loc).select_related(
        "material"
    )
    balance_map = {b.material_id: int(b.usable_quantity) for b in balances}

    # Include all active materials where labourer has balance > 0, or all active materials if none
    materials = list(Material.objects.filter(is_active=True, is_archived=False))
    for mat in materials:
        expected = balance_map.get(mat.id, 0)
        if expected > 0 or len(balance_map) == 0:
            SeasonalClosingMaterialLine.objects.create(
                seasonal_closing=closing,
                material=mat,
                expected_usable_balance=expected,
                actual_returned_usable=expected,
                actual_returned_defective=0,
                missing_or_unexplained_quantity=0,
            )

    allocated_machines = Machine.objects.filter(current_holder=labourer)
    for mch in allocated_machines:
        SeasonalClosingMachineLine.objects.create(
            seasonal_closing=closing,
            machine=mch,
            was_returned=True,
            return_condition="good",
        )

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None
    record_audit_log(
        action="SEASONAL_CLOSING_CREATED",
        module="labour",
        summary=f"Created seasonal closing '{closing_code}' for labourer '{labourer.name}'.",
        actor=auth_actor,
        target_type="SeasonalClosing",
        target_id=str(closing.id),
        request=request,
    )
    return closing


@transaction.atomic
def reconcile_seasonal_closing(
    *,
    closing: SeasonalClosing,
    material_lines: list[dict[str, Any]] | None = None,
    machine_lines: list[dict[str, Any]] | None = None,
    mark_labourer_inactive: bool = False,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> SeasonalClosing:
    """Reconcile and finalize an End-of-Season Closing (Section 14).

    - Transfers physically returned usable and defective raw materials back to Main Office.
    - Writes off any missing/unexplained material from the labourer's balance via the immutable ledger.
    - Returns physically returned machines to Main Office (or marks damaged).
    """
    locked_closing = SeasonalClosing.objects.select_for_update().get(pk=closing.pk)
    if locked_closing.status == SeasonalClosingStatus.RECONCILED:
        raise DRFValidationError(
            {
                "status": f"Seasonal closing '{locked_closing.closing_code}' is already reconciled."
            }
        )

    labourer = locked_closing.labourer
    labour_loc = ensure_labourer_stock_location(labourer)
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None

    mat_input_map: dict[str, dict[str, Any]] = {}
    for item in material_lines or []:
        key = str(item.get("id") or item.get("material_id") or "")
        if key:
            mat_input_map[key] = item

    for line in locked_closing.material_lines.select_related("material").all():
        current_bal = get_or_create_locked_balance(line.material, labour_loc)
        line.expected_usable_balance = int(current_bal.usable_quantity)

        payload = mat_input_map.get(str(line.id)) or mat_input_map.get(
            str(line.material_id)
        )
        if payload is not None:
            ret_u = int(
                payload.get("actual_returned_usable", line.actual_returned_usable) or 0
            )
            ret_d = int(
                payload.get("actual_returned_defective", line.actual_returned_defective)
                or 0
            )
            explanation = (payload.get("discrepancy_explanation") or "").strip()
        else:
            ret_u = min(int(line.actual_returned_usable), line.expected_usable_balance)
            ret_d = int(line.actual_returned_defective)
            explanation = line.discrepancy_explanation

        if ret_u < 0 or ret_d < 0:
            raise DRFValidationError(
                {"material_lines": "Returned material quantities cannot be negative."}
            )

        total_returned = ret_u + ret_d
        missing_qty = line.expected_usable_balance - total_returned

        # If labourer returned more than system expected, record positive stock adjustment first
        if total_returned > line.expected_usable_balance:
            excess = total_returned - line.expected_usable_balance
            current_bal.usable_quantity += excess
            current_bal.save(update_fields=["usable_quantity", "updated_at"])
            StockMovement.objects.create(
                transaction_code=next_movement_code(),
                material=line.material,
                movement_type=MovementType.STOCK_ADJUSTMENT,
                quantity=excess,
                usable_quantity=excess,
                defective_quantity=0,
                source_location=None,
                destination_location=labour_loc,
                destination_usable_delta=excess,
                created_by=auth_actor,
                created_by_username=getattr(auth_actor, "username", "")
                if auth_actor
                else "",
                notes=(
                    f"Seasonal closing {locked_closing.closing_code}: excess material returned by {labourer.name}."
                ),
            )

        if total_returned > 0:
            return_material_from_labourer(
                material=line.material,
                labourer=labourer,
                usable_quantity=ret_u,
                defective_quantity=ret_d,
                notes=(
                    f"Seasonal closing {locked_closing.closing_code} return from {labourer.name}."
                ),
                actor=auth_actor,
                request=request,
            )

        if missing_qty > 0:
            current_bal = get_or_create_locked_balance(line.material, labour_loc)
            deduct = min(int(current_bal.usable_quantity), missing_qty)
            if deduct > 0:
                current_bal.usable_quantity -= deduct
                current_bal.save(update_fields=["usable_quantity", "updated_at"])
                StockMovement.objects.create(
                    transaction_code=next_movement_code(),
                    material=line.material,
                    movement_type=MovementType.MATERIAL_WRITE_OFF,
                    quantity=deduct,
                    usable_quantity=deduct,
                    defective_quantity=0,
                    source_location=labour_loc,
                    destination_location=None,
                    source_usable_delta=-deduct,
                    created_by=auth_actor,
                    created_by_username=getattr(auth_actor, "username", "")
                    if auth_actor
                    else "",
                    notes=(
                        explanation
                        or f"Seasonal closing {locked_closing.closing_code}: missing/unreturned material write-off."
                    ),
                )

        line.actual_returned_usable = ret_u
        line.actual_returned_defective = ret_d
        line.missing_or_unexplained_quantity = missing_qty
        line.discrepancy_explanation = explanation
        line.save()

    mch_input_map: dict[str, dict[str, Any]] = {}
    for item in machine_lines or []:
        key = str(item.get("id") or item.get("machine_id") or "")
        if key:
            mch_input_map[key] = item

    for mline in locked_closing.machine_lines.select_related("machine").all():
        payload = mch_input_map.get(str(mline.id)) or mch_input_map.get(
            str(mline.machine_id)
        )
        if payload is not None:
            mline.was_returned = bool(payload.get("was_returned", True))
            mline.return_condition = payload.get("return_condition", "good")
            mline.notes = (payload.get("notes") or "").strip()
            mline.save()

        if mline.was_returned and mline.machine.current_holder_id == labourer.id:
            cond = (
                MachineReturnCondition.DAMAGED
                if mline.return_condition == "damaged"
                else MachineReturnCondition.GOOD
            )
            return_machine_to_office(
                machine=mline.machine,
                returned_date=locked_closing.closing_date,
                return_condition=cond,
                notes=f"Seasonal closing {locked_closing.closing_code}: {mline.notes}".strip(),
                actor=auth_actor,
                request=request,
            )

    locked_closing.status = SeasonalClosingStatus.RECONCILED
    locked_closing.reconciled_at = timezone.now()
    locked_closing.reconciled_by = auth_actor
    if notes.strip():
        locked_closing.notes = (
            f"{locked_closing.notes}\n{notes.strip()}".strip()
            if locked_closing.notes
            else notes.strip()
        )
    locked_closing.save()

    if mark_labourer_inactive:
        labourer.is_active = False
        labourer.save(update_fields=["is_active", "updated_at"])

    record_audit_log(
        action="SEASONAL_CLOSING_RECONCILED",
        module="labour",
        summary=(
            f"Reconciled seasonal closing '{locked_closing.closing_code}' for labourer '{labourer.name}'."
        ),
        actor=auth_actor,
        target_type="SeasonalClosing",
        target_id=str(locked_closing.id),
        request=request,
    )
    return locked_closing
