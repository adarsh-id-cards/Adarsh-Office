import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FilePlus2,
  FileSpreadsheet,
  RefreshCw,
} from "lucide-react";
import { orderService } from "@/services/orderService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchInput } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/PageHeader";
import type { OrderStatus, OrderType } from "@/types/orders";

export function getOrderStatusBadgeVariant(
  status: OrderStatus,
): "default" | "neutral" | "success" | "warning" | "destructive" {
  switch (status) {
    case "completed":
      return "success";
    case "confirmed":
    case "in_progress":
      return "default";
    case "partially_completed":
      return "warning";
    case "cancelled":
      return "destructive";
    default:
      return "neutral";
  }
}

export function OrdersListPage(): React.ReactElement {
  const navigate = useNavigate();

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<OrderStatus | "">("");
  const [orderTypeFilter, setOrderTypeFilter] = React.useState<OrderType | "">("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "orders",
      "list",
      { search, statusFilter, orderTypeFilter, dateFrom, dateTo, page, pageSize },
    ],
    queryFn: () =>
      orderService.listOrders({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        order_type: orderTypeFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        page_size: pageSize,
      }),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Orders"
        subtitle="Manage original customer orders and linked replacement orders"
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/orders/replacements/new")}>
              <RefreshCw className="h-4 w-4" />
              New Replacement Order
            </Button>
            <Button
              onClick={() => navigate("/orders/new")}
              data-testid="create-order-button"
            >
              <FilePlus2 className="h-4 w-4" />
              New Original Order
            </Button>
          </>
        }
      />

      {/* Filters Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="min-w-0 lg:col-span-2">
              <SearchInput
                placeholder="Search by order #, client name, or item..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                onClear={() => {
                  setSearch("");
                  setPage(1);
                }}
                aria-label="Search orders"
              />
            </div>

            <div className="min-w-0">
              <Select
                value={orderTypeFilter}
                onChange={(e) => {
                  setOrderTypeFilter(e.target.value as OrderType | "");
                  setPage(1);
                }}
                aria-label="Filter by order type"
              >
                <option value="">All Order Types</option>
                <option value="original">Original Orders</option>
                <option value="replacement">Replacement Orders</option>
              </Select>
            </div>

            <div className="min-w-0">
              <Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as OrderStatus | "");
                  setPage(1);
                }}
                aria-label="Filter by order status"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="confirmed">Confirmed</option>
                <option value="in_progress">In Progress</option>
                <option value="partially_completed">Partially Completed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </div>

            <div className="flex min-w-0 items-center gap-1.5 sm:col-span-2 lg:col-span-2">
              <div className="min-w-0 flex-1">
                <DatePicker
                  value={dateFrom}
                  onChange={(v) => {
                    setDateFrom(v);
                    setPage(1);
                  }}
                  placeholder="From date"
                  ariaLabel="Order date from"
                />
              </div>
              <span className="shrink-0 text-[13px] text-slate-400">to</span>
              <div className="min-w-0 flex-1">
                <DatePicker
                  value={dateTo}
                  onChange={(v) => {
                    setDateTo(v);
                    setPage(1);
                  }}
                  placeholder="To date"
                  ariaLabel="Order date to"
                  align="right"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center">
              <Spinner label="Loading orders..." />
            </div>
          ) : isError || !data ? (
            <p className="py-6 text-center text-sm text-red-600">
              Unable to load orders. Please refresh the page.
            </p>
          ) : data.results.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50/50 py-10 text-center">
              <FileSpreadsheet className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-800">No orders found</p>
              <p className="mt-1 text-[13px] text-slate-500">
                Create a new original order or adjust your search filters.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" onClick={() => navigate("/orders/new")}>
                  <FilePlus2 className="h-3.5 w-3.5" />
                  Create First Order
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Items &amp; Quantities</TableHead>
                    <TableHead>Total Qty</TableHead>
                    <TableHead>Dispatched</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.results.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link
                          to={`/orders/${order.id}`}
                          className="font-mono text-[13.5px] font-semibold text-blue-700 hover:underline"
                        >
                          {order.order_number}
                        </Link>
                        {order.original_order && order.original_order_number ? (
                          <div className="mt-0.5 text-[12px] text-slate-500">
                            Orig:{" "}
                            <Link
                              to={`/orders/${order.original_order}`}
                              className="font-mono text-blue-700 hover:underline"
                            >
                              {order.original_order_number}
                            </Link>
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={order.order_type === "replacement" ? "warning" : "neutral"}>
                          {order.order_type === "replacement" ? "Replacement" : "Original"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/clients/${order.client}`}
                          className="text-[13.5px] font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                        >
                          {order.client_name}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[13.5px] text-slate-600">
                        <div>{order.order_date}</div>
                        {order.expected_completion_date ? (
                          <div className="text-[12px] text-slate-400">
                            Due: {order.expected_completion_date}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-[13.5px] text-slate-700">
                        <div className="space-y-0.5">
                          {order.items_summary.map((item) => (
                            <div key={item.id} className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium">{item.item_name}</span>
                              <span className="text-[12px] text-slate-500">
                                ({item.category_label} &bull;{" "}
                                {item.ordered_quantity.toLocaleString("en-IN")})
                              </span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[13.5px] font-semibold text-slate-900">
                        {order.total_ordered_quantity.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="font-mono text-[13.5px] text-slate-700">
                        {order.total_dispatched_quantity.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getOrderStatusBadgeVariant(order.status)}>
                          {order.status_label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          to={`/orders/${order.id}`}
                          className="rounded-[6px] border border-slate-200 bg-white px-2.5 py-1 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Details
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Pagination
                totalCount={data.count}
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
    </div>
  );
}
