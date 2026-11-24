import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  FileSpreadsheet,
  HardHat,
  PackagePlus,
  Printer,
  Truck,
  UserPlus,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { orderService } from "@/services/orderService";
import { productionService } from "@/services/productionService";
import { phase4Service } from "@/services/phase4Service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrentBusinessDate } from "@/lib/utils";
import { getOrderStatusBadgeVariant } from "@/modules/orders/OrdersListPage";

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

interface TodayTaskItem {
  id: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  itemName: string;
  quantityLabel: string;
  stageLabel: string;
  stageVariant: "default" | "warning" | "success" | "neutral";
  to: string;
  actionLabel: string;
}

export function DashboardPage(): React.ReactElement {
  const { user } = useAuth();
  const navigate = useNavigate();
  const currentDateText = React.useMemo(() => formatCurrentBusinessDate(), []);
  const greeting = React.useMemo(() => getTimeGreeting(), []);
  const [isAssignPickerOpen, setIsAssignPickerOpen] = React.useState(false);

  const { data: ordersData, isLoading: isOrdersLoading } = useQuery({
    queryKey: ["orders", "dashboard-recent"],
    queryFn: async () =>
      (await orderService.listOrders({ page_size: 20 })) ?? { count: 0, results: [] },
    staleTime: 30_000,
  });

  const { data: productionOverview } = useQuery({
    queryKey: ["production", "overview"],
    queryFn: async () => (await productionService.getOverview()) ?? null,
    enabled: Boolean(user?.permissions.includes("production.view") ?? true),
    staleTime: 30_000,
  });

  const { data: productionQueueData } = useQuery({
    queryKey: ["production", "dashboard-queue"],
    queryFn: async () => (await productionService.listQueue({ page_size: 25 })) ?? { results: [] },
    staleTime: 30_000,
  });

  const { data: dispatchQueueData } = useQuery({
    queryKey: ["dispatch", "queue"],
    queryFn: async () => (await phase4Service.getDispatchQueue()) ?? { results: [] },
    staleTime: 30_000,
  });

  const { data: assignmentsData } = useQuery({
    queryKey: ["assembly", "assignments", "summary"],
    queryFn: async () => (await phase4Service.listAssignments()) ?? { results: [] },
    staleTime: 30_000,
  });

  const { data: materialsPage } = useQuery({
    queryKey: ["inventory", "materials"],
    queryFn: async () => (await phase4Service.listMaterials()) ?? { results: [] },
    staleTime: 30_000,
  });

  const { data: consumptionList } = useQuery({
    queryKey: ["inventory", "consumption"],
    queryFn: async () => (await phase4Service.getConsumptionSummary()) ?? [],
    staleTime: 30_000,
  });

  const { data: auditsData } = useQuery({
    queryKey: ["stock-audits"],
    queryFn: async () => (await phase4Service.listAudits()) ?? { results: [] },
    staleTime: 30_000,
  });

  const { data: assemblyQueueData } = useQuery({
    queryKey: ["assembly", "queue", "dashboard"],
    queryFn: async () => (await phase4Service.getAssemblyQueue()) ?? { results: [] },
    staleTime: 30_000,
  });

  const allOrders = ordersData?.results || [];
  const activeOrdersCount = allOrders.filter(
    (o) => o.status !== "completed" && o.status !== "cancelled",
  ).length;
  const recentOrders = allOrders.slice(0, 6);

  const dispatchQueue = dispatchQueueData?.results || [];
  const readyForDispatchList = dispatchQueue.filter(
    (q) => q.is_ready_for_dispatch && q.remaining_order_quantity > 0,
  );

  const productionJobs = productionQueueData?.results || [];
  const inProductionCount =
    productionOverview?.incomplete_production ??
    productionJobs.filter((j) => !j.is_production_completed).length;
  const pendingAssemblyCount =
    productionOverview?.lanyards_ready_for_assembly ??
    (assemblyQueueData?.results || []).filter((q) => q.unassigned_quantity > 0).length;
  const readyForDispatchCount =
    readyForDispatchList.length > 0
      ? readyForDispatchList.length
      : (productionOverview?.ready_for_dispatch ?? 0);

  const todaysWork = React.useMemo<TodayTaskItem[]>(() => {
    const tasks: TodayTaskItem[] = [];

    for (const q of readyForDispatchList) {
      tasks.push({
        id: `dsp-${q.order_item_id}`,
        orderId: q.order_id,
        orderNumber: q.order_number,
        clientName: q.client_name,
        itemName: q.item_name,
        quantityLabel: `${q.remaining_order_quantity.toLocaleString("en-IN")} left`,
        stageLabel: "Ready for Dispatch",
        stageVariant: "success",
        to: `/orders/${q.order_id}?tab=dispatch`,
        actionLabel: "Pack & Dispatch",
      });
    }

    for (const job of productionJobs) {
      if (job.is_production_completed) continue;
      let stageLabel = "In Production";
      let stageVariant: TodayTaskItem["stageVariant"] = "default";
      let targetTab = "production";

      if (job.design_status !== "approved" && job.design_status !== "completed") {
        stageLabel = "Awaiting Design";
        stageVariant = "neutral";
      } else if (job.printing_status !== "completed") {
        stageLabel =
          job.successful_printed_quantity > 0 ? "Printing In Progress" : "Awaiting Printing";
        stageVariant = "default";
      } else if (job.item.category === "lanyard" && job.assembly_status !== "completed") {
        stageLabel = "Awaiting Assembly";
        stageVariant = "warning";
        targetTab = "assembly";
      }

      tasks.push({
        id: `prod-${job.id}`,
        orderId: job.item.order_id,
        orderNumber: job.item.order_number,
        clientName: job.item.client_name,
        itemName: job.item.item_name,
        quantityLabel: `${job.required_quantity.toLocaleString("en-IN")} pcs`,
        stageLabel,
        stageVariant,
        to: `/orders/${job.item.order_id}?tab=${targetTab}&item=${job.order_item}`,
        actionLabel: targetTab === "assembly" ? "Assign" : "Update",
      });
    }

    return tasks.slice(0, 6);
  }, [readyForDispatchList, productionJobs]);

  const attentionItems = React.useMemo(() => {
    const alerts: Array<{
      id: string;
      category: string;
      summary: string;
      detail: string;
      to: string;
      tone: "warning" | "destructive" | "default";
    }> = [];

    const awaitingReturn = (assignmentsData?.results || []).filter(
      (a) => a.pending_quantity > 0 && a.status !== "cancelled",
    );
    awaitingReturn.slice(0, 3).forEach((a) => {
      alerts.push({
        id: `ret-${a.id}`,
        category: "Labour Return Pending",
        summary: `${a.labourer_name || "Office Assembly"} (${a.order_number})`,
        detail: `${a.pending_quantity.toLocaleString("en-IN")} of ${a.assigned_quantity.toLocaleString("en-IN")} pending`,
        to: `/orders/${a.order_id}?tab=assembly`,
        tone: "warning",
      });
    });

    const lowStock = (materialsPage?.results || []).filter(
      (m) => m.minimum_stock_level > 0 && m.office_usable_stock <= m.minimum_stock_level,
    );
    lowStock.slice(0, 3).forEach((m) => {
      alerts.push({
        id: `stk-${m.id}`,
        category: "Low Stock",
        summary: m.name,
        detail: `${m.office_usable_stock.toLocaleString("en-IN")} ${m.base_unit} in office (min ${m.minimum_stock_level})`,
        to: "/stock",
        tone: "destructive",
      });
    });

    const diffs = (consumptionList || []).filter((c) => c.unexplained_difference !== 0);
    const firstDiff = diffs[0];
    if (diffs.length > 0 && firstDiff) {
      alerts.push({
        id: "cons-diff",
        category: "Stock Variance",
        summary: `${diffs.length} material(s) need review`,
        detail: `${firstDiff.material_name}: ${firstDiff.unexplained_difference > 0 ? "+" : ""}${firstDiff.unexplained_difference} ${firstDiff.base_unit}`,
        to: "/stock?tab=consumption",
        tone: "warning",
      });
    }

    const openAudits = (auditsData?.results || []).filter((a) => a.status !== "approved");
    const firstAudit = openAudits[0];
    if (openAudits.length > 0 && firstAudit) {
      alerts.push({
        id: `aud-${firstAudit.id}`,
        category: "Pending Stock Audit",
        summary: `${firstAudit.audit_code} (${firstAudit.status_display})`,
        detail: "Complete physical verification or approval",
        to: "/stock?tab=audits",
        tone: "default",
      });
    }

    return alerts;
  }, [assignmentsData, materialsPage, consumptionList, auditsData]);

  const assignableLanyards = (assemblyQueueData?.results || []).filter(
    (q) => q.unassigned_quantity > 0,
  );

  return (
    <div className="space-y-5">
      {/* Compact Header + 4 Quick Actions */}
      <PageHeader
        title={`${greeting}, ${user?.full_name || "Staff"}`}
        subtitle={currentDateText}
        actions={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <Button onClick={() => navigate("/orders/new")} data-testid="qa-new-order">
              <FilePlus2 className="h-4 w-4" />
              New Order
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/clients?action=new")}
              data-testid="qa-add-client"
            >
              <UserPlus className="h-4 w-4" />
              Add Client
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const firstAssignable = assignableLanyards[0];
                if (assignableLanyards.length === 1 && firstAssignable) {
                  navigate(
                    `/orders/${firstAssignable.order_id}?tab=assembly&item=${firstAssignable.order_item_id}`,
                  );
                } else if (assignableLanyards.length > 1) {
                  setIsAssignPickerOpen(true);
                } else {
                  navigate("/labour");
                }
              }}
              data-testid="qa-assign-labour"
            >
              <HardHat className="h-4 w-4" />
              Assign Labour
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/stock?action=stock-in")}
              data-testid="qa-stock-in"
            >
              <PackagePlus className="h-4 w-4" />
              Stock In
            </Button>
          </div>
        }
      />

      {/* Work Overview: 4 Real Counts */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link
          to="/orders"
          className="rounded-[10px] border border-slate-200 bg-white p-4 transition-colors hover:border-blue-300"
        >
          <div className="flex items-center justify-between text-[13px] font-medium text-slate-600">
            <span>Active Orders</span>
            <FileSpreadsheet className="h-4 w-4 text-blue-700" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900">
            {ordersData ? activeOrdersCount : "—"}
          </p>
        </Link>

        <Link
          to="/orders"
          className="rounded-[10px] border border-slate-200 bg-white p-4 transition-colors hover:border-blue-300"
        >
          <div className="flex items-center justify-between text-[13px] font-medium text-slate-600">
            <span>Orders in Production</span>
            <Printer className="h-4 w-4 text-blue-700" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900">
            {productionOverview || productionQueueData ? inProductionCount : "—"}
          </p>
        </Link>

        <Link
          to="/labour"
          className="rounded-[10px] border border-slate-200 bg-white p-4 transition-colors hover:border-blue-300"
        >
          <div className="flex items-center justify-between text-[13px] font-medium text-slate-600">
            <span>Pending Assembly</span>
            <Wrench className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900">
            {productionOverview || assemblyQueueData ? pendingAssemblyCount : "—"}
          </p>
        </Link>

        <Link
          to="/dispatch"
          className="rounded-[10px] border border-slate-200 bg-white p-4 transition-colors hover:border-blue-300"
        >
          <div className="flex items-center justify-between text-[13px] font-medium text-slate-600">
            <span>Ready for Dispatch</span>
            <Truck className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900">
            {dispatchQueueData || productionOverview ? readyForDispatchCount : "—"}
          </p>
        </Link>
      </div>

      {/* Main Action Workspace: Today's Work + Pending Attention */}
      <div
        className={`grid gap-5 ${attentionItems.length > 0 ? "lg:grid-cols-3" : "grid-cols-1"}`}
      >
        <Card className={attentionItems.length > 0 ? "lg:col-span-2" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-blue-700" />
              Today&apos;s Work
            </CardTitle>
            <Link to="/orders" className="text-[13px] font-medium text-blue-700 hover:underline">
              All Orders &rarr;
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {todaysWork.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                <p className="mt-2 text-sm font-medium text-slate-800">
                  No pending tasks right now
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead className="border-b border-slate-200 bg-slate-50/80">
                    <tr>
                      <th className="h-10 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Order
                      </th>
                      <th className="h-10 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Client &amp; Item
                      </th>
                      <th className="h-10 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Next Step
                      </th>
                      <th className="h-10 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {todaysWork.map((task) => (
                      <tr key={task.id} className="hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[13px] font-semibold text-slate-900">
                          {task.orderNumber}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-slate-900">{task.itemName}</p>
                          <p className="text-[12.5px] text-slate-500">
                            {task.clientName} &bull; {task.quantityLabel}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={task.stageVariant}>{task.stageLabel}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Link
                            to={task.to}
                            className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-slate-200 bg-white px-3 text-[13px] font-medium text-blue-700 hover:bg-blue-50"
                          >
                            {task.actionLabel}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {attentionItems.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Pending Attention ({attentionItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {attentionItems.map((item) => (
                <Link
                  key={item.id}
                  to={item.to}
                  className="block rounded-[8px] border border-slate-200 bg-slate-50/60 p-3 transition-colors hover:border-blue-300 hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={item.tone}>{item.category}</Badge>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <p className="mt-1.5 text-[13.5px] font-semibold text-slate-900">{item.summary}</p>
                  <p className="mt-0.5 text-[12.5px] text-slate-600">{item.detail}</p>
                </Link>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Recent Orders */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-blue-700" />
            Recent Orders
          </CardTitle>
          <Link to="/orders" className="text-[13px] font-medium text-blue-700 hover:underline">
            View All ({ordersData?.count ?? 0}) &rarr;
          </Link>
        </CardHeader>
        <CardContent>
          {isOrdersLoading ? (
            <div className="py-6 text-center">
              <Spinner label="Loading recent orders..." />
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[8px] border border-dashed border-slate-200 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">No orders created yet.</p>
              <Button size="sm" className="mt-3" onClick={() => navigate("/orders/new")}>
                <FilePlus2 className="h-4 w-4" />
                Create First Order
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="whitespace-nowrap font-mono font-semibold text-blue-700">
                      <Link to={`/orders/${order.id}`} className="hover:underline">
                        {order.order_number}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {order.client_name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-slate-600">
                      {order.order_date}
                    </TableCell>
                    <TableCell className="text-slate-700">
                      {order.items_summary
                        .map((i) => `${i.item_name} (${i.ordered_quantity.toLocaleString("en-IN")})`)
                        .join(", ")}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={getOrderStatusBadgeVariant(order.status)}>
                          {order.status_label}
                        </Badge>
                        <span className="font-mono text-[12.5px] text-slate-500">
                          {order.total_dispatched_quantity.toLocaleString("en-IN")}/
                          {order.total_ordered_quantity.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        to={`/orders/${order.id}`}
                        className="inline-flex h-8 items-center rounded-[8px] border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isAssignPickerOpen}
        onOpenChange={setIsAssignPickerOpen}
        title="Assign Labour — Select Lanyard Item"
        description="Choose an order item needing assembly assignment."
      >
        <div className="space-y-2">
          {assignableLanyards.map((q) => (
            <button
              key={q.order_item_id}
              type="button"
              onClick={() => {
                setIsAssignPickerOpen(false);
                navigate(`/orders/${q.order_id}?tab=assembly&item=${q.order_item_id}`);
              }}
              className="flex w-full items-center justify-between rounded-[8px] border border-slate-200 px-3.5 py-2.5 text-left text-sm hover:border-blue-300 hover:bg-blue-50/40"
            >
              <div>
                <p className="font-semibold text-slate-900">
                  {q.order_number} &bull; {q.item_name}
                </p>
                <p className="text-[12.5px] text-slate-500">
                  {q.client_name} &bull; {q.lanyard_size_name}
                </p>
              </div>
              <Badge variant="warning">{q.unassigned_quantity} unassigned</Badge>
            </button>
          ))}
        </div>
      </Dialog>
    </div>
  );
}
