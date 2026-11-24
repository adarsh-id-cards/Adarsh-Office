import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  Save,
  Send,
} from "lucide-react";
import { phase4Service } from "@/services/phase4Service";
import { ApiClientError } from "@/services/apiClient";
import { useUiShellStore } from "@/hooks/useToastStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StockAuditRecord } from "@/types/phase4";

export function StockAuditPanel({ embedded = false }: { embedded?: boolean }): React.ReactElement {
  const queryClient = useQueryClient();
  const addToast = useUiShellStore((s) => s.addToast);

  const [selectedAuditId, setSelectedAuditId] = React.useState<string>("");
  const [lineDrafts, setLineDrafts] = React.useState<
    Record<string, { physical: number; reason: string }>
  >({});
  const [actionError, setActionError] = React.useState<string | null>(null);

  const { data: auditsData, isLoading } = useQuery({
    queryKey: ["stock-audits"],
    queryFn: () => phase4Service.listAudits(),
  });

  const audits = auditsData?.results || [];
  const activeAudit: StockAuditRecord | undefined =
    audits.find((a) => a.id === selectedAuditId) || audits[0];

  React.useEffect(() => {
    if (!activeAudit) return;
    if (!selectedAuditId) {
      setSelectedAuditId(activeAudit.id);
    }
    const nextDrafts: Record<string, { physical: number; reason: string }> = {};
    activeAudit.lines.forEach((ln) => {
      nextDrafts[ln.id] = {
        physical: ln.physical_usable_quantity,
        reason: ln.discrepancy_reason || "",
      };
    });
    setLineDrafts(nextDrafts);
    setActionError(null);
  }, [activeAudit, selectedAuditId]);

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["stock-audits"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
  };

  const createAuditMutation = useMutation({
    mutationFn: () => phase4Service.createAudit({ notes: "Weekly physical stock verification" }),
    onSuccess: (created) => {
      setSelectedAuditId(created.id);
      invalidateAll();
      addToast({
        title: `Audit ${created.audit_code} Started`,
        description: "Enter actual physical stock counts for Main Office materials.",
        variant: "success",
      });
    },
    onError: (err) => {
      setActionError(err instanceof ApiClientError ? err.message : "Could not create audit.");
    },
  });

  const saveCountsPayload = () =>
    (activeAudit?.lines || []).map((ln) => {
      const d = lineDrafts[ln.id] || {
        physical: ln.physical_usable_quantity,
        reason: ln.discrepancy_reason,
      };
      return {
        line_id: ln.id,
        physical_usable_quantity: d.physical,
        discrepancy_reason: d.reason,
      };
    });

  const saveCountsMutation = useMutation({
    mutationFn: () => phase4Service.updateAuditCounts(activeAudit!.id, saveCountsPayload()),
    onSuccess: () => {
      setActionError(null);
      invalidateAll();
      addToast({ title: "Physical Counts Saved", variant: "success" });
    },
    onError: (err) => {
      setActionError(err instanceof ApiClientError ? err.message : "Failed to save counts.");
    },
  });

  const submitAuditMutation = useMutation({
    mutationFn: async () => {
      await phase4Service.updateAuditCounts(activeAudit!.id, saveCountsPayload());
      return phase4Service.submitAudit(activeAudit!.id);
    },
    onSuccess: (updated) => {
      setActionError(null);
      invalidateAll();
      addToast({
        title: `Audit ${updated.audit_code} Submitted`,
        description: "Ready for final approval and ledger posting.",
        variant: "success",
      });
    },
    onError: (err) => {
      setActionError(err instanceof ApiClientError ? err.message : "Submission failed.");
    },
  });

  const approveAuditMutation = useMutation({
    mutationFn: async () => {
      await phase4Service.updateAuditCounts(activeAudit!.id, saveCountsPayload());
      return phase4Service.approveAudit(activeAudit!.id);
    },
    onSuccess: (approved) => {
      setActionError(null);
      invalidateAll();
      addToast({
        title: `Audit ${approved.audit_code} Approved`,
        description: "Ledger adjustment movements generated and balances updated.",
        variant: "success",
      });
    },
    onError: (err) => {
      setActionError(err instanceof ApiClientError ? err.message : "Approval failed.");
    },
  });

  return (
    <div className="space-y-5">
      {!embedded ? (
        <PageHeader
          title="Physical Stock Audit & Reconciliation"
          description="Compare system expected balances with counted physical stock, capture discrepancy reasons, and generate ledger adjustments upon approval."
          actions={
            <Button
              size="sm"
              onClick={() => createAuditMutation.mutate()}
              disabled={createAuditMutation.isPending}
              data-testid="start-new-audit-btn"
            >
              <Plus className="h-4 w-4" />
              Start Physical Audit
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Physical Stock Counts &amp; Reconciliation
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Compare system expected balances with counted physical stock and post adjustments.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => createAuditMutation.mutate()}
            disabled={createAuditMutation.isPending}
            data-testid="start-new-audit-btn"
          >
            <Plus className="h-4 w-4" />
            Start Physical Audit
          </Button>
        </div>
      )}

      {actionError ? (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 p-3.5 text-xs text-red-800"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold">Audit Validation Error</p>
            <p className="mt-0.5">{actionError}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Audit Sessions List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Audit Sessions ({audits.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Spinner label="Loading audits..." />
            ) : audits.length === 0 ? (
              <p className="text-xs text-slate-500">
                No audits initiated yet. Click &ldquo;Start Physical Audit&rdquo; to begin.
              </p>
            ) : (
              audits.map((aud) => (
                <button
                  key={aud.id}
                  type="button"
                  onClick={() => setSelectedAuditId(aud.id)}
                  className={`w-full rounded-lg border p-3 text-left text-xs transition ${
                    activeAudit?.id === aud.id
                      ? "border-blue-400 bg-blue-50/70 ring-1 ring-blue-400"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900">{aud.audit_code}</span>
                    <Badge
                      variant={
                        aud.status === "approved"
                          ? "success"
                          : aud.status === "submitted"
                            ? "warning"
                            : "default"
                      }
                    >
                      {aud.status_display}
                    </Badge>
                  </div>
                  <p className="mt-1 text-slate-500">
                    {aud.audit_date} &bull; {aud.discrepancy_count} variance(s)
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Active Audit Sheet */}
        <Card className="lg:col-span-3">
          {activeAudit ? (
            <>
              <CardHeader>
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <CardTitle className="text-sm">
                      {activeAudit.audit_code} &mdash; {activeAudit.location_name} (
                      {activeAudit.audit_date})
                    </CardTitle>
                    <CardDescription>
                      Includes automatic office net consumption formula comparison per material.
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      activeAudit.status === "approved"
                        ? "success"
                        : activeAudit.status === "submitted"
                          ? "warning"
                          : "default"
                    }
                  >
                    {activeAudit.status_display}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>System Expected</TableHead>
                      <TableHead>Physical Count</TableHead>
                      <TableHead>Difference</TableHead>
                      <TableHead>Discrepancy Reason</TableHead>
                      <TableHead>Auto Net Usage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeAudit.lines.map((ln) => {
                      const d = lineDrafts[ln.id] || {
                        physical: ln.physical_usable_quantity,
                        reason: ln.discrepancy_reason,
                      };
                      const liveDiff = d.physical - ln.expected_usable_quantity;
                      const isLocked = activeAudit.status === "approved";

                      return (
                        <TableRow key={ln.id}>
                          <TableCell className="text-[13.5px]">
                            <p className="font-semibold text-slate-900">{ln.material_name}</p>
                            <p className="text-[11.5px] text-slate-500">{ln.base_unit}</p>
                          </TableCell>
                          <TableCell className="font-mono text-[13.5px] font-semibold">
                            {ln.expected_usable_quantity.toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              disabled={isLocked}
                              value={d.physical}
                              onChange={(e) =>
                                setLineDrafts((p) => ({
                                  ...p,
                                  [ln.id]: {
                                    ...d,
                                    physical: parseInt(e.target.value || "0", 10),
                                  },
                                }))
                              }
                              className="h-8.5 w-24 font-mono text-[13px]"
                              data-testid={`audit-phys-${ln.material_code}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant={liveDiff === 0 ? "success" : "warning"}>
                              {liveDiff > 0 ? `+${liveDiff}` : liveDiff}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Input
                              disabled={isLocked}
                              value={d.reason}
                              onChange={(e) =>
                                setLineDrafts((p) => ({
                                  ...p,
                                  [ln.id]: { ...d, reason: e.target.value },
                                }))
                              }
                              placeholder={
                                liveDiff !== 0 ? "Required variance reason..." : "Optional note"
                              }
                              className="h-8.5 text-[13px]"
                              data-testid={`audit-reason-${ln.material_code}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-[13px] text-slate-600">
                            {ln.calculated_net_office_consumption}
                            {ln.adjustment_transaction_code ? (
                              <p className="text-[11.5px] font-semibold text-blue-700">
                                {ln.adjustment_transaction_code}
                              </p>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {activeAudit.status !== "approved" ? (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => saveCountsMutation.mutate()}
                      disabled={saveCountsMutation.isPending}
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save Counts
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => submitAuditMutation.mutate()}
                      disabled={submitAuditMutation.isPending}
                      data-testid="submit-audit-btn"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Submit for Approval
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => approveAuditMutation.mutate()}
                      disabled={approveAuditMutation.isPending}
                      data-testid="approve-audit-btn"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve &amp; Post Adjustments
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs font-medium text-emerald-800">
                    Approved by {activeAudit.approved_by_username || "admin"}. Ledger adjustments
                    have been posted.
                  </p>
                )}
              </CardContent>
            </>
          ) : (
            <CardContent className="py-12 text-center text-xs text-slate-500">
              Select an audit session or start a new physical stock audit.
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}

export function StockAuditPage(): React.ReactElement {
  return <StockAuditPanel />;
}
