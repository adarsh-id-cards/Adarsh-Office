import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Edit3,
  FilePlus2,
  RefreshCw,
} from "lucide-react";
import { clientService } from "@/services/clientService";
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
import { formatDateTimeIST } from "@/lib/utils";
import type { OrderListItem, OrderStatus } from "@/types/orders";

function getStatusBadgeVariant(
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

export function ClientDetailPage(): React.ReactElement {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const addToast = useUiShellStore((state) => state.addToast);

  const [activeTab, setActiveTab] = React.useState<"all" | "original" | "replacement">("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [isRenameOpen, setIsRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState("");
  const [renameError, setRenameError] = React.useState<string | null>(null);

  const {
    data: client,
    isLoading: isClientLoading,
    isError: isClientError,
  } = useQuery({
    queryKey: ["clients", "detail", clientId],
    queryFn: () => clientService.getClient(clientId!),
    enabled: Boolean(clientId),
  });

  const { data: ordersData, isLoading: isOrdersLoading } = useQuery({
    queryKey: ["clients", "orders", clientId, activeTab, page, pageSize],
    queryFn: () =>
      clientService.listClientOrders(clientId!, {
        order_type: activeTab === "all" ? undefined : activeTab,
        page,
        page_size: pageSize,
      }),
    enabled: Boolean(clientId),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { name?: string; is_archived?: boolean; archive_reason?: string }) =>
      clientService.updateClient(clientId!, payload),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      addToast({
        title: "Client Updated",
        description: `Updated record for '${updated.name}'.`,
        variant: "success",
      });
      setIsRenameOpen(false);
      setRenameError(null);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setRenameError(err.message);
      } else {
        setRenameError("Unable to update client.");
      }
    },
  });

  if (isClientLoading) {
    return (
      <div className="py-12 text-center">
        <Spinner label="Loading client profile..." />
      </div>
    );
  }

  if (isClientError || !client) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Client Not Found</CardTitle>
          <CardDescription>
            The requested client profile could not be found.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={() => navigate("/clients")}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Return to Clients Directory
          </Button>
        </CardContent>
      </Card>
    );
  }

  const orders: OrderListItem[] = ordersData?.results || [];

  return (
    <div className="space-y-5">
      <PageHeader
        backLink={{ to: "/clients", label: "Clients" }}
        title={client.name}
        badge={
          <Badge variant={client.is_archived ? "warning" : "success"}>
            {client.is_archived ? "Archived" : "Active"}
          </Badge>
        }
        subtitle={`Created ${formatDateTimeIST(client.created_at)} • Last order: ${
          client.last_order_date || "None"
        }`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setRenameValue(client.name);
                setRenameError(null);
                setIsRenameOpen(true);
              }}
            >
              <Edit3 className="h-4 w-4" />
              Rename
            </Button>

            <Button
              variant="outline"
              onClick={() =>
                updateMutation.mutate({
                  is_archived: !client.is_archived,
                  archive_reason: !client.is_archived ? "Archived from client profile" : "",
                })
              }
            >
              {client.is_archived ? (
                <>
                  <ArchiveRestore className="h-4 w-4 text-emerald-700" />
                  Restore Client
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4" />
                  Archive
                </>
              )}
            </Button>

            {!client.is_archived ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/orders/replacements/new?clientId=${client.id}`)}
                >
                  <RefreshCw className="h-4 w-4" />
                  New Replacement
                </Button>
                <Button onClick={() => navigate(`/orders/new?clientId=${client.id}`)}>
                  <FilePlus2 className="h-4 w-4" />
                  New Original Order
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {/* Quantity & Order Summary Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-[13px] font-medium text-slate-500">Total Associated Orders</p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900">{client.order_count}</p>
            <p className="mt-1 text-[12.5px] text-slate-500">
              {client.original_order_count} Original &bull; {client.replacement_order_count}{" "}
              Replacement
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[13px] font-medium text-slate-500">Original Ordered Qty</p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
              {client.total_original_ordered_quantity.toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-[12.5px] text-slate-500">Across active original orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[13px] font-medium text-slate-500">Replacement Ordered Qty</p>
            <p className="mt-1 font-mono text-2xl font-bold text-amber-800">
              {client.total_replacement_ordered_quantity.toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-[12.5px] text-slate-500">Tracked separately from originals</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[13px] font-medium text-slate-500">Total Dispatched Qty</p>
            <p className="mt-1 font-mono text-2xl font-bold text-emerald-800">
              {client.total_dispatched_quantity.toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-[12.5px] text-slate-500">Original &amp; replacement dispatches</p>
          </CardContent>
        </Card>
      </div>

      {/* Order History Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <CardTitle>Order History</CardTitle>
              <CardDescription>
                Original and linked replacement orders for {client.name}
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "all", label: `All Orders (${client.order_count})` },
                  { id: "original", label: `Original (${client.original_order_count})` },
                  { id: "replacement", label: `Replacements (${client.replacement_order_count})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setPage(1);
                  }}
                  className={`rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    activeTab === tab.id
                      ? "border border-blue-200 bg-blue-50 text-blue-800"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isOrdersLoading ? (
            <div className="py-8 text-center">
              <Spinner label="Loading client order history..." />
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50/50 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">
                No {activeTab === "all" ? "" : activeTab} orders recorded for this client yet.
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Items Summary</TableHead>
                    <TableHead>Ordered Qty</TableHead>
                    <TableHead>Dispatched Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
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
                            Ref:{" "}
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
                          {order.order_type_label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[13.5px] text-slate-700">{order.order_date}</TableCell>
                      <TableCell className="text-[13.5px] text-slate-600">
                        {order.items_summary.map((it) => (
                          <div key={it.id}>
                            {it.item_name} ({it.ordered_quantity.toLocaleString("en-IN")})
                          </div>
                        ))}
                      </TableCell>
                      <TableCell className="font-mono text-[13.5px] text-slate-800">
                        {order.total_ordered_quantity.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="font-mono text-[13.5px] text-slate-700">
                        {order.total_dispatched_quantity.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(order.status)}>
                          {order.status_label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          to={`/orders/${order.id}`}
                          className="rounded-[6px] border border-slate-200 bg-white px-2.5 py-1 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          View Order
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Pagination
                totalCount={ordersData?.count ?? orders.length}
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

      {/* Rename Client Dialog */}
      <Dialog
        open={isRenameOpen}
        onOpenChange={setIsRenameOpen}
        title="Rename Client"
        description="Update the display name for this client."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setRenameError(null);
            if (!renameValue.trim()) {
              setRenameError("Client name cannot be empty.");
              return;
            }
            updateMutation.mutate({ name: renameValue.trim() });
          }}
          className="space-y-4"
        >
          {renameError ? (
            <div className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {renameError}
            </div>
          ) : null}
          <FormField id="rename-client-input" label="Client Name" required>
            <Input
              id="rename-client-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              Save Name
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
