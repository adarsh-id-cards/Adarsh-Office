import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Edit3,
  ExternalLink,
  History,
  LayoutList,
  PackageCheck,
  Printer,
  RefreshCw,
  Ribbon,
  XCircle,
} from "lucide-react";
import { orderService } from "@/services/orderService";
import { ApiClientError } from "@/services/apiClient";
import { useUiShellStore } from "@/hooks/useToastStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
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
import { formatDateTimeIST } from "@/lib/utils";
import { getOrderStatusBadgeVariant } from "@/modules/orders/OrdersListPage";
import { OrderItemProductionPanel } from "@/modules/production/OrderItemProductionPanel";
import type { OrderItemRecord, OrderStatus } from "@/types/orders";

type OrderWorkspaceTab =
  | "overview"
  | "items"
  | "production"
  | "history";

const STATUS_DISPLAY_LABELS: Record<OrderStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  partially_completed: "Partially Completed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function OrderDetailPage(): React.ReactElement {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const addToast = useUiShellStore((state) => state.addToast);

  const initialTab = (searchParams.get("tab") as OrderWorkspaceTab | null) || "overview";
  const initialItem = searchParams.get("item") || "";

  const [activeTab, setActiveTab] = React.useState<OrderWorkspaceTab>(initialTab);
  const [selectedItemId, setSelectedItemId] = React.useState<string>(initialItem);

  // Cancel / Edit dialogs
  const [isCancelOpen, setIsCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  const [isEditMetaOpen, setIsEditMetaOpen] = React.useState(false);
  const [editExpectedDate, setEditExpectedDate] = React.useState("");
  const [editNotes, setEditNotes] = React.useState("");
  const [editMetaError, setEditMetaError] = React.useState<string | null>(null);

  const [editingItem, setEditingItem] = React.useState<OrderItemRecord | null>(null);
  const [editPreparedQty, setEditPreparedQty] = React.useState(0);
  const [editDispatchedQty, setEditDispatchedQty] = React.useState(0);
  const [editItemNotes, setEditItemNotes] = React.useState("");
  const [itemQtyError, setItemQtyError] = React.useState<string | null>(null);

  const {
    data: order,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["orders", "detail", orderId],
    queryFn: () => orderService.getOrder(orderId!),
    enabled: Boolean(orderId),
  });

  React.useEffect(() => {
    const paramTab = searchParams.get("tab") as OrderWorkspaceTab | null;
    const paramItem = searchParams.get("item");
    if (paramTab) setActiveTab(paramTab);
    if (paramItem) setSelectedItemId(paramItem);
  }, [searchParams]);

  React.useEffect(() => {
    const first = order?.items[0];
    if (!order || !first) return;
    if (!selectedItemId || !order.items.some((i) => i.id === selectedItemId)) {
      setSelectedItemId(first.id);
    }
  }, [order, selectedItemId]);

  const switchTab = (tab: OrderWorkspaceTab, itemId?: string) => {
    setActiveTab(tab);
    if (itemId) setSelectedItemId(itemId);
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    if (itemId) next.set("item", itemId);
    setSearchParams(next, { replace: true });
  };

  const refreshOrderQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    void queryClient.invalidateQueries({ queryKey: ["clients"] });
    void queryClient.invalidateQueries({ queryKey: ["production"] });
  };

  const confirmMutation = useMutation({
    mutationFn: () => orderService.confirmOrder(orderId!, "Confirmed by office staff."),
    onSuccess: (updated) => {
      refreshOrderQueries();
      addToast({
        title: `Order ${updated.order_number} Confirmed`,
        description: "Order is now confirmed for production.",
        variant: "success",
      });
    },
  });

  const transitionMutation = useMutation({
    mutationFn: (targetStatus: OrderStatus) =>
      orderService.transitionOrderStatus(
        orderId!,
        targetStatus,
        `Status updated to ${STATUS_DISPLAY_LABELS[targetStatus]}.`,
      ),
    onSuccess: (updated) => {
      refreshOrderQueries();
      addToast({
        title: "Order Status Updated",
        description: `${updated.order_number} is now ${updated.status_label}.`,
        variant: "success",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => orderService.cancelOrder(orderId!, reason),
    onSuccess: (updated) => {
      refreshOrderQueries();
      addToast({
        title: `Order ${updated.order_number} Cancelled`,
        variant: "warning",
      });
      setIsCancelOpen(false);
      setCancelReason("");
      setCancelError(null);
    },
    onError: (err) => {
      setCancelError(err instanceof ApiClientError ? err.message : "Could not cancel order.");
    },
  });

  const updateMetaMutation = useMutation({
    mutationFn: () =>
      orderService.updateOrder(orderId!, {
        expected_completion_date: editExpectedDate || null,
        notes: editNotes.trim(),
      }),
    onSuccess: () => {
      refreshOrderQueries();
      addToast({ title: "Order Updated", variant: "success" });
      setIsEditMetaOpen(false);
    },
    onError: (err) => {
      setEditMetaError(err instanceof ApiClientError ? err.message : "Could not update order.");
    },
  });

  const updateItemQtyMutation = useMutation({
    mutationFn: () =>
      orderService.updateOrderItemQuantities(editingItem!.id, {
        prepared_quantity: editPreparedQty,
        dispatched_quantity: editDispatchedQty,
        notes: editItemNotes.trim(),
      }),
    onSuccess: (updatedItem) => {
      refreshOrderQueries();
      addToast({
        title: "Item Quantities Updated",
        description: `Updated ${updatedItem.item_name} quantities.`,
        variant: "success",
      });
      setEditingItem(null);
      setItemQtyError(null);
    },
    onError: (err) => {
      setItemQtyError(
        err instanceof ApiClientError ? err.message : "Could not update item quantities.",
      );
    },
  });

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <Spinner label="Loading order workspace..." />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Order Not Found</CardTitle>
          <CardDescription>The requested order could not be loaded.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={() => navigate("/orders")}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Return to Orders
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isReplacement = order.order_type === "replacement";
  const nonCancelTransitions = order.allowed_transitions.filter(
    (st) => st !== "cancelled" && st !== "confirmed",
  );

  const selectedProdItem =
    order.items.find((i) => i.id === selectedItemId) || order.items[0];

  const tabs: Array<{
    key: OrderWorkspaceTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    hidden?: boolean;
  }> = [
    { key: "overview", label: "Overview", icon: LayoutList },
    { key: "items", label: `Items (${order.items.length})`, icon: CreditCard },
    { key: "production", label: "Production", icon: Printer },
    { key: "history", label: "History", icon: History },
  ];

  return (
    <div className="space-y-5">
      {/* Order Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center">
        <div>
          <Link
            to="/orders"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Orders
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-[22px] font-semibold tracking-tight text-slate-900">
              {order.order_number}
            </h1>
            <Badge variant={isReplacement ? "warning" : "neutral"}>
              {order.order_type_label}
            </Badge>
            <Badge variant={getOrderStatusBadgeVariant(order.status)}>{order.status_label}</Badge>
          </div>
          <p className="mt-1 text-[13.5px] text-slate-600">
            Client:{" "}
            <Link
              to={`/clients/${order.client}`}
              className="font-semibold text-blue-700 hover:underline"
            >
              {order.client_name}
            </Link>{" "}
            &bull; Order Date: <strong className="text-slate-800">{order.order_date}</strong>
            {order.expected_completion_date ? (
              <>
                {" "}
                &bull; Due: <strong className="text-slate-800">{order.expected_completion_date}</strong>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {order.status !== "completed" && order.status !== "cancelled" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditExpectedDate(order.expected_completion_date || "");
                setEditNotes(order.notes || "");
                setEditMetaError(null);
                setIsEditMetaOpen(true);
              }}
            >
              <Edit3 className="h-3.5 w-3.5" />
              Edit Details
            </Button>
          ) : null}

          {order.allowed_transitions.includes("confirmed") ? (
            <Button
              size="sm"
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
              data-testid="confirm-order-btn"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirm Order
            </Button>
          ) : null}

          {nonCancelTransitions.map((nextStatus) => (
            <Button
              key={nextStatus}
              variant="secondary"
              size="sm"
              onClick={() => transitionMutation.mutate(nextStatus)}
              disabled={transitionMutation.isPending}
            >
              Mark {STATUS_DISPLAY_LABELS[nextStatus]}
            </Button>
          ))}

          {!isReplacement && order.status !== "cancelled" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate(
                  `/orders/replacements/new?clientId=${order.client}&originalOrderId=${order.id}`,
                )
              }
              data-testid="create-replacement-from-order-btn"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Create Replacement
            </Button>
          ) : null}

          {order.allowed_transitions.includes("cancelled") ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setCancelReason("");
                setCancelError(null);
                setIsCancelOpen(true);
              }}
              data-testid="open-cancel-order-btn"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel Order
            </Button>
          ) : null}
        </div>
      </div>

      {/* Replacement / Cancel Banners */}
      {isReplacement && order.original_order ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-950">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-amber-700" />
            <span>
              Replacement Order linked to Original Order{" "}
              <Link
                to={`/orders/${order.original_order}`}
                className="font-mono font-bold text-blue-800 underline"
              >
                {order.original_order_number}
              </Link>
              . Original ordered quantities remain separate.
            </span>
          </div>
          <Link
            to={`/orders/${order.original_order}`}
            className="inline-flex items-center gap-1 font-semibold text-blue-800 hover:underline"
          >
            View Original Order
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}

      {order.status === "cancelled" ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-xs text-red-900">
          <strong>Order Cancelled:</strong> {order.cancel_reason || "Not specified"}
        </div>
      ) : null}

      {/* Order Workspace Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
        {tabs
          .filter((t) => !t.hidden)
          .map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.key}
                size="sm"
                variant={activeTab === tab.key ? "default" : "outline"}
                onClick={() => switchTab(tab.key)}
                data-testid={`order-tab-${tab.key}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </Button>
            );
          })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-slate-500">
                  {isReplacement ? "Replacement Ordered" : "Original Ordered"}
                </p>
                <p className="mt-1 font-mono text-xl font-bold text-slate-900">
                  {order.total_ordered_quantity.toLocaleString("en-IN")}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">{order.items.length} item(s)</p>
              </CardContent>
            </Card>
            {!isReplacement ? (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-slate-500">Linked Replacements</p>
                  <p className="mt-1 font-mono text-xl font-bold text-amber-800">
                    {order.total_replacement_quantity.toLocaleString("en-IN")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {order.replacement_orders.length} order(s)
                  </p>
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-slate-500">Prepared / Produced</p>
                <p className="mt-1 font-mono text-xl font-bold text-blue-800">
                  {order.total_prepared_quantity.toLocaleString("en-IN")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-slate-500">Dispatched</p>
                <p className="mt-1 font-mono text-xl font-bold text-emerald-800">
                  {order.total_dispatched_quantity.toLocaleString("en-IN")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-slate-500">Remaining</p>
                <p className="mt-1 font-mono text-xl font-bold text-slate-800">
                  {order.total_remaining_quantity.toLocaleString("en-IN")}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3.5">
              <div>
                <CardTitle className="text-sm">Item Workflow Progress</CardTitle>
                <CardDescription>
                  Each ID card and lanyard item tracks independently from design to dispatch.
                </CardDescription>
              </div>
              {order.production_progress ? (
                <Badge variant="default">
                  <Printer className="h-3 w-3" />
                  {order.production_progress.summary_label}
                </Badge>
              ) : null}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Ordered</TableHead>
                    <TableHead>Design &amp; Printing</TableHead>
                    <TableHead>Assembly</TableHead>
                    <TableHead>Dispatched / Rem</TableHead>
                    <TableHead className="text-right">Workflow</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => {
                    const isCard = item.category === "id_card";
                    const pj = item.production_job;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-500">
                              #{item.line_number}
                            </span>
                            <span className="font-semibold text-slate-900">{item.item_name}</span>
                          </div>
                          <span className="text-[11px] text-slate-500">
                            {isCard
                              ? `${item.card_orientation_label || "Card"} • ${item.card_printing_label || ""}`
                              : `Lanyard • ${item.lanyard_size_option_detail?.name || ""}`}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold">
                          {item.ordered_quantity.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-xs">
                          {pj ? (
                            <>
                              <span className="font-medium text-slate-800">
                                {pj.design_status_label}
                              </span>{" "}
                              &bull;{" "}
                              <span className="font-mono">
                                {pj.successful_printed_quantity}/{pj.required_quantity}
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {isCard ? (
                            <span className="text-slate-400">N/A</span>
                          ) : pj ? (
                            <span className="font-medium text-slate-800">
                              {pj.assembly_status_label}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <span className="text-emerald-800">
                            {item.dispatched_quantity.toLocaleString("en-IN")}
                          </span>{" "}
                          / {item.remaining_quantity.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            {pj ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => switchTab("production", item.id)}
                                data-testid={`open-production-job-${item.line_number}`}
                              >
                                <Printer className="h-3.5 w-3.5" />
                                Production
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* TAB 2: ITEMS & SPECIFICATIONS */}
      {activeTab === "items" ? (
        <div className="space-y-4">
          {order.items.map((item) => {
            const isCard = item.category === "id_card";
            const prodJob = item.production_job;
            return (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 font-mono text-xs font-bold text-slate-700">
                        #{item.line_number}
                      </span>
                      <h4 className="text-sm font-semibold text-slate-900">{item.item_name}</h4>
                      <Badge variant={isCard ? "default" : "neutral"}>
                        {isCard ? (
                          <CreditCard className="h-3 w-3" />
                        ) : (
                          <Ribbon className="h-3 w-3" />
                        )}
                        {item.category_label}
                      </Badge>
                      {item.replacement_reason ? (
                        <Badge variant="warning">
                          Reason: {item.replacement_reason_label}
                        </Badge>
                      ) : null}
                    </div>

                    {order.status !== "cancelled" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {prodJob ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => switchTab("production", item.id)}
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Manage Production
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingItem(item);
                            setEditPreparedQty(item.prepared_quantity);
                            setEditDispatchedQty(item.dispatched_quantity);
                            setEditItemNotes(item.notes || "");
                            setItemQtyError(null);
                          }}
                        >
                          <PackageCheck className="h-3.5 w-3.5" />
                          Update Quantities
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {/* Quantities Grid */}
                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-md border border-slate-200 bg-slate-50/70 p-3 text-xs sm:grid-cols-5">
                    <div>
                      <span className="text-slate-500">
                        {isReplacement ? "Replacement Qty" : "Original Ordered"}
                      </span>
                      <p className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                        {item.ordered_quantity.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">
                        {isReplacement ? "Original Item Qty" : "Linked Replacements"}
                      </span>
                      <p className="mt-0.5 font-mono text-sm font-bold text-amber-800">
                        {isReplacement
                          ? item.original_item_ordered_quantity?.toLocaleString("en-IN") || "—"
                          : item.replacement_quantity.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Prepared Qty</span>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-blue-800">
                        {item.prepared_quantity.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Dispatched Qty</span>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-emerald-800">
                        {item.dispatched_quantity.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Remaining Qty</span>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-slate-800">
                        {item.remaining_quantity.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>

                  {/* Specifications */}
                  <div className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                    {isCard ? (
                      <>
                        <div>
                          <span className="text-slate-500">Orientation:</span>{" "}
                          <strong>{item.card_orientation_label || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Printing:</span>{" "}
                          <strong>{item.card_printing_label || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Card Type:</span>{" "}
                          <strong>
                            {item.card_type_option_detail?.name ||
                              item.card_type_custom_name ||
                              "Standard"}
                          </strong>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="text-slate-500">Lanyard Size:</span>{" "}
                          <strong>{item.lanyard_size_option_detail?.name || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Design:</span>{" "}
                          <strong>{item.lanyard_design_requirements || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Printing Specs:</span>{" "}
                          <strong>{item.lanyard_printing_specs || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Hook:</span>{" "}
                          <strong>
                            {item.hook_requirement_label}
                            {item.hook_option_detail ? ` (${item.hook_option_detail.name})` : ""}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Attachment Party:</span>{" "}
                          <strong>{item.attachment_party_label}</strong>
                        </div>
                      </>
                    )}
                    <div>
                      <span className="text-slate-500">Holder:</span>{" "}
                      <strong>
                        {item.holder_requirement_label}
                        {item.holder_option_detail ? ` (${item.holder_option_detail.name})` : ""}
                      </strong>
                    </div>
                    {item.notes ? (
                      <div className="sm:col-span-3">
                        <span className="text-slate-500">Item Notes:</span>{" "}
                        <span className="text-slate-800">{item.notes}</span>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {/* TAB 3: INLINE PRODUCTION */}
      {activeTab === "production" && selectedProdItem ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-slate-500">Select Item:</span>
              {order.items.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={selectedProdItem.id === item.id ? "default" : "outline"}
                  onClick={() => switchTab("production", item.id)}
                >
                  #{item.line_number} {item.item_name} (
                  {item.ordered_quantity.toLocaleString("en-IN")})
                </Button>
              ))}
            </div>
            {selectedProdItem.production_job ? (
              <Link
                to={`/production/jobs/${selectedProdItem.production_job.id}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
              >
                Full Production Page
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : null}
          </div>

          {selectedProdItem.production_job ? (
            <OrderItemProductionPanel
              jobId={selectedProdItem.production_job.id}
              showAssembly={selectedProdItem.category === "lanyard"}
              showHistory={true}
            />
          ) : (
            <p className="py-6 text-center text-xs text-slate-500">
              No production job initialized for this item yet.
            </p>
          )}
        </div>
      ) : null}

      {/* TAB 4: HISTORY & REPLACEMENTS */}
      {activeTab === "history" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {!isReplacement ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <RefreshCw className="h-4 w-4 text-blue-700" />
                      Linked Replacement Orders ({order.replacement_orders.length})
                    </CardTitle>
                    <CardDescription>
                      Replacement orders referencing {order.order_number}
                    </CardDescription>
                  </div>
                  {order.status !== "cancelled" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigate(
                          `/orders/replacements/new?clientId=${order.client}&originalOrderId=${order.id}`,
                        )
                      }
                    >
                      + New Replacement
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                {order.replacement_orders.length === 0 ? (
                  <p className="py-4 text-xs text-slate-500">
                    No replacement orders created for this order.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Replacement #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Dispatched</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.replacement_orders.map((repOrder) => (
                        <TableRow key={repOrder.id}>
                          <TableCell>
                            <Link
                              to={`/orders/${repOrder.id}`}
                              className="font-mono text-xs font-semibold text-blue-700 hover:underline"
                            >
                              {repOrder.order_number}
                            </Link>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {repOrder.order_date}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {repOrder.total_ordered_quantity}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {repOrder.total_dispatched_quantity}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getOrderStatusBadgeVariant(repOrder.status)}>
                              {repOrder.status_label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card className={isReplacement ? "lg:col-span-2" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4 text-blue-700" />
                Order Status History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.notes ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                  <p className="font-semibold text-slate-700">Order Notes</p>
                  <p className="mt-1 text-slate-600">{order.notes}</p>
                </div>
              ) : null}

              <div className="divide-y divide-slate-100">
                {order.status_history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between gap-3 py-2.5 text-xs"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        <span className="text-slate-500">{entry.previous_status_label}</span>{" "}
                        &rarr; <strong>{entry.new_status_label}</strong>
                      </p>
                      {entry.reason ? (
                        <p className="mt-0.5 text-slate-600">{entry.reason}</p>
                      ) : null}
                    </div>
                    <div className="text-right text-[11px] text-slate-500">
                      <p className="font-medium text-slate-700">
                        {entry.changed_by_username || "system"}
                      </p>
                      <p className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTimeIST(entry.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Dialogs */}
      <Dialog
        open={isCancelOpen}
        onOpenChange={setIsCancelOpen}
        title={`Cancel Order ${order.order_number}`}
        description="Enter a mandatory cancellation reason."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setCancelError(null);
            if (!cancelReason.trim()) {
              setCancelError("A cancellation reason is required.");
              return;
            }
            cancelMutation.mutate(cancelReason.trim());
          }}
          className="space-y-4"
        >
          {cancelError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {cancelError}
            </div>
          ) : null}
          <FormField id="cancel-order-reason" label="Cancellation Reason" required>
            <Input
              id="cancel-order-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Client requested cancellation"
              autoFocus
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsCancelOpen(false)}>
              Back
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={cancelMutation.isPending}
              data-testid="confirm-cancel-order-btn"
            >
              Confirm Cancellation
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={isEditMetaOpen}
        onOpenChange={setIsEditMetaOpen}
        title={`Edit ${order.order_number} Details`}
        description="Update expected completion date and order notes."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setEditMetaError(null);
            updateMetaMutation.mutate();
          }}
          className="space-y-4"
        >
          {editMetaError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {editMetaError}
            </div>
          ) : null}
          <FormField id="edit-expected-date" label="Expected Completion Date">
            <DatePicker
              id="edit-expected-date"
              value={editExpectedDate}
              onChange={setEditExpectedDate}
              clearable
              placeholder="Optional"
              ariaLabel="Expected completion date"
            />
          </FormField>
          <FormField id="edit-order-notes" label="General Notes">
            <Input
              id="edit-order-notes"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsEditMetaOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMetaMutation.isPending}>
              Save Changes
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(editingItem)}
        onOpenChange={(open) => !open && setEditingItem(null)}
        title={editingItem ? `Update Quantities — ${editingItem.item_name}` : "Update Quantities"}
        description={
          editingItem
            ? `Ordered Quantity: ${editingItem.ordered_quantity.toLocaleString("en-IN")}`
            : ""
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setItemQtyError(null);
            updateItemQtyMutation.mutate();
          }}
          className="space-y-4"
        >
          {itemQtyError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {itemQtyError}
            </div>
          ) : null}
          <FormField id="edit-prepared-qty" label="Quantity Prepared">
            <Input
              id="edit-prepared-qty"
              type="number"
              min={0}
              value={editPreparedQty}
              onChange={(e) => setEditPreparedQty(parseInt(e.target.value || "0", 10))}
            />
          </FormField>
          <FormField
            id="edit-dispatched-qty"
            label={`Quantity Dispatched (Max ${editingItem?.ordered_quantity ?? 0})`}
          >
            <Input
              id="edit-dispatched-qty"
              type="number"
              min={0}
              max={editingItem?.ordered_quantity}
              value={editDispatchedQty}
              onChange={(e) => setEditDispatchedQty(parseInt(e.target.value || "0", 10))}
            />
          </FormField>
          <FormField id="edit-item-notes" label="Item Notes">
            <Input
              id="edit-item-notes"
              value={editItemNotes}
              onChange={(e) => setEditItemNotes(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateItemQtyMutation.isPending}>
              Save Quantities
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
