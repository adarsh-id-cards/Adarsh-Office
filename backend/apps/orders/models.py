"""Order, OrderItem, OrderSequence, and OrderStatusHistory models for Pro Office.

Implements Phase 2 requirements:
- Concurrency-safe human-readable order number generation (`OrderSequence` with row-level lock).
- Original orders and linked Replacement orders (`order_type`: `original` | `replacement`).
- Multiple independent items per order (`OrderItem`) with relational specifications for
  ID Card and Lanyard categories.
- Explicit attachment and accessory states (`not_selected`, `not_required`, `required`, `attach_later`,
  and `attachment_party`).
- Independent item-level quantity tracking (`ordered_quantity`, `prepared_quantity`,
  `dispatched_quantity`, `remaining_quantity`, and separately computed `replacement_quantity`).
- Controlled status transitions and `OrderStatusHistory` audit log.
"""
from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from apps.catalog.models import CatalogCategory
from apps.common.models import TimeStampedUUIDModel


def local_today() -> date:
    """Return current business date in Asia/Kolkata timezone."""
    return timezone.localdate()


class OrderSequence(models.Model):
    """Row-locked counter table guaranteeing unique sequential human-readable order numbers."""

    key = models.CharField(max_length=32, primary_key=True, default="default")
    last_value = models.PositiveIntegerField(default=1000)

    class Meta:
        db_table = "pro_office_order_sequences"
        verbose_name = "Order Number Sequence"
        verbose_name_plural = "Order Number Sequences"

    @classmethod
    def get_next_order_number(cls) -> str:
        """Atomically allocate the next unique order number (e.g. 'ORD-1001')."""
        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(
                key="default",
                defaults={"last_value": 1000},
            )
            while True:
                seq.last_value += 1
                candidate = f"ORD-{seq.last_value}"
                if not Order.objects.filter(order_number=candidate).exists():
                    seq.save(update_fields=["last_value"])
                    return candidate


class OrderType(models.TextChoices):
    ORIGINAL = "original", "Original Order"
    REPLACEMENT = "replacement", "Replacement Order"


class OrderStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    CONFIRMED = "confirmed", "Confirmed"
    IN_PROGRESS = "in_progress", "In Progress"
    PARTIALLY_COMPLETED = "partially_completed", "Partially Completed"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


ALLOWED_ORDER_STATUS_TRANSITIONS: dict[str, list[str]] = {
    OrderStatus.DRAFT: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
    OrderStatus.CONFIRMED: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
    OrderStatus.IN_PROGRESS: [
        OrderStatus.PARTIALLY_COMPLETED,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
    ],
    OrderStatus.PARTIALLY_COMPLETED: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
    OrderStatus.COMPLETED: [],
    OrderStatus.CANCELLED: [],
}


class ItemCategory(models.TextChoices):
    ID_CARD = "id_card", "ID Card"
    LANYARD = "lanyard", "Lanyard"


class OrderItemStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    CONFIRMED = "confirmed", "Confirmed"
    IN_PROGRESS = "in_progress", "In Progress"
    PARTIALLY_COMPLETED = "partially_completed", "Partially Completed"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class CardOrientation(models.TextChoices):
    VERTICAL = "vertical", "Vertical"
    HORIZONTAL = "horizontal", "Horizontal"


class CardPrintingSide(models.TextChoices):
    SINGLE_SIDED = "single_sided", "Single-Sided"
    DOUBLE_SIDED = "double_sided", "Double-Sided"


class AccessoryRequirement(models.TextChoices):
    NOT_SELECTED = "not_selected", "Not Selected (Pending Decision)"
    NOT_REQUIRED = "not_required", "Not Required"
    REQUIRED = "required", "Required"
    ATTACH_LATER = "attach_later", "To Be Attached Later"


class AttachmentParty(models.TextChoices):
    NOT_APPLICABLE = "not_applicable", "Not Applicable"
    NOT_DECIDED = "not_decided", "Pending Decision"
    COMPLETED_BY_ADARSH = "completed_by_adarsh", "Attachment Completed by Adarsh"
    COMPLETED_BY_CLIENT = "completed_by_client", "Attachment Completed by Client"


class ReplacementReason(models.TextChoices):
    LOST = "lost", "Lost Card / Item"
    DAMAGED = "damaged", "Damaged Card / Item"
    STOLEN = "stolen", "Stolen Card / Item"
    INCORRECT_INFO = "incorrect_info", "Incorrect Information"
    OTHER = "other", "Other Reason"


