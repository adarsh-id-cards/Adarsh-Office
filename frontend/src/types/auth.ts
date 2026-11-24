/**
 * Authentication and internal user role types.
 */

export type UserRole = "owner_admin" | "office_worker";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  role_label: string;
  is_owner_admin: boolean;
  is_active: boolean;
  permissions: string[];
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  csrfToken: string;
}

export interface CurrentUserResponse {
  user: AuthUser;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
  confirm_password: string;
}
