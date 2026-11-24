/**
 * Minimal Zustand store for transient UI notifications (toasts) and mobile sidebar state.
 * Note: All server and authentication data is managed via TanStack Query — never stored in localStorage.
 */
import { create } from "zustand";

export type ToastVariant = "default" | "success" | "warning" | "error";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface UiShellState {
  isMobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, "id">) => void;
  dismissToast: (id: string) => void;
}

export const useUiShellStore = create<UiShellState>((set) => ({
  isMobileSidebarOpen: false,
  setMobileSidebarOpen: (open: boolean) => set({ isMobileSidebarOpen: open }),
  toggleMobileSidebar: () =>
    set((state) => ({ isMobileSidebarOpen: !state.isMobileSidebarOpen })),
  toasts: [],
  addToast: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({
      toasts: [...state.toasts.slice(-2), { ...toast, id }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((item) => item.id !== id),
      }));
    }, 3200);
  },
  dismissToast: (id: string) =>
    set((state) => ({
      toasts: state.toasts.filter((item) => item.id !== id),
    })),
}));
