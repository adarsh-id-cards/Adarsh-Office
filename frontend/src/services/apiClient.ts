/**
 * Centralized HTTP client for Pro Office REST API (`/api/v1/`).
 *
 * Security & Architecture characteristics:
 * - Uses Django session authentication with HTTP-only session cookies (`credentials: "include"`).
 * - Automatically attaches `X-CSRFToken` on state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`).
 * - Never stores tokens or credentials in `localStorage` or `sessionStorage`.
 * - Normalizes backend error responses into `ApiClientError`.
 */
import { envConfig } from "@/lib/env";
import type { ApiErrorPayload } from "@/types/api";

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: Record<string, unknown> | unknown[];

  constructor(
    message: string,
    status: number,
    code = "api_error",
    details: Record<string, unknown> | unknown[] = {},
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let inMemoryCsrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}

export function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match && match[2] ? decodeURIComponent(match[2]) : null;
}

export function resolveCsrfToken(): string | null {
  return getCookieValue("pro_office_csrftoken") || getCookieValue("csrftoken") || inMemoryCsrfToken;
}

export async function ensureCsrfToken(): Promise<string | null> {
  const existing = resolveCsrfToken();
  if (existing) {
    return existing;
  }
  try {
    const response = await fetch(`${envConfig.apiBaseUrl}/auth/csrf/`, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });
    if (response.ok) {
      const data = (await response.json()) as { csrfToken?: string };
      if (data.csrfToken) {
        inMemoryCsrfToken = data.csrfToken;
        return data.csrfToken;
      }
    }
  } catch {
    // Handled downstream if network is unreachable
  }
  return resolveCsrfToken();
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (isMutating) {
    const csrfToken = await ensureCsrfToken();
    if (csrfToken) {
      headers.set("X-CSRFToken", csrfToken);
    }
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${envConfig.apiBaseUrl}${normalizedPath}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      method,
      credentials: "include",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiClientError(
      "Unable to reach the Pro Office server. Please check your network connection.",
      0,
      "network_error",
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let parsedData: unknown = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      parsedData = await response.json();
    } catch {
      parsedData = null;
    }
  }

  if (!response.ok) {
    const errorPayload = parsedData as Partial<ApiErrorPayload> | null;
    if (errorPayload?.error) {
      throw new ApiClientError(
        errorPayload.error.message || "Request could not be completed.",
        response.status,
        errorPayload.error.code || "api_error",
        errorPayload.error.details || {},
      );
    }
    throw new ApiClientError(
      `Request failed with HTTP status ${response.status}.`,
      response.status,
      "http_error",
    );
  }

  return parsedData as T;
}
