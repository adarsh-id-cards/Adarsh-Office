import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { AppRouter } from "@/app/router/AppRouter";
import { authService } from "@/services/authService";
import { catalogService } from "@/services/catalogService";
import { productionService } from "@/services/productionService";
import type { AuthUser } from "@/types/auth";
import type { ProductionJobDetailRecord, ProductionOverviewCounts } from "@/types/production";

vi.mock("@/services/authService", () => ({
  authService: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    listUsers: vi.fn(),
  },
}));

vi.mock("@/services/catalogService", () => ({
  catalogService: {
    getCatalogOverview: vi.fn(),
  },
}));

vi.mock("@/services/productionService", () => ({
  productionService: {
    getOverview: vi.fn(),
    listQueue: vi.fn(),
    getJob: vi.fn(),
    startDesign: vi.fn(),
    reviewDesign: vi.fn(),
    approveDesign: vi.fn(),
    completeDesign: vi.fn(),
    overridePrintingPlan: vi.fn(),
    listPrintingRuns: vi.fn(),
    createPrintingRun: vi.fn(),
    completePrintingRun: vi.fn(),
    markAssemblyReady: vi.fn(),
    startAssembly: vi.fn(),
    completeAssembly: vi.fn(),
    completeIdCardProduction: vi.fn(),
  },
}));

const mockUser: AuthUser = {
  id: "11111111-2222-3333-4444-555555555555",
  username: "production.staff",
  email: "prod@adarshidcards.local",
  full_name: "Production Officer",
  role: "office_worker",
  role_label: "Office Worker",
  is_owner_admin: false,
  is_active: true,
  permissions: [
    "dashboard.view",
    "orders.view",
    "production.view",
    "production.manage",
  ],
  last_login: "2026-11-24T09:00:00+05:30",
  created_at: "2026-11-24T08:00:00+05:30",
  updated_at: "2026-11-24T09:00:00+05:30",
};

const mockOverview: ProductionOverviewCounts = {
  total_active_jobs: 3,
  awaiting_design: 1,
  under_design: 1,
  awaiting_printing: 1,
  currently_printing: 0,
  lanyards_ready_for_assembly: 1,
  incomplete_production: 2,
  ready_for_dispatch: 1,
};

