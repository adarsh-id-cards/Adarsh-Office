import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { AppRouter } from "@/app/router/AppRouter";
import { authService } from "@/services/authService";
import { systemService } from "@/services/systemService";
import { clientService } from "@/services/clientService";
import { orderService } from "@/services/orderService";
import { ApiClientError } from "@/services/apiClient";
import type { AuthUser } from "@/types/auth";

vi.mock("@/services/authService", () => ({
  authService: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    listUsers: vi.fn(),
  },
}));

vi.mock("@/services/systemService", () => ({
  systemService: {
    getHealth: vi.fn(),
    getAuditLogs: vi.fn(),
  },
}));

vi.mock("@/services/clientService", () => ({
  clientService: {
    listClients: vi.fn(),
    getClient: vi.fn(),
    createClient: vi.fn(),
    updateClient: vi.fn(),
    listClientOrders: vi.fn(),
  },
}));

vi.mock("@/services/orderService", () => ({
  orderService: {
    listOrders: vi.fn(),
    getOrder: vi.fn(),
    createOrder: vi.fn(),
    updateOrder: vi.fn(),
    confirmOrder: vi.fn(),
    cancelOrder: vi.fn(),
    transitionOrderStatus: vi.fn(),
    getOrderHistory: vi.fn(),
    createReplacementOrder: vi.fn(),
    listOrderReplacements: vi.fn(),
    listOrderItemReplacements: vi.fn(),
    updateOrderItemQuantities: vi.fn(),
  },
}));

vi.mock("@/services/productionService", () => ({
  productionService: {
    getOverview: vi.fn().mockResolvedValue({
      total_active_jobs: 0,
      awaiting_design: 0,
      under_design: 0,
      awaiting_printing: 0,
      currently_printing: 0,
      lanyards_ready_for_assembly: 0,
      incomplete_production: 0,
      ready_for_dispatch: 0,
    }),
    listQueue: vi.fn().mockResolvedValue({ count: 0, next: null, previous: null, page_size: 25, results: [] }),
  },
}));

vi.mock("@/services/phase4Service", () => ({
  phase4Service: {
    listMaterials: vi.fn().mockResolvedValue({ count: 0, next: null, previous: null, page_size: 25, results: [] }),
    listBalances: vi.fn().mockResolvedValue([]),
    listMovements: vi.fn().mockResolvedValue({ count: 0, next: null, previous: null, page_size: 50, results: [] }),
    getConsumptionSummary: vi.fn().mockResolvedValue([]),
    listDefects: vi.fn().mockResolvedValue([]),
    listLabourers: vi.fn().mockResolvedValue({ results: [] }),
    listAssignments: vi.fn().mockResolvedValue({ results: [] }),
    listAudits: vi.fn().mockResolvedValue({ results: [] }),
    getAssemblyQueue: vi.fn().mockResolvedValue({ results: [] }),
    getDispatchQueue: vi.fn().mockResolvedValue({ results: [] }),
    reconcileInventory: vi.fn().mockResolvedValue({ all_reconciled: true, checked_pairs: 0, results: [] }),
  },
}));

const mockAdminUser: AuthUser = {
  id: "6f84a62e-4f88-420e-a761-101010101010",
  username: "admin",
  email: "admin@adarshidcards.local",
  full_name: "Adarsh Administrator",
  role: "owner_admin",
  role_label: "Owner / Admin",
  is_owner_admin: true,
  is_active: true,
  permissions: [
    "dashboard.view",
    "clients.view",
    "clients.manage",
    "orders.view",
    "orders.manage",
    "production.view",
    "production.manage",
    "dispatch.view",
    "dispatch.manage",
    "labour.view",
    "labour.manage",
    "machines.view",
    "machines.manage",
    "inventory.view",
    "inventory.manage",
    "stock_audit.view",
    "stock_audit.manage",
    "users.view",
    "audit_logs.view",
  ],
  last_login: "2026-11-24T08:00:00+05:30",
  created_at: "2026-11-24T07:00:00+05:30",
  updated_at: "2026-11-24T08:00:00+05:30",
};

