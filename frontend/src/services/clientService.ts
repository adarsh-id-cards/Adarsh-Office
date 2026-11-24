/**
 * Client directory and profile API service (`/api/v1/clients/`).
 */
import { apiRequest } from "@/services/apiClient";
import type { PaginatedResponse } from "@/types/api";
import type {
  ClientRecord,
  CreateClientPayload,
  UpdateClientPayload,
} from "@/types/clients";
import type { OrderListItem } from "@/types/orders";

export interface ClientListFilterParams {
  search?: string;
  include_archived?: boolean;
  is_archived?: boolean;
  page?: number;
  page_size?: number;
}

export const clientService = {
  async listClients(params?: ClientListFilterParams): Promise<PaginatedResponse<ClientRecord>> {
    const searchParams = new URLSearchParams();
    if (params?.search) {
      searchParams.set("search", params.search);
    }
    if (params?.include_archived !== undefined) {
      searchParams.set("include_archived", String(params.include_archived));
    }
    if (params?.is_archived !== undefined) {
      searchParams.set("is_archived", String(params.is_archived));
    }
    if (params?.page) {
      searchParams.set("page", String(params.page));
    }
    if (params?.page_size) {
      searchParams.set("page_size", String(params.page_size));
    }
    const query = searchParams.toString();
    return apiRequest<PaginatedResponse<ClientRecord>>(
      query ? `/clients/?${query}` : "/clients/",
      { method: "GET" },
    );
  },

  async getClient(clientId: string): Promise<ClientRecord> {
    return apiRequest<ClientRecord>(`/clients/${clientId}/`, {
      method: "GET",
    });
  },

  async createClient(payload: CreateClientPayload): Promise<ClientRecord> {
    return apiRequest<ClientRecord>("/clients/", {
      method: "POST",
      body: payload,
    });
  },

  async updateClient(clientId: string, payload: UpdateClientPayload): Promise<ClientRecord> {
    return apiRequest<ClientRecord>(`/clients/${clientId}/`, {
      method: "PATCH",
      body: payload,
    });
  },

  async listClientOrders(
    clientId: string,
    params?: {
      order_type?: "original" | "replacement";
      status?: string;
      page?: number;
      page_size?: number;
    },
  ): Promise<PaginatedResponse<OrderListItem>> {
    const searchParams = new URLSearchParams();
    if (params?.order_type) {
      searchParams.set("order_type", params.order_type);
    }
    if (params?.status) {
      searchParams.set("status", params.status);
    }
    if (params?.page) {
      searchParams.set("page", String(params.page));
    }
    if (params?.page_size) {
      searchParams.set("page_size", String(params.page_size));
    }
    const query = searchParams.toString();
    const path = query
      ? `/clients/${clientId}/orders/?${query}`
      : `/clients/${clientId}/orders/`;
    return apiRequest<PaginatedResponse<OrderListItem>>(path, {
      method: "GET",
    });
  },
};
