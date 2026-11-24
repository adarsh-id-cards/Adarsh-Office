/**
 * Core API response and error contracts for Pro Office.
 */

export interface ApiErrorPayload {
  status: "error";
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | unknown[];
  };
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  page_size: number;
  results: T[];
}

export interface HealthCheckResponse {
  status: "healthy" | "degraded";
  service: string;
  version: string;
  timezone: string;
  checks: {
    application: "up" | "down";
    database: "connected" | "unavailable";
  };
  timestamp: string;
}

export interface AuditLogItem {
  id: string;
  actor: string | null;
  actor_username: string;
  actor_role: string;
  action: string;
  module: string;
  target_type: string;
  target_id: string;
  summary: string;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}
