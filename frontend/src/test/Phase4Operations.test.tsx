import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { AppRouter } from "@/app/router/AppRouter";
import { authService } from "@/services/authService";
import { phase4Service } from "@/services/phase4Service";
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

vi.mock("@/services/phase4Service", () => ({
  phase4Service: {
    listLabourers: vi.fn(),
    createLabourer: vi.fn(),
    getLabourer: vi.fn(),
    updateLabourer: vi.fn(),
    createSeasonalClosing: vi.fn(),
    reconcileSeasonalClosing: vi.fn(),
    listMachines: vi.fn(),
    createMachine: vi.fn(),
    allocateMachine: vi.fn(),
    returnMachine: vi.fn(),
    getAssemblyQueue: vi.fn(),
    listAssignments: vi.fn(),
    createAssignment: vi.fn(),
    issueAssignmentMaterials: vi.fn(),
    recordAssemblyReceiving: vi.fn(),
    reconcileAssignmentMaterials: vi.fn(),
    listMaterials: vi.fn(),
    createMaterial: vi.fn(),
    addMaterialPackaging: vi.fn(),
    listBalances: vi.fn(),
    listMovements: vi.fn(),
    recordStockIn: vi.fn(),
    transferMaterial: vi.fn(),
    getConsumptionSummary: vi.fn(),
    recordManualConsumption: vi.fn(),
    listDefects: vi.fn(),
    recordDefect: vi.fn(),
    listAudits: vi.fn(),
    createAudit: vi.fn(),
    updateAuditCounts: vi.fn(),
    submitAudit: vi.fn(),
    approveAudit: vi.fn(),
    getDispatchQueue: vi.fn(),
    listDispatches: vi.fn(),
    createDispatch: vi.fn(),
    listOfficeSurplus: vi.fn(),
    allocateOfficeSurplus: vi.fn(),
    listClientSurplus: vi.fn(),
    reconcileInventory: vi.fn().mockResolvedValue({ all_reconciled: true, checked_pairs: 0, results: [] }),
  },
}));

