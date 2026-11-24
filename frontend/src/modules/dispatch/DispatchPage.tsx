import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  PackageCheck,
} from "lucide-react";
import { phase4Service } from "@/services/phase4Service";
import { ApiClientError } from "@/services/apiClient";
import { useUiShellStore } from "@/hooks/useToastStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
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
import { PageHeader } from "@/components/shared/PageHeader";
import type { DispatchQueueItem } from "@/types/phase4";

export function DispatchPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const addToast = useUiShellStore((s) => s.addToast);

  const [activeTab, setActiveTab] = React.useState<
    "queue" | "history" | "office_surplus" | "client_surplus"
  >("queue");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const [dispatchTarget, setDispatchTarget] = React.useState<DispatchQueueItem | null>(null);
  const [qtyForOrder, setQtyForOrder] = React.useState(0);
  const [extraToClient, setExtraToClient] = React.useState(0);
  const [extraInOffice, setExtraInOffice] = React.useState(0);
  const [dispatchNotes, setDispatchNotes] = React.useState("");
  const [dispatchError, setDispatchError] = React.useState<string | null>(null);

  const { data: queueData, isLoading: isQueueLoading } = useQuery({
    queryKey: ["dispatch", "queue"],
    queryFn: () => phase4Service.getDispatchQueue(),
  });
  const { data: historyData } = useQuery({
    queryKey: ["dispatch", "history"],
    queryFn: () => phase4Service.listDispatches(),
  });
  const { data: officeSurplusData } = useQuery({
    queryKey: ["surplus", "office"],
    queryFn: () => phase4Service.listOfficeSurplus(),
  });
  const { data: clientSurplusData } = useQuery({
    queryKey: ["surplus", "clients"],
    queryFn: () => phase4Service.listClientSurplus(),
  });

  const dispatchMutation = useMutation({
    mutationFn: () =>
      phase4Service.createDispatch({
        order: dispatchTarget!.order_id,
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

  const queue = queueData?.results || [];
  const dispatches = historyData?.results || [];
  const officeSurplus = officeSurplusData?.results || [];
  const clientSurplus = clientSurplusData?.results || [];

  const slicedQueue = queue.slice((page - 1) * pageSize, page * pageSize);
  const slicedDispatches = dispatches.slice((page - 1) * pageSize, page * pageSize);
  const slicedOfficeSurplus = officeSurplus.slice((page - 1) * pageSize, page * pageSize);
  const slicedClientSurplus = clientSurplus.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Packing & Dispatch"
        subtitle="Dispatch order items and route surplus to clients or the Office Surplus Pool."
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
        {(
          [
            { key: "queue", label: `Packing Queue (${queue.length})` },
            { key: "history", label: `Dispatch History (${dispatches.length})` },
            { key: "office_surplus", label: `Office Surplus Pool (${officeSurplus.length})` },
            { key: "client_surplus", label: `Client Surplus Sent (${clientSurplus.length})` },
          ] as const
        ).map((tab) => (
          <Button
            key={tab.key}
            size="sm"
            variant={activeTab === tab.key ? "default" : "outline"}
            onClick={() => {
              setActiveTab(tab.key);
              setPage(1);
            }}
            data-testid={`dispatch-tab-${tab.key}`}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === "queue" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Order Items Packing Queue</CardTitle>
            <CardDescription>
              Dispatch ordered units or allocate surplus independently per line item.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isQueueLoading ? (
              <div className="py-10 text-center">
                <Spinner label="Loading dispatch queue..." />
              </div>
            ) : queue.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No active order items awaiting packing or dispatch.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order &amp; Client</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Ordered</TableHead>
                      <TableHead>Produced / Surplus</TableHead>
                      <TableHead>Dispatched / Remaining</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slicedQueue.map((q) => (
                      <TableRow key={q.order_item_id}>
                        <TableCell className="text-[13.5px]">
                          <Link
                            to={`/orders/${q.order_id}`}
                            className="font-mono font-semibold text-blue-700 hover:underline"
                          >
                            {q.order_number}
                          </Link>
                          {q.order_type === "replacement" ? (
                            <Badge variant="warning" className="ml-1.5">
                              Replacement
                            </Badge>
                          ) : null}
                          <p className="text-[12.5px] text-slate-500">{q.client_name}</p>
                        </TableCell>
                        <TableCell className="text-[13.5px] font-medium text-slate-900">
                          {q.item_name}
                          {q.lanyard_size_name ? (
                            <span className="ml-1 text-[12.5px] text-slate-500">
                              ({q.lanyard_size_name})
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-[13.5px] font-semibold">
                          {q.ordered_quantity.toLocaleString("en-IN")}
                          {q.allocated_from_surplus_quantity > 0 ? (
                            <p className="text-[12px] font-normal text-emerald-700">
                              ({q.allocated_from_surplus_quantity} from surplus)
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-[13.5px]">
                          <span className="font-semibold text-blue-800">
                            {q.produced_quantity.toLocaleString("en-IN")}
                          </span>
                          {q.estimated_surplus_quantity > 0 ? (
                            <span className="ml-1 text-[12.5px] text-amber-800">
                              (+{q.estimated_surplus_quantity} extra)
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-[13.5px]">
                          <span className="text-emerald-800">
                            {q.dispatched_quantity.toLocaleString("en-IN")}
                          </span>{" "}
                          /{" "}
                          <strong className="text-slate-900">
                            {q.remaining_order_quantity.toLocaleString("en-IN")} rem
                          </strong>
                        </TableCell>
                        <TableCell className="text-right">
                          {q.remaining_order_quantity > 0 ? (
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

                <Pagination
                  totalCount={queue.length}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(next) => {
                    setPageSize(next);
                    setPage(1);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "history" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Recorded Dispatches</CardTitle>
          </CardHeader>
          <CardContent>
            {dispatches.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No dispatches recorded yet.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dispatch #</TableHead>
                      <TableHead>Order / Client</TableHead>
                      <TableHead>Items Summary</TableHead>
                      <TableHead>Date &amp; Staff</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slicedDispatches.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-[13.5px] font-semibold">
                          {d.dispatch_number}
                        </TableCell>
                        <TableCell className="text-[13.5px]">
                          <strong>{d.order_number}</strong> &bull; {d.client_name}
                        </TableCell>
                        <TableCell className="text-[13.5px]">
                          {d.items.map((it) => (
                            <div key={it.id}>
                              {it.item_name}: <strong>{it.quantity_dispatched_for_order}</strong>{" "}
                              order
                              {it.extra_dispatched_to_client > 0
                                ? ` + ${it.extra_dispatched_to_client} client extra`
                                : ""}
                              {it.extra_retained_in_office > 0
                                ? ` + ${it.extra_retained_in_office} office surplus`
                                : ""}
                            </div>
                          ))}
                        </TableCell>
                        <TableCell className="text-[13px] text-slate-500">
                          {d.dispatch_date} &bull; {d.dispatched_by_username}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Pagination
                  totalCount={dispatches.length}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(next) => {
                    setPageSize(next);
                    setPage(1);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "office_surplus" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-blue-700" />
              Office Surplus Pool
            </CardTitle>
            <CardDescription>
              Retained client-specific finished surplus stored for replacement reuse.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {officeSurplus.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No retained office surplus records yet.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Surplus Code</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Item &amp; Specs</TableHead>
                      <TableHead>Source Order</TableHead>
                      <TableHead>Initial / Allocated</TableHead>
                      <TableHead>Remaining Available</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slicedOfficeSurplus.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-[13.5px] font-semibold">
                          {s.surplus_code}
                        </TableCell>
                        <TableCell className="text-[13.5px] font-semibold">
                          {s.client_name}
                        </TableCell>
                        <TableCell className="text-[13.5px]">
                          {s.item_name}{" "}
                          <span className="text-slate-500">({s.specification_summary})</span>
                        </TableCell>
                        <TableCell className="font-mono text-[13.5px]">
                          {s.source_order_number}
                        </TableCell>
                        <TableCell className="font-mono text-[13.5px]">
                          {s.initial_quantity} / {s.allocated_quantity}
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.remaining_quantity > 0 ? "success" : "neutral"}>
                            {s.remaining_quantity} pcs remaining
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Pagination
                  totalCount={officeSurplus.length}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(next) => {
                    setPageSize(next);
                    setPage(1);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "client_surplus" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Extra Surplus Dispatched to Client</CardTitle>
          </CardHeader>
          <CardContent>
            {clientSurplus.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No extra client surplus dispatches recorded yet.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Extra Qty Sent</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slicedClientSurplus.map((cs) => (
                      <TableRow key={cs.id}>
                        <TableCell className="font-mono text-[13.5px] font-semibold">
                          {cs.order_number}
                        </TableCell>
                        <TableCell className="text-[13.5px] font-semibold">
                          {cs.client_name}
                        </TableCell>
                        <TableCell className="text-[13.5px]">{cs.item_name}</TableCell>
                        <TableCell className="font-mono text-[13.5px] font-bold text-amber-800">
                          +{cs.quantity_sent}
                        </TableCell>
                        <TableCell className="text-[13px] text-slate-500">
                          {cs.dispatch_date}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Pagination
                  totalCount={clientSurplus.length}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(next) => {
                    setPageSize(next);
                    setPage(1);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Pack & Dispatch Dialog */}
      <Dialog
        open={Boolean(dispatchTarget)}
        onOpenChange={(open) => !open && setDispatchTarget(null)}
        title={`Dispatch ${dispatchTarget?.order_number || ""} — ${dispatchTarget?.item_name || ""}`}
        description={`Remaining order quantity: ${dispatchTarget?.remaining_order_quantity || 0}. Split any surplus between client delivery and Office Surplus Pool.`}
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
