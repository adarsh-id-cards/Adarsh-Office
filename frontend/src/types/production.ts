/**
 * TypeScript interfaces for Phase 3 Production Management.
 */
import type { CatalogOption, ItemCategory, OrderStatus, OrderType } from "@/types/orders";

export type ProductionStage =
  | "design"
  | "printing"
  | "production_completed"
  | "ready_for_dispatch"
  | "assembly"
  | "dispatch";

export type DesignStatus =
  | "not_started"
  | "in_progress"
  | "review_required"
  | "approved"
  | "completed";

export type PrintingStatus =
  | "not_started"
  | "in_progress"
  | "partially_printed"
  | "completed";

export type AssemblyStatus =
  | "not_applicable"
  | "not_ready"
  | "ready_for_assembly"
  | "in_progress"
  | "partially_completed"
  | "completed";

export type PrintingRunStatus = "in_progress" | "completed";

export interface ProductionOverviewCounts {
  total_active_jobs: number;
  awaiting_design: number;
  under_design: number;
  awaiting_printing: number;
  currently_printing: number;
  lanyards_ready_for_assembly: number;
  incomplete_production: number;
  ready_for_dispatch: number;
}

export interface ProductionJobSummary {
  id: string;
  current_stage: ProductionStage;
  current_stage_label: string;
  design_status: DesignStatus;
  design_status_label: string;
  printing_status: PrintingStatus;
  printing_status_label: string;
  assembly_status: AssemblyStatus;
  assembly_status_label: string;
  is_assembly_ready: boolean;
  is_production_completed: boolean;
  is_ready_for_dispatch: boolean;
  batch_capacity: number;
  calculated_batches: number;
  calculated_planned_quantity: number;
  calculated_expected_surplus: number;
  planned_batches: number;
  planned_printing_quantity: number;
  expected_surplus_quantity: number;
  is_plan_overridden: boolean;
  total_printed_quantity: number;
  total_rejected_quantity: number;
  successful_printed_quantity: number;
  planned_assembly_quantity: number;
  completed_assembly_quantity: number;
  ready_for_packing_quantity: number;
  required_quantity: number;
  production_quantity_available: number;
  quantity_completed: number;
  quantity_pending: number;
  actual_printed_surplus: number;
  updated_at: string;
}

export interface ProductionOrderItemContext {
  id: string;
  order_id: string;
  order_number: string;
  order_type: OrderType;
  order_type_label: string;
  order_date: string;
  order_status: OrderStatus;
  order_status_label: string;
  client_id: string;
  client_name: string;
  line_number: number;
  item_name: string;
  category: ItemCategory;
  category_label: string;
  ordered_quantity: number;
  prepared_quantity: number;
  dispatched_quantity: number;
  remaining_quantity: number;
  replacement_reason: string;
  replacement_reason_label: string;
  replacement_reason_notes: string;
  card_orientation: string;
  card_orientation_label: string;
  card_printing: string;
  card_printing_label: string;
  card_type_option_detail: CatalogOption | null;
  card_type_custom_name: string;
  lanyard_size_option: string | null;
  lanyard_size_option_detail: CatalogOption | null;
  lanyard_design_requirements: string;
  lanyard_printing_specs: string;
  holder_requirement: string;
  holder_requirement_label: string;
  holder_option_detail: CatalogOption | null;
  hook_requirement: string;
  hook_requirement_label: string;
  hook_option_detail: CatalogOption | null;
  attachment_party: string;
  attachment_party_label: string;
  accessories_detail: CatalogOption[];
  notes: string;
}

export interface PrintingRunRecord {
  id: string;
  production_job: string;
  order_item: string;
  run_number: number;
  run_identifier: string;
  status: PrintingRunStatus;
  status_label: string;
  run_date: string;
  completed_at: string | null;
  planned_batches: number;
  planned_quantity: number;
  actual_printed_quantity: number;
  rejected_quantity: number;
  successful_quantity: number;
  responsible_user: string | null;
  responsible_username: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ProductionStatusHistoryRecord {
  id: string;
  production_job: string;
  stage: string;
  previous_status: string;
  new_status: string;
  changed_by: string | null;
  changed_by_username: string;
  summary: string;
  notes: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ProductionWorkflowStageStep {
  key: string;
  label: string;
  status: string;
  status_label: string;
  is_completed: boolean;
  is_active: boolean;
}

export interface ProductionJobListItem {
  id: string;
  order_item: string;
  item: ProductionOrderItemContext;
  current_stage: ProductionStage;
  current_stage_label: string;
  design_status: DesignStatus;
  design_status_label: string;
  design_started_at: string | null;
  design_approved_at: string | null;
  design_completed_at: string | null;
  design_responsible_username: string;
  printing_status: PrintingStatus;
  printing_status_label: string;
  printing_started_at: string | null;
  printing_completed_at: string | null;
  printing_responsible_username: string;
  printing_runs_count: number;
  batch_capacity: number;
  calculated_batches: number;
  calculated_planned_quantity: number;
  calculated_expected_surplus: number;
  planned_batches: number;
  planned_printing_quantity: number;
  expected_surplus_quantity: number;
  is_plan_overridden: boolean;
  plan_override_reason: string;
  total_printed_quantity: number;
  total_rejected_quantity: number;
  successful_printed_quantity: number;
  assembly_status: AssemblyStatus;
  assembly_status_label: string;
  is_assembly_ready: boolean;
  planned_assembly_quantity: number;
  completed_assembly_quantity: number;
  assembly_started_at: string | null;
  assembly_completed_at: string | null;
  assembly_responsible_username: string;
  is_production_completed: boolean;
  production_completed_at: string | null;
  is_ready_for_dispatch: boolean;
  ready_for_packing_quantity: number;
  required_quantity: number;
  production_quantity_available: number;
  quantity_completed: number;
  quantity_pending: number;
  actual_printed_surplus: number;
  created_at: string;
  updated_at: string;
}

export interface ProductionJobDetailRecord extends ProductionJobListItem {
  design_notes: string;
  design_reference: string;
  printing_notes: string;
  assembly_notes: string;
  notes: string;
  workflow_stages: ProductionWorkflowStageStep[];
  printing_runs: PrintingRunRecord[];
  history: ProductionStatusHistoryRecord[];
}

export interface CreatePrintingRunPayload {
  run_date?: string;
  planned_batches?: number;
  planned_quantity?: number;
  actual_printed_quantity: number;
  rejected_quantity?: number;
  successful_quantity?: number | null;
  complete_immediately?: boolean;
  idempotency_key?: string;
  notes?: string;
}
