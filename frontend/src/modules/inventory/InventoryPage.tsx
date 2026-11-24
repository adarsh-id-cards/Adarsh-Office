import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  Calculator,
  CheckCircle2,
  PackagePlus,
  Plus,
} from "lucide-react";
import { StockAuditPanel } from "@/modules/stock_audit/StockAuditPage";
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
import { formatDateTimeIST } from "@/lib/utils";
import type { MaterialRecord } from "@/types/phase4";

type StockTab = "materials" | "balances" | "consumption" | "defects" | "audits" | "movements";

export function InventoryPage({
  defaultTab = "materials",
}: {
  defaultTab?: StockTab;
}): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const addToast = useUiShellStore((s) => s.addToast);

  const tabFromUrl = searchParams.get("tab") as StockTab | null;
  const [activeTab, setActiveTab] = React.useState<StockTab>(tabFromUrl || defaultTab);
  const [movementPage, setMovementPage] = React.useState(1);
  const [movementPageSize, setMovementPageSize] = React.useState(20);
  const [matPage, setMatPage] = React.useState(1);
  const [matPageSize, setMatPageSize] = React.useState(20);

  React.useEffect(() => {
    setActiveTab(tabFromUrl || defaultTab);
  }, [tabFromUrl, defaultTab]);

  const switchTab = (next: StockTab) => {
    setActiveTab(next);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  // Stock-In Dialog state
  const [isStockInOpen, setIsStockInOpen] = React.useState(false);

  React.useEffect(() => {
    if (searchParams.get("action") === "stock-in") {
      setIsStockInOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [stockInMatId, setStockInMatId] = React.useState("");
  const [stockInPkgId, setStockInPkgId] = React.useState("");
  const [stockInPkgCount, setStockInPkgCount] = React.useState(1);
  const [stockInDirectQty, setStockInDirectQty] = React.useState(0);
  const [stockInDefQty, setStockInDefQty] = React.useState(0);
  const [stockInType, setStockInType] = React.useState<"stock_in" | "opening_stock">("stock_in");
  const [stockInNotes, setStockInNotes] = React.useState("");
  const [stockInError, setStockInError] = React.useState<string | null>(null);

  // Add Material Dialog state
  const [isNewMatOpen, setIsNewMatOpen] = React.useState(false);
  const [newMatCode, setNewMatCode] = React.useState("");
  const [newMatName, setNewMatName] = React.useState("");
  const [newMatCategory, setNewMatCategory] = React.useState("jointer");
  const [newMatUnit, setNewMatUnit] = React.useState("piece");
  const [newMatSize, setNewMatSize] = React.useState("");
  const [newMatError, setNewMatError] = React.useState<string | null>(null);

  // Add Packaging Dialog state
  const [pkgTargetMat, setPkgTargetMat] = React.useState<MaterialRecord | null>(null);
  const [pkgName, setPkgName] = React.useState("");
  const [pkgUnits, setPkgUnits] = React.useState(500);
  const [pkgVendor, setPkgVendor] = React.useState("");

  // Transfer Dialog state
  const [isTransferOpen, setIsTransferOpen] = React.useState(false);
  const [trMatId, setTrMatId] = React.useState("");
  const [trLabourerId, setTrLabourerId] = React.useState("");
  const [trDirection, setTrDirection] = React.useState<"to_labourer" | "to_office">("to_labourer");
  const [trQty, setTrQty] = React.useState(100);
  const [trNotes, setTrNotes] = React.useState("");
  const [trError, setTrError] = React.useState<string | null>(null);

  // Manual Office Consumption state
  const [consMatId, setConsMatId] = React.useState("");
  const [consQty, setConsQty] = React.useState(10);
  const [consReason, setConsReason] = React.useState("");

  // Defect entry state
  const [defMatId, setDefMatId] = React.useState("");
  const [defQty, setDefQty] = React.useState(1);
  const [defStage, setDefStage] = React.useState("stock_receiving");
  const [defReason, setDefReason] = React.useState("");

  const { data: materialsPage, isLoading: isMatLoading } = useQuery({
    queryKey: ["inventory", "materials"],
    queryFn: () => phase4Service.listMaterials(),
  });
  const { data: balances = [] } = useQuery({
    queryKey: ["inventory", "balances"],
    queryFn: () => phase4Service.listBalances(),
  });
  const { data: movementsPage } = useQuery({
    queryKey: ["inventory", "movements", movementPage, movementPageSize],
    queryFn: () =>
      phase4Service.listMovements({ page: movementPage, page_size: movementPageSize }),
  });
  const { data: consumptionList = [] } = useQuery({
    queryKey: ["inventory", "consumption"],
    queryFn: () => phase4Service.getConsumptionSummary(),
  });
  const { data: defects = [] } = useQuery({
    queryKey: ["inventory", "defects"],
    queryFn: () => phase4Service.listDefects(),
  });
  const { data: labourersData } = useQuery({
    queryKey: ["labourers", { is_active: true }],
    queryFn: () => phase4Service.listLabourers({ is_active: true }),
  });
  const { data: reconcileData } = useQuery({
    queryKey: ["inventory", "reconcile"],
    queryFn: async () => (await phase4Service.reconcileInventory()) ?? null,
    staleTime: 60_000,
  });

  const materials = materialsPage?.results || [];
  const movements = movementsPage?.results || [];
  const labourers = labourersData?.results || [];
  const selectedStockInMat = materials.find((m) => m.id === stockInMatId);
  const selectedStockInPkg = selectedStockInMat?.packagings.find((p) => p.id === stockInPkgId);

  React.useEffect(() => {
    if (isStockInOpen && !stockInMatId && materials.length > 0) {
      const preferred =
        materials.find((m) => m.code === "MAT-JOINTER-16MM") || materials[0];
      if (preferred) {
        setStockInMatId(preferred.id);
        setStockInPkgId(preferred.packagings[0]?.id || "");
      }
    }
  }, [isStockInOpen, stockInMatId, materials]);

  const invalidateInventory = () => {
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    void queryClient.invalidateQueries({ queryKey: ["labourers"] });
  };

  const stockInMutation = useMutation({
    mutationFn: () =>
      phase4Service.recordStockIn({
        material: stockInMatId,
        packaging: stockInPkgId || null,
        package_count: stockInPkgId ? stockInPkgCount : null,
        quantity: stockInPkgId ? null : stockInDirectQty,
        defective_quantity: stockInDefQty,
        movement_type: stockInType,
        notes: stockInNotes.trim(),
      }),
    onSuccess: (mov) => {
      setIsStockInOpen(false);
      setStockInError(null);
      setStockInNotes("");
      setStockInDefQty(0);
      invalidateInventory();
      addToast({
        title: `Stock-In ${mov.transaction_code} Recorded`,
        description: `Added +${mov.usable_quantity} usable ${mov.base_unit}(s) of ${mov.material_name}.`,
        variant: "success",
      });
    },
    onError: (err) => {
      setStockInError(err instanceof ApiClientError ? err.message : "Stock-in failed.");
    },
  });

  const createMatMutation = useMutation({
    mutationFn: () =>
      phase4Service.createMaterial({
        code: newMatCode.trim(),
        name: newMatName.trim(),
        category: newMatCategory,
        base_unit: newMatUnit,
        supported_size_label: newMatSize.trim(),
      }),
    onSuccess: (created) => {
      setIsNewMatOpen(false);
      setNewMatCode("");
      setNewMatName("");
      setNewMatError(null);
      invalidateInventory();
      addToast({ title: `Material Created: ${created.name}`, variant: "success" });
    },
    onError: (err) => {
      setNewMatError(err instanceof ApiClientError ? err.message : "Could not add material.");
    },
  });

  const addPkgMutation = useMutation({
    mutationFn: () =>
      phase4Service.addMaterialPackaging(pkgTargetMat!.id, {
        package_name: pkgName.trim(),
        units_per_package: pkgUnits,
        vendor_label: pkgVendor.trim(),
      }),
    onSuccess: () => {
      setPkgTargetMat(null);
      setPkgName("");
      setPkgVendor("");
      invalidateInventory();
      addToast({ title: "Vendor Packaging Option Added", variant: "success" });
    },
  });

  const transferMutation = useMutation({
    mutationFn: () =>
      phase4Service.transferMaterial({
        material: trMatId,
        labourer: trLabourerId,
        direction: trDirection,
        quantity: trDirection === "to_labourer" ? trQty : undefined,
        usable_quantity: trDirection === "to_office" ? trQty : undefined,
        notes: trNotes.trim(),
      }),
    onSuccess: (mov) => {
      setIsTransferOpen(false);
      setTrError(null);
      setTrNotes("");
      invalidateInventory();
      addToast({
        title: `Transfer ${mov.transaction_code} Recorded`,
        description: `${mov.quantity} ${mov.base_unit}(s) moved (${mov.source_location_name} -> ${mov.destination_location_name}).`,
        variant: "success",
      });
    },
    onError: (err) => {
      setTrError(err instanceof ApiClientError ? err.message : "Transfer failed.");
    },
  });

  const manualConsumptionMutation = useMutation({
    mutationFn: () =>
      phase4Service.recordManualConsumption({
        material: consMatId || materials[0]?.id || "",
        quantity: consQty,
        reason: consReason.trim(),
      }),
    onSuccess: (mov) => {
      setConsReason("");
      invalidateInventory();
      addToast({
        title: `Recorded Consumption (${mov.transaction_code})`,
        variant: "success",
      });
    },
  });

  const defectMutation = useMutation({
    mutationFn: () =>
      phase4Service.recordDefect({
        material: defMatId || materials[0]?.id || "",
        quantity: defQty,
        discovery_stage: defStage,
        reason: defReason.trim(),
      }),
    onSuccess: () => {
      setDefReason("");
      invalidateInventory();
      addToast({ title: "Defective Material Record Logged", variant: "success" });
    },
  });

  const slicedMaterials = materials.slice((matPage - 1) * matPageSize, matPage * matPageSize);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock Management"
        subtitle="Office and labourer balances, catalog, stock-in, transfers, and movement ledger."
        badge={
          reconcileData ? (
            <Badge variant={reconcileData.all_reconciled ? "success" : "destructive"}>
              <CheckCircle2 className="h-3 w-3" />
              {reconcileData.all_reconciled ? "Ledger Verified" : "Variance Detected"}
            </Badge>
          ) : undefined
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setNewMatError(null);
                setIsNewMatOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New Material
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setTrError(null);
                setTrMatId(materials[0]?.id || "");
                setTrLabourerId(labourers[0]?.id || "");
                setIsTransferOpen(true);
              }}
              data-testid="open-transfer-btn"
            >
              <ArrowRightLeft className="h-4 w-4" />
              Transfer Office &harr; Labour
            </Button>
            <Button
              onClick={() => {
                const preferred =
                  materials.find((m) => m.code === "MAT-JOINTER-16MM") || materials[0];
                setStockInError(null);
                setStockInMatId(preferred?.id || "");
                setStockInPkgId(preferred?.packagings[0]?.id || "");
                setStockInPkgCount(1);
                setIsStockInOpen(true);
              }}
              data-testid="open-stock-in-btn"
            >
              <PackagePlus className="h-4 w-4" />
              Record Stock-In
            </Button>
          </>
        }
      />

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
        {(
          [
            { key: "materials", label: "Overview & Catalogue" },
            { key: "balances", label: "Office & Labour Balances" },
            { key: "consumption", label: "Consumption" },
            { key: "defects", label: `Defective (${defects.length})` },
            { key: "audits", label: "Stock Audits" },
            { key: "movements", label: "Movement History" },
          ] as const
        ).map((tab) => (
          <Button
            key={tab.key}
            size="sm"
            variant={activeTab === tab.key ? "default" : "outline"}
            onClick={() => switchTab(tab.key)}
            data-testid={`inventory-tab-${tab.key}`}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === "materials" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Raw Materials &amp; Packaging Catalog</CardTitle>
            <CardDescription>
              All transactions normalize vendor packets into consistent base units while preserving
              packet counts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isMatLoading ? (
              <div className="py-10 text-center">
                <Spinner label="Loading inventory catalog..." />
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Category &amp; Unit</TableHead>
                      <TableHead>Office Usable / Def</TableHead>
                      <TableHead>Held by Labourers</TableHead>
                      <TableHead>Company Total</TableHead>
                      <TableHead>Vendor Packaging Options</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slicedMaterials.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-[13.5px]">
                          <p className="font-semibold text-slate-900">{m.name}</p>
                          <p className="font-mono text-[12px] text-slate-500">{m.code}</p>
                        </TableCell>
                        <TableCell className="text-[13px]">
                          <Badge variant="neutral">{m.category_label}</Badge>
                          <span className="ml-1.5 text-slate-600">{m.base_unit}</span>
                        </TableCell>
                        <TableCell className="font-mono text-[13.5px]">
                          <span className="font-bold text-emerald-800">
                            {m.office_usable_stock.toLocaleString("en-IN")}
                          </span>{" "}
                          /{" "}
                          <span className="text-red-700">
                            {m.office_defective_stock.toLocaleString("en-IN")}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-[13.5px] font-semibold text-blue-800">
                          {m.labour_usable_stock.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="font-mono text-[13.5px] font-bold text-slate-900">
                          {m.total_company_usable_stock.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {m.packagings.map((p) => (
                              <Badge key={p.id} variant="default">
                                {p.package_name}
                                {p.vendor_label ? ` (${p.vendor_label})` : ""}
                              </Badge>
                            ))}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setPkgTargetMat(m);
                                setPkgName("Packet of 500");
                                setPkgUnits(500);
                                setPkgVendor("");
                              }}
                            >
                              + Pkg
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Pagination
                  totalCount={materials.length}
                  page={matPage}
                  pageSize={matPageSize}
                  onPageChange={setMatPage}
                  onPageSizeChange={(next) => {
                    setMatPageSize(next);
                    setMatPage(1);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "balances" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Location-Wise Inventory Balances</CardTitle>
            <CardDescription>
              Main Office inventory vs. stock physically retained at each Labourer location.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Usable Stock</TableHead>
                  <TableHead>Defective Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-xs font-semibold text-slate-900">
                      {b.location_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={b.location_type === "main_office" ? "default" : "neutral"}>
                        {b.location_type === "main_office" ? "Main Office" : "Labourer"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{b.material_name}</TableCell>
                    <TableCell className="font-mono text-xs font-bold text-emerald-800">
                      {b.usable_quantity.toLocaleString("en-IN")} {b.base_unit}s
                    </TableCell>
                    <TableCell className="font-mono text-xs text-red-700">
                      {b.defective_quantity.toLocaleString("en-IN")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "consumption" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Calculator className="h-4 w-4 text-blue-700" />
                Automatic Office Consumption Reconciliation Formula
              </CardTitle>
              <CardDescription>
                Net Office Consumption = Opening + Received + Returns &minus; Transfers to Labourers
                &minus; Closing Physical Stock
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
                <FormField id="manual-cons-mat" label="Record Manual Office Consumption">
                  <Select
                    id="manual-cons-mat"
                    value={consMatId || materials[0]?.id || ""}
                    onChange={(e) => setConsMatId(e.target.value)}
                  >
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField id="manual-cons-qty" label="Quantity Consumed">
                  <Input
                    id="manual-cons-qty"
                    type="number"
                    min={1}
                    value={consQty}
                    onChange={(e) => setConsQty(parseInt(e.target.value || "1", 10))}
                  />
                </FormField>
                <FormField id="manual-cons-reason" label="Reason / Purpose" required>
                  <Input
                    id="manual-cons-reason"
                    value={consReason}
                    onChange={(e) => setConsReason(e.target.value)}
                    placeholder="e.g. Office counter assembly sample"
                  />
                </FormField>
                <div className="flex items-end">
                  <Button
                    size="sm"
                    onClick={() => manualConsumptionMutation.mutate()}
                    disabled={!consReason.trim() || manualConsumptionMutation.isPending}
                  >
                    Record Office Usage
                  </Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Opening + Recv</TableHead>
                    <TableHead>Returns</TableHead>
                    <TableHead>To Labour</TableHead>
                    <TableHead>System Expected</TableHead>
                    <TableHead>Recorded Usage</TableHead>
                    <TableHead>Calculated Net</TableHead>
                    <TableHead>Unexplained Diff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consumptionList.map((row) => (
                    <TableRow key={row.material_id}>
                      <TableCell className="text-xs font-semibold">{row.material_name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.opening_office_stock + row.stock_received}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.returns_from_labourers}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.transfers_to_labourers}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-bold">
                        {row.system_expected_office_stock}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-blue-800">
                        {row.recorded_manual_consumption}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold">
                        {row.calculated_net_office_consumption}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <Badge
                          variant={row.unexplained_difference === 0 ? "success" : "warning"}
                        >
                          {row.unexplained_difference}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === "defects" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              Defective Materials &amp; Finished Product Rejects
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-5">
              <FormField id="def-mat" label="Material">
                <Select
                  id="def-mat"
                  value={defMatId || materials[0]?.id || ""}
                  onChange={(e) => setDefMatId(e.target.value)}
                >
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="def-stage" label="Discovery Stage">
                <Select
                  id="def-stage"
                  value={defStage}
                  onChange={(e) => setDefStage(e.target.value)}
                >
                  <option value="stock_receiving">Stock Receiving</option>
                  <option value="printing_damage">Printing Damage</option>
                  <option value="dispatch_inspection">Dispatch Inspection</option>
                </Select>
              </FormField>
              <FormField id="def-qty" label="Quantity">
                <Input
                  id="def-qty"
                  type="number"
                  min={1}
                  value={defQty}
                  onChange={(e) => setDefQty(parseInt(e.target.value || "1", 10))}
                />
              </FormField>
              <FormField id="def-reason" label="Defect Reason" required>
                <Input
                  id="def-reason"
                  value={defReason}
                  onChange={(e) => setDefReason(e.target.value)}
                  placeholder="Cracked clasp / misprint"
                />
              </FormField>
              <div className="flex items-end">
                <Button
                  size="sm"
                  onClick={() => defectMutation.mutate()}
                  disabled={!defReason.trim() || defectMutation.isPending}
                >
                  Log Defect
                </Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Material / Location</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defects.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Badge variant="warning">{d.defect_category_label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{d.discovery_stage_label}</TableCell>
                    <TableCell className="text-xs">
                      <strong>{d.material_name || d.order_number || "Finished Item"}</strong>
                      <p className="text-[11px] text-slate-500">{d.location_name}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-red-700">
                      {d.quantity}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">{d.reason}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {formatDateTimeIST(d.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "audits" ? <StockAuditPanel embedded /> : null}

      {activeTab === "movements" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Immutable Stock Movement Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tx Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Quantity &amp; Packaging</TableHead>
                  <TableHead>Source &rarr; Destination</TableHead>
                  <TableHead>Staff / Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((mov) => (
                  <TableRow key={mov.id}>
                    <TableCell className="font-mono text-[13.5px] font-semibold">
                      {mov.transaction_code}
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">{mov.movement_type_label}</Badge>
                    </TableCell>
                    <TableCell className="text-[13.5px] font-medium">{mov.material_name}</TableCell>
                    <TableCell className="font-mono text-[13.5px]">
                      <strong>
                        {mov.quantity.toLocaleString("en-IN")} {mov.base_unit}
                      </strong>
                      {mov.package_count ? (
                        <p className="text-[12px] text-slate-500">
                          {mov.package_count} pkg &times; {mov.units_per_package_snapshot}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-[13px] text-slate-600">
                      {mov.source_location_name || "Vendor / Opening"} &rarr;{" "}
                      {mov.destination_location_name || "Consumed / Adjusted"}
                    </TableCell>
                    <TableCell className="text-[13px] text-slate-500">
                      {mov.created_by_username || "system"} &bull;{" "}
                      {formatDateTimeIST(mov.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              totalCount={movementsPage?.count ?? movements.length}
              page={movementPage}
              pageSize={movementPageSize}
              onPageChange={setMovementPage}
              onPageSizeChange={(next) => {
                setMovementPageSize(next);
                setMovementPage(1);
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Stock-In Dialog */}
      <Dialog
        open={isStockInOpen}
        onOpenChange={setIsStockInOpen}
        title="Record Raw Material Stock-In"
        description="Select a material and vendor packaging configuration or enter direct base units."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            stockInMutation.mutate();
          }}
          className="space-y-4"
        >
          {stockInError ? (
            <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{stockInError}</span>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="si-mat" label="Material" required>
              <Select
                id="si-mat"
                value={stockInMatId}
                onChange={(e) => {
                  const nextMat = materials.find((m) => m.id === e.target.value);
                  setStockInMatId(e.target.value);
                  setStockInPkgId(nextMat?.packagings[0]?.id || "");
                }}
              >
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField id="si-type" label="Movement Type">
              <Select
                id="si-type"
                value={stockInType}
                onChange={(e) => setStockInType(e.target.value as "stock_in" | "opening_stock")}
              >
                <option value="stock_in">Stock Received (Purchase)</option>
                <option value="opening_stock">Opening Stock</option>
              </Select>
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="si-pkg" label="Vendor Packaging">
              <Select
                id="si-pkg"
                value={stockInPkgId}
                onChange={(e) => setStockInPkgId(e.target.value)}
              >
                <option value="">— Direct Base Units —</option>
                {(selectedStockInMat?.packagings || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.package_name} ({p.units_per_package}/pkg){p.vendor_label ? ` - ${p.vendor_label}` : ""}
                  </option>
                ))}
              </Select>
            </FormField>

            {stockInPkgId ? (
              <FormField id="si-pkg-count" label="Number of Packets / Boxes" required>
                <Input
                  id="si-pkg-count"
                  type="number"
                  min={1}
                  value={stockInPkgCount}
                  onChange={(e) => setStockInPkgCount(parseInt(e.target.value || "1", 10))}
                />
              </FormField>
            ) : (
              <FormField id="si-direct-qty" label="Total Base Units" required>
                <Input
                  id="si-direct-qty"
                  type="number"
                  min={1}
                  value={stockInDirectQty}
                  onChange={(e) => setStockInDirectQty(parseInt(e.target.value || "1", 10))}
                />
              </FormField>
            )}
          </div>

          {selectedStockInPkg ? (
            <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              Converted Base Units:{" "}
              <strong className="font-mono">
                {(stockInPkgCount * selectedStockInPkg.units_per_package).toLocaleString("en-IN")}{" "}
                {selectedStockInMat?.base_unit}s
              </strong>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="si-def-qty" label="Defective Units in Lot (Optional)">
              <Input
                id="si-def-qty"
                type="number"
                min={0}
                value={stockInDefQty}
                onChange={(e) => setStockInDefQty(parseInt(e.target.value || "0", 10))}
              />
            </FormField>
            <FormField id="si-notes" label="Vendor / Receipt Notes">
              <Input
                id="si-notes"
                value={stockInNotes}
                onChange={(e) => setStockInNotes(e.target.value)}
                placeholder="Supplier invoice or batch remark"
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsStockInOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={stockInMutation.isPending}
              data-testid="confirm-stock-in-btn"
            >
              Confirm Stock-In
            </Button>
          </div>
        </form>
      </Dialog>

      {/* New Material Dialog */}
      <Dialog
        open={isNewMatOpen}
        onOpenChange={setIsNewMatOpen}
        title="Add Configurable Raw Material"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMatMutation.mutate();
          }}
          className="space-y-4"
        >
          {newMatError ? (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {newMatError}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="nm-code" label="Material Code" required>
              <Input
                id="nm-code"
                value={newMatCode}
                onChange={(e) => setNewMatCode(e.target.value)}
                placeholder="MAT-CLASP-16"
                required
              />
            </FormField>
            <FormField id="nm-name" label="Material Name" required>
              <Input
                id="nm-name"
                value={newMatName}
                onChange={(e) => setNewMatName(e.target.value)}
                placeholder="Safety Breakaway Clasp"
                required
              />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField id="nm-cat" label="Category">
              <Select
                id="nm-cat"
                value={newMatCategory}
                onChange={(e) => setNewMatCategory(e.target.value)}
              >
                <option value="jointer">Jointer</option>
                <option value="hook">Hook</option>
                <option value="holder">Holder</option>
                <option value="lanyard_roll">Lanyard Roll</option>
                <option value="pvc_sheet">PVC Sheet</option>
                <option value="consumable">Consumable</option>
              </Select>
            </FormField>
            <FormField id="nm-unit" label="Base Unit">
              <Select
                id="nm-unit"
                value={newMatUnit}
                onChange={(e) => setNewMatUnit(e.target.value)}
              >
                <option value="piece">Piece</option>
                <option value="sheet">Sheet</option>
                <option value="roll">Roll</option>
                <option value="meter">Meter</option>
                <option value="packet">Packet</option>
              </Select>
            </FormField>
            <FormField id="nm-size" label="Size (Optional)">
              <Input
                id="nm-size"
                value={newMatSize}
                onChange={(e) => setNewMatSize(e.target.value)}
                placeholder="16 mm"
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsNewMatOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMatMutation.isPending}>
              Create Material
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add Vendor Packaging Dialog */}
      <Dialog
        open={Boolean(pkgTargetMat)}
        onOpenChange={(open) => !open && setPkgTargetMat(null)}
        title={`Add Packaging Option — ${pkgTargetMat?.name || ""}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addPkgMutation.mutate();
          }}
          className="space-y-4"
        >
          <FormField id="pkg-name" label="Package Name" required>
            <Input
              id="pkg-name"
              value={pkgName}
              onChange={(e) => setPkgName(e.target.value)}
              placeholder="e.g. Box of 1,000"
              required
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="pkg-units" label="Units per Package" required>
              <Input
                id="pkg-units"
                type="number"
                min={1}
                value={pkgUnits}
                onChange={(e) => setPkgUnits(parseInt(e.target.value || "1", 10))}
              />
            </FormField>
            <FormField id="pkg-vendor" label="Vendor Label">
              <Input
                id="pkg-vendor"
                value={pkgVendor}
                onChange={(e) => setPkgVendor(e.target.value)}
                placeholder="Vendor A"
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPkgTargetMat(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addPkgMutation.isPending}>
              Save Packaging
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Transfer Office <-> Labour Dialog */}
      <Dialog
        open={isTransferOpen}
        onOpenChange={setIsTransferOpen}
        title="Location Transfer (Main Office &harr; Labourer)"
        description="Transferring materials to a labourer moves stock between locations without reducing company inventory."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            transferMutation.mutate();
          }}
          className="space-y-4"
        >
          {trError ? (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {trError}
            </div>
          ) : null}
          <FormField id="tr-dir" label="Direction">
            <Select
              id="tr-dir"
              value={trDirection}
              onChange={(e) => setTrDirection(e.target.value as "to_labourer" | "to_office")}
            >
              <option value="to_labourer">Main Office &rarr; Issue to Labourer</option>
              <option value="to_office">Labourer &rarr; Return to Main Office</option>
            </Select>
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="tr-mat" label="Material" required>
              <Select
                id="tr-mat"
                value={trMatId}
                onChange={(e) => setTrMatId(e.target.value)}
              >
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} (Office: {m.office_usable_stock})
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="tr-lab" label="Labourer" required>
              <Select
                id="tr-lab"
                value={trLabourerId}
                onChange={(e) => setTrLabourerId(e.target.value)}
              >
                {labourers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="tr-qty" label="Quantity (Base Units)" required>
              <Input
                id="tr-qty"
                type="number"
                min={1}
                value={trQty}
                onChange={(e) => setTrQty(parseInt(e.target.value || "1", 10))}
              />
            </FormField>
            <FormField id="tr-notes" label="Notes">
              <Input
                id="tr-notes"
                value={trNotes}
                onChange={(e) => setTrNotes(e.target.value)}
                placeholder="Issue or return reason"
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsTransferOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={transferMutation.isPending}>
              Confirm Transfer
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
