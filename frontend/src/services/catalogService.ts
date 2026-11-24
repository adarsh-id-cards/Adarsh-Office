/**
 * Product specification catalog API service (`/api/v1/catalog/`).
 */
import { apiRequest } from "@/services/apiClient";
import type { CatalogOption, CatalogOverviewResponse } from "@/types/orders";

export const catalogService = {
  async getCatalogOverview(): Promise<CatalogOverviewResponse> {
    return apiRequest<CatalogOverviewResponse>("/catalog/", {
      method: "GET",
    });
  },

  async getCardTypes(): Promise<CatalogOption[]> {
    return apiRequest<CatalogOption[]>("/catalog/card-types/", {
      method: "GET",
    });
  },

  async getLanyardSizes(): Promise<CatalogOption[]> {
    return apiRequest<CatalogOption[]>("/catalog/lanyard-sizes/", {
      method: "GET",
    });
  },

  async getAccessories(): Promise<CatalogOption[]> {
    return apiRequest<CatalogOption[]>("/catalog/accessories/", {
      method: "GET",
    });
  },
};