class Order(TimeStampedUUIDModel):
    """Customer order (either an Original Order or a linked Replacement Order)."""

    order_number = models.CharField(
        max_length=32,
        unique=True,
        db_index=True,
        help_text="Human-readable sequential order number (e.g. ORD-1001).",
    )
    order_type = models.CharField(
        max_length=20,
        choices=OrderType.choices,
        default=OrderType.ORIGINAL,
        db_index=True,
        help_text="Distinguishes original orders from replacement orders.",
    )
    client = models.ForeignKey(
        "clients.Client",
        on_delete=models.PROTECT,
        related_name="orders",
        help_text="Client who placed this order.",
    )
    original_order = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="replacement_orders",
        help_text="Parent original order when order_type is 'replacement'.",
    )
    order_date = models.DateField(
        default=local_today,
        db_index=True,
        help_text="Business date when the order was placed.",
    )
    expected_completion_date = models.DateField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Optional promised completion or dispatch date.",
    )
    status = models.CharField(
        max_length=30,
        choices=OrderStatus.choices,
        default=OrderStatus.DRAFT,
        db_index=True,
        help_text="Current lifecycle state of the order.",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="General order-level instructions or notes.",
    )
    cancel_reason = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Recorded reason if the order was cancelled.",
    )
    idempotency_key = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        unique=True,
        help_text="Optional client-supplied idempotency key to prevent duplicate submissions.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_orders",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_orders",
    )

    class Meta:
        db_table = "pro_office_orders"
        ordering = ["-order_date", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["order_number"],
                name="uq_order_number",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(order_type="original", original_order__isnull=True)
                    | models.Q(order_type="replacement", original_order__isnull=False)
                ),
                name="ck_order_type_original_order_consistency",
            ),
        ]
        indexes = [
            models.Index(
                fields=["client", "-order_date"],
                name="idx_order_client_date",
            ),
            models.Index(
                fields=["status", "-order_date"],
                name="idx_order_status_date",
            ),
            models.Index(
                fields=["order_type", "-order_date"],
                name="idx_order_type_date",
            ),
        ]
        verbose_name = "Order"
        verbose_name_plural = "Orders"

    def __str__(self) -> str:
        return f"{self.order_number} ({self.client.name})"

    def clean(self) -> None:
        super().clean()
        if self.order_type == OrderType.ORIGINAL and self.original_order_id is not None:
            raise ValidationError(
                {"original_order": "Original orders cannot reference another original order."}
            )
        if self.order_type == OrderType.REPLACEMENT:
            if self.original_order_id is None:
                raise ValidationError(
                    {"original_order": "Replacement orders must reference an original order."}
                )
            if self.original_order.order_type != OrderType.ORIGINAL:
                raise ValidationError(
                    {"original_order": "Replacement orders must reference an original order, not another replacement."}
                )
            if self.original_order.client_id != self.client_id:
                raise ValidationError(
                    {"original_order": "Replacement order client must match the original order's client."}
                )
            if self.original_order.status == OrderStatus.CANCELLED:
                raise ValidationError(
                    {"original_order": "Cannot create a replacement for a cancelled order."}
                )
        if (
            self.expected_completion_date
            and self.order_date
            and self.expected_completion_date < self.order_date
        ):
            raise ValidationError(
                {"expected_completion_date": "Expected completion date cannot be earlier than the order date."}
            )

    def can_transition_to(self, target_status: str) -> bool:
        return target_status in ALLOWED_ORDER_STATUS_TRANSITIONS.get(self.status, [])

    @property
    def allowed_transitions(self) -> list[str]:
        return list(ALLOWED_ORDER_STATUS_TRANSITIONS.get(self.status, []))


