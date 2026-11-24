import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CreditCard,
  Plus,
  Ribbon,
  Save,
  Trash2,
  UserPlus,
} from "lucide-react";
import { catalogService } from "@/services/catalogService";
import { clientService } from "@/services/clientService";
import { orderService } from "@/services/orderService";
import { ApiClientError } from "@/services/apiClient";
import { useUiShellStore } from "@/hooks/useToastStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/forms/FormField";
import { PageHeader } from "@/components/shared/PageHeader";
import type { ClientRecord } from "@/types/clients";
import type {
  AccessoryRequirement,
  AttachmentParty,
  CardOrientation,
  CardPrintingSide,
  CreateOrderItemInput,
} from "@/types/orders";

interface DraftOrderItem extends CreateOrderItemInput {
  localId: string;
}

function createDefaultCardItem(): DraftOrderItem {
  return {
    localId: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    item_name: "Student ID Cards",
    category: "id_card",
    ordered_quantity: 100,
    card_orientation: "vertical",
    card_printing: "double_sided",
    card_type_option: null,
    card_type_custom_name: "",
    holder_requirement: "not_selected",
    holder_option: null,
    hook_requirement: "not_required",
    hook_option: null,
    attachment_party: "not_applicable",
    accessory_ids: [],
    notes: "",
  };
}

function createDefaultLanyardItem(defaultSizeId: string | null = null): DraftOrderItem {
  return {
    localId: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    item_name: "Printed Lanyards",
    category: "lanyard",
    ordered_quantity: 100,
    lanyard_size_option: defaultSizeId,
    lanyard_design_requirements: "",
    lanyard_printing_specs: "",
    hook_requirement: "required",
    hook_option: null,
    holder_requirement: "not_selected",
    holder_option: null,
    attachment_party: "completed_by_adarsh",
    accessory_ids: [],
    notes: "",
  };
}

function getTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function OrderCreatePage(): React.ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedClientId = searchParams.get("clientId");
  const queryClient = useQueryClient();
  const addToast = useUiShellStore((state) => state.addToast);

  const [idempotencyKey] = React.useState(
    () => `ord-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );

  const [clientSearchText, setClientSearchText] = React.useState("");
  const [selectedClient, setSelectedClient] = React.useState<ClientRecord | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);

  const [items, setItems] = React.useState<DraftOrderItem[]>(() => [createDefaultCardItem()]);
  const [formError, setFormError] = React.useState<string | null>(null);

  const { data: catalog } = useQuery({
    queryKey: ["catalog", "overview"],
    queryFn: () => catalogService.getCatalogOverview(),
  });

  React.useEffect(() => {
    if (!catalog || catalog.lanyard_sizes.length === 0) return;
    const defaultSizeId =
      catalog.lanyard_sizes.find((s) => s.code === "lanyard_16mm")?.id ||
      catalog.lanyard_sizes[0]?.id ||
      null;
    if (!defaultSizeId) return;
    setItems((prev) =>
      prev.map((it) =>
        it.category === "lanyard" && !it.lanyard_size_option
          ? { ...it, lanyard_size_option: defaultSizeId }
          : it,
      ),
    );
  }, [catalog]);

  const { data: preloadedClient } = useQuery({
    queryKey: ["clients", "detail", preselectedClientId],
    queryFn: () => clientService.getClient(preselectedClientId!),
    enabled: Boolean(preselectedClientId),
  });

  React.useEffect(() => {
    if (preloadedClient && !selectedClient) {
      setSelectedClient(preloadedClient);
      setClientSearchText(preloadedClient.name);
    }
  }, [preloadedClient, selectedClient]);

  const { data: clientSuggestionsData } = useQuery({
    queryKey: ["clients", "autocomplete", clientSearchText],
    queryFn: () =>
      clientService.listClients({
        search: clientSearchText.trim() || undefined,
        is_archived: false,
        page_size: 10,
      }),
  });

  const suggestions = clientSuggestionsData?.results || [];
  const normalizedTyped = clientSearchText.trim().replace(/\s+/g, " ").toLowerCase();
  const exactMatchClient = suggestions.find((c) => c.normalized_name === normalizedTyped);

  const handleClientInputChange = (value: string) => {
    setClientSearchText(value);
    setIsDropdownOpen(true);
    if (selectedClient && value.trim().toLowerCase() !== selectedClient.normalized_name) {
      setSelectedClient(null);
    }
  };

  const handleSelectExistingClient = (client: ClientRecord) => {
    setSelectedClient(client);
    setClientSearchText(client.name);
    setIsDropdownOpen(false);
  };

  const updateItem = (localId: string, updater: (prev: DraftOrderItem) => DraftOrderItem) => {
    setItems((prevItems) =>
      prevItems.map((item) => (item.localId === localId ? updater(item) : item)),
    );
  };

  const handleAddCardItem = () => {
    setItems((prev) => [
      ...prev,
      {
        ...createDefaultCardItem(),
        item_name: prev.length === 1 ? "Staff ID Cards" : `ID Card Item #${prev.length + 1}`,
      },
    ]);
  };

  const handleAddLanyardItem = () => {
    const defaultSizeId =
      catalog?.lanyard_sizes.find((s) => s.code === "lanyard_16mm")?.id ||
      catalog?.lanyard_sizes[0]?.id ||
      null;
    setItems((prev) => [...prev, createDefaultLanyardItem(defaultSizeId)]);
  };

  const handleRemoveItem = (localId: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((item) => item.localId !== localId));
  };

  const createOrderMutation = useMutation({
    mutationFn: () => {
      const effectiveClient = selectedClient || exactMatchClient || null;
      return orderService.createOrder({
        client_id: effectiveClient ? effectiveClient.id : null,
        client_name: effectiveClient ? undefined : clientSearchText.trim(),
        order_date: getTodayIso(),
        expected_completion_date: null,
        status: "confirmed",
        notes: "",
        idempotency_key: idempotencyKey,
        items: items.map(({ localId: _localId, ...rest }) => rest),
      });
    },
    onSuccess: (createdOrder) => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      addToast({
        title: `Order ${createdOrder.order_number} Created`,
        description: `Saved order for ${createdOrder.client_name} with ${createdOrder.items.length} item(s).`,
        variant: "success",
      });
      navigate(`/orders/${createdOrder.id}`, { replace: true });
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
      } else {
        setFormError("Unable to create order. Please check all fields and try again.");
      }
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!selectedClient && !clientSearchText.trim()) {
      setFormError("Please select an existing client or enter a new client name.");
      return;
    }

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item) continue;
      const label = `Item #${i + 1}`;
      if (!item.item_name.trim()) {
        setFormError(`${label}: Item name is required.`);
        return;
      }
      if (!item.ordered_quantity || item.ordered_quantity < 1) {
        setFormError(`${label} (${item.item_name}): Quantity must be at least 1.`);
        return;
      }
      if (item.category === "id_card") {
        if (!item.card_orientation) {
          setFormError(`${label} (${item.item_name}): Please select ID Card Orientation.`);
          return;
        }
        if (!item.card_printing) {
          setFormError(`${label} (${item.item_name}): Please select ID Card Printing sides.`);
          return;
        }
      } else if (item.category === "lanyard") {
        if (!item.lanyard_size_option) {
          setFormError(
            `${label} (${item.item_name}): Please select a Lanyard Size (12 mm, 16 mm, or 20 mm).`,
          );
          return;
        }
      }
    }

    createOrderMutation.mutate();
  };

  const totalUnits = items.reduce(
    (sum, item) => sum + (Number(item.ordered_quantity) > 0 ? Number(item.ordered_quantity) : 0),
    0,
  );
  const resolvedExistingClient = selectedClient || exactMatchClient || null;

  return (
    <div className="space-y-5">
      <PageHeader
        backLink={{ to: "/orders", label: "Orders" }}
        title="Create New Order"
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate("/orders")}
            disabled={createOrderMutation.isPending}
          >
            Cancel
          </Button>
        }
      />

      {formError ? (
        <div
          className="flex items-start gap-2.5 rounded-[10px] border border-red-300 bg-red-50 p-3.5 text-[13.5px] text-red-800"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold">Validation Error</p>
            <p className="mt-0.5">{formError}</p>
          </div>
        </div>
      ) : null}

      <form id="create-order-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* CLIENT SELECTION */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="py-3.5">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <CardTitle className="text-[15px] font-semibold text-slate-900">Client</CardTitle>
              {resolvedExistingClient ? (
                <Badge variant="success">
                  <CheckCircle2 className="h-3 w-3" />
                  Existing: {resolvedExistingClient.name}
                </Badge>
              ) : clientSearchText.trim() ? (
                <Badge variant="default">
                  <UserPlus className="h-3 w-3" />
                  New Client: &ldquo;{clientSearchText.trim()}&rdquo;
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="relative max-w-xl">
              <FormField
                id="order-client-input"
                label="Client Name"
                required
              >
                <Input
                  id="order-client-input"
                  value={clientSearchText}
                  onChange={(e) => handleClientInputChange(e.target.value)}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder="Type client name (e.g. ABC Public School)..."
                  autoComplete="off"
                  required
                />
              </FormField>

              {isDropdownOpen && clientSearchText.trim().length > 0 ? (
                <div className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-[12px] border border-slate-200 bg-white p-1.5 shadow-lg">
                  {suggestions.length > 0 ? (
                    <div className="mb-1">
                      <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Matching Existing Clients
                      </p>
                      {suggestions.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => handleSelectExistingClient(client)}
                          className="flex w-full items-center justify-between rounded-[8px] px-2.5 py-2 text-left text-[13.5px] text-slate-800 hover:bg-blue-50"
                        >
                          <span className="flex items-center gap-2 font-medium">
                            <Building2 className="h-3.5 w-3.5 text-blue-700" />
                            {client.name}
                          </span>
                          <span className="text-[12px] text-slate-500">
                            {client.order_count} order(s)
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {!exactMatchClient ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClient(null);
                        setIsDropdownOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-[8px] border border-dashed border-blue-200 bg-blue-50/70 px-2.5 py-2 text-left text-[13px] font-medium text-blue-800 hover:bg-blue-100"
                      data-testid="create-inline-client-option"
                    >
                      <span className="flex items-center gap-2">
                        <UserPlus className="h-3.5 w-3.5 text-blue-700" />
                        New Client Will Be Created &ldquo;{clientSearchText.trim()}&rdquo; (Auto-Create)
                      </span>
                      <span className="text-[11px] font-semibold uppercase">Auto-Save</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* ORDER ITEMS */}
        <div className="space-y-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold text-slate-900">
                Step 2 — Order Items ({items.length})
              </h2>
              <Badge variant="neutral" className="font-mono text-xs">
                {totalUnits.toLocaleString("en-IN")} total units
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCardItem}
                data-testid="add-card-item-btn"
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add ID Card Item
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddLanyardItem}
                data-testid="add-lanyard-item-btn"
                className="border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Lanyard Item
              </Button>
            </div>
          </div>

          {items.map((item, index) => {
            const isCard = item.category === "id_card";

            return (
              <Card
                key={item.localId}
                className={`overflow-hidden shadow-sm transition-colors ${
                  isCard ? "border-blue-200" : "border-purple-200"
                }`}
              >
                <CardHeader
                  className={`py-3 ${
                    isCard ? "border-b border-blue-100 bg-blue-50/60" : "border-b border-purple-100 bg-purple-50/60"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                          isCard ? "bg-blue-700" : "bg-purple-700"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className="text-[15px] font-semibold text-slate-900">
                        {item.item_name || `Item #${index + 1}`}
                      </span>
                      <Badge
                        variant="neutral"
                        className={
                          isCard
                            ? "border border-blue-200 bg-blue-100 text-blue-800"
                            : "border border-purple-200 bg-purple-100 text-purple-800"
                        }
                      >
                        {isCard ? (
                          <>
                            <CreditCard className="h-3 w-3" />
                            ID Card
                          </>
                        ) : (
                          <>
                            <Ribbon className="h-3 w-3" />
                            Lanyard
                          </>
                        )}
                      </Badge>
                    </div>

                    {items.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(item.localId)}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-4">
                  {/* Item Name and Quantity Row */}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <FormField
                      id={`item-name-${index}`}
                      label="Item Name / Group Label"
                      required
                      className="sm:col-span-2"
                    >
                      <Input
                        id={`item-name-${index}`}
                        value={item.item_name}
                        onChange={(e) =>
                          updateItem(item.localId, (prev) => ({
                            ...prev,
                            item_name: e.target.value,
                          }))
                        }
                        placeholder={
                          isCard
                            ? "e.g. Student ID Cards, Staff ID Cards"
                            : "e.g. Student Lanyards, Faculty Lanyards"
                        }
                      />
                    </FormField>

                    <FormField
                      id={`item-qty-${index}`}
                      label="Ordered Quantity"
                      required
                    >
                      <Input
                        id={`item-qty-${index}`}
                        type="number"
                        min={1}
                        value={item.ordered_quantity}
                        onChange={(e) =>
                          updateItem(item.localId, (prev) => ({
                            ...prev,
                            ordered_quantity: parseInt(e.target.value || "0", 10),
                          }))
                        }
                      />
                    </FormField>
                  </div>

                  {/* Specifications: ID Card vs Lanyard */}
                  {isCard ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 rounded-[8px] border border-slate-200 bg-slate-50/70 p-3.5 sm:grid-cols-2 lg:grid-cols-4">
                        <FormField
                          id={`card-orientation-${index}`}
                          label="Card Orientation"
                          required
                        >
                          <Select
                            id={`card-orientation-${index}`}
                            value={item.card_orientation || "vertical"}
                            onChange={(e) =>
                              updateItem(item.localId, (prev) => ({
                                ...prev,
                                card_orientation: e.target.value as CardOrientation,
                              }))
                            }
                          >
                            <option value="vertical">Vertical</option>
                            <option value="horizontal">Horizontal</option>
                          </Select>
                        </FormField>

                        <FormField
                          id={`card-printing-${index}`}
                          label="Printing Sides"
                          required
                        >
                          <Select
                            id={`card-printing-${index}`}
                            value={item.card_printing || "double_sided"}
                            onChange={(e) =>
                              updateItem(item.localId, (prev) => ({
                                ...prev,
                                card_printing: e.target.value as CardPrintingSide,
                              }))
                            }
                          >
                            <option value="double_sided">Double-Sided</option>
                            <option value="single_sided">Single-Sided</option>
                          </Select>
                        </FormField>

                        <FormField
                          id={`card-type-${index}`}
                          label="Card Type (Optional)"
                        >
                          <Select
                            id={`card-type-${index}`}
                            value={item.card_type_option || ""}
                            onChange={(e) =>
                              updateItem(item.localId, (prev) => ({
                                ...prev,
                                card_type_option: e.target.value || null,
                              }))
                            }
                          >
                            <option value="">— Standard —</option>
                            {(catalog?.card_types || []).map((ct) => (
                              <option key={ct.id} value={ct.id}>
                                {ct.name}
                              </option>
                            ))}
                          </Select>
                        </FormField>

                        <FormField
                          id={`card-custom-type-${index}`}
                          label="Custom Finish (Optional)"
                        >
                          <Input
                            id={`card-custom-type-${index}`}
                            value={item.card_type_custom_name || ""}
                            onChange={(e) =>
                              updateItem(item.localId, (prev) => ({
                                ...prev,
                                card_type_custom_name: e.target.value,
                              }))
                            }
                            placeholder="Glossy, Matte, etc."
                          />
                        </FormField>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <FormField id={`holder-req-${index}`} label="Holder Decision">
                          <Select
                            id={`holder-req-${index}`}
                            value={item.holder_requirement || "not_selected"}
                            onChange={(e) => {
                              const req = e.target.value as AccessoryRequirement;
                              updateItem(item.localId, (prev) => ({
                                ...prev,
                                holder_requirement: req,
                                holder_option: req === "required" ? prev.holder_option : null,
                              }));
                            }}
                          >
                            <option value="not_selected">Not Selected</option>
                            <option value="not_required">No Holder Required</option>
                            <option value="required">Holder Required</option>
                            <option value="attach_later">To Be Attached Later</option>
                          </Select>
                        </FormField>

                        {item.holder_requirement === "required" ? (
                          <FormField id={`holder-opt-${index}`} label="Holder Type">
                            <Select
                              id={`holder-opt-${index}`}
                              value={item.holder_option || ""}
                              onChange={(e) =>
                                updateItem(item.localId, (prev) => ({
                                  ...prev,
                                  holder_option: e.target.value || null,
                                }))
                              }
                            >
                              <option value="">— Select Holder —</option>
                              {(catalog?.holders || []).map((h) => (
                                <option key={h.id} value={h.id}>
                                  {h.name}
                                </option>
                              ))}
                            </Select>
                          </FormField>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-4 rounded-[8px] border border-slate-200 bg-slate-50/70 p-3.5 sm:grid-cols-3">
                        <FormField
                          id={`lanyard-size-${index}`}
                          label="Lanyard Size (Catalog)"
                          required
                        >
                          <Select
                            id={`lanyard-size-${index}`}
                            value={item.lanyard_size_option || ""}
                            onChange={(e) =>
                              updateItem(item.localId, (prev) => ({
                                ...prev,
                                lanyard_size_option: e.target.value || null,
                              }))
                            }
                          >
                            <option value="">— Select Size —</option>
                            {(catalog?.lanyard_sizes || []).map((sz) => (
                              <option key={sz.id} value={sz.id}>
                                {sz.name}
                              </option>
                            ))}
                          </Select>
                        </FormField>

                        <FormField
                          id={`lanyard-design-${index}`}
                          label="Design Requirements (Optional)"
                        >
                          <Input
                            id={`lanyard-design-${index}`}
                            value={item.lanyard_design_requirements || ""}
                            onChange={(e) =>
                              updateItem(item.localId, (prev) => ({
                                ...prev,
                                lanyard_design_requirements: e.target.value,
                              }))
                            }
                            placeholder="Ribbon color, text repeat..."
                          />
                        </FormField>

                        <FormField
                          id={`lanyard-printing-${index}`}
                          label="Printing Specifications (Optional)"
                        >
                          <Input
                            id={`lanyard-printing-${index}`}
                            value={item.lanyard_printing_specs || ""}
                            onChange={(e) =>
                              updateItem(item.localId, (prev) => ({
                                ...prev,
                                lanyard_printing_specs: e.target.value,
                              }))
                            }
                            placeholder="Sublimation, single/both sides..."
                          />
                        </FormField>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <FormField id={`hook-req-${index}`} label="Hook Decision">
                          <Select
                            id={`hook-req-${index}`}
                            value={item.hook_requirement || "not_selected"}
                            onChange={(e) => {
                              const req = e.target.value as AccessoryRequirement;
                              updateItem(item.localId, (prev) => ({
                                ...prev,
                                hook_requirement: req,
                                hook_option: req === "required" ? prev.hook_option : null,
                              }));
                            }}
                          >
                            <option value="not_selected">Not Selected</option>
                            <option value="not_required">No Hook Required</option>
                            <option value="required">Hook Required</option>
                            <option value="attach_later">To Be Attached Later</option>
                          </Select>
                        </FormField>

                        {item.hook_requirement === "required" ? (
                          <FormField id={`hook-opt-${index}`} label="Hook Type">
                            <Select
                              id={`hook-opt-${index}`}
                              value={item.hook_option || ""}
                              onChange={(e) =>
                                updateItem(item.localId, (prev) => ({
                                  ...prev,
                                  hook_option: e.target.value || null,
                                }))
                              }
                            >
                              <option value="">— Select Hook —</option>
                              {(catalog?.hooks || []).map((hk) => (
                                <option key={hk.id} value={hk.id}>
                                  {hk.name}
                                </option>
                              ))}
                            </Select>
                          </FormField>
                        ) : null}

                        <FormField id={`attachment-party-${index}`} label="Attachment Responsibility">
                          <Select
                            id={`attachment-party-${index}`}
                            value={item.attachment_party || "not_decided"}
                            onChange={(e) =>
                              updateItem(item.localId, (prev) => ({
                                ...prev,
                                attachment_party: e.target.value as AttachmentParty,
                              }))
                            }
                          >
                            <option value="completed_by_adarsh">
                              Attachment Completed by Adarsh
                            </option>
                            <option value="completed_by_client">
                              Attachment Completed by Client
                            </option>
                            <option value="not_decided">Pending Decision</option>
                            <option value="not_applicable">Not Applicable</option>
                          </Select>
                        </FormField>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[13.5px] text-slate-600">
            {resolvedExistingClient ? (
              <span>Order for <strong className="text-slate-900">{resolvedExistingClient.name}</strong></span>
            ) : clientSearchText.trim() ? (
              <span>New client <strong className="text-slate-900">&ldquo;{clientSearchText.trim()}&rdquo;</strong></span>
            ) : (
              <span>Enter client name above</span>
            )}
            <span className="mx-2 text-slate-300">•</span>
            <span className="font-mono font-semibold text-slate-900">{items.length} item(s)</span>
            <span className="mx-2 text-slate-300">•</span>
            <span className="font-mono font-bold text-blue-700">{totalUnits.toLocaleString("en-IN")} units</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/orders")}
              disabled={createOrderMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createOrderMutation.isPending}
              data-testid="submit-create-order-btn"
            >
              <Save className="h-4 w-4" />
              {createOrderMutation.isPending ? "Saving..." : "Save Order"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
