"""Services for Weekly Physical Stock Audits & Automatic Ledger Adjustments (Section 13)."""
from datetime import date
from typing import Any

from django.db import transaction
from django.http import HttpRequest
from django.utils import timezone
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.audit_logs.services import record_audit_log
from apps.inventory.models import (
    Material,
    MovementType,
    StockLocation,
    StockMovement,
)
from apps.inventory.services import (
    compute_office_consumption_formula,
    get_main_office_location,
    get_or_create_locked_balance,
    get_usable_balance,
    next_movement_code,
    next_named_sequence,
)

from .models import StockAudit, StockAuditLine, StockAuditStatus


def local_today() -> date:
    return timezone.localdate()


def _refresh_line_consumption_metrics(line: StockAuditLine) -> None:
    formula = compute_office_consumption_formula(
        line.material,
        closing_physical_stock=int(line.physical_usable_quantity),
    )
    line.opening_office_stock = formula["opening_office_stock"]
    line.stock_received = formula["stock_received"]
    line.returns_from_labourers = formula["returns_from_labourers"]
    line.transfers_to_labourers = formula["transfers_to_labourers"]
    line.recorded_manual_consumption = formula["recorded_manual_consumption"]
    line.calculated_net_office_consumption = formula["calculated_net_office_consumption"]
    line.unexplained_difference = formula["unexplained_difference"]