function renderWithRouter(initialEntries: string[] = ["/dashboard"]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <AppRouter />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Pro Office Application Shell & Phase 3-4 Placeholders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(systemService.getHealth).mockResolvedValue({
      status: "healthy",
      service: "pro-office-api",
      version: "1.1.0-phase2",
      timezone: "Asia/Kolkata",
      checks: {
        application: "up",
        database: "connected",
      },
      timestamp: "2026-11-24T14:00:00+05:30",
    });
    vi.mocked(clientService.listClients).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      page_size: 25,
      results: [],
    });
    vi.mocked(orderService.listOrders).mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      page_size: 25,
      results: [],
    });
  });

  it("redirects unauthenticated visitors from protected routes to /login", async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValue(
      new ApiClientError("Not authenticated", 403, "authentication_error"),
    );

    renderWithRouter(["/dashboard"]);

    await waitFor(() => {
      expect(screen.getByText("Internal Staff Sign In")).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Username or Work Email/i)).toBeInTheDocument();
  });

  it("renders redesigned workflow dashboard, 4 primary sidebar modules, and secondary administration", async () => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue(mockAdminUser);

    renderWithRouter(["/dashboard"]);

    await waitFor(() => {
      expect(screen.getByText(/Good (morning|afternoon|evening), Adarsh Administrator/i)).toBeInTheDocument();
    });

    expect(screen.getByTestId("qa-new-order")).toBeInTheDocument();
    expect(screen.getByTestId("qa-add-client")).toBeInTheDocument();
    expect(screen.getByTestId("qa-assign-labour")).toBeInTheDocument();
    expect(screen.getByTestId("qa-stock-in")).toBeInTheDocument();

    expect(screen.getByText("Active Orders")).toBeInTheDocument();
    expect(screen.getByText("Orders in Production")).toBeInTheDocument();
    expect(screen.getByText("Pending Assembly")).toBeInTheDocument();
    expect(screen.getByText("Ready for Dispatch")).toBeInTheDocument();

    expect(screen.queryByText(/Notifications \(Planned\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Application & Infrastructure Health/i)).not.toBeInTheDocument();

    // Primary nav uses Clients, Orders, Labour, Stock cleanly; System Health moved to Settings
    expect(screen.getAllByRole("link", { name: /^Clients$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^Orders$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^Labour$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^Stock$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Administration").length).toBeGreaterThan(0);
  });

  it("hides admin-only links from Office Worker and shows System Health under Settings", async () => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      ...mockAdminUser,
      role: "office_worker",
      role_label: "Office Worker",
      is_owner_admin: false,
      permissions: ["dashboard.view", "clients.view", "orders.view", "labour.view", "inventory.view"],
    });

    renderWithRouter(["/system/settings"]);

    expect(await screen.findByText(/System Healthy/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Users & Roles$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Activity Logs$/i })).not.toBeInTheDocument();
  });

  it("routes /inventory and /stock to unified Stock Management without placeholder stubs", async () => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue(mockAdminUser);

    renderWithRouter(["/inventory"]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Stock Management/i })).toBeInTheDocument();
    });
    expect(screen.getByTestId("inventory-tab-audits")).toBeInTheDocument();
    expect(screen.queryByText(/Module Not Yet Implemented/i)).not.toBeInTheDocument();
  });

  it("completes login form submission and transitions to dashboard", async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValueOnce(
      new ApiClientError("Not authenticated", 403, "authentication_error"),
    );
    vi.mocked(authService.login).mockResolvedValueOnce(mockAdminUser);

    const user = userEvent.setup();
    renderWithRouter(["/login"]);

    await waitFor(() => {
      expect(screen.getByText("Internal Staff Sign In")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Username or Work Email/i), "admin");
    await user.type(screen.getByLabelText(/Password/i), "StrongPassword123!");
    await user.click(screen.getByRole("button", { name: /Sign In to Pro Office/i }));

    await waitFor(() => {
      expect(authService.login).toHaveBeenCalledWith({
        username: "admin",
        password: "StrongPassword123!",
      });
      expect(screen.getByText(/Good (morning|afternoon|evening), Adarsh Administrator/i)).toBeInTheDocument();
    });
  });
});
