import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { AppRouter } from "@/app/router/AppRouter";
import { authService } from "@/services/authService";
import { catalogService } from "@/services/catalogService";
import { clientService } from "@/services/clientService";
import { orderService } from "@/services/orderService";
import type { AuthUser } from "@/types/auth";
import type { CatalogOverviewResponse, OrderDetailRecord } from "@/types/orders";

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

const mockWorkerUser: AuthUser = {
  id: "11111111-2222-3333-4444-555555555555",
  username: "office.worker",
  email: "worker@adarshidcards.local",
  full_name: "Priya Office Staff",
  role: "office_worker",
  role_label: "Office Worker",
  is_owner_admin: false,
  is_active: true,
  permissions: ["dashboard.view", "clients.view", "clients.manage", "orders.view", "orders.manage"],
  last_login: "2026-11-24T09:00:00+05:30",
  created_at: "2026-11-24T08:00:00+05:30",
  updated_at: "2026-11-24T09:00:00+05:30",
};

const mockCatalog: CatalogOverviewResponse = {
  card_types: [
    {
      id: "aaaa1111-0000-0000-0000-000000000001",
      category: "card_type",
      category_label: "ID Card Type",
      code: "card_pvc_cr80",
      name: "Standard PVC CR80 Card",
      description: "",
      applicable_to: "id_card",
      sort_order: 1,
      is_archived: false,
    },
  ],
  lanyard_sizes: [
    {
      id: "bbbb2222-0000-0000-0000-000000000001",
      category: "lanyard_size",
      category_label: "Lanyard Size",
      code: "lanyard_16mm",
      name: "16 mm",
      description: "",
      applicable_to: "lanyard",
      sort_order: 2,
      is_archived: false,
    },
  ],
  holders: [
    {
      id: "cccc3333-0000-0000-0000-000000000001",
      category: "holder",
      category_label: "ID Card Holder",
      code: "holder_soft_pvc",
      name: "Transparent Soft PVC Holder",
      description: "",
      applicable_to: "both",
      sort_order: 1,
      is_archived: false,
    },
  ],
  hooks: [
    {
      id: "dddd4444-0000-0000-0000-000000000001",
      category: "hook",
      category_label: "Lanyard Hook",
      code: "hook_dog_metal",
      name: "Metal Dog Hook",
      description: "",
      applicable_to: "lanyard",
      sort_order: 1,
      is_archived: false,
    },
  ],
  accessories: [],
};

