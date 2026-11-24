import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  Cpu,
  HardHat,
  Info,
  Package,
  Phone,
  Plus,
  UserCheck,
  UserX,
  Wrench,
} from "lucide-react";
import { phase4Service } from "@/services/phase4Service";
import { ApiClientError } from "@/services/apiClient";
import { useUiShellStore } from "@/hooks/useToastStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { MachinesPanel } from "@/modules/machines/MachinesPage";

type LabourTab = "labourers" | "assignments" | "machines";

export function LabourPage({
  defaultTab = "labourers",
}: {
  defaultTab?: LabourTab;
}): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const addToast = useUiShellStore((s) => s.addToast);

  const tabFromUrl = searchParams.get("tab") as LabourTab | null;
  const [activeTab, setActiveTab] = React.useState<LabourTab>(tabFromUrl || defaultTab);

  React.useEffect(() => {
    setActiveTab(tabFromUrl || defaultTab);
  }, [tabFromUrl, defaultTab]);

  const switchTab = (next: LabourTab) => {
    setActiveTab(next);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const [assignmentPage, setAssignmentPage] = React.useState(1);
  const [assignmentPageSize, setAssignmentPageSize] = React.useState(20);

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [contactNumber, setContactNumber] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["labourers", { search, statusFilter }],
    queryFn: () =>
      phase4Service.listLabourers({
        search: search.trim() || undefined,
        is_active:
          statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined,
      }),
  });

  const { data: assignmentsData, isLoading: isAssignmentsLoading } = useQuery({
    queryKey: ["assembly", "assignments", "labour-tab"],
    queryFn: () => phase4Service.listAssignments(),
    enabled: activeTab === "assignments",
  });

  const createMutation = useMutation({
    mutationFn: () =>
      phase4Service.createLabourer({
        name: name.trim(),
        contact_number: contactNumber.trim(),
        is_active: true,
        notes: notes.trim(),
      }),
    onSuccess: (created) => {
      setIsCreateOpen(false);
      setName("");
      setContactNumber("");
      setNotes("");
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["labourers"] });
      addToast({
        title: "Labourer Added",
        description: `${created.name} added to office-managed directory.`,
        variant: "success",
      });
    },
    onError: (err) => {
      setFormError(err instanceof ApiClientError ? err.message : "Failed to create labourer.");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      phase4Service.updateLabourer(id, { is_active }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["labourers"] });
    },
  });

  const labourers = data?.results || [];
  const activeCount = labourers.filter((l) => l.is_active).length;
  const assignments = assignmentsData?.results || [];

  const slicedLabourers = labourers.slice((page - 1) * pageSize, page * pageSize);
  const slicedAssignments = assignments.slice(
    (assignmentPage - 1) * assignmentPageSize,
    assignmentPage * assignmentPageSize,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Labour & Machines"
        subtitle="Manage labourers, physical machines, assembly returns, and seasonal recovery."
        badge={<Badge variant="default">{activeCount} Active</Badge>}
        actions={
          <Button
            onClick={() => {
              setFormError(null);
              setIsCreateOpen(true);
            }}
            data-testid="open-create-labourer-btn"
          >
            <Plus className="h-4 w-4" />
            Add Labourer
          </Button>
        }
      />

      {/* Sub-Navigation Tabs: Labourers | Work Assignments | Machines */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
        <Button
          size="sm"
          variant={activeTab === "labourers" ? "default" : "outline"}
          onClick={() => switchTab("labourers")}
          data-testid="labour-tab-labourers"
        >
          <HardHat className="h-3.5 w-3.5" />
          Labourers ({labourers.length})
        </Button>
        <Button
          size="sm"
          variant={activeTab === "assignments" ? "default" : "outline"}
          onClick={() => switchTab("assignments")}
          data-testid="labour-tab-assignments"
        >
          <Wrench className="h-3.5 w-3.5" />
          Work Assignments &amp; Returns
        </Button>
        <Button
          size="sm"
          variant={activeTab === "machines" ? "default" : "outline"}
          onClick={() => switchTab("machines")}
          data-testid="labour-tab-machines"
        >
          <Cpu className="h-3.5 w-3.5" />
          Machines
        </Button>
      </div>

      {activeTab === "labourers" ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-[10px] border border-blue-200 bg-blue-50/60 px-3.5 py-2.5 text-[13px] text-blue-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
            <p>
              <strong>Office-Managed Directory:</strong> Labourers do not log in. Open any profile
              to check material balances or record seasonal closing.
            </p>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex-1">
                <SearchInput
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  onClear={() => {
                    setSearch("");
                    setPage(1);
                  }}
                  placeholder="Search labourer by name or contact..."
                  aria-label="Search labourer"
                />
              </div>
              <div className="flex gap-1.5">
                {(["all", "active", "inactive"] as const).map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={statusFilter === st ? "default" : "outline"}
                    onClick={() => {
                      setStatusFilter(st);
                      setPage(1);
                    }}
                    className="capitalize"
                  >
                    {st}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Labourers Directory ({labourers.length})</CardTitle>
              <CardDescription>
                Open a profile to inspect balances, active work, or perform seasonal closing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-10 text-center">
                  <Spinner label="Loading labourers..." />
                </div>
              ) : labourers.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  No labourers found matching the current filter.
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Labourer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Allocated Machines</TableHead>
                        <TableHead>Retained Materials</TableHead>
                        <TableHead>Active Jobs</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {slicedLabourers.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>
                            <Link
                              to={`/labour/${l.id}`}
                              className="font-semibold text-blue-700 hover:underline"
                            >
                              {l.name}
                            </Link>
                            {l.contact_number ? (
                              <p className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-500">
                                <Phone className="h-3 w-3" />
                                {l.contact_number}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Badge variant={l.is_active ? "success" : "neutral"}>
                              {l.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {l.allocated_machines.length === 0 ? (
                              <span className="text-[13px] text-slate-400">No machine</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {l.allocated_machines.map((m) => (
                                  <Badge key={m.id} variant="default" className="font-mono">
                                    <Cpu className="h-3 w-3" />
                                    {m.machine_code} ({m.supported_size_label})
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {l.material_balances.filter((b) => b.usable_quantity > 0).length === 0 ? (
                              <span className="text-[13px] text-slate-400">Zero balance</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {l.material_balances
                                  .filter((b) => b.usable_quantity > 0 || b.defective_quantity > 0)
                                  .map((b) => (
                                    <span
                                      key={b.id}
                                      className="inline-flex items-center gap-1 rounded-[6px] border border-slate-200 bg-slate-50 px-2 py-0.5 text-[12px] text-slate-700"
                                    >
                                      <Package className="h-3 w-3 text-slate-500" />
                                      {b.material_name}:{" "}
                                      <strong className="font-mono">
                                        {b.usable_quantity.toLocaleString("en-IN")}
                                      </strong>
                                    </span>
                                  ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-[13.5px] font-semibold">
                            {l.active_assignments_count}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1.5">
                              <Link
                                to={`/labour/${l.id}`}
                                className="rounded-[6px] border border-slate-300 px-2.5 py-1 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Profile &amp; Recovery
                              </Link>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  toggleActiveMutation.mutate({ id: l.id, is_active: !l.is_active })
                                }
                              >
                                {l.is_active ? (
                                  <>
                                    <UserX className="h-3 w-3" />
                                    Deactivate
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="h-3 w-3" />
                                    Activate
                                  </>
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Pagination
                    totalCount={labourers.length}
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
      ) : null}

      {activeTab === "assignments" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Assembly Assignments &amp; Returns</CardTitle>
            <CardDescription>
              Open the linked order to record returns, issue materials, or reconcile balances.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isAssignmentsLoading ? (
              <div className="py-8 text-center">
                <Spinner label="Loading assignments..." />
              </div>
            ) : assignments.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No lanyard assembly assignments recorded yet.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assignment</TableHead>
                      <TableHead>Labourer</TableHead>
                      <TableHead>Order &amp; Item</TableHead>
                      <TableHead>Assigned / Usable / Def / Pending</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slicedAssignments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono text-[13.5px] font-semibold text-slate-900">
                          {a.assignment_code}
                        </TableCell>
                        <TableCell className="text-[13.5px] font-medium text-slate-800">
                          {a.labourer ? (
                            <Link to={`/labour/${a.labourer}`} className="text-blue-700 hover:underline">
                              {a.labourer_name}
                            </Link>
                          ) : (
                            "Internal Office"
                          )}
                        </TableCell>
                        <TableCell className="text-[13.5px]">
                          <span className="font-mono font-semibold">{a.order_number}</span> &bull;{" "}
                          {a.item_name}
                        </TableCell>
                        <TableCell className="font-mono text-[13.5px]">
                          {a.assigned_quantity} /{" "}
                          <span className="text-emerald-800">{a.received_usable_quantity}</span> /{" "}
                          <span className="text-red-700">{a.received_defective_quantity}</span> /{" "}
                          <strong className="text-amber-800">{a.pending_quantity}</strong>
                        </TableCell>
                        <TableCell>
                          <Badge variant={a.pending_quantity === 0 ? "success" : "warning"}>
                            {a.status_display}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            to={`/orders/${a.order_id}?tab=assembly`}
                            className="inline-flex items-center gap-1 rounded-[6px] border border-slate-200 px-2.5 py-1 text-[13px] font-medium text-blue-700 hover:bg-blue-50"
                          >
                            Order
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Pagination
                  totalCount={assignments.length}
                  page={assignmentPage}
                  pageSize={assignmentPageSize}
                  onPageChange={setAssignmentPage}
                  onPageSizeChange={(next) => {
                    setAssignmentPageSize(next);
                    setAssignmentPage(1);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "machines" ? <MachinesPanel embedded /> : null}

      {/* Add Labourer Dialog */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="Add New Labourer"
        description="Store labourer name and contact details. Labourers do not have login access."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            createMutation.mutate();
          }}
          className="space-y-4"
        >
          {formError ? (
            <div className="flex items-start gap-2 rounded-[8px] border border-red-200 bg-red-50 p-2.5 text-[13px] text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          ) : null}

          <FormField id="labourer-name" label="Labourer Name" required>
            <Input
              id="labourer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              required
            />
          </FormField>

          <FormField id="labourer-contact" label="Contact Number (Optional)">
            <Input
              id="labourer-contact"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              placeholder="e.g. 9876543210"
            />
          </FormField>

          <FormField id="labourer-notes" label="Notes (Optional)">
            <Input
              id="labourer-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Home assembly specialist"
            />
          </FormField>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !name.trim()}
              data-testid="submit-create-labourer-btn"
            >
              {createMutation.isPending ? "Saving..." : "Save Labourer"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