@transaction.atomic
def create_stock_audit(
    *,
    location: StockLocation | None = None,
    audit_date: date | None = None,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> StockAudit:
    """Create a new Physical Stock Audit session populated with all active materials."""
    resolved_loc = location or get_main_office_location()
    auth_actor = actor if getattr(actor, "is_authenticated", False) else None

    audit_code = next_named_sequence(
        key="stock_audit",
        prefix="AUD-",
        start_value=1000,
        model_cls=StockAudit,
        field_name="audit_code",
    )

    audit = StockAudit.objects.create(
        audit_code=audit_code,
        audit_date=audit_date or local_today(),
        location=resolved_loc,
        status=StockAuditStatus.DRAFT,
        conducted_by=auth_actor,
        conducted_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
        notes=(notes or "").strip(),
    )

    materials = Material.objects.filter(is_active=True, is_archived=False)
    for mat in materials:
        expected = get_usable_balance(mat, resolved_loc)
        line = StockAuditLine(
            audit=audit,
            material=mat,
            expected_usable_quantity=expected,
            physical_usable_quantity=max(0, expected),
            difference_quantity=0,
        )
        _refresh_line_consumption_metrics(line)
        line.save()

    record_audit_log(
        action="STOCK_AUDIT_CREATED",
        module="stock_audit",
        summary=f"Initiated physical stock audit '{audit_code}' for '{resolved_loc.name}'.",
        actor=auth_actor,
        target_type="StockAudit",
        target_id=str(audit.id),
        request=request,
    )
    return audit


@transaction.atomic
def update_stock_audit_counts(
    *,
    audit: StockAudit,
    counts: list[dict[str, Any]],
    notes: str | None = None,
    actor: Any = None,
    request: HttpRequest | None = None,
) -> StockAudit:
    """Record physical count values and discrepancy reasons on a Draft/Submitted StockAudit."""
    locked_audit = StockAudit.objects.select_for_update().get(pk=audit.pk)
    if locked_audit.status == StockAuditStatus.APPROVED:
        raise DRFValidationError(
            {"status": f"Stock audit '{locked_audit.audit_code}' is already approved and locked."}
        )

    input_map: dict[str, dict[str, Any]] = {}
    for item in counts or []:
        key = str(item.get("line_id") or item.get("id") or item.get("material_id") or item.get("material") or "")
        if key:
            input_map[key] = item

    for line in locked_audit.lines.select_related("material").all():
        payload = input_map.get(str(line.id)) or input_map.get(str(line.material_id))
        if payload is None:
            continue

        phys_qty = int(payload.get("physical_usable_quantity", line.physical_usable_quantity))
        if phys_qty < 0:
            raise DRFValidationError(
                {"physical_usable_quantity": "Physical stock count cannot be negative."}
            )
        expected = get_usable_balance(line.material, locked_audit.location)
        line.expected_usable_quantity = expected
        line.physical_usable_quantity = phys_qty
        line.difference_quantity = phys_qty - expected
        if "discrepancy_reason" in payload:
            line.discrepancy_reason = (payload.get("discrepancy_reason") or "").strip()
        _refresh_line_consumption_metrics(line)
        line.save()

    if notes is not None:
        locked_audit.notes = notes.strip()
        locked_audit.save(update_fields=["notes", "updated_at"])

    return locked_audit


@transaction.atomic
def submit_stock_audit(
    *,
    audit: StockAudit,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> StockAudit:
    """Submit a StockAudit for approval after verifying discrepancy reasons are provided."""
    locked_audit = StockAudit.objects.select_for_update().get(pk=audit.pk)
    if locked_audit.status == StockAuditStatus.APPROVED:
        raise DRFValidationError(
            {"status": f"Stock audit '{locked_audit.audit_code}' is already approved."}
        )

    for line in locked_audit.lines.select_related("material").all():
        expected = get_usable_balance(line.material, locked_audit.location)
        line.expected_usable_quantity = expected
        line.difference_quantity = int(line.physical_usable_quantity) - expected
        _refresh_line_consumption_metrics(line)
        line.save()
        if line.difference_quantity != 0 and not line.discrepancy_reason.strip():
            raise DRFValidationError(
                {
                    "discrepancy_reason": (
                        f"Material '{line.material.name}' has a difference of "
                        f"{line.difference_quantity}; a discrepancy reason is required before submitting."
                    )
                }
            )

    locked_audit.status = StockAuditStatus.SUBMITTED
    locked_audit.submitted_at = timezone.now()
    if notes.strip():
        locked_audit.notes = (
            f"{locked_audit.notes}\n{notes.strip()}".strip()
            if locked_audit.notes
            else notes.strip()
        )
    locked_audit.save(update_fields=["status", "submitted_at", "notes", "updated_at"])
    return locked_audit


@transaction.atomic
def approve_stock_audit(
    *,
    audit: StockAudit,
    notes: str = "",
    actor: Any = None,
    request: HttpRequest | None = None,
) -> StockAudit:
    """Approve a StockAudit and generate `AUDIT_ADJUSTMENT` ledger entries for all variances."""
    locked_audit = (
        StockAudit.objects.select_for_update(of=("self",))
        .select_related("location")
        .get(pk=audit.pk)
    )
    if locked_audit.status == StockAuditStatus.APPROVED:
        raise DRFValidationError(
            {"status": f"Stock audit '{locked_audit.audit_code}' has already been approved."}
        )

    auth_actor = actor if getattr(actor, "is_authenticated", False) else None

    for line in locked_audit.lines.select_related("material").all():
        bal = get_or_create_locked_balance(line.material, locked_audit.location)
        expected = int(bal.usable_quantity)
        phys = int(line.physical_usable_quantity)
        diff = phys - expected

        line.expected_usable_quantity = expected
        line.difference_quantity = diff

        if diff != 0 and not line.discrepancy_reason.strip() and not (notes or "").strip():
            raise DRFValidationError(
                {
                    "discrepancy_reason": (
                        f"Material '{line.material.name}' has a stock difference of {diff}; "
                        "provide a discrepancy reason before approving."
                    )
                }
            )

        if diff != 0:
            reason_text = (
                line.discrepancy_reason.strip()
                or notes.strip()
                or f"Approved audit adjustment ({locked_audit.audit_code})"
            )
            line.discrepancy_reason = reason_text
            bal.usable_quantity = phys
            bal.save(update_fields=["usable_quantity", "updated_at"])

            tx_code = next_movement_code()
            abs_qty = abs(diff)
            if diff > 0:
                mov = StockMovement.objects.create(
                    transaction_code=tx_code,
                    material=line.material,
                    movement_type=MovementType.AUDIT_ADJUSTMENT,
                    quantity=abs_qty,
                    usable_quantity=abs_qty,
                    defective_quantity=0,
                    source_location=None,
                    destination_location=locked_audit.location,
                    source_usable_delta=0,
                    destination_usable_delta=abs_qty,
                    related_audit=locked_audit,
                    created_by=auth_actor,
                    created_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
                    notes=f"[{locked_audit.audit_code}] +{abs_qty}: {reason_text}",
                )
            else:
                mov = StockMovement.objects.create(
                    transaction_code=tx_code,
                    material=line.material,
                    movement_type=MovementType.AUDIT_ADJUSTMENT,
                    quantity=abs_qty,
                    usable_quantity=abs_qty,
                    defective_quantity=0,
                    source_location=locked_audit.location,
                    destination_location=None,
                    source_usable_delta=-abs_qty,
                    destination_usable_delta=0,
                    related_audit=locked_audit,
                    created_by=auth_actor,
                    created_by_username=getattr(auth_actor, "username", "") if auth_actor else "",
                    notes=f"[{locked_audit.audit_code}] -{abs_qty}: {reason_text}",
                )
            line.adjustment_movement = mov

        _refresh_line_consumption_metrics(line)
        line.save()

    locked_audit.status = StockAuditStatus.APPROVED
    locked_audit.approved_by = auth_actor
    locked_audit.approved_by_username = (
        getattr(auth_actor, "username", "") if auth_actor else ""
    )
    locked_audit.approved_at = timezone.now()
    if locked_audit.submitted_at is None:
        locked_audit.submitted_at = locked_audit.approved_at
    if notes.strip():
        locked_audit.notes = (
            f"{locked_audit.notes}\nApproval: {notes.strip()}".strip()
            if locked_audit.notes
            else notes.strip()
        )
    locked_audit.save()

    record_audit_log(
        action="STOCK_AUDIT_APPROVED",
        module="stock_audit",
        summary=f"Approved physical stock audit '{locked_audit.audit_code}' and posted ledger adjustments.",
        actor=auth_actor,
        target_type="StockAudit",
        target_id=str(locked_audit.id),
        request=request,
    )
    return locked_audit
