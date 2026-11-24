import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  PackageCheck,
  PackagePlus,
  Plus,
  Wrench,
} from "lucide-react";
import { phase4Service } from "@/services/phase4Service";
import { ApiClientError } from "@/services/apiClient";
import { useUiShellStore } from "@/hooks/useToastStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/forms/FormField";
import type { AssemblyAssignmentRecord } from "@/types/phase4";
import type { ProductionJobDetailRecord } from "@/types/production";

interface AssemblyOperationsPanelProps {
  job: ProductionJobDetailRecord;
}

export function AssemblyOperationsPanel({ job }: AssemblyOperationsPanelProps): React.ReactElement {
  const queryClient = useQueryClient();
  const addToast = useUiShellStore((s) => s.addToast);

  const sizeLabel = job.item.lanyard_size_option_detail?.name || "16 mm";

  const [isAssignOpen, setIsAssignOpen] = React.useState(false);
  const [assignMode, setAssignMode] = React.useState<"labourer" | "office_assembly">("labourer");
  const [selectedLabourerId, setSelectedLabourerId] = React.useState("");
  const [assignQty, setAssignQty] = React.useState(job.required_quantity);
  const [isOverride, setIsOverride] = React.useState(false);
  const [overrideReason, setOverrideReason] = React.useState("");
  const [assignError, setAssignError] = React.useState<string | null>(null);

  // Material Issuance dialog
  const [issueTarget, setIssueTarget] = React.useState<AssemblyAssignmentRecord | null>(null);
  const [issueMatId, setIssueMatId] = React.useState("");
  const [issuePkgId, setIssuePkgId] = React.useState("");
  const [issuePackets, setIssuePackets] = React.useState(1);
  const [issueError, setIssueError] = React.useState<string | null>(null);

  // Receiving dialog
  const [recvTarget, setRecvTarget] = React.useState<AssemblyAssignmentRecord | null>(null);
  const [recvUsable, setRecvUsable] = React.useState(0);
  const [recvDefective, setRecvDefective] = React.useState(0);
  const [recvNotes, setRecvNotes] = React.useState("");
  const [recvError, setRecvError] = React.useState<string | null>(null);

  const { data: queueData } = useQuery({
    queryKey: ["assembly", "queue", job.id],
    queryFn: () => phase4Service.getAssemblyQueue(job.id),
  });

  const { data: labourersData } = useQuery({
    queryKey: ["labourers", { is_active: true, supported_size: sizeLabel }],
    queryFn: () =>
      phase4Service.listLabourers({ is_active: true, supported_size: sizeLabel }),
  });

  const { data: materialsPage } = useQuery({
    queryKey: ["inventory", "materials"],
    queryFn: () => phase4Service.listMaterials(),
  });

  const queueEntry = queueData?.results[0];
  const assignments = queueEntry?.assignments || [];
  const unassignedQty = queueEntry?.unassigned_quantity ?? job.required_quantity;
  const labourers = labourersData?.results || [];
  const materials = materialsPage?.results || [];

  React.useEffect(() => {
    setAssignQty(Math.max(1, unassignedQty));
  }, [unassignedQty]);

  const computeRecommendedPackets = React.useCallback(
    (matId: string, pkgId: string, asm: AssemblyAssignmentRecord | null) => {
      if (!asm || !matId || !pkgId) return 1;
      const mat = materials.find((m) => m.id === matId);
      const pkg = mat?.packagings.find((p) => p.id === pkgId);
      if (!pkg || pkg.units_per_package <= 0) return 1;
      const lab = labourers.find((l) => l.id === asm.labourer);
      const existing =
        lab?.material_balances.find((b) => b.material === matId)?.usable_quantity || 0;
      const needed = Math.max(0, asm.assigned_quantity - existing);
      return needed > 0 ? Math.ceil(needed / pkg.units_per_package) : 0;
    },
    [materials, labourers],
  );

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["assembly"] });
    void queryClient.invalidateQueries({ queryKey: ["production"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    void queryClient.invalidateQueries({ queryKey: ["labourers"] });
    void queryClient.invalidateQueries({ queryKey: ["dispatch"] });
  };

  const createAssignMutation = useMutation({
    mutationFn: () =>
      phase4Service.createAssignment({
        order_item: job.order_item,
        production_job: job.id,
        assignment_mode: assignMode,
        labourer: assignMode === "labourer" ? selectedLabourerId : null,
        assigned_quantity: assignQty,
        is_machine_override: isOverride,
        machine_override_reason: overrideReason.trim(),
      }),
    onSuccess: (created) => {
      setIsAssignOpen(false);
      setAssignError(null);
      setOverrideReason("");
      invalidateAll();
      addToast({
        title: `Assignment ${created.assignment_code} Created`,
        description: `Assigned ${created.assigned_quantity} pcs to ${created.labourer_name}.`,
        variant: "success",
      });
    },
    onError: (err) => {
      setAssignError(err instanceof ApiClientError ? err.message : "Could not assign assembly.");
    },
  });

  const issueMatMutation = useMutation({
    mutationFn: () =>
      phase4Service.issueAssignmentMaterials(issueTarget!.id, {
        lines: [
          {
            material: issueMatId,
            required_quantity: issueTarget!.assigned_quantity,
            packaging: issuePkgId || null,
            packets_issued: issuePkgId ? issuePackets : null,
          },
        ],
      }),
    onSuccess: (updated) => {
      setIssueTarget(null);
      setIssueError(null);
      invalidateAll();
      addToast({
        title: `Materials Issued (${updated.assignment_code})`,
        description: "Transferred from Main Office and recorded against labourer balance.",
        variant: "success",
      });
    },
    onError: (err) => {
      setIssueError(err instanceof ApiClientError ? err.message : "Material issuance failed.");
    },
  });

  const recvMutation = useMutation({
    mutationFn: () =>
      phase4Service.recordAssemblyReceiving(recvTarget!.id, {
        usable_quantity: recvUsable,
        defective_quantity: recvDefective,
        notes: recvNotes.trim(),
      }),
    onSuccess: (updated) => {
      setRecvTarget(null);
      setRecvError(null);
      setRecvNotes("");
      invalidateAll();
      addToast({
        title: `Assembly Delivery Recorded (${updated.assignment_code})`,
        description: `Usable: ${updated.received_usable_quantity}, Pending: ${updated.pending_quantity}.`,
        variant: "success",
      });
    },
    onError: (err) => {
      setRecvError(err instanceof ApiClientError ? err.message : "Receiving entry failed.");
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: (asm: AssemblyAssignmentRecord) =>
      phase4Service.reconcileAssignmentMaterials(asm.id, {
        material_reconciliations: asm.material_allocations.map((al) => ({
          allocation_id: al.id,
          consumed_quantity: asm.received_usable_quantity,
          defective_quantity: 0,
          returned_to_office_quantity: 0,
        })),
      }),
    onSuccess: (updated) => {
      invalidateAll();
      addToast({
        title: `Materials Reconciled (${updated.assignment_code})`,
        description: "Remaining usable stock retained in labourer balance for next assignment.",
        variant: "success",
      });
    },
    onError: (err) => {
      addToast({
        title: "Reconciliation Failed",
        description:
          err instanceof ApiClientError ? err.message : "Could not reconcile assignment materials.",
        variant: "error",
      });
    },
  });

  // Live preview math for Material Issuance dialog
  const selectedMat = materials.find((m) => m.id === issueMatId);
  const selectedPkg = selectedMat?.packagings.find((p) => p.id === issuePkgId);
  const issueLabourer = labourers.find((l) => l.id === issueTarget?.labourer);
  const existingLabourBal =
    issueLabourer?.material_balances.find((b) => b.material === issueMatId)?.usable_quantity || 0;
  const reqQty = issueTarget?.assigned_quantity || 0;
  const additionalNeeded = Math.max(0, reqQty - existingLabourBal);
  const issuedUnits = selectedPkg ? issuePackets * selectedPkg.units_per_package : additionalNeeded;
  const totalAvailAfterIssue = existingLabourBal + issuedUnits;
  const expectedRemainingAfter = Math.max(0, totalAvailAfterIssue - reqQty);

  return (
    <div className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/30 p-4">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-950">
            <Wrench className="h-4 w-4 text-blue-700" />
            Labour, Machine Compatibility &amp; Split Assembly Assignments
          </h4>
          <p className="mt-0.5 text-xs text-slate-600">
            Required Size: <strong>{sizeLabel}</strong> &bull; Total Assigned:{" "}
            <strong className="font-mono">
              {queueEntry?.total_assigned_quantity ?? 0}
            </strong>{" "}
            &bull; Remaining Unassigned:{" "}
            <strong className="font-mono text-blue-800">{unassignedQty}</strong>
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => {
            setAssignError(null);
            const firstCompat =
              labourers.find((l) => l.is_compatible_with_requested_size) || labourers[0];
            setSelectedLabourerId(firstCompat?.id || "");
            setAssignQty(Math.max(1, unassignedQty));
            setIsAssignOpen(true);
          }}
          disabled={unassignedQty <= 0}
          data-testid="open-create-assignment-btn"
        >
          <Plus className="h-3.5 w-3.5" />
          Assign Assembly ({unassignedQty} left)
        </Button>
      </div>

      {assignments.length === 0 ? (
        <p className="rounded border border-dashed border-slate-300 bg-white py-4 text-center text-xs text-slate-500">
          No split or full assembly assignments created yet. Click &ldquo;Assign Assembly&rdquo; to
          assign to a compatible labourer or Internal Office Assembly.
        </p>
      ) : (
        <div className="space-y-3">
          {assignments.map((asm) => (
            <div
              key={asm.id}
              className="rounded-lg border border-slate-200 bg-white p-3.5 text-xs shadow-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-slate-900">{asm.assignment_code}</span>
                  <Badge variant={asm.assignment_mode === "office_assembly" ? "neutral" : "default"}>
                    {asm.labourer_name}
                  </Badge>
                  {asm.assigned_machine_code ? (
                    <Badge variant="neutral" className="font-mono text-[10px]">
                      <Cpu className="h-3 w-3" />
                      {asm.assigned_machine_code}
                    </Badge>
                  ) : null}
                  <Badge variant={asm.status === "completed" ? "success" : "warning"}>
                    {asm.status_display}
                  </Badge>
                  {asm.is_reconciled ? <Badge variant="success">Materials Reconciled</Badge> : null}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {asm.assignment_mode === "labourer" && !asm.is_reconciled ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const defaultMat =
                          materials.find(
                            (m) =>
                              m.category === "jointer" &&
                              m.supported_size_label.toLowerCase() === sizeLabel.toLowerCase(),
                          ) || materials[0];
                        setIssueError(null);
                        setIssueTarget(asm);
                        const matId = defaultMat?.id || "";
                        const pkgId = defaultMat?.packagings[0]?.id || "";
                        setIssueMatId(matId);
                        setIssuePkgId(pkgId);
                        setIssuePackets(computeRecommendedPackets(matId, pkgId, asm));
                      }}
                      data-testid={`issue-materials-btn-${asm.assignment_code}`}
                    >
                      <PackagePlus className="h-3.5 w-3.5" />
                      Issue Materials
                    </Button>
                  ) : null}

                  {asm.pending_quantity > 0 ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setRecvError(null);
                        setRecvTarget(asm);
                        setRecvUsable(asm.pending_quantity);
                        setRecvDefective(0);
                      }}
                      data-testid={`receive-assembly-btn-${asm.assignment_code}`}
                    >
                      <PackageCheck className="h-3.5 w-3.5" />
                      Record Receiving ({asm.pending_quantity} pend)
                    </Button>
                  ) : null}

                  {asm.material_allocations.length > 0 && !asm.is_reconciled ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reconcileMutation.mutate(asm)}
                      disabled={reconcileMutation.isPending}
                      data-testid={`reconcile-assignment-btn-${asm.assignment_code}`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Reconcile Materials
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <span className="text-slate-500">Assigned:</span>{" "}
                  <strong className="font-mono">{asm.assigned_quantity}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Received Usable:</span>{" "}
                  <strong className="font-mono text-emerald-800">
                    {asm.received_usable_quantity}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Defective:</span>{" "}
                  <strong className="font-mono text-red-700">
                    {asm.received_defective_quantity}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Pending:</span>{" "}
                  <strong className="font-mono">{asm.pending_quantity}</strong>
                </div>
              </div>

              {asm.material_allocations.length > 0 ? (
                <div className="mt-2 rounded bg-slate-50 p-2 text-[11px] text-slate-700">
                  <span className="font-semibold">Material Allocations:</span>{" "}
                  {asm.material_allocations.map((al) => (
                    <span key={al.id} className="mr-3 inline-block">
                      {al.material_name}: need <strong>{al.required_quantity}</strong>, opening{" "}
                      <strong>{al.opening_labour_balance}</strong>, issued{" "}
                      <strong>{al.issued_quantity}</strong>{" "}
                      {al.packets_issued ? `(${al.packets_issued} pkt)` : ""}, closing{" "}
                      <strong className="text-emerald-800">{al.closing_labour_balance}</strong>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Assign Assembly Dialog */}
      <Dialog
        open={isAssignOpen}
        onOpenChange={setIsAssignOpen}
        title="Assign Lanyard Assembly"
        description={`Split across multiple labourers or assign to Internal Office Assembly. Required machine size: ${sizeLabel}.`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createAssignMutation.mutate();
          }}
          className="space-y-4"
        >
          {assignError ? (
            <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{assignError}</span>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="asm-mode" label="Assembly Mode">
              <Select
                id="asm-mode"
                value={assignMode}
                onChange={(e) =>
                  setAssignMode(e.target.value as "labourer" | "office_assembly")
                }
              >
                <option value="labourer">External / Floor Labourer</option>
                <option value="office_assembly">Internal Office Assembly</option>
              </Select>
            </FormField>

            <FormField id="asm-qty" label={`Quantity (Max ${unassignedQty})`} required>
              <Input
                id="asm-qty"
                type="number"
                min={1}
                max={unassignedQty}
                value={assignQty}
                onChange={(e) => setAssignQty(parseInt(e.target.value || "1", 10))}
              />
            </FormField>
          </div>

          {assignMode === "labourer" ? (
            <>
              <FormField id="asm-labourer" label="Select Labourer (Machine Compatibility)" required>
                <Select
                  id="asm-labourer"
                  value={selectedLabourerId}
                  onChange={(e) => setSelectedLabourerId(e.target.value)}
                >
                  <option value="">— Select Labourer —</option>
                  {labourers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} —{" "}
                      {l.is_compatible_with_requested_size
                        ? `Compatible (${l.supported_lanyard_sizes.join(", ")})`
                        : `No ${sizeLabel} Machine`}
                    </option>
                  ))}
                </Select>
              </FormField>

              <Checkbox
                id="asm-override-check"
                checked={isOverride}
                onChange={(e) => setIsOverride(e.target.checked)}
                label="Override machine compatibility check (requires reason)"
              />

              {isOverride ? (
                <FormField id="asm-override-reason" label="Override Reason" required>
                  <Input
                    id="asm-override-reason"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Reason for assigning without matching machine"
                  />
                </FormField>
              ) : null}
            </>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsAssignOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createAssignMutation.isPending}
              data-testid="confirm-create-assignment-btn"
            >
              Confirm Assignment
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Issue Materials Dialog */}
      <Dialog
        open={Boolean(issueTarget)}
        onOpenChange={(open) => !open && setIssueTarget(null)}
        title={`Issue Raw Materials — ${issueTarget?.assignment_code || ""}`}
        description={`Labourer: ${issueTarget?.labourer_name || ""} | Required: ${reqQty} lanyards`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            issueMatMutation.mutate();
          }}
          className="space-y-4"
        >
          {issueError ? (
            <div className="rounded-[8px] border border-red-200 bg-red-50 p-2.5 text-[13px] text-red-700">
              {issueError}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <FormField id="iss-mat" label="Material">
              <Select
                id="iss-mat"
                value={issueMatId}
                onChange={(e) => {
                  const m = materials.find((x) => x.id === e.target.value);
                  const pkgId = m?.packagings[0]?.id || "";
                  setIssueMatId(e.target.value);
                  setIssuePkgId(pkgId);
                  setIssuePackets(computeRecommendedPackets(e.target.value, pkgId, issueTarget));
                }}
              >
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} (Office: {m.office_usable_stock})
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField id="iss-pkg" label="Vendor Packaging">
              <Select
                id="iss-pkg"
                value={issuePkgId}
                onChange={(e) => {
                  setIssuePkgId(e.target.value);
                  setIssuePackets(
                    computeRecommendedPackets(issueMatId, e.target.value, issueTarget),
                  );
                }}
              >
                <option value="">Exact Additional Needed</option>
                {(selectedMat?.packagings || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.package_name} ({p.units_per_package}/pkt)
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField id="iss-pkts" label="Packets to Issue">
              <Input
                id="iss-pkts"
                type="number"
                min={0}
                disabled={!issuePkgId}
                value={issuePackets}
                onChange={(e) => setIssuePackets(parseInt(e.target.value || "0", 10))}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs sm:grid-cols-3">
            <div>
              Required: <strong className="font-mono">{reqQty}</strong>
            </div>
            <div>
              Existing Balance: <strong className="font-mono">{existingLabourBal}</strong>
            </div>
            <div>
              Additional Needed: <strong className="font-mono">{additionalNeeded}</strong>
            </div>
            <div>
              New Issued Qty: <strong className="font-mono text-blue-900">{issuedUnits}</strong>
            </div>
            <div>
              Total Available: <strong className="font-mono">{totalAvailAfterIssue}</strong>
            </div>
            <div>
              Expected Remaining:{" "}
              <strong className="font-mono text-emerald-800">{expectedRemainingAfter}</strong>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIssueTarget(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={issueMatMutation.isPending}
              data-testid="confirm-issue-materials-btn"
            >
              Issue Materials &amp; Transfer Stock
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Assembly Receiving Dialog */}
      <Dialog
        open={Boolean(recvTarget)}
        onOpenChange={(open) => !open && setRecvTarget(null)}
        title={`Record Assembly Receiving — ${recvTarget?.assignment_code || ""}`}
        description={`Remaining pending quantity: ${recvTarget?.pending_quantity || 0}. Partial deliveries supported.`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            recvMutation.mutate();
          }}
          className="space-y-4"
        >
          {recvError ? (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {recvError}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="recv-usable" label="Usable Lanyards Received" required>
              <Input
                id="recv-usable"
                type="number"
                min={0}
                value={recvUsable}
                onChange={(e) => setRecvUsable(parseInt(e.target.value || "0", 10))}
              />
            </FormField>
            <FormField id="recv-defective" label="Defective Lanyards">
              <Input
                id="recv-defective"
                type="number"
                min={0}
                value={recvDefective}
                onChange={(e) => setRecvDefective(parseInt(e.target.value || "0", 10))}
              />
            </FormField>
          </div>

          <FormField id="recv-notes" label="Delivery / Quality Notes">
            <Input
              id="recv-notes"
              value={recvNotes}
              onChange={(e) => setRecvNotes(e.target.value)}
              placeholder="Checked stitching and hook tension"
            />
          </FormField>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRecvTarget(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={recvMutation.isPending}
              data-testid="confirm-assembly-receiving-btn"
            >
              Save Delivery Entry
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
