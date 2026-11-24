import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  Clock,
  History,
  Lock,
  PackageCheck,
  Palette,
  Plus,
  Printer,
  Sliders,
  Wrench,
} from "lucide-react";
import { productionService } from "@/services/productionService";
import { ApiClientError } from "@/services/apiClient";
import { useUiShellStore } from "@/hooks/useToastStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  getAssemblyBadgeVariant,
  getDesignBadgeVariant,
  getPrintingBadgeVariant,
} from "@/modules/production/ProductionDashboardPage";

interface OrderItemProductionPanelProps {
  jobId: string;
  showAssembly?: boolean;
  showHistory?: boolean;
  onJobLoaded?: (jobTitle: string) => void;
}

export function OrderItemProductionPanel({
  jobId,
  showAssembly = true,
  showHistory = true,
  onJobLoaded,
}: OrderItemProductionPanelProps): React.ReactElement {
  const queryClient = useQueryClient();
  const addToast = useUiShellStore((state) => state.addToast);

  const [actionError, setActionError] = React.useState<string | null>(null);

  // Stage 1: Design form state
  const [designReference, setDesignReference] = React.useState("");
  const [designNotes, setDesignNotes] = React.useState("");

  // Stage 2: Printing run form state
  const [runPlannedBatches, setRunPlannedBatches] = React.useState(1);
  const [runPlannedQty, setRunPlannedQty] = React.useState(100);
  const [runActualPrintedQty, setRunActualPrintedQty] = React.useState(100);
  const [runRejectedQty, setRunRejectedQty] = React.useState(0);
  const [runNotes, setRunNotes] = React.useState("");

  // Batch plan override dialog state (Lanyards)
  const [isOverrideOpen, setIsOverrideOpen] = React.useState(false);
  const [overrideBatches, setOverrideBatches] = React.useState(1);
  const [overrideReason, setOverrideReason] = React.useState("");
  const [overrideError, setOverrideError] = React.useState<string | null>(null);

  // Stage 3: Lanyard assembly state
  const [assemblyCompletedQty, setAssemblyCompletedQty] = React.useState(0);
  const [assemblyNotes, setAssemblyNotes] = React.useState("");

  // ID Card completion notes
  const [cardCompletionNotes, setCardCompletionNotes] = React.useState("");

  const {
    data: job,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["production", "job", jobId],
    queryFn: () => productionService.getJob(jobId),
    enabled: Boolean(jobId),
  });

  React.useEffect(() => {
    if (!job) return;
    onJobLoaded?.(job.item.item_name);
    setDesignReference(job.design_reference || "");
    setDesignNotes(job.design_notes || "");

    const remainingToPrint = Math.max(
      1,
      job.planned_printing_quantity - job.successful_printed_quantity,
    );
    const defaultBatches =
      job.item.category === "lanyard"
        ? Math.max(1, Math.ceil(remainingToPrint / Math.max(1, job.batch_capacity)))
        : 1;
    const defaultPlannedQty =
      job.item.category === "lanyard"
        ? defaultBatches * job.batch_capacity
        : remainingToPrint;

    setRunPlannedBatches(defaultBatches);
    setRunPlannedQty(defaultPlannedQty);
    setRunActualPrintedQty(defaultPlannedQty);
    setRunRejectedQty(0);

    setOverrideBatches(job.planned_batches);
    setAssemblyCompletedQty(
      job.completed_assembly_quantity > 0
        ? job.completed_assembly_quantity
        : job.required_quantity,
    );
    setAssemblyNotes(job.assembly_notes || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.printing_runs.length, job?.planned_batches]);

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["production"] });
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    void queryClient.invalidateQueries({ queryKey: ["assembly"] });
    void queryClient.invalidateQueries({ queryKey: ["dispatch"] });
  };

  const handleMutationError = (err: unknown) => {
    if (err instanceof ApiClientError) {
      setActionError(err.message);
    } else {
      setActionError("Operation could not be completed. Please try again.");
    }
  };

  // --- Design Mutations ---
  const designStartMutation = useMutation({
    mutationFn: () =>
      productionService.startDesign(jobId, {
        design_reference: designReference,
        notes: designNotes,
      }),
    onSuccess: () => {
      setActionError(null);
      invalidateAll();
      addToast({ title: "Design Started", variant: "success" });
    },
    onError: handleMutationError,
  });

  const designReviewMutation = useMutation({
    mutationFn: () =>
      productionService.reviewDesign(jobId, {
        design_reference: designReference,
        notes: designNotes,
      }),
    onSuccess: () => {
      setActionError(null);
      invalidateAll();
      addToast({ title: "Design Marked for Review", variant: "default" });
    },
    onError: handleMutationError,
  });

  const designApproveMutation = useMutation({
    mutationFn: () =>
      productionService.approveDesign(jobId, {
        design_reference: designReference,
        notes: designNotes,
      }),
    onSuccess: () => {
      setActionError(null);
      invalidateAll();
      addToast({
        title: "Design Approved",
        description: "Item design is approved for printing.",
        variant: "success",
      });
    },
    onError: handleMutationError,
  });

  const designCompleteMutation = useMutation({
    mutationFn: () =>
      productionService.completeDesign(jobId, {
        design_reference: designReference,
        notes: designNotes,
      }),
    onSuccess: () => {
      setActionError(null);
      invalidateAll();
      addToast({
        title: "Design Completed",
        description: "Item has advanced to Printing stage.",
        variant: "success",
      });
    },
    onError: handleMutationError,
  });

  // --- Printing & Batch Override Mutations ---
  const overridePlanMutation = useMutation({
    mutationFn: () =>
      productionService.overridePrintingPlan(jobId, {
        planned_batches: overrideBatches,
        override_reason: overrideReason,
      }),
    onSuccess: (updated) => {
      setOverrideError(null);
      setIsOverrideOpen(false);
      invalidateAll();
      addToast({
        title: "Printing Batch Plan Updated",
        description: `Plan set to ${updated.planned_batches} batches (${updated.planned_printing_quantity} pcs).`,
        variant: "success",
      });
    },
    onError: (err) => {
      setOverrideError(
        err instanceof ApiClientError ? err.message : "Could not override batch plan.",
      );
    },
  });

  const recordPrintingRunMutation = useMutation({
    mutationFn: () =>
      productionService.createPrintingRun(jobId, {
        planned_batches: runPlannedBatches,
        planned_quantity: runPlannedQty,
        actual_printed_quantity: runActualPrintedQty,
        rejected_quantity: runRejectedQty,
        successful_quantity: Math.max(0, runActualPrintedQty - runRejectedQty),
        complete_immediately: true,
        notes: runNotes,
      }),
    onSuccess: () => {
      setActionError(null);
      setRunNotes("");
      invalidateAll();
      addToast({
        title: "Printing Run Recorded",
        description: "Printing run saved and cumulative production updated.",
        variant: "success",
      });
    },
    onError: handleMutationError,
  });

  const completeInProgressRunMutation = useMutation({
    mutationFn: (runId: string) =>
      productionService.completePrintingRun(runId, {
        notes: "Completed from production panel.",
      }),
    onSuccess: () => {
      setActionError(null);
      invalidateAll();
      addToast({ title: "Printing Run Completed", variant: "success" });
    },
    onError: handleMutationError,
  });

  // --- Assembly & Completion Mutations ---
  const markAssemblyReadyMutation = useMutation({
    mutationFn: () =>
      productionService.markAssemblyReady(jobId, {
        planned_assembly_quantity: job?.required_quantity,
        notes: assemblyNotes,
      }),
    onSuccess: () => {
      setActionError(null);
      invalidateAll();
      addToast({ title: "Marked Ready for Assembly", variant: "success" });
    },
    onError: handleMutationError,
  });

  const startAssemblyMutation = useMutation({
    mutationFn: () =>
      productionService.startAssembly(jobId, {
        completed_assembly_quantity: assemblyCompletedQty,
        notes: assemblyNotes,
      }),
    onSuccess: () => {
      setActionError(null);
      invalidateAll();
      addToast({ title: "Assembly Progress Updated", variant: "success" });
    },
    onError: handleMutationError,
  });

  const completeAssemblyMutation = useMutation({
    mutationFn: () =>
      productionService.completeAssembly(jobId, {
        completed_assembly_quantity: assemblyCompletedQty,
        notes: assemblyNotes,
      }),
    onSuccess: () => {
      setActionError(null);
      invalidateAll();
      addToast({
        title: "Lanyard Assembly Completed",
        description: "Item is ready for packing & dispatch.",
        variant: "success",
      });
    },
    onError: handleMutationError,
  });

  const completeIdCardMutation = useMutation({
    mutationFn: () =>
      productionService.completeIdCardProduction(jobId, {
        ready_for_packing_quantity: job?.required_quantity,
        notes: cardCompletionNotes,
      }),
    onSuccess: () => {
      setActionError(null);
      invalidateAll();
      addToast({
        title: "ID Card Production Completed",
        description: "Item is ready for packing & dispatch.",
        variant: "success",
      });
    },
    onError: handleMutationError,
  });

  if (isLoading) {
    return (
      <div className="py-10 text-center">
        <Spinner label="Loading production details..." />
      </div>
    );
  }

  if (isError || !job) {
    return (
      <p className="py-6 text-center text-xs text-red-600">
        Unable to load production job details.
      </p>
    );
  }

  const isLanyard = job.item.category === "lanyard";
  const canPrint = job.design_status === "approved" || job.design_status === "completed";
  const previewSuccessfulRunQty = Math.max(0, runActualPrintedQty - runRejectedQty);

  return (
    <div className="space-y-5">
      {actionError ? (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 p-3.5 text-xs text-red-800"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold">Production Validation Notice</p>
            <p className="mt-0.5">{actionError}</p>
          </div>
        </div>
      ) : null}

      {/* Step Timeline + Quantity Strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        {job.workflow_stages.map((st) => (
          <div
            key={st.key}
            className={`rounded-lg border p-3 ${
              st.is_completed
                ? "border-emerald-300 bg-emerald-50/60 text-emerald-950"
                : st.is_active
                  ? "border-blue-400 bg-blue-50/70 text-blue-950 ring-1 ring-blue-400"
                  : "border-slate-200 bg-slate-50/60 text-slate-600"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">{st.label}</span>
              {st.is_completed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
            </div>
            <p className="mt-1 text-xs font-medium opacity-90">{st.status_label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-[10px] border border-slate-200 bg-white p-3.5">
          <p className="text-[12.5px] font-medium text-slate-500">Required Qty</p>
          <p className="mt-1 font-mono text-base font-bold text-slate-900">
            {job.required_quantity.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="rounded-[10px] border border-slate-200 bg-white p-3.5">
          <p className="text-[12.5px] font-medium text-slate-500">Successful Printed</p>
          <p className="mt-1 font-mono text-base font-bold text-blue-800">
            {job.successful_printed_quantity.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="rounded-[10px] border border-slate-200 bg-white p-3.5">
          <p className="text-[12.5px] font-medium text-slate-500">Printing Waste</p>
          <p className="mt-1 font-mono text-base font-bold text-red-700">
            {job.total_rejected_quantity.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="rounded-[10px] border border-slate-200 bg-white p-3.5">
          <p className="text-[12.5px] font-medium text-slate-500">Printed Surplus</p>
          <p className="mt-1 font-mono text-base font-bold text-amber-800">
            {job.actual_printed_surplus.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="rounded-[10px] border border-slate-200 bg-white p-3.5">
          <p className="text-[12.5px] font-medium text-slate-500">Completed / Pending</p>
          <p className="mt-1 font-mono text-base font-bold text-emerald-800">
            {job.quantity_completed.toLocaleString("en-IN")} /{" "}
            <span className="text-slate-600">{job.quantity_pending.toLocaleString("en-IN")}</span>
          </p>
        </div>
        <div className="rounded-[10px] border border-slate-200 bg-white p-3.5">
          <p className="text-[12.5px] font-medium text-slate-500">Ready for Packing</p>
          <p className="mt-1 font-mono text-base font-bold text-emerald-900">
            {job.ready_for_packing_quantity.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* STAGE 1: DESIGN MANAGEMENT */}
      <Card>
        <CardHeader className="py-3.5">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Palette className="h-4 w-4 text-blue-700" />
              Stage 1 — Design Management
            </CardTitle>
            <Badge variant={getDesignBadgeVariant(job.design_status)}>
              {job.design_status_label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-3">
            <div>
              <span className="text-slate-500">Staff:</span>{" "}
              <strong className="text-slate-900">
                {job.design_responsible_username || "Unassigned"}
              </strong>
            </div>
            <div>
              <span className="text-slate-500">Started:</span>{" "}
              <strong>{formatDateTimeIST(job.design_started_at)}</strong>
            </div>
            <div>
              <span className="text-slate-500">Completed:</span>{" "}
              <strong>{formatDateTimeIST(job.design_completed_at)}</strong>
            </div>
          </div>

          {!job.is_production_completed ? (
            <div className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="design-ref-input" label="Artwork Reference / File Code (Optional)">
                  <Input
                    id="design-ref-input"
                    value={designReference}
                    onChange={(e) => setDesignReference(e.target.value)}
                    placeholder="e.g. ART-2026-1001.cdr"
                  />
                </FormField>

                <FormField id="design-notes-input" label="Design Notes">
                  <Input
                    id="design-notes-input"
                    value={designNotes}
                    onChange={(e) => setDesignNotes(e.target.value)}
                    placeholder="Layout remarks or proof feedback"
                  />
                </FormField>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => designStartMutation.mutate()}
                  disabled={designStartMutation.isPending || job.design_status === "completed"}
                  data-testid="design-start-btn"
                >
                  Start Design
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => designReviewMutation.mutate()}
                  disabled={designReviewMutation.isPending || job.design_status === "completed"}
                >
                  Mark Review Required
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => designApproveMutation.mutate()}
                  disabled={designApproveMutation.isPending || job.design_status === "completed"}
                  data-testid="design-approve-btn"
                >
                  Approve Design
                </Button>
                <Button
                  size="sm"
                  onClick={() => designCompleteMutation.mutate()}
                  disabled={designCompleteMutation.isPending || job.design_status === "completed"}
                  data-testid="design-complete-btn"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Complete Design
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* STAGE 2: PRINTING MANAGEMENT */}
      <Card>
        <CardHeader className="py-3.5">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Printer className="h-4 w-4 text-blue-700" />
              Stage 2 — Printing Runs ({job.printing_runs.length})
            </CardTitle>
            <Badge variant={getPrintingBadgeVariant(job.printing_status)}>
              {job.printing_status_label}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLanyard ? (
            <div
              className="rounded-lg border border-blue-200 bg-blue-50/40 p-4"
              data-testid="lanyard-batch-calculator-panel"
            >
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-blue-700" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-950">
                    Lanyard Batch Printing Calculator
                  </h4>
                  {job.is_plan_overridden ? (
                    <Badge variant="warning">Overridden Plan</Badge>
                  ) : (
                    <Badge variant="default">Standard Calculation</Badge>
                  )}
                </div>

                {!job.is_production_completed ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setOverrideBatches(job.planned_batches);
                      setOverrideReason(job.plan_override_reason || "");
                      setOverrideError(null);
                      setIsOverrideOpen(true);
                    }}
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    Override Batch Plan
                  </Button>
                ) : null}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 rounded-md border border-blue-100 bg-white p-3 text-xs sm:grid-cols-6">
                <div>
                  <span className="text-slate-500">Required</span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                    {job.required_quantity.toLocaleString("en-IN")} pcs
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Size</span>
                  <p className="mt-0.5 font-semibold text-slate-900">
                    {job.item.lanyard_size_option_detail?.name || "16 mm"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Batch Capacity</span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-blue-800">
                    {job.batch_capacity} pcs / batch
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Planned Batches</span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                    {job.planned_batches} batches
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Planned Printed Qty</span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-blue-900">
                    {job.planned_printing_quantity.toLocaleString("en-IN")} pcs
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Expected Surplus</span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-amber-800">
                    {job.expected_surplus_quantity.toLocaleString("en-IN")} pcs
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {!job.is_production_completed ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Record Printing Run
              </h4>
              {!canPrint ? (
                <p className="mt-1.5 text-xs text-amber-800">
                  Design must be marked <strong>Approved</strong> or <strong>Completed</strong>{" "}
                  before recording printing runs.
                </p>
              ) : null}

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                {isLanyard ? (
                  <FormField id="run-planned-batches" label="Planned Batches">
                    <Input
                      id="run-planned-batches"
                      type="number"
                      min={1}
                      value={runPlannedBatches}
                      onChange={(e) => {
                        const b = Math.max(1, parseInt(e.target.value || "1", 10));
                        setRunPlannedBatches(b);
                        const calcQty = b * job.batch_capacity;
                        setRunPlannedQty(calcQty);
                        setRunActualPrintedQty(calcQty);
                      }}
                    />
                  </FormField>
                ) : null}

                <FormField id="run-planned-qty" label="Planned Qty">
                  <Input
                    id="run-planned-qty"
                    type="number"
                    min={1}
                    value={runPlannedQty}
                    onChange={(e) => setRunPlannedQty(parseInt(e.target.value || "0", 10))}
                  />
                </FormField>

                <FormField id="run-actual-qty" label="Gross Printed Qty" required>
                  <Input
                    id="run-actual-qty"
                    type="number"
                    min={1}
                    value={runActualPrintedQty}
                    onChange={(e) => setRunActualPrintedQty(parseInt(e.target.value || "0", 10))}
                  />
                </FormField>

                <FormField id="run-rejected-qty" label="Rejected / Waste Qty">
                  <Input
                    id="run-rejected-qty"
                    type="number"
                    min={0}
                    value={runRejectedQty}
                    onChange={(e) => setRunRejectedQty(parseInt(e.target.value || "0", 10))}
                  />
                </FormField>

                <div>
                  <span className="block text-xs font-medium text-slate-700">
                    Successful Output
                  </span>
                  <div className="mt-1.5 flex h-9 items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 font-mono text-sm font-bold text-emerald-900">
                    {previewSuccessfulRunQty.toLocaleString("en-IN")} good
                  </div>
                </div>

                <FormField id="run-notes" label="Run Notes">
                  <Input
                    id="run-notes"
                    value={runNotes}
                    onChange={(e) => setRunNotes(e.target.value)}
                    placeholder="Batch remarks"
                  />
                </FormField>
              </div>

              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => recordPrintingRunMutation.mutate()}
                  disabled={!canPrint || recordPrintingRunMutation.isPending}
                  data-testid="record-printing-run-btn"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {recordPrintingRunMutation.isPending
                    ? "Recording Run..."
                    : "Record Printing Run"}
                </Button>
              </div>
            </div>
          ) : null}

          {job.printing_runs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Planned</TableHead>
                  <TableHead>Gross Printed</TableHead>
                  <TableHead>Rejected</TableHead>
                  <TableHead>Good Output</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.printing_runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-mono text-xs font-semibold text-slate-900">
                      {run.run_identifier}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{run.run_date}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {run.planned_quantity.toLocaleString("en-IN")}
                      {isLanyard ? ` (${run.planned_batches}b)` : ""}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-900">
                      {run.actual_printed_quantity.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-red-700">
                      {run.rejected_quantity.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-emerald-800">
                      {run.successful_quantity.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {run.responsible_username || "—"}
                    </TableCell>
                    <TableCell>
                      {run.status === "completed" ? (
                        <Badge variant="success">
                          <Lock className="h-3 w-3" />
                          Completed
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => completeInProgressRunMutation.mutate(run.id)}
                        >
                          Complete Run
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      {/* STAGE 3 & 4 */}
      {isLanyard && showAssembly ? (
        <Card>
          <CardHeader className="py-3.5">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Wrench className="h-4 w-4 text-blue-700" />
                Stage 3 — Lanyard Assembly &amp; Labour Allocation
              </CardTitle>
              <Badge variant={getAssemblyBadgeVariant(job.assembly_status)}>
                {job.assembly_status_label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 text-xs sm:grid-cols-4">
              <div>
                <span className="text-slate-500">Readiness:</span>{" "}
                <strong className={job.is_assembly_ready ? "text-emerald-700" : "text-slate-700"}>
                  {job.is_assembly_ready ? "Ready for Assembly" : "Awaiting Printed Stock"}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Planned Qty:</span>{" "}
                <strong className="font-mono">
                  {job.planned_assembly_quantity.toLocaleString("en-IN")}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Completed Qty:</span>{" "}
                <strong className="font-mono text-emerald-800">
                  {job.completed_assembly_quantity.toLocaleString("en-IN")}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Completed At:</span>{" "}
                <strong>{formatDateTimeIST(job.assembly_completed_at)}</strong>
              </div>
            </div>

            {!job.is_production_completed ? (
              <div className="space-y-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    id="assembly-completed-qty"
                    label={`Assembled Quantity (Required: ${job.required_quantity.toLocaleString("en-IN")})`}
                  >
                    <Input
                      id="assembly-completed-qty"
                      type="number"
                      min={0}
                      max={job.successful_printed_quantity}
                      value={assemblyCompletedQty}
                      onChange={(e) =>
                        setAssemblyCompletedQty(parseInt(e.target.value || "0", 10))
                      }
                    />
                  </FormField>

                  <FormField id="assembly-notes-input" label="General Assembly Notes">
                    <Input
                      id="assembly-notes-input"
                      value={assemblyNotes}
                      onChange={(e) => setAssemblyNotes(e.target.value)}
                      placeholder="Stitching, hook fitting, or holder remarks"
                    />
                  </FormField>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => markAssemblyReadyMutation.mutate()}
                    disabled={
                      markAssemblyReadyMutation.isPending ||
                      job.successful_printed_quantity < job.required_quantity
                    }
                  >
                    Mark Ready for Assembly
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => startAssemblyMutation.mutate()}
                    disabled={
                      startAssemblyMutation.isPending || job.successful_printed_quantity < 1
                    }
                    data-testid="assembly-start-btn"
                  >
                    Update Assembly Progress
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => completeAssemblyMutation.mutate()}
                    disabled={
                      completeAssemblyMutation.isPending ||
                      job.successful_printed_quantity < job.required_quantity
                    }
                    data-testid="assembly-complete-btn"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Complete Assembly &amp; Advance to Dispatch
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!isLanyard ? (
        <Card>
          <CardHeader className="py-3.5">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <CardTitle className="flex items-center gap-2 text-sm">
                <PackageCheck className="h-4 w-4 text-blue-700" />
                ID Card Production Completion &amp; Dispatch Readiness
              </CardTitle>
              <Badge variant={job.is_ready_for_dispatch ? "success" : "neutral"}>
                {job.is_ready_for_dispatch ? "Ready for Packing / Dispatch" : "Awaiting Completion"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!job.is_production_completed ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <FormField
                  id="card-completion-notes"
                  label="Completion / Packing Readiness Notes (Optional)"
                  className="flex-1"
                >
                  <Input
                    id="card-completion-notes"
                    value={cardCompletionNotes}
                    onChange={(e) => setCardCompletionNotes(e.target.value)}
                    placeholder="Quality checked and bundled for packing"
                  />
                </FormField>
                <Button
                  size="sm"
                  onClick={() => completeIdCardMutation.mutate()}
                  disabled={
                    completeIdCardMutation.isPending ||
                    job.successful_printed_quantity < job.required_quantity
                  }
                  data-testid="complete-id-card-production-btn"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Complete Production &amp; Mark Ready for Packing
                </Button>
              </div>
            ) : (
              <p className="text-xs font-medium text-emerald-800">
                Production completed on {formatDateTimeIST(job.production_completed_at)}.{" "}
                <strong>{job.ready_for_packing_quantity.toLocaleString("en-IN")}</strong> units are
                ready for packing and dispatch.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Production History */}
      {showHistory && job.history.length > 0 ? (
        <Card>
          <CardHeader className="py-3.5">
            <CardTitle className="flex items-center gap-2 text-sm">
              <History className="h-4 w-4 text-blue-700" />
              Production History ({job.history.length})
            </CardTitle>
            <CardDescription>
              Design, printing, batch override, and assembly log for this item
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100">
              {job.history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col justify-between gap-2 py-2.5 text-xs sm:flex-row sm:items-start"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral" className="uppercase">
                        {entry.stage}
                      </Badge>
                      <span className="font-semibold text-slate-900">{entry.summary}</span>
                    </div>
                    {entry.notes ? (
                      <p className="mt-1 text-slate-600">Notes: {entry.notes}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-slate-500">
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
      ) : null}

      {/* Override Batch Plan Dialog */}
      <Dialog
        open={isOverrideOpen}
        onOpenChange={setIsOverrideOpen}
        title="Override Calculated Lanyard Batch Plan"
        description={`Calculated ${job.calculated_batches} batches (${job.calculated_planned_quantity} pcs, ${job.calculated_expected_surplus} surplus) at ${job.batch_capacity} pcs/batch.`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setOverrideError(null);
            overridePlanMutation.mutate();
          }}
          className="space-y-4"
        >
          {overrideError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {overrideError}
            </div>
          ) : null}

          <FormField id="override-batches-input" label="New Planned Batches" required>
            <Input
              id="override-batches-input"
              type="number"
              min={1}
              value={overrideBatches}
              onChange={(e) => setOverrideBatches(parseInt(e.target.value || "1", 10))}
            />
          </FormField>

          <FormField id="override-reason-input" label="Override Reason" required>
            <Input
              id="override-reason-input"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. Extra buffer batch for colour matching test"
            />
          </FormField>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOverrideOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={overridePlanMutation.isPending}>
              Save Override Plan
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
