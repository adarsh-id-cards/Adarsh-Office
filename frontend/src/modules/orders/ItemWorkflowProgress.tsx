import * as React from "react";
import {
  AlertCircle,
  Check,
  PackageCheck,
  Palette,
  Printer,
  Truck,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ItemCategory } from "@/types/orders";
import type {
  AssemblyStatus,
  DesignStatus,
  PrintingStatus,
  ProductionJobSummary,
} from "@/types/production";

export type StepState = "completed" | "current" | "pending" | "blocked";

export interface WorkflowStep {
  key: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  state: StepState;
  statusText: string;
  detailText?: string;
  blockingReason?: string;
}

interface ItemWorkflowProgressProps {
  category: ItemCategory;
  job?: ProductionJobSummary | null;
  orderedQuantity: number;
  dispatchedQuantity: number;
  isCancelled?: boolean;
  className?: string;
}

export function computeWorkflowSteps(
  category: ItemCategory,
  job: ProductionJobSummary | null | undefined,
  orderedQuantity: number,
  dispatchedQuantity: number,
  isCancelled = false,
): WorkflowStep[] {
  const isLanyard = category === "lanyard";

  if (isCancelled) {
    return [
      {
        key: "cancelled",
        label: "Order Cancelled",
        shortLabel: "Cancelled",
        icon: AlertCircle,
        state: "blocked",
        statusText: "Cancelled",
        detailText: "Order was cancelled.",
      },
    ];
  }

  // 1. Stage 1: Design
  const designStatus: DesignStatus = job?.design_status || "not_started";
  const isDesignDone = designStatus === "approved" || designStatus === "completed";
  const isDesignActive = !isDesignDone;

  const designStep: WorkflowStep = {
    key: "design",
    label: "1. Design",
    shortLabel: "Design",
    icon: Palette,
    state: isDesignDone ? "completed" : isDesignActive ? "current" : "pending",
    statusText: isDesignDone
      ? "Design Approved"
      : designStatus === "in_progress"
        ? "In Progress"
        : designStatus === "review_required"
          ? "Under Review"
          : "Not Started",
    detailText: isDesignDone
      ? "Ready for printing"
      : designStatus === "not_started"
        ? "Requires artwork / layout"
        : "Design being finalized",
  };

  // 2. Stage 2: Printing
  const printingStatus: PrintingStatus = job?.printing_status || "not_started";
  const printedQty = job?.successful_printed_quantity || 0;
  const isPrintingDone = printingStatus === "completed" || (job?.required_quantity && printedQty >= job.required_quantity);
  const isPrintingActive = isDesignDone && !isPrintingDone;
  const isPrintingBlocked = !isDesignDone;

  const printingStep: WorkflowStep = {
    key: "printing",
    label: "2. Printing",
    shortLabel: "Printing",
    icon: Printer,
    state: isPrintingDone
      ? "completed"
      : isPrintingActive
        ? "current"
        : isPrintingBlocked
          ? "pending"
          : "pending",
    statusText: isPrintingDone
      ? `Completed (${printedQty.toLocaleString("en-IN")} pcs)`
      : isPrintingActive
        ? printedQty > 0
          ? `${printedQty.toLocaleString("en-IN")} / ${(job?.required_quantity || orderedQuantity).toLocaleString("en-IN")} pcs`
          : "Ready to Print"
        : "Awaiting Design",
    detailText: isPrintingDone
      ? "Printed successfully"
      : isPrintingBlocked
        ? "Blocked until design is approved"
        : "Production printing run",
    blockingReason: isPrintingBlocked ? "Design must be approved before printing can begin." : undefined,
  };

  if (!isLanyard) {
    // ID Card Workflow: Exactly 3 stages: Design -> Printing -> Ready for Dispatch
    const isDispatched = dispatchedQuantity >= orderedQuantity && orderedQuantity > 0;
    const isDispatchCurrent = isPrintingDone && !isDispatched;

    const dispatchStep: WorkflowStep = {
      key: "dispatch",
      label: "3. Ready for Dispatch",
      shortLabel: "Dispatch",
      icon: PackageCheck,
      state: isDispatched
        ? "completed"
        : isDispatchCurrent
          ? "current"
          : "pending",
      statusText: isDispatched
        ? `Dispatched (${dispatchedQuantity.toLocaleString("en-IN")} pcs)`
        : isDispatchCurrent
          ? dispatchedQuantity > 0
            ? `Partially Dispatched (${dispatchedQuantity}/${orderedQuantity})`
            : "Ready for Packing / Dispatch"
          : "Awaiting Printing",
      detailText: isDispatched
        ? "Item fully dispatched to client"
        : isDispatchCurrent
          ? "Cards ready to be packed and dispatched"
          : "Pending print completion",
    };

    return [designStep, printingStep, dispatchStep];
  }

  // Lanyard Workflow: Exactly 4 stages: Design -> Printing -> Assembly -> Dispatch
  const assemblyStatus: AssemblyStatus = job?.assembly_status || "not_ready";
  const isAssemblyDone = assemblyStatus === "completed" || job?.is_production_completed || job?.is_ready_for_dispatch;
  const isAssemblyActive = isPrintingDone && !isAssemblyDone;
  const isAssemblyBlocked = !isPrintingDone;

  const assemblyStep: WorkflowStep = {
    key: "assembly",
    label: "3. Assembly",
    shortLabel: "Assembly",
    icon: Wrench,
    state: isAssemblyDone
      ? "completed"
      : isAssemblyActive
        ? "current"
        : "pending",
    statusText: isAssemblyDone
      ? `Completed (${(job?.completed_assembly_quantity || job?.required_quantity || orderedQuantity).toLocaleString("en-IN")} pcs)`
      : isAssemblyActive
        ? job?.is_assembly_ready
          ? "Ready for Assembly"
          : "Awaiting Printed Stock"
        : "Awaiting Printing",
    detailText: isAssemblyDone
      ? "Lanyards assembled with hooks"
      : isAssemblyBlocked
        ? "Blocked until lanyards are printed"
        : "Stitching and hook attachment",
    blockingReason: isAssemblyBlocked ? "Printing must finish before lanyard assembly can start." : undefined,
  };

  const isLanyardDispatched = dispatchedQuantity >= orderedQuantity && orderedQuantity > 0;
  const isLanyardDispatchCurrent = isAssemblyDone && !isLanyardDispatched;

  const lanyardDispatchStep: WorkflowStep = {
    key: "dispatch",
    label: "4. Dispatch",
    shortLabel: "Dispatch",
    icon: Truck,
    state: isLanyardDispatched
      ? "completed"
      : isLanyardDispatchCurrent
        ? "current"
        : "pending",
    statusText: isLanyardDispatched
      ? `Dispatched (${dispatchedQuantity.toLocaleString("en-IN")} pcs)`
      : isLanyardDispatchCurrent
        ? dispatchedQuantity > 0
          ? `Partially Dispatched (${dispatchedQuantity}/${orderedQuantity})`
          : "Ready for Dispatch"
        : "Awaiting Assembly",
    detailText: isLanyardDispatched
      ? "Item fully dispatched"
      : isLanyardDispatchCurrent
        ? "Packing & dispatch in progress"
        : "Pending assembly completion",
  };

  return [designStep, printingStep, assemblyStep, lanyardDispatchStep];
}

