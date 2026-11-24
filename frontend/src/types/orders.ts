/**
 * TypeScript interfaces for Phase 2 Catalog, Orders, OrderItems, Replacements, and Lifecycle.
 */

import type { ProductionJobSummary } from "@/types/production";

export type CatalogCategory =
  | "card_type"
  | "lanyard_size"
  | "holder"
  | "hook"
  | "accessory";

export interface CatalogOption {
  id: string;
  category: CatalogCategory;
  category_label: string;
  code: string;
  name: string;
  description: string;
  applicable_to: "id_card" | "lanyard" | "both";
  sort_order: number;
  batch_capacity?: number | null;
  is_archived: boolean;
}

export interface CatalogOverviewResponse {
  card_types: CatalogOption[];
  lanyard_sizes: CatalogOption[];
  holders: CatalogOption[];
  hooks: CatalogOption[];
  accessories: CatalogOption[];
}

export type OrderType = "original" | "replacement";

export type OrderStatus =
  | "draft"
  | "confirmed"
  | "in_progress"
  | "partially_completed"
  | "completed"
  | "cancelled";

export type ItemCategory = "id_card" | "lanyard";

export type CardOrientation = "vertical" | "horizontal" | "";
export type CardPrintingSide = "single_sided" | "double_sided" | "";

export type AccessoryRequirement =
  | "not_selected"
  | "not_required"
  | "required"
  | "attach_later";

export type AttachmentParty =
  | "not_applicable"
  | "not_decided"
  | "completed_by_adarsh"
  | "completed_by_client";

export type ReplacementReason =
  | "lost"
  | "damaged"
  | "stolen"
  | "incorrect_info"
  | "other";

export interface OrderItemReplacementSummary {
  id: string;
  replacement_order_id: string;
  replacement_order_number: string;
  replacement_order_date: string;
  replacement_order_status: OrderStatus;
  replacement_order_status_label: string;
  item_name: string;
  ordered_quantity: number;
  prepared_quantity: number;
  dispatched_quantity: number;
  remaining_quantity: number;
  replacement_reason: ReplacementReason;
  replacement_reason_label: string;
  replacement_reason_notes: string;
  created_at: string;
}

export interface OrderItemRecord {
  id: string;
  order: string;
  line_number: number;
  item_name: string;
  category: ItemCategory;
  category_label: string;
  status: string;
  status_label: string;
  original_item: string | null;
  original_item_name: string;
  original_item_ordered_quantity: number | null;
  replacement_reason: ReplacementReason | "";
  replacement_reason_label: string;
  replacement_reason_notes: string;
  ordered_quantity: number;
  original_ordered_quantity: number;
  replacement_quantity: number;
  prepared_quantity: number;
  dispatched_quantity: number;
  replacement_dispatched_quantity: number;
  remaining_quantity: number;
  card_orientation: CardOrientation;
  card_orientation_label: string;
  card_printing: CardPrintingSide;
  card_printing_label: string;
  card_type_option: string | null;
  card_type_option_detail: CatalogOption | null;
  card_type_custom_name: string;
  lanyard_size_option: string | null;
  lanyard_size_option_detail: CatalogOption | null;
  lanyard_design_requirements: string;
  lanyard_printing_specs: string;
  holder_requirement: AccessoryRequirement;
  holder_requirement_label: string;
  holder_option: string | null;
  holder_option_detail: CatalogOption | null;
  hook_requirement: AccessoryRequirement;
  hook_requirement_label: string;
  hook_option: string | null;
  hook_option_detail: CatalogOption | null;
  attachment_party: AttachmentParty;
  attachment_party_label: string;
  accessories_detail: CatalogOption[];
  extra_specifications: Record<string, unknown>;
  notes: string;
  replacement_items: OrderItemReplacementSummary[];
  production_job?: ProductionJobSummary | null;
  created_at: string;
  updated_at: string;
}

