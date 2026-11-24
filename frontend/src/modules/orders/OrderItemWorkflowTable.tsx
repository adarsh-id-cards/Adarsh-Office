import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  CreditCard,
  Printer,
  Ribbon,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { productionService } from "@/services/productionService";
import { useUiShellStore } from "@/hooks/useToastStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderItemProductionPanel } from "@/modules/production/OrderItemProductionPanel";
import type { OrderDetailRecord, OrderItemRecord } from "@/types/orders";

interface OrderItemWorkflowTableProps {
  order: OrderDetailRecord;
  expandedItemLines: Record<number, boolean>;
  onToggleItemExpansion: (lineNumber: number) => void;
  onOpenDispatchModal: (item: OrderItemRecord) => void;
  isCancelled?: boolean;
}

export function OrderItemWorkflowTable({
  order,
  expandedItemLines,
  onToggleItemExpansion,
  onOpenDispatchModal,
  isCancelled = false,
}: OrderItemWorkflowTableProps): React.ReactElement {
  const queryClient = useQueryClient();
  const addToast = useUiShellStore((state) => state.addToast);

  // Quick Action Mutation: Mark / Approve Design
  const approveDesignMutation = useMutation({
    mutationFn: async ({ jobId }: { jobId: string }) => {
      try {
        await productionService.startDesign(jobId);
      } catch {
        // Already started, proceed to approve
      }
      return productionService.approveDesign(jobId);
    },
    onSuccess: () => {
      addToast({
        title: "Design Approved",
        description: "Item design has been approved successfully.",
        variant: "success",
      });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (err) => {
      addToast({
        title: "Could Not Approve Design",
        description: err instanceof Error ? err.message : "Error updating design status",
        variant: "error",
      });
    },
  });

  // Quick Action Mutation: Complete Lanyard Assembly
  const completeAssemblyMutation = useMutation({
    mutationFn: async ({ jobId, quantity }: { jobId: string; quantity: number }) => {
      return productionService.completeAssembly(jobId, {
        completed_assembly_quantity: quantity,
      });
    },
    onSuccess: () => {
      addToast({
        title: "Assembly Completed",
        description: "Lanyard assembly marked as complete.",
        variant: "success",
      });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["production"] });
      void queryClient.invalidateQueries({ queryKey: ["assembly"] });
    },
    onError: (err) => {
      addToast({
        title: "Could Not Complete Assembly",
        description: err instanceof Error ? err.message : "Error updating assembly status",
        variant: "error",
      });
    },
  });

  // Quick Action Mutation: Complete ID Card Production
  const completeIdCardMutation = useMutation({
    mutationFn: async ({ jobId, quantity }: { jobId: string; quantity: number }) => {
      return productionService.completeIdCardProduction(jobId, {
        ready_for_packing_quantity: quantity,
      });
    },
    onSuccess: () => {
      addToast({
        title: "Production Completed",
        description: "ID Card production completed and ready for packing/dispatch.",
        variant: "success",
      });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (err) => {
      addToast({
        title: "Could Not Complete Production",
        description: err instanceof Error ? err.message : "Error completing card production",
        variant: "error",
      });
    },
  });

  return (
    <div className="rounded-[10px] border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <Table className="min-w-[900px] w-full">
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-slate-200">
              <TableHead className="w-12 text-center text-xs font-bold text-slate-700">#</TableHead>
              <TableHead className="min-w-[200px] text-xs font-bold text-slate-700">Item &amp; Specifications</TableHead>
              <TableHead className="w-24 text-right text-xs font-bold text-slate-700">Ordered</TableHead>
              <TableHead className="w-24 text-right text-xs font-bold text-slate-700">Produced</TableHead>
              <TableHead className="w-24 text-right text-xs font-bold text-slate-700">Dispatched</TableHead>
              <TableHead className="w-36 text-center text-xs font-bold text-slate-700">1. Design</TableHead>
              <TableHead className="w-36 text-center text-xs font-bold text-slate-700">2. Printing</TableHead>
              <TableHead className="w-36 text-center text-xs font-bold text-slate-700">3. Assembly</TableHead>
              <TableHead className="w-36 text-center text-xs font-bold text-slate-700">4. Dispatch</TableHead>
              <TableHead className="w-32 text-right text-xs font-bold text-slate-700">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.map((item) => {
              const isCard = item.category === "id_card";
              const isLanyard = item.category === "lanyard";
              const job = item.production_job;
              const isExpanded = Boolean(expandedItemLines[item.line_number]);

              // Stage completion statuses
              const isDesignDone = job
                ? job.design_status === "approved" || job.design_status === "completed"
                : false;
              const isPrintingDone = job ? job.printing_status === "completed" : false;
              const isAssemblyDone = isLanyard
                ? job?.assembly_status === "completed"
                : true; // Not applicable for ID Cards
              const isReadyForDispatch = Boolean(
                job?.is_ready_for_dispatch || job?.is_production_completed,
              );
              const isDispatched =
                item.dispatched_quantity >= item.ordered_quantity && item.ordered_quantity > 0;

              return (
                <React.Fragment key={item.id}>
                  <TableRow className={cn(
                    "transition-colors hover:bg-slate-50/80 border-b border-slate-100",
                    isExpanded && "bg-blue-50/20"
                  )}>
                    {/* Line # */}
                    <TableCell className="text-center font-bold text-slate-600">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-800">
                        {item.line_number}
                      </span>
                    </TableCell>

                    {/* Item Name & Specs */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 text-[13.5px]">
                            {item.item_name}
                          </span>
                          <Badge
                            variant="neutral"
                            className={cn(
                              "text-[10px] px-1.5 py-0 h-4 font-medium",
                              isCard
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-purple-50 text-purple-700 border-purple-200",
                            )}
                          >
                            {isCard ? (
                              <CreditCard className="mr-1 h-2.5 w-2.5 inline" />
                            ) : (
                              <Ribbon className="mr-1 h-2.5 w-2.5 inline" />
                            )}
                            {isCard ? "ID Card" : "Lanyard"}
                          </Badge>
                        </div>
                        <p className="text-[11.5px] text-slate-500 truncate max-w-[260px]">
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
                        </p>
                      </div>
                    </TableCell>

                    {/* Ordered Qty */}
                    <TableCell className="text-right font-mono font-semibold text-slate-900 text-[13px]">
                      {item.ordered_quantity.toLocaleString("en-IN")}
                    </TableCell>

                    {/* Produced Qty */}
                    <TableCell className="text-right font-mono font-bold text-blue-800 text-[13px]">
                      {item.prepared_quantity.toLocaleString("en-IN")}
                    </TableCell>

                    {/* Dispatched Qty */}
                    <TableCell className="text-right font-mono font-bold text-emerald-800 text-[13px]">
                      {item.dispatched_quantity.toLocaleString("en-IN")}
                    </TableCell>

                    {/* 1. Design Column */}
                    <TableCell className="text-center">
                      {isDesignDone ? (
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-800 select-none">
                          <Check className="h-3 w-3 stroke-[3] text-emerald-600" />
                          <span>Approved</span>
                        </div>
                      ) : job ? (
                        <button
                          type="button"
                          onClick={() => approveDesignMutation.mutate({ jobId: job.id })}
                          disabled={approveDesignMutation.isPending || isCancelled}
                          className="group inline-flex items-center gap-1.5 rounded-[6px] border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-slate-700 shadow-sm transition hover:border-blue-600 hover:bg-blue-50/70 hover:text-blue-900 active:scale-95 disabled:opacity-50"
                          title="Click checkbox to mark Design as Approved"
                        >
                          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-slate-400 bg-white transition group-hover:border-blue-600 group-hover:bg-blue-100" />
                          <span>{job.design_status === "in_progress" ? "Approve Design" : "Start & Approve"}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Pending</span>
                      )}
                    </TableCell>

                    {/* 2. Printing Column */}
                    <TableCell className="text-center">
                      {isPrintingDone ? (
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-800 select-none">
                          <Check className="h-3 w-3 stroke-[3] text-emerald-600" />
                          <span>Printed</span>
                        </div>
                      ) : !isDesignDone ? (
                        <span className="text-[11px] text-slate-400 italic">Awaiting Design</span>
                      ) : isCard && isReadyForDispatch ? (
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-800 select-none">
                          <Check className="h-3 w-3 stroke-[3] text-emerald-600" />
                          <span>Ready for Packing</span>
                        </div>
                      ) : isCard && job ? (
                        <button
                          type="button"
                          onClick={() => completeIdCardMutation.mutate({ jobId: job.id, quantity: item.ordered_quantity })}
                          disabled={completeIdCardMutation.isPending || isCancelled}
                          className="group inline-flex items-center gap-1.5 rounded-[6px] border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-slate-700 shadow-sm transition hover:border-blue-600 hover:bg-blue-50/70 hover:text-blue-900 active:scale-95 disabled:opacity-50"
                          title="Click to mark printing complete and ready for dispatch"
                        >
                          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-slate-400 bg-white transition group-hover:border-blue-600" />
                          <span>Mark Printed</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onToggleItemExpansion(item.line_number)}
                          className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50/60 px-2 py-0.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-100 transition"
                        >
                          <Printer className="h-3 w-3" />
                          <span>Print Runs</span>
                        </button>
                      )}
                    </TableCell>

                    {/* 3. Assembly Column */}
                    <TableCell className="text-center">
                      {!isLanyard ? (
                        <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-400 italic select-none">
                          N/A (Cards)
                        </span>
                      ) : isAssemblyDone ? (
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-800 select-none">
                          <Check className="h-3 w-3 stroke-[3] text-emerald-600" />
                          <span>Assembled</span>
                        </div>
                      ) : !isPrintingDone ? (
                        <span className="text-[11px] text-slate-400 italic">Awaiting Print</span>
                      ) : job ? (
                        <button
                          type="button"
                          onClick={() =>
                            completeAssemblyMutation.mutate({
                              jobId: job.id,
                              quantity: item.ordered_quantity,
                            })
                          }
                          disabled={completeAssemblyMutation.isPending || isCancelled}
                          className="group inline-flex items-center gap-1.5 rounded-[6px] border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-slate-700 shadow-sm transition hover:border-emerald-600 hover:bg-emerald-50/70 hover:text-emerald-900 active:scale-95 disabled:opacity-50"
                          title="Click checkbox to mark Assembly as Complete"
                        >
                          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-slate-400 bg-white transition group-hover:border-emerald-600 group-hover:bg-emerald-100" />
                          <span>Mark Assembled</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Pending</span>
                      )}
                    </TableCell>

                    {/* 4. Dispatch Column */}
                    <TableCell className="text-center">
                      {isDispatched ? (
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-800 select-none">
                          <Check className="h-3 w-3 stroke-[3] text-emerald-600" />
                          <span>Dispatched</span>
                        </div>
                      ) : isReadyForDispatch ? (
                        <button
                          type="button"
                          onClick={() => onOpenDispatchModal(item)}
                          disabled={isCancelled}
                          className="inline-flex items-center gap-1 rounded-[6px] border border-blue-400 bg-blue-50 px-2 py-1 text-[11.5px] font-semibold text-blue-800 shadow-sm transition hover:bg-blue-100 active:scale-95 disabled:opacity-50"
                        >
                          <Truck className="h-3 w-3 text-blue-600" />
                          <span>{item.dispatched_quantity > 0 ? "Add Dispatch" : "Dispatch"}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">In Production</span>
                      )}
                    </TableCell>

                    {/* Details Column with test ID preservation */}
                    <TableCell className="text-right">
                      {job ? (
                        <Button
                          size="sm"
                          variant={isExpanded ? "default" : "outline"}
                          onClick={() => onToggleItemExpansion(item.line_number)}
                          data-testid={`open-production-job-${item.line_number}`}
                          className="h-7 px-2 text-[11.5px] font-medium gap-1"
                        >
                          <Printer className="h-3 w-3" />
                          <span>{isExpanded ? "Hide" : "Details"}</span>
                          <ChevronDown
                            className={cn(
                              "h-3 w-3 transition-transform",
                              isExpanded && "rotate-180",
                            )}
                          />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>

                  {/* Expandable Detailed Production Workspace (Batch Calculator & Runs) */}
                  {isExpanded && job ? (
                    <TableRow className="bg-slate-50/70 border-b border-slate-200">
                      <TableCell colSpan={10} className="p-3.5 pt-2">
                        <div className="rounded-[8px] border border-slate-200 bg-white p-3 shadow-sm animate-in fade-in-0 duration-200">
                          <div className="mb-2.5 flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                              {item.item_name} &bull; Detailed Production Tools
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onToggleItemExpansion(item.line_number)}
                              className="h-6 px-2 text-xs text-slate-500 hover:text-slate-800"
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
                      </TableCell>
                    </TableRow>
                  ) : null}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
