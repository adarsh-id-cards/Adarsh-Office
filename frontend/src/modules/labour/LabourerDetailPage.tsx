import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Package,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { phase4Service } from "@/services/phase4Service";
import { ApiClientError } from "@/services/apiClient";
import { useUiShellStore } from "@/hooks/useToastStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { PageHeader } from "@/components/shared/PageHeader";
import { FormField } from "@/components/forms/FormField";
import { formatDateTimeIST } from "@/lib/utils";
import type { SeasonalClosingRecord } from "@/types/phase4";

export function LabourerDetailPage(): React.ReactElement {
  const { labourerId } = useParams<{ labourerId: string }>();
  const queryClient = useQueryClient();
  const addToast = useUiShellStore((s) => s.addToast);

  const [isClosingDialogOpen, setIsClosingDialogOpen] = React.useState(false);
  const [seasonLabel, setSeasonLabel] = React.useState("Annual Production Season");
  const [activeDraftClosing, setActiveDraftClosing] = React.useState<SeasonalClosingRecord | null>(
    null,
  );
  const [materialInputs, setMaterialInputs] = React.useState<
    Record<string, { usable: number; defective: number; explanation: string }>
  >({});
  const [markInactive, setMarkInactive] = React.useState(false);
  const [closingError, setClosingError] = React.useState<string | null>(null);

  const { data: labourer, isLoading } = useQuery({
    queryKey: ["labourers", "detail", labourerId],
    queryFn: () => phase4Service.getLabourer(labourerId!),
    enabled: Boolean(labourerId),
  });

  const createClosingMutation = useMutation({
    mutationFn: () =>
      phase4Service.createSeasonalClosing({
        labourer: labourerId!,
        season_label: seasonLabel.trim() || "Annual Production Season",
      }),
    onSuccess: (closing) => {
      setActiveDraftClosing(closing);
      const initMap: Record<string, { usable: number; defective: number; explanation: string }> =
        {};
      closing.material_lines.forEach((ln) => {
        initMap[ln.id] = {
          usable: ln.expected_usable_balance,
          defective: 0,
          explanation: "",
        };
      });
      setMaterialInputs(initMap);
      setClosingError(null);
      setIsClosingDialogOpen(true);
    },
    onError: (err) => {
      setClosingError(
        err instanceof ApiClientError ? err.message : "Could not initiate seasonal closing.",
      );
    },
  });

  const reconcileClosingMutation = useMutation({
    mutationFn: () =>
      phase4Service.reconcileSeasonalClosing(activeDraftClosing!.id, {
        material_lines: (activeDraftClosing?.material_lines || []).map((ln) => {
          const inp = materialInputs[ln.id] || {
            usable: ln.expected_usable_balance,
            defective: 0,
            explanation: "",
          };
          return {
            id: ln.id,
            actual_returned_usable: inp.usable,
            actual_returned_defective: inp.defective,
            discrepancy_explanation: inp.explanation,
          };
        }),
        machine_lines: (activeDraftClosing?.machine_lines || []).map((m) => ({
          id: m.id,
          was_returned: true,
          return_condition: "good",
        })),
        mark_labourer_inactive: markInactive,
      }),
    onSuccess: (reconciled) => {
      setIsClosingDialogOpen(false);
      setActiveDraftClosing(null);
      void queryClient.invalidateQueries({ queryKey: ["labourers"] });
      void queryClient.invalidateQueries({ queryKey: ["machines"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      addToast({
        title: `Seasonal Closing ${reconciled.closing_code} Completed`,
        description: "Returned machines and raw materials transferred back to Main Office.",
        variant: "success",
      });
    },
    onError: (err) => {
      setClosingError(
        err instanceof ApiClientError ? err.message : "Could not reconcile seasonal closing.",
      );
    },
  });

  if (isLoading || !labourer) {
    return (
      <div className="py-12 text-center">
        <Spinner label="Loading labourer profile..." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        backLink={{ to: "/labour", label: "Labourers" }}
        title={labourer.name}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={labourer.is_active ? "success" : "neutral"}>
              {labourer.is_active ? "Active" : "Inactive"}
            </Badge>
            {labourer.contact_number ? (
              <span className="text-[13px] text-slate-500">Contact: {labourer.contact_number}</span>
            ) : null}
          </div>
        }
        actions={
          <Button
            variant="outline"
            onClick={() => createClosingMutation.mutate()}
            disabled={createClosingMutation.isPending}
            data-testid="start-seasonal-closing-btn"
          >
            <RefreshCw className="h-4 w-4" />
            Seasonal Recovery &amp; Closing
          </Button>
        }
      />

      {/* Overview Strip */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Held Machines */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Cpu className="h-4 w-4 text-blue-700" />
              Allocated Machines ({labourer.allocated_machines.length})
            </CardTitle>
            <CardDescription>
              Determines compatible lanyard sizes for assembly assignment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {labourer.allocated_machines.length === 0 ? (
              <p className="text-xs text-slate-500">
                No physical machines currently assigned to {labourer.name}.
              </p>
            ) : (
              <div className="space-y-2">
                {labourer.allocated_machines.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-900">{m.machine_code}</span>{" "}
                      &mdash; {m.name}
                    </div>
                    <Badge variant="default">{m.supported_size_label}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Material Balances Held */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4 text-blue-700" />
              Current Material Balances Held
            </CardTitle>
            <CardDescription>
              Remaining usable materials retained across assignments until seasonal recovery.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {labourer.material_balances.length === 0 ? (
              <p className="text-xs text-slate-500">No material balances recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Usable Held</TableHead>
                    <TableHead>Defective Held</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {labourer.material_balances.map((bal) => (
                    <TableRow key={bal.id}>
                      <TableCell className="text-xs font-medium text-slate-900">
                        {bal.material_name}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-bold text-emerald-800">
                        {bal.usable_quantity.toLocaleString("en-IN")} {bal.base_unit}s
                      </TableCell>
                      <TableCell className="font-mono text-xs text-red-700">
                        {bal.defective_quantity.toLocaleString("en-IN")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assignments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Wrench className="h-4 w-4 text-blue-700" />
            Assembly Assignments ({labourer.assignments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {labourer.assignments.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">
              No lanyard assembly assignments recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Order &amp; Item</TableHead>
                  <TableHead>Assigned Qty</TableHead>
                  <TableHead>Received Usable / Defective</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {labourer.assignments.map((asm) => (
                  <TableRow key={asm.id}>
                    <TableCell className="font-mono text-xs font-semibold">
                      {asm.assignment_code}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Link
                        to={`/production/jobs/${asm.production_job}`}
                        className="font-semibold text-blue-700 hover:underline"
                      >
                        {asm.order_number} &bull; {asm.item_name}
                      </Link>
                      <p className="text-[11px] text-slate-500">
                        {asm.client_name} ({asm.lanyard_size_name})
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{asm.assigned_quantity}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <span className="text-emerald-800">{asm.received_usable_quantity}</span> /{" "}
                      <span className="text-red-700">{asm.received_defective_quantity}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold">
                      {asm.pending_quantity}
                    </TableCell>
                    <TableCell>
                      <Badge variant={asm.status === "completed" ? "success" : "default"}>
                        {asm.status_display}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Material Transaction Ledger */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            Material Movement Ledger ({labourer.material_movements.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {labourer.material_movements.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">No stock movements yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tx Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>From &rarr; To</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {labourer.material_movements.map((mov) => (
                  <TableRow key={mov.id}>
                    <TableCell className="font-mono text-xs font-semibold">
                      {mov.transaction_code}
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">{mov.movement_type_label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{mov.material_name}</TableCell>
                    <TableCell className="font-mono text-xs font-bold">
                      {mov.quantity} {mov.base_unit}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {mov.source_location_name || "External"} &rarr;{" "}
                      {mov.destination_location_name || "Consumed"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {formatDateTimeIST(mov.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Seasonal Recovery & Closing Dialog */}
      <Dialog
        open={isClosingDialogOpen}
        onOpenChange={setIsClosingDialogOpen}
        title={`Seasonal Closing (${activeDraftClosing?.closing_code || ""}) — ${labourer.name}`}
        description="Verify actual returned machines and remaining raw materials to reconcile and close out seasonal holdings back to Main Office."
      >
        <div className="space-y-4">
          {closingError ? (
            <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{closingError}</span>
            </div>
          ) : null}

          <FormField id="season-label-input" label="Season Label">
            <Input
              id="season-label-input"
              value={seasonLabel}
              onChange={(e) => setSeasonLabel(e.target.value)}
            />
          </FormField>

          {activeDraftClosing && activeDraftClosing.machine_lines.length > 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
              <p className="font-semibold text-slate-800">
                Machines to Recover ({activeDraftClosing.machine_lines.length})
              </p>
              <ul className="mt-1 space-y-1">
                {activeDraftClosing.machine_lines.map((ml) => (
                  <li key={ml.id} className="flex items-center justify-between">
                    <span>
                      {ml.machine_code} ({ml.supported_size_label})
                    </span>
                    <Badge variant="success">Return to Office</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {activeDraftClosing && activeDraftClosing.material_lines.length > 0 ? (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-2">
              {activeDraftClosing.material_lines.map((ln) => {
                const inp = materialInputs[ln.id] || {
                  usable: ln.expected_usable_balance,
                  defective: 0,
                  explanation: "",
                };
                const missing = ln.expected_usable_balance - inp.usable - inp.defective;
                return (
                  <div
                    key={ln.id}
                    className="grid gap-2 border-b border-slate-100 pb-2 text-xs last:border-0 sm:grid-cols-4"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{ln.material_name}</p>
                      <p className="text-xs text-slate-500">
                        Expected: <strong>{ln.expected_usable_balance}</strong> {ln.base_unit}
                      </p>
                    </div>
                    <div>
                      <span className="text-[11.5px] font-medium text-slate-600">Returned Usable</span>
                      <Input
                        type="number"
                        min={0}
                        value={inp.usable}
                        onChange={(e) =>
                          setMaterialInputs((p) => ({
                            ...p,
                            [ln.id]: {
                              ...inp,
                              usable: parseInt(e.target.value || "0", 10),
                            },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <span className="text-[11.5px] font-medium text-slate-600">Returned Defective</span>
                      <Input
                        type="number"
                        min={0}
                        value={inp.defective}
                        onChange={(e) =>
                          setMaterialInputs((p) => ({
                            ...p,
                            [ln.id]: {
                              ...inp,
                              defective: parseInt(e.target.value || "0", 10),
                            },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <span className="text-[11.5px] font-medium text-slate-600">
                        Variance ({missing >= 0 ? `-${missing}` : `+${Math.abs(missing)}`})
                      </span>
                      <Input
                        value={inp.explanation}
                        onChange={(e) =>
                          setMaterialInputs((p) => ({
                            ...p,
                            [ln.id]: { ...inp, explanation: e.target.value },
                          }))
                        }
                        placeholder="Variance reason"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <Checkbox
            id="mark-inactive"
            checked={markInactive}
            onChange={(e) => setMarkInactive(e.target.checked)}
            label="Mark labourer inactive after seasonal closing reconciliation"
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsClosingDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => reconcileClosingMutation.mutate()}
              disabled={reconcileClosingMutation.isPending}
              data-testid="confirm-seasonal-closing-btn"
            >
              <CheckCircle2 className="h-4 w-4" />
              {reconcileClosingMutation.isPending ? "Reconciling..." : "Reconcile & Recover"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
