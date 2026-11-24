/**
 * Phase 3 Production Management API service (`/api/v1/production/` & `/api/v1/printing-runs/`).
 */
import { apiRequest } from "@/services/apiClient";
import type { PaginatedResponse } from "@/types/api";
import type {
  CreatePrintingRunPayload,
  PrintingRunRecord,
  ProductionJobDetailRecord,
  ProductionJobListItem,
  ProductionOverviewCounts,
} from "@/types/production";

export interface ProductionQueueFilterParams {
  search?: string;
  category?: "id_card" | "lanyard" | "";
  client?: string;
  order_number?: string;
  lanyard_size?: string;
  stage?: string;
  design_status?: string;
  printing_status?: string;
  assembly_status?: string;
  bucket?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export const productionService = {
  async getOverview(): Promise<ProductionOverviewCounts> {
    return apiRequest<ProductionOverviewCounts>("/production/overview/", {
      method: "GET",
    });
  },

  async listQueue(
    params?: ProductionQueueFilterParams,
  ): Promise<PaginatedResponse<ProductionJobListItem>> {
    const sp = new URLSearchParams();
    if (params?.search) sp.set("search", params.search);
    if (params?.category) sp.set("category", params.category);
    if (params?.client) sp.set("client", params.client);
    if (params?.order_number) sp.set("order_number", params.order_number);
    if (params?.lanyard_size) sp.set("lanyard_size", params.lanyard_size);
    if (params?.stage) sp.set("stage", params.stage);
    if (params?.design_status) sp.set("design_status", params.design_status);
    if (params?.printing_status) sp.set("printing_status", params.printing_status);
    if (params?.assembly_status) sp.set("assembly_status", params.assembly_status);
    if (params?.bucket) sp.set("bucket", params.bucket);
    if (params?.date_from) sp.set("date_from", params.date_from);
    if (params?.date_to) sp.set("date_to", params.date_to);
    if (params?.page) sp.set("page", String(params.page));
    if (params?.page_size) sp.set("page_size", String(params.page_size));

    const query = sp.toString();
    return apiRequest<PaginatedResponse<ProductionJobListItem>>(
      query ? `/production/queue/?${query}` : "/production/queue/",
      { method: "GET" },
    );
  },

  async getJob(jobId: string): Promise<ProductionJobDetailRecord> {
    return apiRequest<ProductionJobDetailRecord>(`/production/jobs/${jobId}/`, {
      method: "GET",
    });
  },

  async startDesign(
    jobId: string,
    payload?: { notes?: string; design_reference?: string },
  ): Promise<ProductionJobDetailRecord> {
    return apiRequest<ProductionJobDetailRecord>(`/production/jobs/${jobId}/design/start/`, {
      method: "POST",
      body: payload || {},
    });
  },

  async reviewDesign(
    jobId: string,
    payload?: { notes?: string; design_reference?: string },
  ): Promise<ProductionJobDetailRecord> {
    return apiRequest<ProductionJobDetailRecord>(`/production/jobs/${jobId}/design/review/`, {
      method: "POST",
      body: payload || {},
    });
  },

  async approveDesign(
    jobId: string,
    payload?: { notes?: string; design_reference?: string },
  ): Promise<ProductionJobDetailRecord> {
    return apiRequest<ProductionJobDetailRecord>(`/production/jobs/${jobId}/design/approve/`, {
      method: "POST",
      body: payload || {},
    });
  },

  async completeDesign(
    jobId: string,
    payload?: { notes?: string; design_reference?: string },
  ): Promise<ProductionJobDetailRecord> {
    return apiRequest<ProductionJobDetailRecord>(`/production/jobs/${jobId}/design/complete/`, {
      method: "POST",
      body: payload || {},
    });
  },

  async overridePrintingPlan(
    jobId: string,
    payload: {
      planned_batches: number;
      planned_printing_quantity?: number;
      override_reason: string;
    },
  ): Promise<ProductionJobDetailRecord> {
    return apiRequest<ProductionJobDetailRecord>(
      `/production/jobs/${jobId}/printing-plan/override/`,
      {
        method: "POST",
        body: payload,
      },
    );
  },

  async listPrintingRuns(jobId: string): Promise<PrintingRunRecord[]> {
    return apiRequest<PrintingRunRecord[]>(`/production/jobs/${jobId}/printing-runs/`, {
      method: "GET",
    });
  },

  async createPrintingRun(
    jobId: string,
    payload: CreatePrintingRunPayload,
  ): Promise<ProductionJobDetailRecord> {
    return apiRequest<ProductionJobDetailRecord>(`/production/jobs/${jobId}/printing-runs/`, {
      method: "POST",
      body: payload,
    });
  },

  async completePrintingRun(
    runId: string,
    payload: {
      actual_printed_quantity?: number;
      rejected_quantity?: number;
      successful_quantity?: number | null;
      notes?: string;
    },
  ): Promise<ProductionJobDetailRecord> {
    return apiRequest<ProductionJobDetailRecord>(`/printing-runs/${runId}/complete/`, {
      method: "POST",
      body: payload,
    });
  },

  async markAssemblyReady(
    jobId: string,
    payload?: { planned_assembly_quantity?: number; notes?: string },
  ): Promise<ProductionJobDetailRecord> {
    return apiRequest<ProductionJobDetailRecord>(`/production/jobs/${jobId}/assembly/ready/`, {
      method: "POST",
      body: payload || {},
    });
  },

  async startAssembly(
    jobId: string,
    payload?: { completed_assembly_quantity?: number; notes?: string },
  ): Promise<ProductionJobDetailRecord> {
    return apiRequest<ProductionJobDetailRecord>(`/production/jobs/${jobId}/assembly/start/`, {
      method: "POST",
      body: payload || {},
    });
  },

  async completeAssembly(
    jobId: string,
    payload?: { completed_assembly_quantity?: number; notes?: string },
  ): Promise<ProductionJobDetailRecord> {
    return apiRequest<ProductionJobDetailRecord>(`/production/jobs/${jobId}/assembly/complete/`, {
      method: "POST",
      body: payload || {},
    });
  },

  async completeIdCardProduction(
    jobId: string,
    payload?: { ready_for_packing_quantity?: number; notes?: string },
  ): Promise<ProductionJobDetailRecord> {
    return apiRequest<ProductionJobDetailRecord>(`/production/jobs/${jobId}/complete/`, {
      method: "POST",
      body: payload || {},
    });
  },
};
