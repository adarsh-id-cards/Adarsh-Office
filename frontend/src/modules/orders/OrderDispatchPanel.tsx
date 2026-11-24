import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Archive, CheckCircle2, PackageCheck, Truck } from "lucide-react";
import { phase4Service } from "@/services/phase4Service";
import { ApiClientError } from "@/services/apiClient";
import { useUiShellStore } from "@/hooks/useToastStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FormField } from "@/components/forms/FormField";
import type { DispatchQueueItem } from "@/types/phase4";

interface OrderDispatchPanelProps {
  orderId: string;
  orderNumber: string;
  clientId: string;
  isCancelled: boolean;
}

export function OrderDispatchPanel({
  orderId,
  orderNumber,
  clientId,
  isCancelled,
}: OrderDispatchPanelProps): React.ReactElement {
  const queryClient = useQueryClient();
  const addToast = useUiShellStore((s) => s.addToast);

  const [dispatchTarget, setDispatchTarget] = React.useState<DispatchQueueItem | null>(null);
  const [qtyForOrder, setQtyForOrder] = React.useState(0);
  const [extraToClient, setExtraToClient] = React.useState(0);
  const [extraInOffice, setExtraInOffice] = React.useState(0);
  const [dispatchNotes, setDispatchNotes] = React.useState("");
  const [dispatchError, setDispatchError] = React.useState<string | null>(null);

  const { data: queueData, isLoading } = useQuery({
    queryKey: ["dispatch", "queue"],
    queryFn: () => phase4Service.getDispatchQueue(),
  });
  const { data: historyData } = useQuery({
    queryKey: ["dispatch", "history"],
    queryFn: () => phase4Service.listDispatches(),
  });
  const { data: officeSurplusData } = useQuery({
    queryKey: ["surplus", "office", clientId],
    queryFn: () => phase4Service.listOfficeSurplus({ client: clientId }),
  });
  const { data: clientSurplusData } = useQuery({
    queryKey: ["surplus", "clients", clientId],
    queryFn: () => phase4Service.listClientSurplus(clientId),
  });

  const dispatchMutation = useMutation({
    mutationFn: () =>
      phase4Service.createDispatch({
        order: orderId,
        packing_verified: true,
        notes: dispatchNotes.trim(),
        items: [
          {
            order_item: dispatchTarget!.order_item_id,
            quantity_dispatched_for_order: qtyForOrder,
            extra_dispatched_to_client: extraToClient,
            extra_retained_in_office: extraInOffice,
            notes: dispatchNotes.trim(),
          },
        ],
      }),
    onSuccess: (created) => {
      setDispatchTarget(null);
      setDispatchNotes("");
      setDispatchError(null);
      void queryClient.invalidateQueries({ queryKey: ["dispatch"] });
      void queryClient.invalidateQueries({ queryKey: ["surplus"] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      addToast({
        title: `Dispatch ${created.dispatch_number} Recorded`,
        description: `Order ${created.order_number} status is now ${created.order_status}.`,
        variant: "success",
      });
    },
    onError: (err) => {
      setDispatchError(err instanceof ApiClientError ? err.message : "Dispatch failed.");
    },
  });

  const orderQueue = (queueData?.results || []).filter((q) => q.order_id === orderId);
  const orderDispatches = (historyData?.results || []).filter((d) => d.order === orderId);
  const orderOfficeSurplus = (officeSurplusData?.results || []).filter(
    (s) => s.source_order === orderId || s.remaining_quantity > 0,
  );
  const orderClientSurplus = (clientSurplusData?.results || []).filter(
    (cs) => cs.order === orderId,
  );

  return (
    <div className="space-y-5">
      {/* Packing & Dispatch Items for This Order */}
      <Card>
        <CardHeader className="py-3.5">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Truck className="h-4 w-4 text-blue-700" />
            Packing &amp; Dispatch Readiness — {orderNumber}
          </CardTitle>
          <CardDescription>
            Dispatch partial or full quantities per item and route surplus between client delivery
            and Office Surplus Pool.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-6 text-center">
              <Spinner label="Loading dispatch readiness..." />
            </div>
          ) : orderQueue.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              No dispatchable line items found for this order yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead>Usable Produced</TableHead>
                  <TableHead>Dispatched / Rem</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderQueue.map((q) => (
                  <TableRow key={q.order_item_id}>
                    <TableCell className="text-xs">
                      <span className="font-semibold text-slate-900">{q.item_name}</span>
                      {q.lanyard_size_name ? (
                        <span className="ml-1 text-slate-500">({q.lanyard_size_name})</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {q.ordered_quantity.toLocaleString("en-IN")}
                      {q.allocated_from_surplus_quantity > 0 ? (
                        <span className="block text-[12px] text-emerald-700">
                          ({q.allocated_from_surplus_quantity} from surplus)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <span className="font-semibold text-blue-800">
                        {q.produced_quantity.toLocaleString("en-IN")}
                      </span>
                      {q.estimated_surplus_quantity > 0 ? (
                        <span className="ml-1 text-[12px] text-amber-800">
                          (+{q.estimated_surplus_quantity} extra)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <span className="text-emerald-800">
                        {q.dispatched_quantity.toLocaleString("en-IN")}
                      </span>{" "}
                      /{" "}
                      <strong>{q.remaining_order_quantity.toLocaleString("en-IN")} rem</strong>
                    </TableCell>
                    <TableCell className="text-right">
                      {isCancelled ? (
                        <Badge variant="destructive">Cancelled</Badge>
                      ) : q.remaining_order_quantity > 0 ? (
                        <Button
                          size="sm"
                          variant={q.is_ready_for_dispatch ? "default" : "outline"}
                          onClick={() => {
                            const availableOrderUnits = Math.max(
                              0,
                              q.produced_quantity - q.dispatched_quantity,
                            );
                            setDispatchError(null);
                            setDispatchTarget(q);
                            setQtyForOrder(
                              Math.min(q.remaining_order_quantity, availableOrderUnits),
                            );
                            setExtraToClient(0);
                            setExtraInOffice(q.estimated_surplus_quantity);
                          }}
                          data-testid={`open-dispatch-btn-${q.order_item_id}`}
                        >
                          <PackageCheck className="h-3.5 w-3.5" />
                          Pack &amp; Dispatch
                        </Button>
                      ) : (
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3" />
                          Dispatched
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Partial Dispatch History + Client & Office Surplus */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="py-3.5">
            <CardTitle className="text-sm">
              Dispatch History ({orderDispatches.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {orderDispatches.length === 0 ? (
              <p className="py-4 text-xs text-slate-500">No dispatches recorded for {orderNumber}.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dispatch #</TableHead>
                    <TableHead>Quantities</TableHead>
                    <TableHead>Date &amp; Staff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderDispatches.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs font-bold">
                        {d.dispatch_number}
                      </TableCell>
                      <TableCell className="text-xs">
                        {d.items.map((it) => (
                          <div key={it.id}>
                            {it.item_name}: <strong>{it.quantity_dispatched_for_order}</strong> order
                            {it.extra_dispatched_to_client > 0
                              ? ` + ${it.extra_dispatched_to_client} client extra`
                              : ""}
                            {it.extra_retained_in_office > 0
                              ? ` + ${it.extra_retained_in_office} office surplus`
                              : ""}
                          </div>
                        ))}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {d.dispatch_date} &bull; {d.dispatched_by_username}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3.5">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Archive className="h-4 w-4 text-blue-700" />
              Client &amp; Office Surplus Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div>
              <p className="mb-1.5 font-semibold text-slate-800">
                Retained in Office Surplus Pool (Client Inventory)
              </p>
              {orderOfficeSurplus.length === 0 ? (
                <p className="text-slate-500">No office surplus pool batches for this client.</p>
              ) : (
                <div className="space-y-1.5">
                  {orderOfficeSurplus.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div>
                        <span className="font-mono font-semibold text-slate-900">
                          {s.surplus_code}
                        </span>{" "}
                        &bull; {s.item_name}{" "}
                        <span className="text-slate-500">({s.source_order_number})</span>
                      </div>
                      <Badge variant={s.remaining_quantity > 0 ? "success" : "neutral"}>
                        {s.remaining_quantity} pcs remaining
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {orderClientSurplus.length > 0 ? (
              <div>
                <p className="mb-1.5 font-semibold text-slate-800">Extra Sent to Client</p>
                <div className="space-y-1">
                  {orderClientSurplus.map((cs) => (
                    <div
                      key={cs.id}
                      className="flex items-center justify-between rounded border border-amber-200 bg-amber-50/50 px-3 py-1.5"
                    >
                      <span>{cs.item_name}</span>
                      <span className="font-mono font-bold text-amber-800">
                        +{cs.quantity_sent} sent ({cs.dispatch_date})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Pack & Dispatch Dialog */}
      <Dialog
        open={Boolean(dispatchTarget)}
        onOpenChange={(open) => !open && setDispatchTarget(null)}
        title={`Dispatch ${orderNumber} — ${dispatchTarget?.item_name || ""}`}
        description={`Remaining order quantity: ${dispatchTarget?.remaining_order_quantity || 0}. Split extra surplus between client delivery and Office Surplus Pool.`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            dispatchMutation.mutate();
          }}
          className="space-y-4"
        >
          {dispatchError ? (
            <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{dispatchError}</span>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <FormField id="dsp-order-qty" label="Qty for Order" required>
              <Input
                id="dsp-order-qty"
                type="number"
                min={0}
                max={dispatchTarget?.remaining_order_quantity}
                value={qtyForOrder}
                onChange={(e) => setQtyForOrder(parseInt(e.target.value || "0", 10))}
              />
            </FormField>
            <FormField id="dsp-client-extra" label="Extra Sent to Client">
              <Input
                id="dsp-client-extra"
                type="number"
                min={0}
                value={extraToClient}
                onChange={(e) => setExtraToClient(parseInt(e.target.value || "0", 10))}
              />
            </FormField>
            <FormField id="dsp-office-extra" label="Retained in Office Surplus">
              <Input
                id="dsp-office-extra"
                type="number"
                min={0}
                value={extraInOffice}
                onChange={(e) => setExtraInOffice(parseInt(e.target.value || "0", 10))}
              />
            </FormField>
          </div>

          <FormField id="dsp-notes" label="Packing / Courier Notes">
            <Input
              id="dsp-notes"
              value={dispatchNotes}
              onChange={(e) => setDispatchNotes(e.target.value)}
              placeholder="Carton count, docket #, or handoff note"
            />
          </FormField>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDispatchTarget(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={dispatchMutation.isPending}
              data-testid="confirm-dispatch-btn"
            >
              Confirm Packing &amp; Dispatch
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
