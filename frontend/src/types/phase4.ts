/**
 * Phase 4 TypeScript domain contracts: Labour, Machines, Assembly, Inventory, Stock Audit, Dispatch & Surplus.
 */

export type MachineStatus =
  | "in_office"
  | "allocated"
  | "under_maintenance"
  | "damaged"
  | "retired";

export interface MachineAllocationRecord {
  id: string;
  machine: string;
  machine_code: string;
  supported_size_label: string;
  labourer: string;
  labourer_name: string;
  allocated_date: string;
  issued_by_username: string;
  returned_date: string | null;
  returned_to_username: string;
  return_condition: string;
  is_active: boolean;
  notes: string;
  created_at: string;
}

export interface MachineRecord {
  id: string;
  machine_code: string;
  name: string;
  machine_type: string;
  supported_lanyard_size: string | null;
  supported_size_label: string;
  status: MachineStatus;
  status_display: string;
  current_holder: string | null;
  current_holder_name: string | null;
  current_location_display: string;
  is_archived: boolean;
  notes: string;
  allocations: MachineAllocationRecord[];
  created_at: string;
  updated_at: string;
}

export interface InventoryBalanceRecord {
  id: string;
  material: string;
  material_name: string;
  material_code: string;
  material_category: string;
  material_category_label: string;
  base_unit: string;
  location: string;
  location_name: string;
  location_type: "main_office" | "labourer";
  labourer_id: string | null;
  usable_quantity: number;
  defective_quantity: number;
  updated_at: string;
}

