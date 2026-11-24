/**
 * Orders, Order Items, Replacements, and Lifecycle API service (`/api/v1/orders/`).
 */
import { apiRequest } from "@/services/apiClient";
import type { PaginatedResponse } from "@/types/api";
import type {
  CreateOrderPayload,
  CreateReplacementOrderPayload,
  OrderDetailRecord,
  OrderItemRecord,
  OrderItemReplacementSummary,
  OrderListItem,
  OrderStatus,
  OrderStatusHistoryRecord,
  OrderType,
} from "@/types/orders";

export interface OrderListFilterParams {
  search?: string;
  client?: string;
  status?: OrderStatus | "";
  order_type?: OrderType | "";
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export const orderService = {
  async listOrders(params?: OrderListFilterParams): Promise<PaginatedResponse<OrderListItem>> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.client) searchParams.set("client", params.client);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.order_type) searchParams.set("order_type", params.order_type);
    if (params?.date_from) searchParams.set("date_from", params.date_from);
    if (params?.date_to) searchParams.set("date_to", params.date_to);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.page_size) searchParams.set("page_size", String(params.page_size));

    const query = searchParams.toString();
    return apiRequest<PaginatedResponse<OrderListItem>>(
      query ? `/orders/?${query}` : "/orders/",
      { method: "GET" },
    );
  },

  async getOrder(orderId: string): Promise<OrderDetailRecord> {
    return apiRequest<OrderDetailRecord>(`/orders/${orderId}/`, {
      method: "GET",
    });
  },

  async createOrder(payload: CreateOrderPayload): Promise<OrderDetailRecord> {
    return apiRequest<OrderDetailRecord>("/orders/", {
      method: "POST",
      body: payload,
    });
  },

  async updateOrder(
    orderId: string,
    payload: { order_date?: string; expected_completion_date?: string | null; notes?: string },
  ): Promise<OrderDetailRecord> {
    return apiRequest<OrderDetailRecord>(`/orders/${orderId}/`, {
      method: "PATCH",
      body: payload,
    });
  },

  async confirmOrder(orderId: string, reason = "Order confirmed."): Promise<OrderDetailRecord> {
    return apiRequest<OrderDetailRecord>(`/orders/${orderId}/confirm/`, {
      method: "POST",
      body: { reason },
    });
  },

  async cancelOrder(orderId: string, reason: string): Promise<OrderDetailRecord> {
    return apiRequest<OrderDetailRecord>(`/orders/${orderId}/cancel/`, {
      method: "POST",
      body: { reason },
    });
  },

  async transitionOrderStatus(
    orderId: string,
    status: OrderStatus,
    reason = "",
  ): Promise<OrderDetailRecord> {
    return apiRequest<OrderDetailRecord>(`/orders/${orderId}/transition/`, {
      method: "POST",
      body: { status, reason },
    });
  },

  async getOrderHistory(orderId: string): Promise<OrderStatusHistoryRecord[]> {
    return apiRequest<OrderStatusHistoryRecord[]>(`/orders/${orderId}/history/`, {
      method: "GET",
    });
  },

  async createReplacementOrder(
    originalOrderId: string,
    payload: CreateReplacementOrderPayload,
  ): Promise<OrderDetailRecord> {
    return apiRequest<OrderDetailRecord>(`/orders/${originalOrderId}/replacements/`, {
      method: "POST",
      body: payload,
    });
  },

  async listOrderReplacements(originalOrderId: string): Promise<OrderListItem[]> {
    return apiRequest<OrderListItem[]>(`/orders/${originalOrderId}/replacements/`, {
      method: "GET",
    });
  },

  async listOrderItemReplacements(orderItemId: string): Promise<OrderItemReplacementSummary[]> {
    return apiRequest<OrderItemReplacementSummary[]>(`/order-items/${orderItemId}/replacements/`, {
      method: "GET",
    });
  },

  async updateOrderItemQuantities(
    orderItemId: string,
    payload: { prepared_quantity?: number; dispatched_quantity?: number; notes?: string },
  ): Promise<OrderItemRecord> {
    return apiRequest<OrderItemRecord>(`/order-items/${orderItemId}/`, {
      method: "PATCH",
      body: payload,
    });
  },
};
