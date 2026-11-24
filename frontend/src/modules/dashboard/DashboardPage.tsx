import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  FilePlus2,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { orderService } from "@/services/orderService";
import { clientService } from "@/services/clientService";
import { productionService } from "@/services/productionService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function DashboardPage(): React.ReactElement {
  const { user } = useAuth();
  const navigate = useNavigate();
  const currentDateText = React.useMemo(() => formatCurrentBusinessDate(), []);
  const greeting = React.useMemo(() => getTimeGreeting(), []);

  const { data: ordersData, isLoading: isOrdersLoading } = useQuery({
    queryKey: ["orders", "dashboard-recent"],
    queryFn: async () =>
      (await orderService.listOrders({ page_size: 20 })) ?? { count: 0, results: [] },
    staleTime: 30_000,
  });

  const { data: clientsData } = useQuery({
    queryKey: ["clients", "dashboard-count"],
    queryFn: async () =>
      (await clientService.listClients({ page_size: 1 })) ?? { count: 0, results: [] },
    staleTime: 30_000,
  });

  const { data: productionOverview } = useQuery({
    queryKey: ["production", "overview"],
    queryFn: async () => (await productionService.getOverview()) ?? null,
    enabled: Boolean(user?.permissions.includes("production.view") ?? true),
    staleTime: 30_000,
  });

  const { data: productionQueueData, isLoading: isQueueLoading } = useQuery({
    queryKey: ["production", "dashboard-queue"],
    queryFn: async () => (await productionService.listQueue({ page_size: 15 })) ?? { results: [] },
    staleTime: 30_000,
  });

  const allOrders = ordersData?.results || [];
  const activeOrdersCount = allOrders.filter(
    (o) => o.status !== "completed" && o.status !== "cancelled",
  ).length;
  const completedOrdersCount = allOrders.filter((o) => o.status === "completed").length;
  const recentOrders = allOrders.slice(0, 6);

  const productionJobs = productionQueueData?.results || [];
  const activeJobs = productionJobs.filter((j) => !j.is_production_completed);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={`${greeting}, ${user?.full_name || "User"}`}
        subtitle={`Adarsh ID Cards operations summary for ${currentDateText}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/orders/replacements/new")}
              data-testid="qa-new-replacement"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              New Replacement
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate("/clients")}
              data-testid="qa-add-client"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Clients Directory
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/orders/new")}
              data-testid="qa-new-order"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              New Original Order
            </Button>
          </div>
        }
      />

      {/* 4 Primary Operational Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:border-slate-300 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Active Orders
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-blue-50 text-blue-700">
                <FileSpreadsheet className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              {activeOrdersCount}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {allOrders.length} total recorded order(s)
            </p>
          </CardContent>
        </Card>

        <Card className="hover:border-slate-300 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Registered Clients
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-slate-100 text-slate-700">
                <Building2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              {clientsData?.count ?? 0}
            </div>
            <p className="mt-1 text-xs text-slate-500">Active customer profiles</p>
          </CardContent>
        </Card>

        <Card className="hover:border-slate-300 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Jobs in Production
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-amber-50 text-amber-700">
                <Printer className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-amber-900">
              {productionOverview?.incomplete_production ?? activeJobs.length}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {productionOverview?.currently_printing ?? 0} currently printing
            </p>
          </CardContent>
        </Card>

        <Card className="hover:border-slate-300 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Completed Orders
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-900">
              {completedOrdersCount}
            </div>
            <p className="mt-1 text-xs text-slate-500">Fulfilled orders</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Recent Orders & Production Queue */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Recent Orders Table (8 cols on lg) */}
        <div className="lg:col-span-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <div>
                <CardTitle className="text-[15px] font-semibold text-slate-900">
                  Recent Orders
                </CardTitle>
                <p className="text-xs text-slate-500">
                  Latest customer orders and linked replacements
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/orders")}
                className="text-xs"
              >
                View All Orders
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {isOrdersLoading ? (
                <div className="py-12 text-center">
                  <Spinner label="Loading recent orders..." />
                </div>
              ) : recentOrders.length === 0 ? (
                <div className="py-12 text-center">
                  <FileSpreadsheet className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm font-medium text-slate-700">No orders placed yet</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Create your first original order to begin operations.
                  </p>
                  <div className="mt-4">
                    <Button size="sm" onClick={() => navigate("/orders/new")}>
                      <FilePlus2 className="h-3.5 w-3.5" />
                      Create Order
                    </Button>
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Order #</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-xs font-semibold text-blue-700">
                          <Link to={`/orders/${order.id}`} className="hover:underline">
                            {order.order_number}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs font-medium text-slate-900">
                          <Link to={`/clients/${order.client}`} className="hover:underline">
                            {order.client_name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={order.order_type === "replacement" ? "warning" : "neutral"}
                            className="text-[11px]"
                          >
                            {order.order_type === "replacement" ? "Replacement" : "Original"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {order.total_ordered_quantity.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={getOrderStatusBadgeVariant(order.status)}
                            className="text-[11px]"
                          >
                            {order.status_label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => navigate(`/orders/${order.id}`)}
                          >
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Active Production Queue (4 cols on lg) */}
        <div className="lg:col-span-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <div>
                <CardTitle className="text-[15px] font-semibold text-slate-900">
                  Production Queue
                </CardTitle>
                <p className="text-xs text-slate-500">
                  Active ID card and lanyard printing runs
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/production")}
                className="text-xs"
                data-testid="qa-production"
              >
                Production
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {isQueueLoading ? (
                <div className="py-8 text-center">
                  <Spinner label="Loading production jobs..." />
                </div>
              ) : activeJobs.length === 0 ? (
                <div className="py-8 text-center">
                  <Printer className="mx-auto h-7 w-7 text-slate-300" />
                  <p className="mt-2 text-xs font-medium text-slate-600">
                    No active production jobs in queue
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activeJobs.slice(0, 5).map((job) => (
                    <div key={job.id} className="p-3.5 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <Link
                          to={`/orders/${job.item.order_id}?tab=production&item=${job.order_item}`}
                          className="font-mono text-xs font-semibold text-blue-700 hover:underline"
                        >
                          {job.item.order_number}
                        </Link>
                        <Badge
                          variant={job.printing_status === "completed" ? "success" : "default"}
                          className="text-[10.5px]"
                        >
                          {job.printing_status_label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs font-medium text-slate-800 truncate">
                        {job.item.item_name}
                      </p>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{job.item.client_name}</span>
                        <span className="font-mono">
                          {job.successful_printed_quantity} / {job.required_quantity} pcs
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