export function ItemWorkflowProgress({
  category,
  job,
  orderedQuantity,
  dispatchedQuantity,
  isCancelled = false,
  className,
}: ItemWorkflowProgressProps): React.ReactElement {
  const steps = React.useMemo(
    () => computeWorkflowSteps(category, job, orderedQuantity, dispatchedQuantity, isCancelled),
    [category, job, orderedQuantity, dispatchedQuantity, isCancelled],
  );

  return (
    <div className={cn("w-full space-y-2 select-none", className)}>
      {/* Horizontal Steps Bar */}
      <div className="flex w-full items-center justify-between gap-1 overflow-x-auto py-1">
        {steps.map((step, idx) => {
          const isFirst = idx === 0;

          return (
            <React.Fragment key={step.key}>
              {/* Connector line from previous step */}
              {!isFirst && (
                <div
                  className={cn(
                    "h-0.5 min-w-4 flex-1 transition-colors sm:min-w-8",
                    step.state === "completed"
                      ? "bg-emerald-500"
                      : step.state === "current"
                        ? "bg-blue-400"
                        : "bg-slate-200",
                  )}
                />
              )}

              {/* Step Node */}
              <div
                className={cn(
                  "group relative flex shrink-0 items-center gap-2 rounded-[8px] border px-2.5 py-1.5 transition-all",
                  step.state === "completed" &&
                    "border-emerald-300 bg-emerald-50/70 text-emerald-950",
                  step.state === "current" &&
                    "border-blue-400 bg-blue-50/90 text-blue-950 shadow-sm ring-2 ring-blue-200/60",
                  step.state === "pending" &&
                    "border-slate-200 bg-slate-50/60 text-slate-500 opacity-80",
                  step.state === "blocked" &&
                    "border-amber-300 bg-amber-50 text-amber-950",
                )}
                title={step.blockingReason || step.detailText}
              >
                {/* State Indicator Icon/Circle */}
                <div
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    step.state === "completed" && "bg-emerald-600 text-white",
                    step.state === "current" && "bg-blue-600 text-white animate-pulse",
                    step.state === "pending" && "bg-slate-200 text-slate-600",
                    step.state === "blocked" && "bg-amber-600 text-white",
                  )}
                >
                  {step.state === "completed" ? (
                    <Check className="h-3 w-3 stroke-[3]" />
                  ) : step.state === "blocked" ? (
                    "!"
                  ) : (
                    idx + 1
                  )}
                </div>

                {/* Step Labels */}
                <div className="min-w-0 text-left">
                  <p
                    className={cn(
                      "text-[12px] font-semibold leading-tight",
                      step.state === "completed" && "text-emerald-900",
                      step.state === "current" && "text-blue-900 font-bold",
                      step.state === "pending" && "text-slate-600",
                      step.state === "blocked" && "text-amber-900",
                    )}
                  >
                    {step.label}
                  </p>
                  <p
                    className={cn(
                      "truncate text-[11px] leading-tight",
                      step.state === "completed" && "text-emerald-700 font-medium",
                      step.state === "current" && "text-blue-700 font-medium",
                      step.state === "pending" && "text-slate-400",
                      step.state === "blocked" && "text-amber-700",
                    )}
                  >
                    {step.statusText}
                  </p>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export interface ItemNextAction {
  actionId:
    | "start_design"
    | "complete_design"
    | "record_printing"
    | "complete_id_production"
    | "mark_assembly_ready"
    | "complete_assembly"
    | "update_dispatch"
    | "all_completed"
    | "none";
  label: string;
  variant: "default" | "secondary" | "outline" | "success";
  description: string;
  isAvailable: boolean;
  canExecute: boolean;
  blockingMessage?: string;
}

export function resolveItemNextAction(
  category: ItemCategory,
  job: ProductionJobSummary | null | undefined,
  orderedQuantity: number,
  dispatchedQuantity: number,
  userPermissions: string[] = [],
  isOrderCancelled = false,
): ItemNextAction {
  if (isOrderCancelled) {
    return {
      actionId: "none",
      label: "Cancelled",
      variant: "outline",
      description: "Order is cancelled. No further production or dispatch actions can be performed.",
      isAvailable: false,
      canExecute: false,
    };
  }

  const canManageProduction =
    userPermissions.includes("production.manage") || userPermissions.length === 0;
  const canManageOrders =
    userPermissions.includes("orders.manage") || userPermissions.length === 0;

  const isLanyard = category === "lanyard";

  // 1. Stage 1: Design
  const designStatus = job?.design_status || "not_started";
  const isDesignDone = designStatus === "approved" || designStatus === "completed";

  if (!isDesignDone) {
    if (designStatus === "not_started") {
      return {
        actionId: "start_design",
        label: "Start Design",
        variant: "default",
        description: "Artwork and layout preparation has not started yet.",
        isAvailable: true,
        canExecute: canManageProduction,
        blockingMessage: !canManageProduction ? "Permission required to advance design." : undefined,
      };
    }
    return {
      actionId: "complete_design",
      label: "Complete Design",
      variant: "default",
      description: "Artwork is drafted/under review. Approve and complete design to unlock printing.",
      isAvailable: true,
      canExecute: canManageProduction,
      blockingMessage: !canManageProduction ? "Permission required to approve design." : undefined,
    };
  }

  // 2. Stage 2: Printing
  const printingStatus = job?.printing_status || "not_started";
  const printedQty = job?.successful_printed_quantity || 0;
  const requiredQty = job?.required_quantity || orderedQuantity;
  const isPrintingDone = printingStatus === "completed" || (requiredQty > 0 && printedQty >= requiredQty);

  if (!isPrintingDone) {
    return {
      actionId: "record_printing",
      label: "Record Printing Run",
      variant: "default",
      description:
        printedQty > 0
          ? `${printedQty.toLocaleString("en-IN")} of ${requiredQty.toLocaleString("en-IN")} pcs printed so far.`
          : "Design is approved. Record the first press/printing run.",
      isAvailable: true,
      canExecute: canManageProduction,
      blockingMessage: !canManageProduction ? "Permission required to record printing runs." : undefined,
    };
  }

  // 3. Stage 3: ID Card Dispatch Readiness vs Lanyard Assembly
  if (!isLanyard) {
    const isReadyForDispatch = Boolean(
      job?.is_ready_for_dispatch || job?.is_production_completed,
    );

    if (!isReadyForDispatch) {
      return {
        actionId: "complete_id_production",
        label: "Mark Ready for Dispatch",
        variant: "default",
        description: "Printing is complete. Finalize card production to unlock dispatch.",
        isAvailable: true,
        canExecute: canManageProduction,
      };
    }

    if (dispatchedQuantity < orderedQuantity) {
      return {
        actionId: "update_dispatch",
        label: "Record Dispatch",
        variant: "default",
        description: `${(orderedQuantity - dispatchedQuantity).toLocaleString("en-IN")} pcs ready to be packed and dispatched.`,
        isAvailable: true,
        canExecute: canManageOrders,
      };
    }

    return {
      actionId: "all_completed",
      label: "Fully Completed & Dispatched",
      variant: "success",
      description: "All ordered units have been printed, verified, and dispatched.",
      isAvailable: false,
      canExecute: false,
    };
  }

  // Lanyard Stages: Assembly -> Dispatch
  const assemblyStatus = job?.assembly_status || "not_ready";
  const isAssemblyDone = assemblyStatus === "completed" || job?.is_production_completed;

  if (!isAssemblyDone) {
    if (!job?.is_assembly_ready) {
      return {
        actionId: "mark_assembly_ready",
        label: "Mark Assembly Ready",
        variant: "default",
        description: "Lanyards printed. Advance status to allow assembly stitching.",
        isAvailable: true,
        canExecute: canManageProduction,
      };
    }

    return {
      actionId: "complete_assembly",
      label: "Complete Assembly",
      variant: "default",
      description: "Ribbons and hooks are ready. Record assembled units.",
      isAvailable: true,
      canExecute: canManageProduction,
    };
  }

  if (dispatchedQuantity < orderedQuantity) {
    return {
      actionId: "update_dispatch",
      label: "Record Dispatch",
      variant: "default",
      description: `${(orderedQuantity - dispatchedQuantity).toLocaleString("en-IN")} assembled lanyards ready to dispatch.`,
      isAvailable: true,
      canExecute: canManageOrders,
    };
  }

  return {
    actionId: "all_completed",
    label: "Fully Completed & Dispatched",
    variant: "success",
    description: "All lanyards have been printed, assembled, and dispatched.",
    isAvailable: false,
    canExecute: false,
  };
}