const mockOpsUser: AuthUser = {
  id: "11111111-2222-3333-4444-555555555555",
  username: "ops.staff",
  email: "ops@adarshidcards.local",
  full_name: "Operations Staff",
  role: "office_worker",
  role_label: "Office Worker",
  is_owner_admin: false,
  is_active: true,
  permissions: [
    "dashboard.view",
    "labour.view",
    "labour.manage",
    "machines.view",
    "machines.manage",
    "inventory.view",
    "inventory.manage",
    "stock_audit.view",
    "stock_audit.manage",
    "dispatch.view",
    "dispatch.manage",
  ],
  last_login: "2026-11-24T09:00:00+05:30",
  created_at: "2026-11-24T08:00:00+05:30",
  updated_at: "2026-11-24T09:00:00+05:30",
};

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRouter />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Phase 4 Labour, Machines, Inventory, Stock Audit & Dispatch Modules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authService.getCurrentUser).mockResolvedValue(mockOpsUser);
  });

  it("renders Labour Management directory and allows creating a labourer without user login", async () => {
    vi.mocked(phase4Service.listLabourers).mockResolvedValue({
      results: [
        {
          id: "lab-1",
          name: "Ramesh Kumar",
          contact_number: "9876500001",
          is_active: true,
          is_archived: false,
          joined_date: "2026-11-24",
          notes: "",
          allocated_machines: [],
          supported_lanyard_sizes: ["16 mm"],
          material_balances: [],
          active_assignments_count: 1,
          created_at: "2026-11-24T09:00:00+05:30",
          updated_at: "2026-11-24T09:00:00+05:30",
        },
      ],
    });
    vi.mocked(phase4Service.createLabourer).mockResolvedValue({
      id: "lab-2",
      name: "Suresh Yadav",
      contact_number: "9876500002",
      is_active: true,
      is_archived: false,
      joined_date: "2026-11-24",
      notes: "",
      allocated_machines: [],
      supported_lanyard_sizes: [],
      material_balances: [],
      active_assignments_count: 0,
      created_at: "2026-11-24T09:00:00+05:30",
      updated_at: "2026-11-24T09:00:00+05:30",
    });

    const user = userEvent.setup();
    renderAt("/labour");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Labour & Machines/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/Office-Managed Directory/i)).toBeInTheDocument();
    expect(await screen.findByText("Ramesh Kumar")).toBeInTheDocument();

    await user.click(screen.getByTestId("open-create-labourer-btn"));
    await user.type(screen.getByLabelText(/Labourer Name/i), "Suresh Yadav");
    await user.click(screen.getByTestId("submit-create-labourer-btn"));

    await waitFor(() => {
      expect(phase4Service.createLabourer).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Suresh Yadav" }),
      );
    });
  });

  it("renders Central Inventory with vendor packet conversion and Office Consumption formula", async () => {
    vi.mocked(phase4Service.listMaterials).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      page_size: 25,
      results: [
        {
          id: "mat-1",
          code: "MAT-JOINTER-16MM",
          name: "Jointer 16 mm",
          category: "jointer",
          category_label: "Jointer",
          base_unit: "piece",
          base_unit_label: "Piece",
          supported_size_label: "16 mm",
          minimum_stock_level: 1000,
          is_active: true,
          notes: "",
          office_usable_stock: 5000,
          office_defective_stock: 0,
          labour_usable_stock: 400,
          total_company_usable_stock: 5400,
          packagings: [
            {
              id: "pkg-500",
              material: "mat-1",
              package_name: "Packet of 500",
              units_per_package: 500,
              vendor_label: "Vendor B",
              is_default: true,
              is_active: true,
              notes: "",
            },
          ],
        },
      ],
    });
    vi.mocked(phase4Service.listBalances).mockResolvedValue([]);
    vi.mocked(phase4Service.listMovements).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      page_size: 50,
      results: [],
    });
    vi.mocked(phase4Service.getConsumptionSummary).mockResolvedValue([
      {
        material_id: "mat-1",
        material_name: "Jointer 16 mm",
        base_unit: "piece",
        opening_office_stock: 2000,
        stock_received: 500,
        returns_from_labourers: 0,
        transfers_to_labourers: 600,
        system_expected_office_stock: 1900,
        closing_physical_office_stock: 1900,
        recorded_manual_consumption: 0,
        calculated_net_office_consumption: 0,
        unexplained_difference: 0,
      },
    ]);
    vi.mocked(phase4Service.listDefects).mockResolvedValue([]);
    vi.mocked(phase4Service.listLabourers).mockResolvedValue({ results: [] });

    const user = userEvent.setup();
    renderAt("/inventory");

    await waitFor(() => {
      expect(screen.getByText("Jointer 16 mm")).toBeInTheDocument();
    });
    expect(screen.getByText("5,000")).toBeInTheDocument();
    expect(screen.getByText("5,400")).toBeInTheDocument();

    await user.click(screen.getByTestId("inventory-tab-consumption"));
    expect(await screen.findByText(/Automatic Office Consumption Reconciliation Formula/i)).toBeInTheDocument();
  });

  it("renders Dispatch Queue and Office Surplus Pool", async () => {
    vi.mocked(phase4Service.getDispatchQueue).mockResolvedValue({
      results: [
        {
          order_item_id: "oi-1",
          order_id: "ord-1",
          order_number: "ORD-1001",
          order_type: "original",
          order_status: "in_progress",
          client_id: "cl-1",
          client_name: "ABC School",
          item_name: "Lanyards 16mm",
          category: "lanyard",
          lanyard_size_name: "16 mm",
          ordered_quantity: 1000,
          allocated_from_surplus_quantity: 0,
          produced_quantity: 1020,
          dispatched_quantity: 0,
          remaining_order_quantity: 1000,
          estimated_surplus_quantity: 20,
          is_ready_for_dispatch: true,
          current_stage: "dispatch",
        },
      ],
    });
    vi.mocked(phase4Service.listDispatches).mockResolvedValue({ results: [] });
    vi.mocked(phase4Service.listOfficeSurplus).mockResolvedValue({
      results: [
        {
          id: "srp-1",
          surplus_code: "SRP-1001",
          source_order: "ord-1",
          source_order_number: "ORD-1001",
          source_order_item: "oi-1",
          client: "cl-1",
          client_name: "ABC School",
          category: "lanyard",
          item_name: "Lanyards 16mm",
          lanyard_size_name: "16 mm",
          specification_summary: "Lanyard 16 mm",
          initial_quantity: 10,
          allocated_quantity: 0,
          remaining_quantity: 10,
          notes: "",
          created_at: "2026-11-24T12:00:00+05:30",
        },
      ],
    });
    vi.mocked(phase4Service.listClientSurplus).mockResolvedValue({ results: [] });

    const user = userEvent.setup();
    renderAt("/dispatch");

    await waitFor(() => {
      expect(screen.getByText("ORD-1001")).toBeInTheDocument();
    });
    expect(screen.getByText(/\+20 extra/i)).toBeInTheDocument();

    await user.click(screen.getByTestId("dispatch-tab-office_surplus"));
    expect(await screen.findByText("SRP-1001")).toBeInTheDocument();
    expect(screen.getByText("10 pcs remaining")).toBeInTheDocument();
  });
});