const mockCreatedOrder: OrderDetailRecord = {
  id: "99999999-8888-7777-6666-555555555555",
  order_number: "ORD-1001",
  order_type: "original",
  order_type_label: "Original Order",
  client: "77777777-6666-5555-4444-333333333333",
  client_name: "ABC Public School",
  client_is_archived: false,
  original_order: null,
  original_order_number: null,
  order_date: "2026-11-24",
  expected_completion_date: null,
  status: "confirmed",
  status_label: "Confirmed",
  allowed_transitions: ["in_progress", "cancelled"],
  notes: "",
  cancel_reason: "",
  total_ordered_quantity: 2050,
  total_prepared_quantity: 0,
  total_dispatched_quantity: 0,
  total_remaining_quantity: 2050,
  total_replacement_quantity: 0,
  items: [
    {
      id: "10000000-0000-0000-0000-000000000001",
      order: "99999999-8888-7777-6666-555555555555",
      line_number: 1,
      item_name: "Student ID Cards",
      category: "id_card",
      category_label: "ID Card",
      status: "confirmed",
      status_label: "Confirmed",
      original_item: null,
      original_item_name: "",
      original_item_ordered_quantity: null,
      replacement_reason: "",
      replacement_reason_label: "",
      replacement_reason_notes: "",
      ordered_quantity: 1000,
      original_ordered_quantity: 1000,
      replacement_quantity: 0,
      prepared_quantity: 0,
      dispatched_quantity: 0,
      replacement_dispatched_quantity: 0,
      remaining_quantity: 1000,
      card_orientation: "vertical",
      card_orientation_label: "Vertical",
      card_printing: "double_sided",
      card_printing_label: "Double-Sided",
      card_type_option: null,
      card_type_option_detail: null,
      card_type_custom_name: "",
      lanyard_size_option: null,
      lanyard_size_option_detail: null,
      lanyard_design_requirements: "",
      lanyard_printing_specs: "",
      holder_requirement: "not_selected",
      holder_requirement_label: "Not Selected (Pending Decision)",
      holder_option: null,
      holder_option_detail: null,
      hook_requirement: "not_required",
      hook_requirement_label: "Not Required",
      hook_option: null,
      hook_option_detail: null,
      attachment_party: "not_applicable",
      attachment_party_label: "Not Applicable",
      accessories_detail: [],
      extra_specifications: {},
      notes: "",
      replacement_items: [],
      created_at: "2026-11-24T10:00:00+05:30",
      updated_at: "2026-11-24T10:00:00+05:30",
    },
    {
      id: "10000000-0000-0000-0000-000000000002",
      order: "99999999-8888-7777-6666-555555555555",
      line_number: 2,
      item_name: "Staff ID Cards",
      category: "id_card",
      category_label: "ID Card",
      status: "confirmed",
      status_label: "Confirmed",
      original_item: null,
      original_item_name: "",
      original_item_ordered_quantity: null,
      replacement_reason: "",
      replacement_reason_label: "",
      replacement_reason_notes: "",
      ordered_quantity: 50,
      original_ordered_quantity: 50,
      replacement_quantity: 0,
      prepared_quantity: 0,
      dispatched_quantity: 0,
      replacement_dispatched_quantity: 0,
      remaining_quantity: 50,
      card_orientation: "horizontal",
      card_orientation_label: "Horizontal",
      card_printing: "single_sided",
      card_printing_label: "Single-Sided",
      card_type_option: null,
      card_type_option_detail: null,
      card_type_custom_name: "",
      lanyard_size_option: null,
      lanyard_size_option_detail: null,
      lanyard_design_requirements: "",
      lanyard_printing_specs: "",
      holder_requirement: "not_required",
      holder_requirement_label: "Not Required",
      holder_option: null,
      holder_option_detail: null,
      hook_requirement: "not_required",
      hook_requirement_label: "Not Required",
      hook_option: null,
      hook_option_detail: null,
      attachment_party: "not_applicable",
      attachment_party_label: "Not Applicable",
      accessories_detail: [],
      extra_specifications: {},
      notes: "",
      replacement_items: [],
      created_at: "2026-11-24T10:00:00+05:30",
      updated_at: "2026-11-24T10:00:00+05:30",
    },
  ],
  replacement_orders: [],
  status_history: [
    {
      id: "hist-1",
      order: "99999999-8888-7777-6666-555555555555",
      previous_status: "",
      previous_status_label: "Initial",
      new_status: "confirmed",
      new_status_label: "Confirmed",
      changed_by: mockWorkerUser.id,
      changed_by_username: "office.worker",
      reason: "Initial order created.",
      created_at: "2026-11-24T10:00:00+05:30",
    },
  ],
  created_by: mockWorkerUser.id,
  created_by_username: "office.worker",
  updated_by: mockWorkerUser.id,
  updated_by_username: "office.worker",
  created_at: "2026-11-24T10:00:00+05:30",
  updated_at: "2026-11-24T10:00:00+05:30",
};

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AppRouter />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Phase 2 Client & Order Creation and Replacement Workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authService.getCurrentUser).mockResolvedValue(mockWorkerUser);
    vi.mocked(catalogService.getCatalogOverview).mockResolvedValue(mockCatalog);
    vi.mocked(clientService.listClients).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      page_size: 10,
      results: [],
    });
  });

  it("supports inline client creation, multiple ID card & lanyard items, and dynamic form fields", async () => {
    vi.mocked(orderService.createOrder).mockResolvedValue(mockCreatedOrder);
    vi.mocked(orderService.getOrder).mockResolvedValue(mockCreatedOrder);

    const user = userEvent.setup();
    renderPage("/orders/new");

    await waitFor(() => {
      expect(screen.getByText("Create New Order")).toBeInTheDocument();
    });

    // Type a new client name and verify inline auto-create option appears
    const clientInput = screen.getByLabelText(/Client Name/i);
    await user.type(clientInput, "ABC Public School");

    expect(
      await screen.findByText(/New Client Will Be Created/i),
    ).toBeInTheDocument();

    // Add a second ID card item and a Lanyard item
    await user.click(screen.getByTestId("add-card-item-btn"));
    await user.click(screen.getByTestId("add-lanyard-item-btn"));

    expect(screen.getByText("Step 2 — Order Items (3)")).toBeInTheDocument();

    // Verify Lanyard specific fields (Lanyard Size, Hook Decision, Attachment Responsibility) rendered
    expect(screen.getByLabelText(/Lanyard Size \(Catalog\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Hook Decision/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Attachment Responsibility/i)).toBeInTheDocument();

    // Submit the order
    await user.click(screen.getByTestId("submit-create-order-btn"));

    await waitFor(() => {
      expect(orderService.createOrder).toHaveBeenCalledTimes(1);
    });
    const callArg = vi.mocked(orderService.createOrder).mock.calls[0]?.[0];
    expect(callArg?.client_name).toBe("ABC Public School");
    expect(callArg?.items.length).toBe(3);

    // Transitions to OrderDetailPage showing ORD-1001
    expect(await screen.findByText("ORD-1001")).toBeInTheDocument();
  });

  it("validates missing client name before submitting order creation", async () => {
    const user = userEvent.setup();
    renderPage("/orders/new");

    await waitFor(() => {
      expect(screen.getByText("Create New Order")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("submit-create-order-btn"));

    expect(
      await screen.findByText(
        /Please select an existing client or enter a new client name/i,
      ),
    ).toBeInTheDocument();
    expect(orderService.createOrder).not.toHaveBeenCalled();
  });

  it("creates a linked replacement order referencing original order items", async () => {
    vi.mocked(clientService.listClients).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      page_size: 100,
      results: [
        {
          id: mockCreatedOrder.client,
          name: "ABC Public School",
          normalized_name: "abc public school",
          is_archived: false,
          archived_at: null,
          archive_reason: "",
          order_count: 1,
          original_order_count: 1,
          replacement_order_count: 0,
          last_order_date: "2026-11-24",
          total_original_ordered_quantity: 1050,
          total_replacement_ordered_quantity: 0,
          total_ordered_quantity: 1050,
          total_dispatched_quantity: 0,
          created_at: "2026-11-24T10:00:00+05:30",
          updated_at: "2026-11-24T10:00:00+05:30",
        },
      ],
    });
    vi.mocked(orderService.listOrders).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      page_size: 100,
      results: [
        {
          id: mockCreatedOrder.id,
          order_number: "ORD-1001",
          order_type: "original",
          order_type_label: "Original Order",
          client: mockCreatedOrder.client,
          client_name: "ABC Public School",
          original_order: null,
          original_order_number: null,
          order_date: "2026-11-24",
          expected_completion_date: null,
          status: "confirmed",
          status_label: "Confirmed",
          item_count: 2,
          total_ordered_quantity: 1050,
          total_dispatched_quantity: 0,
          replacement_orders_count: 0,
          items_summary: [],
          notes: "",
          created_by_username: "office.worker",
          created_at: "2026-11-24T10:00:00+05:30",
          updated_at: "2026-11-24T10:00:00+05:30",
        },
      ],
    });
    vi.mocked(orderService.getOrder).mockResolvedValue(mockCreatedOrder);
    vi.mocked(orderService.createReplacementOrder).mockResolvedValue({
      ...mockCreatedOrder,
      id: "88888888-7777-6666-5555-444444444444",
      order_number: "ORD-1002",
      order_type: "replacement",
      order_type_label: "Replacement Order",
      original_order: mockCreatedOrder.id,
      original_order_number: "ORD-1001",
      total_ordered_quantity: 10,
    });

    const user = userEvent.setup();
    renderPage(
      `/orders/replacements/new?clientId=${mockCreatedOrder.client}&originalOrderId=${mockCreatedOrder.id}`,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Create Replacement Order" }),
      ).toBeInTheDocument();
    });

    expect(await screen.findByText("Student ID Cards")).toBeInTheDocument();
    expect(screen.getByText("Staff ID Cards")).toBeInTheDocument();

    const qtyInput = screen.getByLabelText(/Replacement Quantity/i);
    await user.clear(qtyInput);
    await user.type(qtyInput, "10");

    await user.click(screen.getByTestId("submit-replacement-order-btn"));

    await waitFor(() => {
      expect(orderService.createReplacementOrder).toHaveBeenCalledWith(
        mockCreatedOrder.id,
        expect.objectContaining({
          client_id: mockCreatedOrder.client,
          items: [
            expect.objectContaining({
              original_item: "10000000-0000-0000-0000-000000000001",
              ordered_quantity: 10,
              replacement_reason: "lost",
            }),
          ],
        }),
      );
    });
  });
});
