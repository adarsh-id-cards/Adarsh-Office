import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Edit3,
  ExternalLink,
  History,
  LayoutList,
  MoreVertical,
  Plus,
  Printer,
  RefreshCw,
  Ribbon,
  Table as TableIcon,
  Truck,
  XCircle,
} from "lucide-react";
import { orderService } from "@/services/orderService";
import { ApiClientError } from "@/services/apiClient";
import { useAuth } from "@/hooks/useAuth";
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
import { cn, formatDateTimeIST } from "@/lib/utils";
import { getOrderStatusBadgeVariant } from "@/modules/orders/OrdersListPage";
import { OrderItemProductionPanel } from "@/modules/production/OrderItemProductionPanel";
import {
  ItemWorkflowProgress,
  resolveItemNextAction,
} from "@/modules/orders/ItemWorkflowProgress";
import { OrderItemWorkflowTable } from "@/modules/orders/OrderItemWorkflowTable";
import type { OrderItemRecord } from "@/types/orders";

type OrderDetailView = "workflow" | "history";

export function OrderDetailPage(): React.ReactElement {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const addToast = useUiShellStore((state) => state.addToast);

  const initialTab = searchParams.get("tab");
  const initialItem = searchParams.get("item") || "";

  // Active view: workflow (default) or history
  const [activeView, setActiveView] = React.useState<OrderDetailView>(
    initialTab === "history" ? "history" : "workflow",
  );

  // Workflow display layout: "table" (checklist table default) or "cards"
  const [workflowLayout, setWorkflowLayout] = React.useState<"table" | "cards">("table");

  // Set of item line numbers that have their inline production panel expanded
  const [expandedItemLines, setExpandedItemLines] = React.useState<Record<number, boolean>>(() => {
    const lineNum = initialItem ? parseInt(initialItem, 10) : NaN;
    if (!isNaN(lineNum)) {
      return { [lineNum]: true };
    }
    return {};
  });

  // More Actions dropdown toggle
  const [isActionsMenuOpen, setIsActionsMenuOpen] = React.useState(false);
  const actionsMenuRef = React.useRef<HTMLDivElement>(null);

  // Dialog states
  const [isCancelOpen, setIsCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  const [isEditMetaOpen, setIsEditMetaOpen] = React.useState(false);
  const [editExpectedDate, setEditExpectedDate] = React.useState("");
  const [editNotes, setEditNotes] = React.useState("");
  const [editMetaError, setEditMetaError] = React.useState<string | null>(null);

  const [editingItem, setEditingItem] = React.useState<OrderItemRecord | null>(null);
  const [editDispatchedQty, setEditDispatchedQty] = React.useState(0);
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

  // Close actions menu on outside click
  React.useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setIsActionsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // Handle URL sync
  React.useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "history") {
      setActiveView("history");
    } else {
      setActiveView("workflow");
      // If a specific item or production tab is requested, auto-expand that item
      const itemParam = searchParams.get("item");
      if (order?.items?.length) {
        if (itemParam) {
          const matching = order.items.find(
            (i) => i.id === itemParam || String(i.line_number) === itemParam,
          );
          if (matching) {
            setExpandedItemLines((prev) => ({ ...prev, [matching.line_number]: true }));
          }
        } else if (tabParam === "production") {
          const firstLine = order.items[0]?.line_number;
          if (firstLine !== undefined) {
            setExpandedItemLines((prev) =>
              Object.keys(prev).length === 0 ? { [firstLine]: true } : prev,
            );
          }
        }
      }
    }
  }, [searchParams, order?.items]);

  const toggleItemExpansion = (lineNumber: number) => {
    const isCurrentlyExpanded = Boolean(expandedItemLines[lineNumber]);
    const willBeOpen = !isCurrentlyExpanded;

    const next = new URLSearchParams(searchParams);
    if (willBeOpen) {
      next.set("tab", "production");
      const item = order?.items?.find((i) => i.line_number === lineNumber);
      if (item) next.set("item", item.id);
    } else {
      const remainingOpen = Object.entries(expandedItemLines).some(
        ([k, v]) => Number(k) !== lineNumber && Boolean(v),
      );
      if (!remainingOpen) {
        next.delete("tab");
        next.delete("item");
      }
    }
    setSearchParams(next, { replace: true });

    setExpandedItemLines((prev) => ({
      ...prev,
      [lineNumber]: willBeOpen,
    }));
  };

  const switchView = (view: OrderDetailView) => {
    setActiveView(view);
    const next = new URLSearchParams(searchParams);
    if (view === "history") {
      next.set("tab", "history");
      next.delete("item");
    } else {
      next.delete("tab");
      next.delete("item");
    }
    setSearchParams(next, { replace: true });
    void queryClient.invalidateQueries({ queryKey: ["orders", "detail", orderId] });
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
      addToast({ title: "Order Details Updated", variant: "success" });
      setIsEditMetaOpen(false);
    },
    onError: (err) => {
      setEditMetaError(err instanceof ApiClientError ? err.message : "Could not update order.");
    },
  });

  const updateItemQtyMutation = useMutation({
    mutationFn: () =>
      orderService.updateOrderItemQuantities(editingItem!.id, {
        dispatched_quantity: editDispatchedQty,
      }),
    onSuccess: (updatedItem) => {
      refreshOrderQueries();
      addToast({
        title: "Dispatched Quantity Updated",
        description: `Recorded ${updatedItem.dispatched_quantity} units dispatched for ${updatedItem.item_name}.`,
        variant: "success",
      });
      setEditingItem(null);
      setItemQtyError(null);
    },
    onError: (err) => {
      setItemQtyError(
        err instanceof ApiClientError ? err.message : "Could not update dispatched quantity.",
      );
    },
  });

  if (isLoading) {
    return (
      <div className="py-16 text-center">
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
  const userPermissions = user?.permissions || [];
  const isCancelled = order.status === "cancelled";

  return (
    <div className="space-y-5">
      {/* 1. COMPACT WORKFLOW HEADER */}
      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
        <div>
          <Link
            to="/orders"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3 w-3" />
            Orders Directory
          </Link>

          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {order.order_number}
            </h1>
            <Badge variant={isReplacement ? "warning" : "neutral"} className="text-xs">
              {order.order_type_label}
            </Badge>
            <Badge variant={getOrderStatusBadgeVariant(order.status)} className="text-xs">
              {order.status_label}
            </Badge>
          </div>

          <p className="mt-1 text-[13px] text-slate-600">
            Client:{" "}
            <Link
              to={`/clients/${order.client}`}
              className="font-semibold text-blue-700 hover:underline"
            >
              {order.client_name}
            </Link>{" "}
            &bull; Ordered: <strong className="text-slate-800">{order.order_date}</strong>
            {order.expected_completion_date ? (
              <>
                {" "}
                &bull; Due: <strong className="text-slate-800">{order.expected_completion_date}</strong>
              </>
            ) : null}
          </p>
        </div>

        {/* Header Right Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Primary Action: Confirm Order (only if draft) */}
          {order.status === "draft" ? (
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

          {/* More Actions Dropdown */}
          <div className="relative" ref={actionsMenuRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsActionsMenuOpen((prev) => !prev)}
              aria-label="More actions"
              data-testid="order-actions-menu-trigger"
            >
              <MoreVertical className="h-3.5 w-3.5" />
              Actions
              <ChevronDown className="h-3 w-3" />
            </Button>

            {isActionsMenuOpen && (
              <div className="absolute right-0 z-30 mt-1 w-52 rounded-[10px] border border-slate-200 bg-white p-1.5 shadow-lg ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95">
                {!isCancelled && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        setEditExpectedDate(order.expected_completion_date || "");
                        setEditNotes(order.notes || "");
                        setEditMetaError(null);
                        setIsEditMetaOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                      Edit Order Details
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        navigate(
                          `/orders/replacements/new?clientId=${order.client}&originalOrderId=${order.id}`,
                        );
                      }}
                      className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                      data-testid="create-replacement-from-order-btn"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-amber-600" />
                      Create Replacement
                    </button>
                  </>
                )}

                {order.allowed_transitions.includes("cancelled") && (
                  <>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        setCancelReason("");
                        setCancelError(null);
                        setIsCancelOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
                      data-testid="open-cancel-order-btn"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel Order
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Replacement or Cancellation Banners */}
      {isReplacement && order.original_order ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50/80 px-3.5 py-2 text-xs text-amber-950"
          data-testid="linked-original-banner"
        >
          <div className="flex items-center gap-2">
            <RefreshCw className="h-3.5 w-3.5 text-amber-700" />
            <span>
              Replacement order linked to Original Order{" "}
              <Link
                to={`/orders/${order.original_order}`}
                className="font-mono font-bold text-blue-800 underline"
              >
                {order.original_order_number}
              </Link>
              . Original quantities remain separate.
            </span>
          </div>
          <Link
            to={`/orders/${order.original_order}`}
            className="inline-flex items-center gap-1 font-semibold text-blue-800 hover:underline"
          >
            View Original Order
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      ) : null}

      {isCancelled ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-2 text-xs text-red-900">
          <strong>Order Cancelled:</strong> {order.cancel_reason || "Not specified"}
        </div>
      ) : null}

      {/* 2. UNIFIED METRICS STRIP */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-xs">
        <div className="grid grid-cols-2 divide-y divide-slate-100 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <div className="p-2 sm:px-4 sm:first:pl-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {isReplacement ? "Replacement Qty" : "Ordered Quantity"}
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {order.total_ordered_quantity.toLocaleString("en-IN")}
              </span>
              <span className="text-xs font-normal text-slate-500">pcs</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{order.items.length} item line(s)</p>
          </div>

          <div className="p-2 sm:px-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Produced / Ready
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold tracking-tight text-blue-700 tabular-nums">
                {order.total_prepared_quantity.toLocaleString("en-IN")}
              </span>
              <span className="text-xs font-normal text-slate-500">pcs</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {order.production_progress?.production_completed_items ?? 0} of {order.items.length} items ready
            </p>
          </div>

          <div className="p-2 sm:px-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Dispatched
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-700 tabular-nums">
                {order.total_dispatched_quantity.toLocaleString("en-IN")}
              </span>
              <span className="text-xs font-normal text-slate-500">pcs</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">Sent to client</p>
          </div>

          <div className="p-2 sm:px-4 sm:last:pr-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Remaining Balance
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold tracking-tight text-slate-700 tabular-nums">
                {order.total_remaining_quantity.toLocaleString("en-IN")}
              </span>
              <span className="text-xs font-normal text-slate-500">pcs</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">To be shipped</p>
          </div>
        </div>
      </div>

      {/* 3. WORKSPACE VIEW SWITCHER */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={activeView === "workflow" ? "default" : "outline"}
            onClick={() => switchView("workflow")}
            data-testid="order-tab-overview"
          >
            <LayoutList className="h-3.5 w-3.5" />
            Order Items &amp; Workflows ({order.items.length})
          </Button>

          <Button
            size="sm"
            variant={activeView === "history" ? "default" : "outline"}
            onClick={() => switchView("history")}
            data-testid="order-tab-history"
          >
            <History className="h-3.5 w-3.5" />
            History &amp; Replacements
            {order.replacement_orders.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.2 text-[10.5px] font-bold text-amber-800">
                {order.replacement_orders.length}
              </span>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-3">
          {order.production_progress ? (
            <span className="hidden text-xs font-medium text-slate-600 sm:inline-block">
              {order.production_progress.summary_label}
            </span>
          ) : null}

          {/* Toggle between Table Checklist (default) and Cards */}
          {activeView === "workflow" ? (
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 select-none">
              <button
                type="button"
                onClick={() => setWorkflowLayout("table")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-[6px] transition-colors",
                  workflowLayout === "table"
                    ? "bg-white text-blue-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900",
                )}
                title="Switch to Table Checklist view"
              >
                <TableIcon className="h-3.5 w-3.5" />
                <span>Table Checklist</span>
              </button>
              <button
                type="button"
                onClick={() => setWorkflowLayout("cards")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-[6px] transition-colors",
                  workflowLayout === "cards"
                    ? "bg-white text-blue-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900",
                )}
                title="Switch to Cards view"
              >
                <LayoutList className="h-3.5 w-3.5" />
                <span>Cards</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* 4. PRIMARY WORKFLOW WORKSPACE: TABLE CHECKLIST (DEFAULT) OR CARDS */}
      {activeView === "workflow" ? (
        workflowLayout === "table" ? (
          <OrderItemWorkflowTable
            order={order}
            expandedItemLines={expandedItemLines}
            onToggleItemExpansion={toggleItemExpansion}
            onOpenDispatchModal={(item) => {
              setEditingItem(item);
              setEditDispatchedQty(item.dispatched_quantity);
              setItemQtyError(null);
            }}
            isCancelled={isCancelled}
          />
        ) : (
          <div className="space-y-4">
            {order.items.map((item) => {
              const isCard = item.category === "id_card";
              const isLanyard = item.category === "lanyard";
              const job = item.production_job;
              const isExpanded = Boolean(expandedItemLines[item.line_number]);

              const nextAction = resolveItemNextAction(
                item.category,
              job,
              item.ordered_quantity,
              item.dispatched_quantity,
              userPermissions,
              isCancelled,
            );

            return (
              <Card
                key={item.id}
                className="overflow-hidden border border-slate-200 transition-all hover:border-slate-300"
              >
                {/* Item Card Header */}
                <CardHeader className="border-b border-slate-100 bg-slate-50/70 p-3.5">
                  <div className="flex flex-col justify-between gap-2.5 sm:flex-row sm:items-center">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white">
                        {item.line_number}
                      </span>
                      <h3 className="text-[15px] font-semibold text-slate-900">
                        {item.item_name}
                      </h3>
                      <Badge
                        variant="neutral"
                        className={
                          isCard
                            ? "border-blue-200 bg-blue-50 text-blue-800 text-[11px]"
                            : "border-purple-200 bg-purple-50 text-purple-800 text-[11px]"
                        }
                      >
                        {isCard ? (
                          <>
                            <CreditCard className="mr-1 h-3 w-3" />
                            ID Card
                          </>
                        ) : (
                          <>
                            <Ribbon className="mr-1 h-3 w-3" />
                            Lanyard
                          </>
                        )}
                      </Badge>

                      {/* Compact specification tag */}
                      <span className="text-xs text-slate-500">
                        {isCard ? (
                          <>
                            {item.card_orientation_label} &bull; {item.card_printing_label}
                            {item.holder_requirement !== "not_selected" &&
                              item.holder_requirement !== "not_required" &&
                              ` • ${item.holder_requirement_label}`}
                          </>
                        ) : (
                          <>
                            {item.lanyard_size_option_detail?.name || "16 mm"}
                            {item.hook_requirement !== "not_required" &&
                              item.hook_requirement !== "not_selected" &&
                              ` • ${item.hook_requirement_label}`}
                          </>
                        )}
                      </span>
                    </div>

                    {/* Quantities summary chip */}
                    <div className="flex items-center gap-3 text-xs">
                      <div>
                        <span className="text-slate-500">Ordered:</span>{" "}
                        <strong className="font-mono text-slate-900">
                          {item.ordered_quantity.toLocaleString("en-IN")}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Produced:</span>{" "}
                        <strong className="font-mono text-blue-800">
                          {item.prepared_quantity.toLocaleString("en-IN")}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Dispatched:</span>{" "}
                        <strong className="font-mono text-emerald-800">
                          {item.dispatched_quantity.toLocaleString("en-IN")}
                        </strong>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 p-4">
                  {/* Type-Specific Horizontal Step Progress Bar */}
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Production Progress
                    </p>
                    <ItemWorkflowProgress
                      category={item.category}
                      job={job}
                      orderedQuantity={item.ordered_quantity}
                      dispatchedQuantity={item.dispatched_quantity}
                      isCancelled={isCancelled}
                    />
                  </div>

                  {/* Obvious Next Action Row */}
                  <div className="flex flex-col justify-between gap-3 rounded-[8px] border border-slate-200 bg-slate-50/50 p-3 sm:flex-row sm:items-center">
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-slate-800">
                        Next Action:{" "}
                        <span className="text-blue-700 font-bold">{nextAction.label}</span>
                      </p>
                      <p className="text-[12px] text-slate-500">{nextAction.description}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Secondary: Toggle Detailed Production Workspace */}
                      {job ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleItemExpansion(item.line_number)}
                          data-testid={`open-production-job-${item.line_number}`}
                          className="h-8 text-xs"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          {isExpanded ? "Hide Production Details" : "Production Details"}
                          <ChevronDown
                            className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </Button>
                      ) : null}

                      {/* Quick Dispatch Qty adjustment */}
                      {nextAction.actionId === "update_dispatch" ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            setEditingItem(item);
                            setEditDispatchedQty(item.dispatched_quantity);
                            setItemQtyError(null);
                          }}
                          className="h-8 text-xs"
                        >
                          <Truck className="h-3.5 w-3.5" />
                          Update Dispatched Qty
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {/* Expandable Inline Production Details Panel (retaining full testing & batch tool compatibility) */}
                  {isExpanded && job ? (
                    <div className="rounded-[8px] border border-slate-200 bg-white p-3.5 pt-2 animate-in fade-in-0 duration-200">
                      <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                          {item.item_name} — Production Workspace
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleItemExpansion(item.line_number)}
                          className="h-6 text-xs text-slate-500 hover:text-slate-800"
                        >
                          Close Details
                        </Button>
                      </div>

                      <OrderItemProductionPanel
                        jobId={job.id}
                        showAssembly={isLanyard}
                        showHistory={true}
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )
    ) : null}

      {/* 5. SECONDARY WORKSPACE: ORDER HISTORY & REPLACEMENTS */}
      {activeView === "history" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Linked Replacements */}
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
                  {!isCancelled ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate(
                          `/orders/replacements/new?clientId=${order.client}&originalOrderId=${order.id}`,
                        )
                      }
                      className="text-xs"
                    >
                      <Plus className="h-3 w-3" />
                      Add Replacement
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {order.replacement_orders.length === 0 ? (
                  <p className="p-6 text-center text-xs text-slate-500">
                    No replacement orders linked to this original order.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.replacement_orders.map((rep) => (
                        <TableRow key={rep.id}>
                          <TableCell className="font-mono text-xs font-semibold text-blue-700">
                            <Link to={`/orders/${rep.id}`} className="hover:underline">
                              {rep.order_number}
                            </Link>
                          </TableCell>
                          <TableCell className="text-xs">{rep.order_date}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {rep.total_ordered_quantity.toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={getOrderStatusBadgeVariant(rep.status)}
                              className="text-[11px]"
                            >
                              {rep.status_label}
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

          {/* Status Audit Trail */}
          <Card className={isReplacement ? "lg:col-span-2" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4 text-slate-600" />
                Status Audit Trail ({order.status_history.length})
              </CardTitle>
              <CardDescription>Immutable record of order state transitions</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {order.status_history.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-500">
                  No status transition history recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transition</TableHead>
                      <TableHead>Reason / Notes</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.status_history.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="text-xs">
                          {h.previous_status_label ? (
                            <>
                              <span className="text-slate-500">{h.previous_status_label}</span>
                              <span className="mx-1.5 text-slate-400">&rarr;</span>
                            </>
                          ) : null}
                          <strong className="text-slate-800">{h.new_status_label}</strong>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{h.reason || "—"}</TableCell>
                        <TableCell className="text-xs font-medium text-slate-700">
                          {h.changed_by_username || "System"}
                        </TableCell>
                        <TableCell className="text-right text-[11px] text-slate-500">
                          {formatDateTimeIST(h.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* 6. MODALS & DIALOGS */}
      {/* Update Dispatched Quantity Dialog */}
      <Dialog
        open={Boolean(editingItem)}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
        }}
        title={`Update Dispatched Quantity — ${editingItem?.item_name || ""}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Total Ordered:{" "}
            <strong className="font-mono">
              {editingItem?.ordered_quantity.toLocaleString("en-IN")} pcs
            </strong>
          </p>

          <FormField
            id="modal-dispatched-qty"
            label="Dispatched Quantity"
            required
            error={itemQtyError || undefined}
          >
            <Input
              id="modal-dispatched-qty"
              type="number"
              min={0}
              max={editingItem?.ordered_quantity || 100000}
              value={editDispatchedQty}
              onChange={(e) => setEditDispatchedQty(parseInt(e.target.value || "0", 10))}
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditingItem(null)}
              disabled={updateItemQtyMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => updateItemQtyMutation.mutate()}
              disabled={updateItemQtyMutation.isPending}
            >
              Save Dispatched Quantity
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Edit Order Info Dialog */}
      <Dialog
        open={isEditMetaOpen}
        onOpenChange={(open) => {
          if (!open) setIsEditMetaOpen(false);
        }}
        title="Edit Order Information"
      >
        <div className="space-y-4">
          <FormField id="edit-expected-date" label="Promised Completion / Due Date">
            <DatePicker
              value={editExpectedDate}
              onChange={(v) => setEditExpectedDate(v)}
              placeholder="Select promised date"
            />
          </FormField>

          <FormField id="edit-notes" label="Internal Order Notes">
            <Input
              id="edit-notes"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Order remarks or delivery instructions"
            />
          </FormField>

          {editMetaError ? (
            <div className="rounded-[6px] bg-red-50 p-2 text-xs text-red-700">
              {editMetaError}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditMetaOpen(false)}
              disabled={updateMetaMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => updateMetaMutation.mutate()}
              disabled={updateMetaMutation.isPending}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Cancel Order Dialog */}
      <Dialog
        open={isCancelOpen}
        onOpenChange={(open) => {
          if (!open) setIsCancelOpen(false);
        }}
        title={`Cancel Order ${order.order_number}?`}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Cancelling an order is a destructive operation that terminates production and prevents
            further dispatch. Please state the cancellation reason.
          </p>

          <FormField
            id="cancel-reason-input"
            label="Cancellation Reason"
            required
            error={cancelError || undefined}
          >
            <Input
              id="cancel-reason-input"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Client changed requirements, duplicate order, etc."
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCancelOpen(false)}
              disabled={cancelMutation.isPending}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => cancelMutation.mutate(cancelReason)}
              disabled={!cancelReason.trim() || cancelMutation.isPending}
              data-testid="confirm-cancel-order-btn"
            >
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
