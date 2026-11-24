import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Building2,
  FilePlus2,
  Plus,
} from "lucide-react";
import { clientService } from "@/services/clientService";
import { ApiClientError } from "@/services/apiClient";
import { useUiShellStore } from "@/hooks/useToastStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, SearchInput } from "@/components/ui/input";
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
import type { ClientRecord } from "@/types/clients";

export function ClientsListPage(): React.ReactElement {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const addToast = useUiShellStore((state) => state.addToast);

  const [searchQuery, setSearchQuery] = React.useState("");
  const [archiveFilter, setArchiveFilter] = React.useState<"active" | "all" | "archived">("active");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  // Create client dialog state
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  React.useEffect(() => {
    if (searchParams.get("action") === "new") {
      setIsCreateOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [newClientName, setNewClientName] = React.useState("");
  const [createError, setCreateError] = React.useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["clients", "list", { search: searchQuery, archiveFilter, page, pageSize }],
    queryFn: () =>
      clientService.listClients({
        search: searchQuery.trim() || undefined,
        include_archived: archiveFilter === "all" ? true : undefined,
        is_archived: archiveFilter === "archived" ? true : archiveFilter === "active" ? false : undefined,
        page,
        page_size: pageSize,
      }),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => clientService.createClient({ name }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      addToast({
        title: "Client Created",
        description: `'${created.name}' has been added to the client directory.`,
        variant: "success",
      });
      setIsCreateOpen(false);
      setNewClientName("");
      setCreateError(null);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setCreateError(err.message);
      } else {
        setCreateError("Could not create client. Please try again.");
      }
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ client, archive }: { client: ClientRecord; archive: boolean }) =>
      clientService.updateClient(client.id, {
        is_archived: archive,
        archive_reason: archive ? "Archived from client directory" : "",
      }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      addToast({
        title: updated.is_archived ? "Client Archived" : "Client Restored",
        description: `'${updated.name}' is now ${updated.is_archived ? "archived" : "active"}.`,
        variant: "default",
      });
    },
  });

  const handleCreateSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError(null);
    const trimmed = newClientName.trim();
    if (!trimmed) {
      setCreateError("Client name is required.");
      return;
    }
    createMutation.mutate(trimmed);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients"
        subtitle="Manage client records, order history, and quantities"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/orders/new")}>
              <FilePlus2 className="h-4 w-4" />
              New Order
            </Button>
            <Button
              onClick={() => {
                setNewClientName("");
                setCreateError(null);
                setIsCreateOpen(true);
              }}
              data-testid="open-create-client-dialog"
            >
              <Plus className="h-4 w-4" />
              Add Client
            </Button>
          </>
        }
      />

      {/* Search & Status Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="w-full sm:max-w-sm">
              <SearchInput
                placeholder="Search by client name..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                onClear={() => {
                  setSearchQuery("");
                  setPage(1);
                }}
                aria-label="Search clients by name"
              />
            </div>

            <div className="flex items-center gap-1.5">
              {(["active", "all", "archived"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setArchiveFilter(mode);
                    setPage(1);
                  }}
                  className={`rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    archiveFilter === mode
                      ? "border border-blue-200 bg-blue-50 text-blue-800"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {mode === "active"
                    ? "Active Clients"
                    : mode === "all"
                      ? "All Clients"
                      : "Archived"}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center">
              <Spinner label="Loading clients directory..." />
            </div>
          ) : isError || !data ? (
            <p className="py-6 text-center text-sm text-red-600">
              Unable to load clients directory. Please refresh.
            </p>
          ) : data.results.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50/50 py-10 text-center">
              <Building2 className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-800">No matching clients found</p>
              <p className="mt-1 text-[13px] text-slate-500">
                {searchQuery
                  ? `No client matched "${searchQuery}". Add it now or create inline during order entry.`
                  : "Add a client or create one during order entry."}
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setNewClientName(searchQuery.trim());
                    setCreateError(null);
                    setIsCreateOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create Client{searchQuery.trim() ? ` "${searchQuery.trim()}"` : ""}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client Name</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Ordered Qty</TableHead>
                    <TableHead>Dispatched Qty</TableHead>
                    <TableHead>Last Order Date</TableHead>
                    <TableHead>Created Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.results.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <Link
                          to={`/clients/${client.id}`}
                          className="font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                        >
                          {client.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-[13.5px]">
                        <span className="font-semibold text-slate-900">{client.order_count}</span>
                        {client.replacement_order_count > 0 ? (
                          <span className="ml-1.5 text-[12px] text-slate-500">
                            ({client.original_order_count} orig, {client.replacement_order_count} repl)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-[13.5px] text-slate-800">
                        {client.total_ordered_quantity.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="font-mono text-[13.5px] text-slate-700">
                        {client.total_dispatched_quantity.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-[13px] text-slate-600">
                        {client.last_order_date || "No orders yet"}
                      </TableCell>
                      <TableCell className="text-[13px] text-slate-500">
                        {formatDateTimeIST(client.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={client.is_archived ? "warning" : "success"}>
                          {client.is_archived ? "Archived" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Link
                            to={`/clients/${client.id}`}
                            className="rounded-[6px] border border-slate-200 bg-white px-2.5 py-1 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Profile
                          </Link>
                          {!client.is_archived ? (
                            <Link
                              to={`/orders/new?clientId=${client.id}`}
                              className="rounded-[6px] border border-blue-200 bg-blue-50 px-2.5 py-1 text-[13px] font-medium text-blue-800 hover:bg-blue-100"
                            >
                              + Order
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              archiveMutation.mutate({
                                client,
                                archive: !client.is_archived,
                              })
                            }
                            className="rounded-[6px] border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            title={client.is_archived ? "Restore Client" : "Archive Client"}
                            aria-label={client.is_archived ? `Restore ${client.name}` : `Archive ${client.name}`}
                          >
                            {client.is_archived ? (
                              <ArchiveRestore className="h-3.5 w-3.5 text-emerald-700" />
                            ) : (
                              <Archive className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
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

      {/* Add Client Dialog */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="Add New Client"
        description="Duplicate names are detected automatically across case and spacing."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4" noValidate>
          {createError ? (
            <div
              className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700"
              role="alert"
            >
              {createError}
            </div>
          ) : null}

          <FormField
            id="new-client-name"
            label="Client Name"
            required
            hint="e.g. ABC Public School, St. Xavier College, Metro Corporate Services"
          >
            <Input
              id="new-client-name"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="Enter client name"
              autoFocus
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Save Client"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
