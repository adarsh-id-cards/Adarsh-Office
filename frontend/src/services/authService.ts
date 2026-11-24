/**
 * Authentication API service functions.
 */
import { apiRequest, setCsrfToken } from "@/services/apiClient";
import type {
  AuthUser,
  ChangePasswordPayload,
  CurrentUserResponse,
  LoginCredentials,
  LoginResponse,
} from "@/types/auth";
import type { PaginatedResponse } from "@/types/api";

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthUser> {
    const data = await apiRequest<LoginResponse>("/auth/login/", {
      method: "POST",
      body: credentials,
    });
    if (data.csrfToken) {
      setCsrfToken(data.csrfToken);
    }
    return data.user;
  },

  async logout(): Promise<void> {
    await apiRequest<{ detail: string }>("/auth/logout/", {
      method: "POST",
    });
    setCsrfToken(null);
  },

  async getCurrentUser(): Promise<AuthUser | null> {
    const sessionCheck = await apiRequest<{
      csrfToken?: string;
      isAuthenticated?: boolean;
    }>("/auth/csrf/", {
      method: "GET",
    });
    if (sessionCheck.csrfToken) {
      setCsrfToken(sessionCheck.csrfToken);
    }
    if (sessionCheck.isAuthenticated === false) {
      return null;
    }
    const data = await apiRequest<CurrentUserResponse>("/auth/me/", {
      method: "GET",
    });
    return data.user;
  },

  async changePassword(payload: ChangePasswordPayload): Promise<{ detail: string }> {
    return apiRequest<{ detail: string }>("/auth/password/change/", {
      method: "POST",
      body: payload,
    });
  },

  async listUsers(params?: { page?: number; page_size?: number }): Promise<PaginatedResponse<AuthUser>> {
    const sp = new URLSearchParams();
    if (params?.page) sp.set("page", String(params.page));
    if (params?.page_size) sp.set("page_size", String(params.page_size));
    const q = sp.toString();
    return apiRequest<PaginatedResponse<AuthUser>>(q ? `/auth/users/?${q}` : "/auth/users/", {
      method: "GET",
    });
  },
};