export interface OrderProductionProgress {
  total_items: number;
  design_completed_items: number;
  printing_completed_items: number;
  assembly_applicable_items: number;
  assembly_completed_items: number;
  production_completed_items: number;
  ready_for_dispatch_items: number;
  summary_label: string;
}

export interface OrderStatusHistoryRecord {
  id: string;
  order: string;
  previous_status: string;
  previous_status_label: string;
  new_status: OrderStatus;
  new_status_label: string;
  changed_by: string | null;
  changed_by_username: string;
  reason: string;
  created_at: string;
}

export interface LinkedOrderSummary {
  id: string;
  order_number: string;
  order_type: OrderType;
  order_type_label: string;
  order_date: string;
  status: OrderStatus;
  status_label: string;
  total_ordered_quantity: number;
  total_dispatched_quantity: number;
  created_at: string;
}

export interface OrderListSummaryItem {
  id: string;
  item_name: string;
  category: ItemCategory;
  category_label: string;
  ordered_quantity: number;
  dispatched_quantity: number;
}

export interface OrderListItem {
  id: string;
  order_number: string;
  order_type: OrderType;
  order_type_label: string;
  client: string;
  client_name: string;
  original_order: string | null;
  original_order_number: string | null;
  order_date: string;
  expected_completion_date: string | null;
  status: OrderStatus;
  status_label: string;
  item_count: number;
  total_ordered_quantity: number;
  total_dispatched_quantity: number;
  replacement_orders_count: number;
  items_summary: OrderListSummaryItem[];
  notes: string;
  created_by_username: string;
  created_at: string;
  updated_at: string;
}

export interface OrderDetailRecord {
  id: string;
  order_number: string;
  order_type: OrderType;
  order_type_label: string;
  client: string;
  client_name: string;
  client_is_archived: boolean;
  original_order: string | null;
  original_order_number: string | null;
  order_date: string;
  expected_completion_date: string | null;
  status: OrderStatus;
  status_label: string;
  allowed_transitions: OrderStatus[];
  notes: string;
  cancel_reason: string;
  total_ordered_quantity: number;
  total_prepared_quantity: number;
  total_dispatched_quantity: number;
  total_remaining_quantity: number;
  total_replacement_quantity: number;
  production_progress?: OrderProductionProgress;
  items: OrderItemRecord[];
  replacement_orders: LinkedOrderSummary[];
  status_history: OrderStatusHistoryRecord[];
  created_by: string | null;
  created_by_username: string;
  updated_by: string | null;
  updated_by_username: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderItemInput {
  item_name: string;
  category: ItemCategory;
  ordered_quantity: number;
  card_orientation?: CardOrientation;
  card_printing?: CardPrintingSide;
  card_type_option?: string | null;
  card_type_custom_name?: string;
  lanyard_size_option?: string | null;
  lanyard_design_requirements?: string;
  lanyard_printing_specs?: string;
  holder_requirement?: AccessoryRequirement;
  holder_option?: string | null;
  hook_requirement?: AccessoryRequirement;
  hook_option?: string | null;
  attachment_party?: AttachmentParty;
  accessory_ids?: string[];
  notes?: string;
}

export interface CreateOrderPayload {
  client_id?: string | null;
  client_name?: string;
  order_date?: string;
  expected_completion_date?: string | null;
  status?: "draft" | "confirmed";
  notes?: string;
  idempotency_key?: string;
  items: CreateOrderItemInput[];
}

export interface CreateReplacementItemInput {
  original_item: string;
  item_name?: string;
  ordered_quantity: number;
  replacement_reason: ReplacementReason;
  replacement_reason_notes?: string;
  notes?: string;
}

export interface CreateReplacementOrderPayload {
  client_id?: string | null;
  order_date?: string;
  expected_completion_date?: string | null;
  status?: "draft" | "confirmed";
  notes?: string;
  idempotency_key?: string;
  items: CreateReplacementItemInput[];
}
