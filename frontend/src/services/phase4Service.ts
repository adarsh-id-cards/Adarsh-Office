/**
 * Phase 4 Operational API Service: Labour, Machines, Assembly, Inventory, Audits, Dispatch & Surplus.
 */
import { apiRequest } from "@/services/apiClient";
import type { PaginatedResponse } from "@/types/api";
import type {
  AssemblyAssignmentRecord,
  AssemblyQueueItem,
  ClientSurplusRecord,
  DefectiveRecord,
  DispatchQueueItem,
  DispatchRecord,
  InventoryBalanceRecord,
  LabourerDetailRecord,
  LabourerRecord,
  MachineRecord,
  MaterialRecord,
  OfficeConsumptionSummary,
  OfficeSurplusPoolRecord,
  SeasonalClosingRecord,
  StockAuditRecord,
  StockMovementRecord,
} from "@/types/phase4";

export const phase4Service = {
  // --- Labourers & Seasonal Closing ---
  async listLabourers(params?: {
    is_active?: boolean;
    supported_size?: string;
    search?: string;
  }): Promise<{ results: LabourerRecord[] }> {
    const sp = new URLSearchParams();
    if (params?.is_active !== undefined) sp.set("is_active", String(params.is_active));
    if (params?.supported_size) sp.set("supported_size", params.supported_size);
    if (params?.search) sp.set("search", params.search);
    const q = sp.toString();
    return apiRequest<{ results: LabourerRecord[] }>(q ? `/labourers/?${q}` : "/labourers/");
  },

  async createLabourer(payload: {
    name: string;
    contact_number?: string;
    is_active?: boolean;
    notes?: string;
  }): Promise<LabourerRecord> {
    return apiRequest<LabourerRecord>("/labourers/", { method: "POST", body: payload });
  },

  async getLabourer(labourerId: string): Promise<LabourerDetailRecord> {
    return apiRequest<LabourerDetailRecord>(`/labourers/${labourerId}/`);
  },

  async updateLabourer(
    labourerId: string,
    payload: Partial<{ name: string; contact_number: string; is_active: boolean; notes: string }>,
  ): Promise<LabourerRecord> {
    return apiRequest<LabourerRecord>(`/labourers/${labourerId}/`, {
      method: "PATCH",
      body: payload,
    });
  },

  async createSeasonalClosing(payload: {
    labourer: string;
    season_label?: string;
    notes?: string;
  }): Promise<SeasonalClosingRecord> {
    return apiRequest<SeasonalClosingRecord>("/seasonal-closings/", {
      method: "POST",
      body: payload,
    });
  },

  async reconcileSeasonalClosing(
    closingId: string,
    payload: {
      material_lines: Array<{
        id: string;
        actual_returned_usable: number;
        actual_returned_defective: number;
        discrepancy_explanation?: string;
      }>;
      machine_lines?: Array<{
        id: string;
        was_returned: boolean;
        return_condition: "good" | "damaged" | "missing";
        notes?: string;
      }>;
      mark_labourer_inactive?: boolean;
      notes?: string;
    },
  ): Promise<SeasonalClosingRecord> {
    return apiRequest<SeasonalClosingRecord>(`/seasonal-closings/${closingId}/reconcile/`, {
      method: "POST",
      body: payload,
    });
  },

  // --- Machines ---
  async listMachines(params?: {
    status?: string;
    supported_size?: string;
  }): Promise<{ summary: Record<string, number>; results: MachineRecord[] }> {
    const sp = new URLSearchParams();
    if (params?.status) sp.set("status", params.status);
    if (params?.supported_size) sp.set("supported_size", params.supported_size);
    const q = sp.toString();
    return apiRequest<{ summary: Record<string, number>; results: MachineRecord[] }>(
      q ? `/machines/?${q}` : "/machines/",
    );
  },

  async createMachine(payload: {
    machine_code: string;
    name: string;
    machine_type?: string;
    supported_size_label: string;
    notes?: string;
  }): Promise<MachineRecord> {
    return apiRequest<MachineRecord>("/machines/", { method: "POST", body: payload });
  },

  async allocateMachine(
    machineId: string,
    payload: { labourer: string; notes?: string },
  ): Promise<MachineRecord> {
    return apiRequest<MachineRecord>(`/machines/${machineId}/allocations/`, {
      method: "POST",
      body: payload,
    });
  },

  async returnMachine(
    machineId: string,
    payload: {
      return_condition: "good" | "maintenance_required" | "damaged";
      notes?: string;
    },
  ): Promise<MachineRecord> {
    return apiRequest<MachineRecord>(`/machines/${machineId}/return/`, {
      method: "POST",
      body: payload,
    });
  },

  // --- Assembly Assignments, Material Issuance & Receiving ---
  async getAssemblyQueue(jobId?: string): Promise<{ results: AssemblyQueueItem[] }> {
    const res = await apiRequest<{ results: AssemblyQueueItem[] }>("/assembly/queue/");
    if (jobId) {
      return {
        results: res.results.filter((q) => q.production_job_id === jobId),
      };
    }
    return res;
  },

  async listAssignments(params?: {
    production_job?: string;
    labourer?: string;
  }): Promise<{ results: AssemblyAssignmentRecord[] }> {
    const sp = new URLSearchParams();
    if (params?.production_job) sp.set("production_job", params.production_job);
    if (params?.labourer) sp.set("labourer", params.labourer);
    const q = sp.toString();
    return apiRequest<{ results: AssemblyAssignmentRecord[] }>(
      q ? `/assembly/assignments/?${q}` : "/assembly/assignments/",
    );
  },

  async createAssignment(payload: {
    order_item?: string;
    production_job?: string;
    assignment_mode: "labourer" | "office_assembly";
    labourer?: string | null;
    assigned_machine?: string | null;
    is_machine_override?: boolean;
    machine_override_reason?: string;
    assigned_quantity: number;
    notes?: string;
  }): Promise<AssemblyAssignmentRecord> {
    return apiRequest<AssemblyAssignmentRecord>("/assembly/assignments/", {
      method: "POST",
      body: payload,
    });
  },

  async issueAssignmentMaterials(
    assignmentId: string,
    payload: {
      lines: Array<{
        material: string;
        required_quantity: number;
        packaging?: string | null;
        packets_issued?: number | null;
        issued_quantity?: number | null;
        is_override?: boolean;
        override_reason?: string;
      }>;
      notes?: string;
    },
  ): Promise<AssemblyAssignmentRecord> {
    return apiRequest<AssemblyAssignmentRecord>(
      `/assembly/assignments/${assignmentId}/issue-materials/`,
      { method: "POST", body: payload },
    );
  },

  async recordAssemblyReceiving(
    assignmentId: string,
    payload: { usable_quantity: number; defective_quantity: number; notes?: string },
  ): Promise<AssemblyAssignmentRecord> {
    return apiRequest<AssemblyAssignmentRecord>(
      `/assembly/assignments/${assignmentId}/receiving/`,
      { method: "POST", body: payload },
    );
  },

  async reconcileAssignmentMaterials(
    assignmentId: string,
    payload: {
      material_reconciliations: Array<{
        allocation_id: string;
        consumed_quantity: number;
        defective_quantity: number;
        returned_to_office_quantity: number;
      }>;
      notes?: string;
    },
  ): Promise<AssemblyAssignmentRecord> {
    return apiRequest<AssemblyAssignmentRecord>(
      `/assembly/assignments/${assignmentId}/reconcile/`,
      { method: "POST", body: payload },
    );
  },

  // --- Materials & Central Inventory ---
  async listMaterials(category?: string): Promise<PaginatedResponse<MaterialRecord>> {
    const q = category ? `?category=${encodeURIComponent(category)}` : "";
    return apiRequest<PaginatedResponse<MaterialRecord>>(`/materials/${q}`);
  },

  async createMaterial(payload: {
    code: string;
    name: string;
    category: string;
    base_unit: string;
    supported_size_label?: string;
    minimum_stock_level?: number;
    notes?: string;
  }): Promise<MaterialRecord> {
    return apiRequest<MaterialRecord>("/materials/", { method: "POST", body: payload });
  },

  async addMaterialPackaging(
    materialId: string,
    payload: {
      package_name: string;
      units_per_package: number;
      vendor_label?: string;
      is_default?: boolean;
    },
  ): Promise<unknown> {
    return apiRequest(`/materials/${materialId}/packaging/`, {
      method: "POST",
      body: payload,
    });
  },

  async listBalances(params?: {
    location_type?: string;
    labourer?: string;
  }): Promise<InventoryBalanceRecord[]> {
    const sp = new URLSearchParams();
    if (params?.location_type) sp.set("location_type", params.location_type);
    if (params?.labourer) sp.set("labourer", params.labourer);
    const q = sp.toString();
    return apiRequest<InventoryBalanceRecord[]>(
      q ? `/inventory/balances/?${q}` : "/inventory/balances/",
    );
  },

  async listMovements(params?: {
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<StockMovementRecord>> {
    const sp = new URLSearchParams();
    sp.set("page_size", String(params?.page_size ?? 20));
    if (params?.page) sp.set("page", String(params.page));
    return apiRequest<PaginatedResponse<StockMovementRecord>>(
      `/inventory/movements/?${sp.toString()}`,
    );
  },

  async recordStockIn(payload: {
    material: string;
    packaging?: string | null;
    package_count?: number | null;
    quantity?: number | null;
    defective_quantity?: number;
    movement_type?: "stock_in" | "opening_stock";
    notes?: string;
  }): Promise<StockMovementRecord> {
    return apiRequest<StockMovementRecord>("/inventory/stock-in/", {
      method: "POST",
      body: payload,
    });
  },

  async transferMaterial(payload: {
    material: string;
    labourer: string;
    direction: "to_labourer" | "to_office";
    packaging?: string | null;
    package_count?: number | null;
    quantity?: number | null;
    usable_quantity?: number;
    defective_quantity?: number;
    notes?: string;
  }): Promise<StockMovementRecord> {
    return apiRequest<StockMovementRecord>("/inventory/transfers/", {
      method: "POST",
      body: payload,
    });
  },

  async getConsumptionSummary(): Promise<OfficeConsumptionSummary[]> {
    return apiRequest<OfficeConsumptionSummary[]>("/inventory/consumption/");
  },

  async recordManualConsumption(payload: {
    material: string;
    quantity: number;
    reason: string;
  }): Promise<StockMovementRecord> {
    return apiRequest<StockMovementRecord>("/inventory/consumption/", {
      method: "POST",
      body: payload,
    });
  },

  async listDefects(): Promise<DefectiveRecord[]> {
    return apiRequest<DefectiveRecord[]>("/inventory/defects/");
  },

  async recordDefect(payload: {
    material: string;
    quantity: number;
    discovery_stage: string;
    reason: string;
    labourer?: string | null;
  }): Promise<DefectiveRecord> {
    return apiRequest<DefectiveRecord>("/inventory/defects/", {
      method: "POST",
      body: payload,
    });
  },

  // --- Physical Stock Audits ---
  async listAudits(): Promise<{ results: StockAuditRecord[] }> {
    return apiRequest<{ results: StockAuditRecord[] }>("/audits/");
  },

  async createAudit(payload?: { notes?: string }): Promise<StockAuditRecord> {
    return apiRequest<StockAuditRecord>("/audits/", {
      method: "POST",
      body: payload || {},
    });
  },

  async updateAuditCounts(
    auditId: string,
    counts: Array<{
      line_id: string;
      physical_usable_quantity: number;
      discrepancy_reason: string;
    }>,
  ): Promise<StockAuditRecord> {
    return apiRequest<StockAuditRecord>(`/audits/${auditId}/counts/`, {
      method: "POST",
      body: { counts },
    });
  },

  async submitAudit(auditId: string): Promise<StockAuditRecord> {
    return apiRequest<StockAuditRecord>(`/audits/${auditId}/submit/`, {
      method: "POST",
      body: {},
    });
  },

  async approveAudit(auditId: string): Promise<StockAuditRecord> {
    return apiRequest<StockAuditRecord>(`/audits/${auditId}/approve/`, {
      method: "POST",
      body: {},
    });
  },

  // --- Dispatch & Surplus ---
  async getDispatchQueue(): Promise<{ results: DispatchQueueItem[] }> {
    return apiRequest<{ results: DispatchQueueItem[] }>("/dispatch/queue/");
  },

  async listDispatches(): Promise<{ results: DispatchRecord[] }> {
    return apiRequest<{ results: DispatchRecord[] }>("/dispatch/");
  },

  async createDispatch(payload: {
    order: string;
    packing_verified: boolean;
    notes?: string;
    items: Array<{
      order_item: string;
      quantity_dispatched_for_order: number;
      extra_dispatched_to_client: number;
      extra_retained_in_office: number;
      notes?: string;
    }>;
  }): Promise<DispatchRecord> {
    return apiRequest<DispatchRecord>("/dispatch/", { method: "POST", body: payload });
  },

  async listOfficeSurplus(params?: {
    client?: string;
    available_only?: boolean;
  }): Promise<{ results: OfficeSurplusPoolRecord[] }> {
    const sp = new URLSearchParams();
    if (params?.client) sp.set("client", params.client);
    if (params?.available_only) sp.set("available_only", "true");
    const q = sp.toString();
    return apiRequest<{ results: OfficeSurplusPoolRecord[] }>(
      q ? `/surplus/office/?${q}` : "/surplus/office/",
    );
  },

  async allocateOfficeSurplus(
    surplusId: string,
    payload: {
      replacement_order_item: string;
      quantity_to_allocate: number;
      notes?: string;
    },
  ): Promise<OfficeSurplusPoolRecord> {
    return apiRequest<OfficeSurplusPoolRecord>(`/surplus/office/${surplusId}/allocate/`, {
      method: "POST",
      body: payload,
    });
  },

  async listClientSurplus(clientId?: string): Promise<{ results: ClientSurplusRecord[] }> {
    const q = clientId ? `?client=${encodeURIComponent(clientId)}` : "";
    return apiRequest<{ results: ClientSurplusRecord[] }>(`/surplus/clients/${q}`);
  },

  async reconcileInventory(): Promise<{
    all_reconciled: boolean;
    checked_pairs: number;
    results: Array<{
      material_id: string;
      location_id: string;
      is_reconciled: boolean;
    }>;
  }> {
    return apiRequest("/inventory/reconcile/");
  },
};
