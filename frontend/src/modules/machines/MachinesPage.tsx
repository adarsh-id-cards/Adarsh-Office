import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRightLeft,
  Plus,
  RotateCcw,
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
import { FormField } from "@/components/forms/FormField";
import { PageHeader } from "@/components/shared/PageHeader";
import type { MachineRecord } from "@/types/phase4";

export function MachinesPanel({ embedded = false }: { embedded?: boolean }): React.ReactElement {
  const queryClient = useQueryClient();
  const addToast = useUiShellStore((s) => s.addToast);

  const [sizeFilter, setSizeFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [isAddOpen, setIsAddOpen] = React.useState(false);

  const [machineCode, setMachineCode] = React.useState("");
  const [machineName, setMachineName] = React.useState("");
  const [machineType, setMachineType] = React.useState("Lanyard Fitting & Assembly Press");
  const [supportedSize, setSupportedSize] = React.useState("16 mm");
  const [formError, setFormError] = React.useState<string | null>(null);

  const [allocateTarget, setAllocateTarget] = React.useState<MachineRecord | null>(null);
  const [selectedLabourerId, setSelectedLabourerId] = React.useState("");
  const [allocNotes, setAllocNotes] = React.useState("");
  const [allocError, setAllocError] = React.useState<string | null>(null);

  const [returnTarget, setReturnTarget] = React.useState<MachineRecord | null>(null);
  const [returnCondition, setReturnCondition] = React.useState<
    "good" | "maintenance_required" | "damaged"
  >("good");
  const [returnNotes, setReturnNotes] = React.useState("");

  const { data: machinesData, isLoading } = useQuery({
    queryKey: ["machines", { sizeFilter, statusFilter }],
    queryFn: () =>
      phase4Service.listMachines({
        supported_size: sizeFilter || undefined,
        status: statusFilter || undefined,
      }),
  });

  const { data: labourersData } = useQuery({
    queryKey: ["labourers", { is_active: true }],
    queryFn: () => phase4Service.listLabourers({ is_active: true }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      phase4Service.createMachine({
        machine_code: machineCode.trim(),
        name: machineName.trim(),
        machine_type: machineType.trim(),
        supported_size_label: supportedSize.trim(),
      }),
    onSuccess: (created) => {
      setIsAddOpen(false);
      setMachineCode("");
      setMachineName("");
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["machines"] });
      addToast({
        title: `Machine ${created.machine_code} Registered`,
        description: `Supports ${created.supported_size_label} lanyards.`,
        variant: "success",
      });
    },
    onError: (err) => {
      setFormError(err instanceof ApiClientError ? err.message : "Could not register machine.");
    },
  });

  const allocateMutation = useMutation({
    mutationFn: () =>
      phase4Service.allocateMachine(allocateTarget!.id, {
        labourer: selectedLabourerId,
        notes: allocNotes.trim(),
      }),
    onSuccess: (updated) => {
      setAllocateTarget(null);
      setSelectedLabourerId("");
      setAllocNotes("");
      setAllocError(null);
      void queryClient.invalidateQueries({ queryKey: ["machines"] });
      void queryClient.invalidateQueries({ queryKey: ["labourers"] });
      addToast({
        title: `Allocated ${updated.machine_code}`,
        description: `Now held by ${updated.current_holder_name}.`,
        variant: "success",
      });
    },
    onError: (err) => {
      setAllocError(
        err instanceof ApiClientError ? err.message : "Could not allocate machine.",
      );
    },
  });

  const returnMutation = useMutation({
    mutationFn: () =>
      phase4Service.returnMachine(returnTarget!.id, {
        return_condition: returnCondition,
        notes: returnNotes.trim(),
      }),
    onSuccess: (updated) => {
      setReturnTarget(null);
      setReturnNotes("");
      void queryClient.invalidateQueries({ queryKey: ["machines"] });
      void queryClient.invalidateQueries({ queryKey: ["labourers"] });
      addToast({
        title: `Returned ${updated.machine_code}`,
        description: `Status updated to ${updated.status_display}.`,
        variant: "success",
      });
    },
  });

  const machines = machinesData?.results || [];
  const summary = machinesData?.summary || {};
  const activeLabourers = labourersData?.results || [];

  const slicedMachines = machines.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-5">
      {!embedded ? (
        <PageHeader
          title="Physical Machine Register"
          subtitle="Track assembly presses by supported lanyard width, current holder, and office returns."
          actions={
            <Button
              onClick={() => {
                setFormError(null);
                setIsAddOpen(true);
              }}
              data-testid="open-add-machine-btn"
            >
              <Plus className="h-4 w-4" />
              Register Machine
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Machine Allocation &amp; Register
            </h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              Track physical assembly presses by supported lanyard width (12 mm, 16 mm, 20 mm).
            </p>
          </div>
          <Button
            onClick={() => {
              setFormError(null);
              setIsAddOpen(true);
            }}
            data-testid="open-add-machine-btn"
          >
            <Plus className="h-4 w-4" />
            Register Machine
          </Button>
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-[13px] font-medium text-slate-500">Total Machines</p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
              {summary.total ?? machines.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[13px] font-medium text-slate-500">In Office (Available)</p>
            <p className="mt-1 font-mono text-2xl font-bold text-emerald-700">
              {summary.in_office ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[13px] font-medium text-slate-500">Allocated to Labourers</p>
            <p className="mt-1 font-mono text-2xl font-bold text-blue-700">
              {summary.allocated ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[13px] font-medium text-slate-500">Maintenance / Damaged</p>
            <p className="mt-1 font-mono text-2xl font-bold text-amber-700">
              {(summary.under_maintenance ?? 0) + (summary.damaged ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex items-center gap-1.5 text-[13px]">
            <span className="font-medium text-slate-600">Lanyard Size:</span>
            {["", "12 mm", "16 mm", "20 mm"].map((sz) => (
              <Button
                key={sz || "all"}
                size="sm"
                variant={sizeFilter === sz ? "default" : "outline"}
                onClick={() => {
                  setSizeFilter(sz);
                  setPage(1);
                }}
              >
                {sz || "All Sizes"}
              </Button>
            ))}
          </div>
          <Select
            compact
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-44"
          >
            <option value="">All Statuses</option>
            <option value="in_office">In Office</option>
            <option value="allocated">Allocated</option>
            <option value="under_maintenance">Under Maintenance</option>
            <option value="damaged">Damaged</option>
          </Select>
        </CardContent>
      </Card>

      {/* Machines Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Registered Equipment ({machines.length})</CardTitle>
          <CardDescription>
            Assembly assignments require an active allocated machine matching the item&apos;s
            lanyard width.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center">
              <Spinner label="Loading machine register..." />
            </div>
          ) : machines.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No machines registered yet. Click &ldquo;Register Machine&rdquo; to add physical
              press equipment.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Machine Code</TableHead>
                    <TableHead>Name &amp; Type</TableHead>
                    <TableHead>Supported Size</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Current Holder / Location</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slicedMachines.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-[13.5px] font-semibold text-slate-900">
                        {m.machine_code}
                      </TableCell>
                      <TableCell className="text-[13.5px]">
                        <p className="font-medium text-slate-900">{m.name}</p>
                        <p className="text-[12px] text-slate-500">{m.machine_type}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">{m.supported_size_label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            m.status === "in_office"
                              ? "success"
                              : m.status === "allocated"
                                ? "default"
                                : "warning"
                          }
                        >
                          {m.status_display}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[13.5px] font-medium text-slate-800">
                        {m.current_location_display}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.status === "in_office" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAllocError(null);
                              setSelectedLabourerId(activeLabourers[0]?.id || "");
                              setAllocateTarget(m);
                            }}
                            data-testid={`allocate-machine-${m.machine_code}`}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                            Allocate
                          </Button>
                        ) : m.status === "allocated" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReturnCondition("good");
                              setReturnNotes("");
                              setReturnTarget(m);
                            }}
                            data-testid={`return-machine-${m.machine_code}`}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Return to Office
                          </Button>
                        ) : (
                          <span className="text-[13px] text-slate-400">Unavailable</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Pagination
                totalCount={machines.length}
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

      {/* Register Machine Dialog */}
      <Dialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        title="Register Physical Machine"
        description="Add a machine asset with its unique code and supported lanyard width."
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
            <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="mch-code" label="Machine Code" required>
              <Input
                id="mch-code"
                value={machineCode}
                onChange={(e) => setMachineCode(e.target.value)}
                placeholder="e.g. MCH-16MM-01"
                required
              />
            </FormField>

            <FormField id="mch-size" label="Supported Lanyard Size" required>
              <Select
                id="mch-size"
                value={supportedSize}
                onChange={(e) => setSupportedSize(e.target.value)}
              >
                <option value="12 mm">12 mm</option>
                <option value="16 mm">16 mm</option>
                <option value="20 mm">20 mm</option>
              </Select>
            </FormField>
          </div>

          <FormField id="mch-name" label="Machine Name" required>
            <Input
              id="mch-name"
              value={machineName}
              onChange={(e) => setMachineName(e.target.value)}
              placeholder="e.g. 16mm Heavy Fitting Press #1"
              required
            />
          </FormField>

          <FormField id="mch-type" label="Machine Type">
            <Input
              id="mch-type"
              value={machineType}
              onChange={(e) => setMachineType(e.target.value)}
            />
          </FormField>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !machineCode.trim()}
              data-testid="submit-create-machine-btn"
            >
              {createMutation.isPending ? "Saving..." : "Register Machine"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Allocate Machine Dialog */}
      <Dialog
        open={Boolean(allocateTarget)}
        onOpenChange={(open) => !open && setAllocateTarget(null)}
        title={`Allocate ${allocateTarget?.machine_code || ""}`}
        description={`Supports ${allocateTarget?.supported_size_label || ""} lanyards. Select an active labourer to receive this machine.`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAllocError(null);
            allocateMutation.mutate();
          }}
          className="space-y-4"
        >
          {allocError ? (
            <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              {allocError}
            </div>
          ) : null}

          <FormField id="alloc-labourer" label="Select Labourer" required>
            <Select
              id="alloc-labourer"
              value={selectedLabourerId}
              onChange={(e) => setSelectedLabourerId(e.target.value)}
              required
            >
              <option value="">— Select Labourer —</option>
              {activeLabourers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField id="alloc-notes" label="Allocation Notes (Optional)">
            <Input
              id="alloc-notes"
              value={allocNotes}
              onChange={(e) => setAllocNotes(e.target.value)}
              placeholder="Issued with die set"
            />
          </FormField>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAllocateTarget(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={allocateMutation.isPending || !selectedLabourerId}
              data-testid="confirm-allocate-machine-btn"
            >
              Confirm Allocation
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Return Machine Dialog */}
      <Dialog
        open={Boolean(returnTarget)}
        onOpenChange={(open) => !open && setReturnTarget(null)}
        title={`Return ${returnTarget?.machine_code || ""} to Office`}
        description={`Currently held by ${returnTarget?.current_holder_name || ""}. Record physical return condition.`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            returnMutation.mutate();
          }}
          className="space-y-4"
        >
          <FormField id="ret-cond" label="Return Condition" required>
            <Select
              id="ret-cond"
              value={returnCondition}
              onChange={(e) =>
                setReturnCondition(
                  e.target.value as "good" | "maintenance_required" | "damaged",
                )
              }
            >
              <option value="good">Good / Operational (Return to In Office)</option>
              <option value="maintenance_required">Needs Maintenance</option>
              <option value="damaged">Damaged</option>
            </Select>
          </FormField>

          <FormField id="ret-notes" label="Return Notes">
            <Input
              id="ret-notes"
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="Inspection remarks"
            />
          </FormField>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setReturnTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={returnMutation.isPending}>
              Confirm Office Return
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

export function MachinesPage(): React.ReactElement {
  return <MachinesPanel />;
}