export interface LabourerRecord {
  id: string;
  name: string;
  contact_number: string;
  is_active: boolean;
  is_archived: boolean;
  joined_date: string;
  notes: string;
  allocated_machines: MachineRecord[];
  supported_lanyard_sizes: string[];
  material_balances: InventoryBalanceRecord[];
  active_assignments_count: number;
  is_compatible_with_requested_size?: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaterialPackagingRecord {
  id: string;
  material: string;
  package_name: string;
  units_per_package: number;
  vendor_label: string;
  is_default: boolean;
  is_active: boolean;
  notes: string;
}

export interface MaterialRecord {
  id: string;
  code: string;
  name: string;
  category: string;
  category_label: string;
  base_unit: string;
  base_unit_label: string;
  supported_size_label: string;
  minimum_stock_level: number;
  is_active: boolean;
  notes: string;
  office_usable_stock: number;
  office_defective_stock: number;
  labour_usable_stock: number;
  total_company_usable_stock: number;
  packagings: MaterialPackagingRecord[];
}

export interface StockMovementRecord {
  id: string;
  transaction_code: string;
  material: string;
  material_name: string;
  base_unit: string;
  movement_type: string;
  movement_type_label: string;
  quantity: number;
  usable_quantity: number;
  defective_quantity: number;
  source_location_name: string;
  destination_location_name: string;
  package_name: string;
  package_count: number | null;
  units_per_package_snapshot: number | null;
  vendor_label_snapshot: string;
  created_by_username: string;
  notes: string;
  created_at: string;
}

export interface DefectiveRecord {
  id: string;
  defect_category: "raw_material" | "finished_product";
  defect_category_label: string;
  discovery_stage: string;
  discovery_stage_label: string;
  material: string | null;
  material_name: string;
  location_name: string;
  order_number: string;
  quantity: number;
  reason: string;
  disposition: string;
  recorded_by_username: string;
  created_at: string;
}

export interface OfficeConsumptionSummary {
  material_id: string;
  material_name: string;
  base_unit: string;
  opening_office_stock: number;
  stock_received: number;
  returns_from_labourers: number;
  transfers_to_labourers: number;
  system_expected_office_stock: number;
  closing_physical_office_stock: number;
  recorded_manual_consumption: number;
  calculated_net_office_consumption: number;
  unexplained_difference: number;
}

export interface AssignmentMaterialAllocationRecord {
  id: string;
  assignment: string;
  material: string;
  material_name: string;
  material_code: string;
  base_unit: string;
  required_quantity: number;
  opening_labour_balance: number;
  additional_needed_quantity: number;
  packaging: string | null;
  package_name: string;
  packets_issued: number;
  units_per_package_snapshot: number | null;
  issued_quantity: number;
  total_available_after_issue: number;
  expected_remaining_balance: number;
  is_override: boolean;
  override_reason: string;
  consumed_quantity: number;
  defective_quantity: number;
  returned_to_office_quantity: number;
  closing_labour_balance: number;
  is_reconciled: boolean;
  notes: string;
}

export interface AssemblyReceivingRecord {
  id: string;
  assignment: string;
  received_date: string;
  usable_quantity: number;
  defective_quantity: number;
  received_by_username: string;
  notes: string;
  created_at: string;
}

export interface AssemblyAssignmentRecord {
  id: string;
  assignment_code: string;
  order_id: string;
  order_number: string;
  client_name: string;
  order_item: string;
  production_job: string;
  item_name: string;
  lanyard_size_name: string;
  assignment_mode: "labourer" | "office_assembly";
  labourer: string | null;
  labourer_name: string;
  assigned_machine: string | null;
  assigned_machine_code: string;
  is_machine_override: boolean;
  machine_override_reason: string;
  assigned_quantity: number;
  received_usable_quantity: number;
  received_defective_quantity: number;
  pending_quantity: number;
  status: string;
  status_display: string;
  is_reconciled: boolean;
  assigned_date: string;
  notes: string;
  material_allocations: AssignmentMaterialAllocationRecord[];
  receiving_records: AssemblyReceivingRecord[];
  created_at: string;
}

export interface AssemblyQueueItem {
  production_job_id: string;
  order_item_id: string;
  order_id: string;
  order_number: string;
  client_name: string;
  item_name: string;
  lanyard_size_name: string;
  ordered_quantity: number;
  successful_printed_quantity: number;
  max_allocatable_quantity: number;
  total_assigned_quantity: number;
  unassigned_quantity: number;
  is_assembly_ready: boolean;
  assembly_status: string;
  completed_assembly_quantity: number;
  assignments: AssemblyAssignmentRecord[];
}

export interface SeasonalClosingRecord {
  id: string;
  closing_code: string;
  labourer: string;
  labourer_name: string;
  season_label: string;
  closing_date: string;
  status: "draft" | "reconciled";
  reconciled_by_username: string;
  notes: string;
  material_lines: Array<{
    id: string;
    material: string;
    material_name: string;
    base_unit: string;
    expected_usable_balance: number;
    actual_returned_usable: number;
    actual_returned_defective: number;
    missing_or_unexplained_quantity: number;
    discrepancy_explanation: string;
  }>;
  machine_lines: Array<{
    id: string;
    machine: string;
    machine_code: string;
    machine_name: string;
    supported_size_label: string;
    was_returned: boolean;
    return_condition: "good" | "damaged" | "missing";
    notes: string;
  }>;
}

export interface LabourerDetailRecord extends LabourerRecord {
  assignments: AssemblyAssignmentRecord[];
  material_movements: StockMovementRecord[];
  seasonal_closings: SeasonalClosingRecord[];
}

export interface StockAuditLineRecord {
  id: string;
  material: string;
  material_name: string;
  material_code: string;
  material_category: string;
  base_unit: string;
  expected_usable_quantity: number;
  physical_usable_quantity: number;
  difference_quantity: number;
  discrepancy_reason: string;
  opening_office_stock: number;
  stock_received: number;
  returns_from_labourers: number;
  transfers_to_labourers: number;
  recorded_manual_consumption: number;
  calculated_net_office_consumption: number;
  unexplained_difference: number;
  adjustment_transaction_code: string;
}

export interface StockAuditRecord {
  id: string;
  audit_code: string;
  audit_date: string;
  location: string;
  location_name: string;
  status: "draft" | "submitted" | "approved";
  status_display: string;
  conducted_by_username: string;
  approved_by_username: string;
  notes: string;
  discrepancy_count: number;
  lines: StockAuditLineRecord[];
  created_at: string;
}

export interface DispatchQueueItem {
  order_item_id: string;
  order_id: string;
  order_number: string;
  order_type: "original" | "replacement";
  order_status: string;
  client_id: string;
  client_name: string;
  item_name: string;
  category: "id_card" | "lanyard";
  lanyard_size_name: string;
  ordered_quantity: number;
  allocated_from_surplus_quantity: number;
  produced_quantity: number;
  dispatched_quantity: number;
  remaining_order_quantity: number;
  estimated_surplus_quantity: number;
  is_ready_for_dispatch: boolean;
  current_stage: string;
}

export interface DispatchRecord {
  id: string;
  dispatch_number: string;
  order: string;
  order_number: string;
  order_type: string;
  order_status: string;
  client_id: string;
  client_name: string;
  dispatch_date: string;
  packing_verified: boolean;
  dispatched_by_username: string;
  notes: string;
  items: Array<{
    id: string;
    order_item: string;
    item_name: string;
    category: string;
    ordered_quantity: number;
    quantity_dispatched_for_order: number;
    extra_dispatched_to_client: number;
    extra_retained_in_office: number;
    notes: string;
  }>;
  created_at: string;
}

export interface OfficeSurplusPoolRecord {
  id: string;
  surplus_code: string;
  source_order: string;
  source_order_number: string;
  source_order_item: string;
  client: string;
  client_name: string;
  category: string;
  item_name: string;
  lanyard_size_name: string;
  specification_summary: string;
  initial_quantity: number;
  allocated_quantity: number;
  remaining_quantity: number;
  notes: string;
  created_at: string;
}

export interface ClientSurplusRecord {
  id: string;
  order: string;
  order_number: string;
  order_item: string;
  item_name: string;
  category: string;
  client: string;
  client_name: string;
  quantity_sent: number;
  dispatch_date: string;
  notes: string;
}
