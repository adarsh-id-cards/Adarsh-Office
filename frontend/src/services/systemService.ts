/**
 * System health check and audit log API services.
 */
import { apiRequest } from "@/services/apiClient";
import type { AuditLogItem, HealthCheckResponse, PaginatedResponse } from "@/types/api";

export const systemService = {
  async getHealth(): Promise<HealthCheckResponse> {
    return apiRequest<HealthCheckResponse>("/health/", {
      method: "GET",
    });
  },

  async getAuditLogs(params?: {
    module?: string;
    action?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<AuditLogItem>> {
    const searchParams = new URLSearchParams();
    if (params?.module) {
      searchParams.set("module", params.module);
    }
    if (params?.action) {
      searchParams.set("action", params.action);
    }
    if (params?.page) {
      searchParams.set("page", String(params.page));
    }
    if (params?.page_size) {
      searchParams.set("page_size", String(params.page_size));
    }
    const query = searchParams.toString();
    const path = query ? `/audit-logs/?${query}` : "/audit-logs/";
    return apiRequest<PaginatedResponse<AuditLogItem>>(path, {
      method: "GET",
    });
  },
};
