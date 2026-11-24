import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authService } from "@/services/authService";
import { ApiClientError } from "@/services/apiClient";
import type { AuthUser, LoginCredentials } from "@/types/auth";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      try {
        return await authService.getCurrentUser();
      } catch (err) {
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          return null;
        }
        return null;
      }
    },
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginCredentials) => authService.login(credentials),
    onSuccess: (authenticatedUser) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, authenticatedUser);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Unmount authenticated shell & cancel active background queries before destroying server session
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      await queryClient.cancelQueries();
      return authService.logout();
    },
    onSettled: () => {
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.removeQueries({
        predicate: (q) => q.queryKey[0] !== "auth",
      });
    },
  });

  const refreshUser = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
  }, [queryClient]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user: user ?? null,
      isLoading,
      isAuthenticated: Boolean(user),
      login: (credentials: LoginCredentials) => loginMutation.mutateAsync(credentials),
      logout: () => logoutMutation.mutateAsync(),
      refreshUser,
    }),
    [user, isLoading, loginMutation, logoutMutation, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
