import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckSquare,
  RefreshCw,
  Save,
} from "lucide-react";
import { clientService } from "@/services/clientService";
import { orderService } from "@/services/orderService";
import { phase4Service } from "@/services/phase4Service";
import { ApiClientError } from "@/services/apiClient";
import { useUiShellStore } from "@/hooks/useToastStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { FormField } from "@/components/forms/FormField";
import { PageHeader } from "@/components/shared/PageHeader";
import type { OrderItemRecord, ReplacementReason } from "@/types/orders";

interface DraftReplacementSelection {
  selected: boolean;
  ordered_quantity: number;
  replacement_reason: ReplacementReason;
  replacement_reason_notes: string;
  surplus_pool_id: string;
  allocate_from_surplus_quantity: number;
}

export function ReplacementOrderCreatePage(): React.ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialClientId = searchParams.get("clientId") || "";
  const initialOriginalOrderId = searchParams.get("originalOrderId") || "";

  const queryClient = useQueryClient();
  const addToast = useUiShellStore((state) => state.addToast);

  const [idempotencyKey] = React.useState(
    () => `rep-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );

  const [selectedClientId, setSelectedClientId] = React.useState(initialClientId);
  const [selectedOriginalOrderId, setSelectedOriginalOrderId] = React.useState(
    initialOriginalOrderId,
  );
  const [notes, setNotes] = React.useState("");
  const [expectedCompletionDate, setExpectedCompletionDate] = React.useState("");
  const [itemSelections, setItemSelections] = React.useState<
    Record<string, DraftReplacementSelection>
  >({});
  const [formError, setFormError] = React.useState<string | null>(null);

  // 1. Fetch active clients
  const { data: clientsData } = useQuery({
    queryKey: ["clients", "list", { activeOnly: true }],
    queryFn: () => clientService.listClients({ is_archived: false, page_size: 100 }),
  });

  // 2. Fetch original orders belonging ONLY to the selected client
  const { data: clientOrdersData, isLoading: isOrdersLoading } = useQuery({
    queryKey: ["orders", "original-for-client", selectedClientId],
    queryFn: () =>
      orderService.listOrders({
        client: selectedClientId,
        order_type: "original",
        page_size: 100,
      }),
    enabled: Boolean(selectedClientId),
  });

  // 3. Fetch full details of the selected original order
  const { data: originalOrderDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ["orders", "detail", selectedOriginalOrderId],
    queryFn: () => orderService.getOrder(selectedOriginalOrderId),
    enabled: Boolean(selectedOriginalOrderId),
  });

  // 4. Fetch available Office Surplus Pool records for this client (Phase 4 Section 16)
  const { data: clientSurplusData } = useQuery({
    queryKey: ["surplus", "office", "for-client", selectedClientId],
    queryFn: () =>
      phase4Service.listOfficeSurplus({ client: selectedClientId, available_only: true }),
    enabled: Boolean(selectedClientId),
  });
  const availableClientSurplus = clientSurplusData?.results || [];

  // When originalOrderDetail loads, initialize selection state and sync client
  React.useEffect(() => {
    if (!originalOrderDetail) return;
    if (!selectedClientId || selectedClientId !== originalOrderDetail.client) {
      setSelectedClientId(originalOrderDetail.client);
    }
    const nextMap: Record<string, DraftReplacementSelection> = {};
    originalOrderDetail.items.forEach((item, idx) => {
      nextMap[item.id] = {
        selected: idx === 0,
        ordered_quantity: 1,
        replacement_reason: "lost",
        replacement_reason_notes: "",
        surplus_pool_id: "",
        allocate_from_surplus_quantity: 0,
      };
    });
    setItemSelections(nextMap);
  }, [originalOrderDetail, selectedClientId]);

  const handleClientChange = (newClientId: string) => {
    setSelectedClientId(newClientId);
    setSelectedOriginalOrderId("");
    setItemSelections({});
    setFormError(null);
  };

  const updateSelection = (
    itemId: string,
    updater: (prev: DraftReplacementSelection) => DraftReplacementSelection,
  ) => {
    setItemSelections((prev) => {
      const current = prev[itemId] || {
        selected: false,
        ordered_quantity: 1,
        replacement_reason: "lost" as ReplacementReason,
        replacement_reason_notes: "",
        surplus_pool_id: "",
        allocate_from_surplus_quantity: 0,
      };
      return {
        ...prev,
        [itemId]: updater(current),
      };
    });
  };

  const eligibleOriginalOrders = (clientOrdersData?.results || []).filter(
    (ord) => ord.status !== "cancelled",
  );

  const selectedReplacementItems = (originalOrderDetail?.items || [])
    .filter((item) => itemSelections[item.id]?.selected)
    .map((item) => {
      const sel = itemSelections[item.id]!;
      return {
        original_item: item.id,
        item_name: `${item.item_name} (Replacement)`,
        ordered_quantity: sel.ordered_quantity,
        replacement_reason: sel.replacement_reason,
        replacement_reason_notes: sel.replacement_reason_notes,
        surplus_pool_id: sel.surplus_pool_id || null,
        allocate_from_surplus_quantity: sel.allocate_from_surplus_quantity || 0,
      };
    });

  const createReplacementMutation = useMutation({
    mutationFn: () =>
      orderService.createReplacementOrder(selectedOriginalOrderId, {
        client_id: selectedClientId,
        expected_completion_date: expectedCompletionDate || null,
        status: "confirmed",
        notes: notes.trim(),
        idempotency_key: idempotencyKey,
        items: selectedReplacementItems,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      addToast({
        title: `Replacement Order ${created.order_number} Created`,
        description: `Linked to original order ${created.original_order_number}.`,
        variant: "success",
      });
      navigate(`/orders/${created.id}`, { replace: true });
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
      } else {
        setFormError("Unable to create replacement order.");
      }
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!selectedClientId) {
      setFormError("Please select a client.");
      return;
    }
    if (!selectedOriginalOrderId) {
      setFormError("Please select the original order to replace items from.");
      return;
    }
    if (selectedReplacementItems.length === 0) {
      setFormError("Please select at least one original item to replace.");
      return;
    }
    for (const repItem of selectedReplacementItems) {
      if (!repItem.ordered_quantity || repItem.ordered_quantity < 1) {
        setFormError("Replacement quantity must be at least 1 for every selected item.");
        return;
      }
    }

    createReplacementMutation.mutate();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        backLink={{ to: "/orders", label: "Orders" }}
        title="Create Replacement Order"
        badge={
          <Badge variant="warning">
            <RefreshCw className="h-3 w-3" />
            Linked Replacement
          </Badge>
        }
        subtitle="Reference an original order and choose replacement items without altering original counts."
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

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Step 1: Select Client and Original Order */}
        <Card>
          <CardHeader>
            <CardTitle>Step 1 — Select Client &amp; Original Order</CardTitle>
            <CardDescription>
              Only original orders belonging to the selected client are listed.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FormField id="rep-client-select" label="Client" required>
              <Select
                id="rep-client-select"
                value={selectedClientId}
                onChange={(e) => handleClientChange(e.target.value)}
              >
                <option value="">— Select Client —</option>
                {(clientsData?.results || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.original_order_count} original orders)
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField id="rep-original-order-select" label="Original Order" required>
              <Select
                id="rep-original-order-select"
                value={selectedOriginalOrderId}
                onChange={(e) => setSelectedOriginalOrderId(e.target.value)}
                disabled={!selectedClientId || isOrdersLoading}
              >
                <option value="">
                  {!selectedClientId
                    ? "Select a client first"
                    : isOrdersLoading
                      ? "Loading orders..."
                      : "— Select Original Order —"}
                </option>
                {eligibleOriginalOrders.map((ord) => (
                  <option key={ord.id} value={ord.id}>
                    {ord.order_number} ({ord.order_date} &bull; {ord.item_count} items)
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField id="rep-expected-date" label="Expected Completion Date (Optional)">
              <DatePicker
                id="rep-expected-date"
                value={expectedCompletionDate}
                onChange={setExpectedCompletionDate}
                clearable
                placeholder="Optional"
                ariaLabel="Expected completion date"
              />
            </FormField>

            <FormField id="rep-notes" label="General Replacement Notes">
              <Input
                id="rep-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Urgent replacement batch"
              />
            </FormField>
          </CardContent>
        </Card>

        {/* Step 2: Select Original Items to Replace */}
        {selectedOriginalOrderId ? (
          <Card>
            <CardHeader>
              <CardTitle>Step 2 — Select Original Items &amp; Replacement Quantities</CardTitle>
              <CardDescription>
                Choose items from <strong>{originalOrderDetail?.order_number}</strong> and enter
                replacement quantities and reasons.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isDetailLoading || !originalOrderDetail ? (
                <div className="py-6 text-center">
                  <Spinner label="Loading original order items..." />
                </div>
              ) : (
                originalOrderDetail.items.map((origItem: OrderItemRecord) => {
                  const sel = itemSelections[origItem.id] || {
                    selected: false,
                    ordered_quantity: 1,
                    replacement_reason: "lost" as ReplacementReason,
                    replacement_reason_notes: "",
                    surplus_pool_id: "",
                    allocate_from_surplus_quantity: 0,
                  };

                  return (
                    <div
                      key={origItem.id}
                      className={`rounded-[10px] border p-4 transition-colors ${
                        sel.selected
                          ? "border-blue-300 bg-blue-50/40"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <Checkbox
                            id={`rep-select-${origItem.id}`}
                            checked={sel.selected}
                            onChange={(e) =>
                              updateSelection(origItem.id, (prev) => ({
                                ...prev,
                                selected: e.target.checked,
                              }))
                            }
                            label={origItem.item_name}
                          />
                          <Badge variant="neutral">{origItem.category_label}</Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[13px] text-slate-600">
                          <span>
                            Original Qty:{" "}
                            <strong className="font-mono text-slate-900">
                              {origItem.ordered_quantity.toLocaleString("en-IN")}
                            </strong>
                          </span>
                          <span>
                            Prior Replacements:{" "}
                            <strong className="font-mono text-amber-800">
                              {origItem.replacement_quantity.toLocaleString("en-IN")}
                            </strong>
                          </span>
                        </div>
                      </div>

                      {sel.selected ? (
                        <div className="mt-4 grid gap-4 border-t border-slate-200 pt-3 sm:grid-cols-3">
                          <FormField
                            id={`rep-qty-${origItem.id}`}
                            label="Replacement Quantity"
                            required
                          >
                            <Input
                              id={`rep-qty-${origItem.id}`}
                              type="number"
                              min={1}
                              value={sel.ordered_quantity}
                              onChange={(e) =>
                                updateSelection(origItem.id, (prev) => ({
                                  ...prev,
                                  ordered_quantity: parseInt(e.target.value || "0", 10),
                                }))
                              }
                            />
                          </FormField>

                          <FormField
                            id={`rep-reason-${origItem.id}`}
                            label="Replacement Reason"
                            required
                          >
                            <Select
                              id={`rep-reason-${origItem.id}`}
                              value={sel.replacement_reason}
                              onChange={(e) =>
                                updateSelection(origItem.id, (prev) => ({
                                  ...prev,
                                  replacement_reason: e.target.value as ReplacementReason,
                                }))
                              }
                            >
                              <option value="lost">Lost Card / Item</option>
                              <option value="damaged">Damaged Card / Item</option>
                              <option value="stolen">Stolen Card / Item</option>
                              <option value="incorrect_info">Incorrect Information</option>
                              <option value="other">Other Reason</option>
                            </Select>
                          </FormField>

                          <FormField
                            id={`rep-notes-${origItem.id}`}
                            label="Reason Details / Notes (Optional)"
                          >
                            <Input
                              id={`rep-notes-${origItem.id}`}
                              value={sel.replacement_reason_notes}
                              onChange={(e) =>
                                updateSelection(origItem.id, (prev) => ({
                                  ...prev,
                                  replacement_reason_notes: e.target.value,
                                }))
                              }
                              placeholder="Student roll numbers or specific remark"
                            />
                          </FormField>

                          {availableClientSurplus.length > 0 ? (
                            <div className="rounded-[8px] border border-emerald-200 bg-emerald-50/70 p-3 text-[13px] sm:col-span-3">
                              <p className="font-semibold text-emerald-900">
                                Available Office Surplus Stock for {originalOrderDetail.client_name}
                              </p>
                              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                                <FormField
                                  id={`rep-surplus-pool-${origItem.id}`}
                                  label="Reuse Retained Office Surplus (Optional)"
                                >
                                  <Select
                                    id={`rep-surplus-pool-${origItem.id}`}
                                    compact
                                    value={sel.surplus_pool_id}
                                    onChange={(e) => {
                                      const pool = availableClientSurplus.find(
                                        (p) => p.id === e.target.value,
                                      );
                                      updateSelection(origItem.id, (prev) => ({
                                        ...prev,
                                        surplus_pool_id: e.target.value,
                                        allocate_from_surplus_quantity: pool
                                          ? Math.min(pool.remaining_quantity, prev.ordered_quantity)
                                          : 0,
                                      }));
                                    }}
                                  >
                                    <option value="">
                                      — Produce New Batch (Do not allocate surplus) —
                                    </option>
                                    {availableClientSurplus.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.surplus_code}: {p.item_name} ({p.remaining_quantity} pcs
                                        available)
                                      </option>
                                    ))}
                                  </Select>
                                </FormField>
                                {sel.surplus_pool_id ? (
                                  <FormField
                                    id={`rep-surplus-qty-${origItem.id}`}
                                    label="Quantity Allocated from Surplus"
                                  >
                                    <Input
                                      id={`rep-surplus-qty-${origItem.id}`}
                                      type="number"
                                      min={0}
                                      max={sel.ordered_quantity}
                                      value={sel.allocate_from_surplus_quantity}
                                      onChange={(e) =>
                                        updateSelection(origItem.id, (prev) => ({
                                          ...prev,
                                          allocate_from_surplus_quantity: parseInt(
                                            e.target.value || "0",
                                            10,
                                          ),
                                        }))
                                      }
                                    />
                                  </FormField>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}

              <div className="flex items-center justify-between border-t border-slate-200 pt-4">
                <div className="flex items-center gap-2 text-[13.5px] text-slate-600">
                  <CheckSquare className="h-4 w-4 text-blue-700" />
                  <span>
                    Selected <strong>{selectedReplacementItems.length}</strong> replacement item(s)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/orders")}
                    disabled={createReplacementMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      createReplacementMutation.isPending || selectedReplacementItems.length === 0
                    }
                    data-testid="submit-replacement-order-btn"
                  >
                    <Save className="h-4 w-4" />
                    {createReplacementMutation.isPending
                      ? "Creating Replacement..."
                      : "Create Replacement Order"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </form>
    </div>
  );
}