class OrderItem(TimeStampedUUIDModel):
    """Individual line item within an Order (ID Card or Lanyard)."""

    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name="items",
        help_text="Parent order containing this item.",
    )
    line_number = models.PositiveSmallIntegerField(
        default=1,
        help_text="1-based line sequence within the order.",
    )
    item_name = models.CharField(
        max_length=150,
        help_text="Descriptive item name (e.g. 'Student ID Cards', 'Staff ID Cards', 'Lanyards').",
    )
    category = models.CharField(
        max_length=24,
        choices=ItemCategory.choices,
        db_index=True,
        help_text="Product category (id_card or lanyard).",
    )
    status = models.CharField(
        max_length=30,
        choices=OrderItemStatus.choices,
        default=OrderItemStatus.PENDING,
        db_index=True,
    )

    # Replacement linkage
    original_item = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="replacement_items",
        help_text="Original order item being replaced (only set for items in a Replacement Order).",
    )
    replacement_reason = models.CharField(
        max_length=40,
        choices=ReplacementReason.choices,
        blank=True,
        default="",
        help_text="Reason for replacement request.",
    )
    replacement_reason_notes = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Additional detail when replacement reason is 'other' or specific card numbers.",
    )

    # Quantity tracking
    ordered_quantity = models.PositiveIntegerField(
        help_text="Authorized quantity ordered for this specific line item.",
    )
    allocated_from_surplus_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Quantity fulfilled from retained Office Surplus Pool (Section 16).",
    )
    prepared_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Quantity prepared for production.",
    )
    dispatched_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Quantity dispatched for this item independently.",
    )

    # ID Card relational specifications
    card_orientation = models.CharField(
        max_length=20,
        choices=CardOrientation.choices,
        blank=True,
        default="",
        help_text="ID Card orientation (vertical or horizontal).",
    )
    card_printing = models.CharField(
        max_length=20,
        choices=CardPrintingSide.choices,
        blank=True,
        default="",
        help_text="ID Card printing sides (single_sided or double_sided).",
    )
    card_type_option = models.ForeignKey(
        "catalog.CatalogOption",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="card_type_order_items",
        help_text="Optional catalog card type selection.",
    )
    card_type_custom_name = models.CharField(
        max_length=120,
        blank=True,
        default="",
        help_text="Optional custom card type or subtype label.",
    )

    # Lanyard relational specifications
    lanyard_size_option = models.ForeignKey(
        "catalog.CatalogOption",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="lanyard_size_order_items",
        help_text="Configurable catalog lanyard size (e.g. 12 mm, 16 mm, 20 mm).",
    )
    lanyard_design_requirements = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Lanyard colour, logo, text, or design requirements.",
    )
    lanyard_printing_specs = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Optional lanyard printing method/specifications (e.g. multi-colour sublimation, screen print).",
    )

    # Holder, Hook & Attachment configuration states
    holder_requirement = models.CharField(
        max_length=30,
        choices=AccessoryRequirement.choices,
        default=AccessoryRequirement.NOT_SELECTED,
        help_text="Explicit holder decision (not_selected, not_required, required, attach_later).",
    )
    holder_option = models.ForeignKey(
        "catalog.CatalogOption",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="holder_order_items",
        help_text="Selected catalog holder when holder_requirement is 'required'.",
    )
    hook_requirement = models.CharField(
        max_length=30,
        choices=AccessoryRequirement.choices,
        default=AccessoryRequirement.NOT_SELECTED,
        help_text="Explicit hook decision for lanyard (not_selected, not_required, required, attach_later).",
    )
    hook_option = models.ForeignKey(
        "catalog.CatalogOption",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="hook_order_items",
        help_text="Selected catalog hook when hook_requirement is 'required'.",
    )
    attachment_party = models.CharField(
        max_length=30,
        choices=AttachmentParty.choices,
        default=AttachmentParty.NOT_APPLICABLE,
        help_text="Who performs attachment (completed_by_adarsh, completed_by_client, not_decided, not_applicable).",
    )

    accessories = models.ManyToManyField(
        "catalog.CatalogOption",
        blank=True,
        related_name="accessory_order_items",
        help_text="Optional additional configurable catalog accessories.",
    )
    extra_specifications = models.JSONField(
        default=dict,
        blank=True,
        help_text="Optional variable specification attributes.",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Item-specific production or packing notes.",
    )

    class Meta:
        db_table = "pro_office_order_items"
        ordering = ["line_number", "created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ordered_quantity__gte=1),
                name="ck_order_item_ordered_qty_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(prepared_quantity__gte=0),
                name="ck_order_item_prepared_qty_non_negative",
            ),
            models.CheckConstraint(
                condition=models.Q(dispatched_quantity__gte=0),
                name="ck_order_item_dispatched_qty_non_negative",
            ),
            models.CheckConstraint(
                condition=models.Q(dispatched_quantity__lte=models.F("ordered_quantity")),
                name="ck_order_item_dispatched_lte_ordered",
            ),
        ]
        indexes = [
            models.Index(
                fields=["order", "line_number"],
                name="idx_order_item_order_line",
            ),
            models.Index(
                fields=["category", "status"],
                name="idx_order_item_cat_status",
            ),
        ]
        verbose_name = "Order Item"
        verbose_name_plural = "Order Items"

    def __str__(self) -> str:
        return f"{self.order.order_number} — {self.item_name} ({self.ordered_quantity})"

    @property
    def remaining_quantity(self) -> int:
        return max(0, int(self.ordered_quantity) - int(self.dispatched_quantity))

    def clean(self) -> None:
        super().clean()
        self.item_name = (self.item_name or "").strip()
        if not self.item_name:
            raise ValidationError({"item_name": "Item name cannot be blank."})

        if self.ordered_quantity is None or self.ordered_quantity < 1:
            raise ValidationError({"ordered_quantity": "Quantity must be at least 1."})
        if self.prepared_quantity < 0:
            raise ValidationError({"prepared_quantity": "Prepared quantity cannot be negative."})
        if self.dispatched_quantity < 0:
            raise ValidationError({"dispatched_quantity": "Dispatched quantity cannot be negative."})
        if self.dispatched_quantity > self.ordered_quantity:
            raise ValidationError(
                {
                    "dispatched_quantity": (
                        f"Dispatched quantity ({self.dispatched_quantity}) cannot exceed "
                        f"authorized ordered quantity ({self.ordered_quantity})."
                    )
                }
            )

        # Category-specific validation
        if self.category == ItemCategory.ID_CARD:
            if not self.card_orientation:
                raise ValidationError(
                    {"card_orientation": "Orientation (Vertical or Horizontal) is required for ID Card items."}
                )
            if not self.card_printing:
                raise ValidationError(
                    {"card_printing": "Printing side (Single-Sided or Double-Sided) is required for ID Card items."}
                )
            if self.lanyard_size_option_id is not None:
                raise ValidationError(
                    {"lanyard_size_option": "Lanyard size cannot be set on an ID Card item."}
                )
            if (
                self.card_type_option is not None
                and self.card_type_option.category != CatalogCategory.CARD_TYPE
            ):
                raise ValidationError(
                    {"card_type_option": "Selected catalog option is not an ID Card Type."}
                )
            # Clear lanyard-specific hook fields on ID Card items
            self.hook_requirement = AccessoryRequirement.NOT_REQUIRED
            self.hook_option = None

        elif self.category == ItemCategory.LANYARD:
            if self.lanyard_size_option_id is None:
                raise ValidationError(
                    {"lanyard_size_option": "Lanyard size (12 mm, 16 mm, or 20 mm) is required for Lanyard items."}
                )
            if self.lanyard_size_option.category != CatalogCategory.LANYARD_SIZE:
                raise ValidationError(
                    {"lanyard_size_option": "Selected catalog option is not a Lanyard Size."}
                )
            if self.card_orientation or self.card_printing or self.card_type_option_id:
                raise ValidationError(
                    {"category": "ID Card orientation/printing fields cannot be set on a Lanyard item."}
                )

            # Hook requirement consistency
            if self.hook_requirement == AccessoryRequirement.REQUIRED:
                if (
                    self.hook_option is not None
                    and self.hook_option.category != CatalogCategory.HOOK
                ):
                    raise ValidationError(
                        {"hook_option": "Selected catalog option is not a Lanyard Hook."}
                    )
            else:
                self.hook_option = None

        # Holder requirement consistency across both categories
        if self.holder_requirement == AccessoryRequirement.REQUIRED:
            if (
                self.holder_option is not None
                and self.holder_option.category != CatalogCategory.HOLDER
            ):
                raise ValidationError(
                    {"holder_option": "Selected catalog option is not an ID Card Holder."}
                )
        else:
            self.holder_option = None

        # Replacement item linkage validation
        if self.order_id and self.order.order_type == OrderType.REPLACEMENT:
            if self.original_item_id is None:
                raise ValidationError(
                    {"original_item": "Replacement items must reference an original order item."}
                )
            if self.original_item.order_id != self.order.original_order_id:
                raise ValidationError(
                    {
                        "original_item": (
                            "Replacement item must belong to the selected original order."
                        )
                    }
                )
            if self.original_item.order.client_id != self.order.client_id:
                raise ValidationError(
                    {
                        "original_item": (
                            "Cannot reference an original order item belonging to a different client."
                        )
                    }
                )
            if not self.replacement_reason:
                raise ValidationError(
                    {"replacement_reason": "Replacement reason is required for replacement items."}
                )
        elif self.order_id and self.order.order_type == OrderType.ORIGINAL:
            if self.original_item_id is not None:
                raise ValidationError(
                    {"original_item": "Original order items cannot reference a parent item."}
                )


class OrderStatusHistory(TimeStampedUUIDModel):
    """Immutable log of order lifecycle status transitions."""

    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name="status_history",
    )
    previous_status = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="Previous order status before transition (empty on initial creation).",
    )
    new_status = models.CharField(
        max_length=30,
        choices=OrderStatus.choices,
        help_text="New order status after transition.",
    )
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_status_changes",
    )
    changed_by_username = models.CharField(
        max_length=150,
        blank=True,
        default="",
    )
    reason = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Optional reason or note for the status transition.",
    )

    class Meta:
        db_table = "pro_office_order_status_history"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["order", "-created_at"],
                name="idx_order_status_hist_order",
            ),
        ]
        verbose_name = "Order Status History"
        verbose_name_plural = "Order Status Histories"

    def __str__(self) -> str:
        prev = self.previous_status or "initial"
        return f"{self.order.order_number}: {prev} -> {self.new_status}"