const mockLanyardJob: ProductionJobDetailRecord = {
  id: "aaaa0000-1111-2222-3333-444444444444",
  order_item: "bbbb0000-1111-2222-3333-444444444444",
  item: {
    id: "bbbb0000-1111-2222-3333-444444444444",
    order_id: "cccc0000-1111-2222-3333-444444444444",
    order_number: "ORD-1001",
    order_type: "original",
    order_type_label: "Original Order",
    order_date: "2026-11-24",
    order_status: "in_progress",
    order_status_label: "In Progress",
    client_id: "dddd0000-1111-2222-3333-444444444444",
    client_name: "ABC Public School",
    line_number: 3,
    item_name: "School Lanyards 16mm",
    category: "lanyard",
    category_label: "Lanyard",
    ordered_quantity: 1000,
    prepared_quantity: 0,
    dispatched_quantity: 0,
    remaining_quantity: 1000,
    replacement_reason: "",
    replacement_reason_label: "",
    replacement_reason_notes: "",
    card_orientation: "",
    card_orientation_label: "",
    card_printing: "",
    card_printing_label: "",
    card_type_option_detail: null,
    card_type_custom_name: "",
    lanyard_size_option: "size-16mm",
    lanyard_size_option_detail: {
      id: "size-16mm",
      category: "lanyard_size",
      category_label: "Lanyard Size",
      code: "lanyard_16mm",
      name: "16 mm",
      description: "",
      applicable_to: "lanyard",
      sort_order: 2,
      batch_capacity: 30,
      is_archived: false,
    },
    lanyard_design_requirements: "Navy blue with crest",
    lanyard_printing_specs: "Multi-colour sublimation",
    holder_requirement: "attach_later",
    holder_requirement_label: "To Be Attached Later",
    holder_option_detail: null,
    hook_requirement: "required",
    hook_requirement_label: "Required",
    hook_option_detail: null,
    attachment_party: "completed_by_adarsh",
    attachment_party_label: "Attachment Completed by Adarsh",
    accessories_detail: [],
    notes: "",
  },
  current_stage: "printing",
  current_stage_label: "Printing",
  design_status: "completed",
  design_status_label: "Completed",
  design_started_at: "2026-11-24T09:00:00+05:30",
  design_approved_at: "2026-11-24T09:30:00+05:30",
  design_completed_at: "2026-11-24T10:00:00+05:30",
  design_responsible_username: "production.staff",
  printing_status: "not_started",
  printing_status_label: "Not Started",
  printing_started_at: null,
  printing_completed_at: null,
  printing_responsible_username: "",
  printing_runs_count: 0,
  batch_capacity: 30,
  calculated_batches: 34,
  calculated_planned_quantity: 1020,
  calculated_expected_surplus: 20,
  planned_batches: 34,
  planned_printing_quantity: 1020,
  expected_surplus_quantity: 20,
  is_plan_overridden: false,
  plan_override_reason: "",
  total_printed_quantity: 0,
  total_rejected_quantity: 0,
  successful_printed_quantity: 0,
  assembly_status: "not_ready",
  assembly_status_label: "Not Ready",
  is_assembly_ready: false,
  planned_assembly_quantity: 1000,
  completed_assembly_quantity: 0,
  assembly_started_at: null,
  assembly_completed_at: null,
  assembly_responsible_username: "",
  is_production_completed: false,
  production_completed_at: null,
  is_ready_for_dispatch: false,
  ready_for_packing_quantity: 0,
  required_quantity: 1000,
  production_quantity_available: 0,
  quantity_completed: 0,
  quantity_pending: 1000,
  actual_printed_surplus: 0,
  design_notes: "Approved by school",
  design_reference: "ART-1001",
  printing_notes: "",
  assembly_notes: "",
  notes: "",
  workflow_stages: [
    {
      key: "design",
      label: "1. Design",
      status: "completed",
      status_label: "Completed",
      is_completed: true,
      is_active: false,
    },
    {
      key: "printing",
      label: "2. Printing",
      status: "not_started",
      status_label: "Not Started",
      is_completed: false,
      is_active: true,
    },
    {
      key: "assembly",
      label: "3. Assembly",
      status: "not_ready",
      status_label: "Not Ready",
      is_completed: false,
      is_active: false,
    },
    {
      key: "dispatch",
      label: "4. Dispatch",
      status: "pending",
      status_label: "Pending Assembly",
      is_completed: false,
      is_active: false,
    },
  ],
  printing_runs: [],
  history: [],
  created_at: "2026-11-24T09:00:00+05:30",
  updated_at: "2026-11-24T10:00:00+05:30",
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

describe("Phase 3 Production Management Dashboard & Lanyard Batch Calculator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(catalogService.getCatalogOverview).mockResolvedValue({
      card_types: [],
      lanyard_sizes: [],
      holders: [],
      hooks: [],
      accessories: [],
    });
    vi.mocked(productionService.getOverview).mockResolvedValue(mockOverview);
    vi.mocked(productionService.listQueue).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      page_size: 25,
      results: [mockLanyardJob],
    });
  });

  it("renders Production Dashboard overview buckets and independent item queue", async () => {
    renderAt("/production");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Production Management" }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Awaiting Design")).toBeInTheDocument();
    expect(screen.getByText("Lanyards Ready for Assembly")).toBeInTheDocument();
    expect(await screen.findByText("School Lanyards 16mm")).toBeInTheDocument();
    expect(screen.getByText("ORD-1001")).toBeInTheDocument();
  });

  it("displays transparent Lanyard Batch Calculator (34 batches = 1,020 pcs, 20 surplus) and records printing run", async () => {
    vi.mocked(productionService.getJob).mockResolvedValue(mockLanyardJob);
    vi.mocked(productionService.createPrintingRun).mockResolvedValue({
      ...mockLanyardJob,
      printing_status: "completed",
      printing_status_label: "Completed",
      successful_printed_quantity: 1020,
      total_printed_quantity: 1020,
      assembly_status: "ready_for_assembly",
      assembly_status_label: "Ready for Assembly",
      is_assembly_ready: true,
    });

    const user = userEvent.setup();
    renderAt(`/production/jobs/${mockLanyardJob.id}`);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "School Lanyards 16mm" }),
      ).toBeInTheDocument();
    });

    // Verify transparent lanyard batch calculation panel
    const calcPanel = screen.getByTestId("lanyard-batch-calculator-panel");
    expect(calcPanel).toHaveTextContent("30 pcs / batch");
    expect(calcPanel).toHaveTextContent("34 batches");
    expect(calcPanel).toHaveTextContent("1,020 pcs");
    expect(calcPanel).toHaveTextContent("20 pcs");

    // Record printing run
    await user.click(screen.getByTestId("record-printing-run-btn"));

    await waitFor(() => {
      expect(productionService.createPrintingRun).toHaveBeenCalledWith(
        mockLanyardJob.id,
        expect.objectContaining({
          planned_batches: 34,
          planned_quantity: 1020,
          actual_printed_quantity: 1020,
          rejected_quantity: 0,
        }),
      );
    });
  });
});
