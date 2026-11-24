import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  CreditCard,
  Layers,
  PackageCheck,
  Palette,
  Printer,
  Ribbon,
  Wrench,
} from "lucide-react";
import { productionService } from "@/services/productionService";
import { catalogService } from "@/services/catalogService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchInput } from "@/components/ui/input";
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
import { PageHeader } from "@/components/shared/PageHeader";
import type { ItemCategory } from "@/types/orders";
import type {
  AssemblyStatus,
  DesignStatus,
  PrintingStatus,
  ProductionOverviewCounts,
} from "@/types/production";

export function getDesignBadgeVariant(
  status: DesignStatus,
): "default" | "neutral" | "success" | "warning" {
  switch (status) {
    case "completed":
    case "approved":
      return "success";
    case "review_required":
      return "warning";
    case "in_progress":
      return "default";
    default:
      return "neutral";
  }
}

export function getPrintingBadgeVariant(
  status: PrintingStatus,
): "default" | "neutral" | "success" | "warning" {
  switch (status) {
    case "completed":
      return "success";
    case "partially_printed":
      return "warning";
    case "in_progress":
      return "default";
    default:
      return "neutral";
  }
}

export function getAssemblyBadgeVariant(
  status: AssemblyStatus,
): "default" | "neutral" | "success" | "warning" {
  switch (status) {
    case "completed":
      return "success";
    case "ready_for_assembly":
    case "in_progress":
      return "default";
    case "partially_completed":
      return "warning";
    default:
      return "neutral";
  }
}

interface OverviewBucketCard {
  key: string;
  label: string;
  countKey: keyof ProductionOverviewCounts;
  icon: React.ComponentType<{ className?: string }>;
}

const OVERVIEW_BUCKETS: OverviewBucketCard[] = [
  {
    key: "awaiting_design",
    label: "Awaiting Design",
    countKey: "awaiting_design",
    icon: Palette,
  },
  {
    key: "under_design",
    label: "Under Design",
    countKey: "under_design",
    icon: Palette,
  },
  {
    key: "awaiting_printing",
    label: "Awaiting Printing",
    countKey: "awaiting_printing",
    icon: Printer,
  },
  {
    key: "currently_printing",
    label: "Currently Printing",
    countKey: "currently_printing",
    icon: Printer,
  },
  {
    key: "lanyards_ready_for_assembly",
    label: "Lanyards Ready for Assembly",
    countKey: "lanyards_ready_for_assembly",
    icon: Wrench,
  },
  {
    key: "incomplete_production",
    label: "Incomplete Production",
    countKey: "incomplete_production",
    icon: Layers,
  },
  {
    key: "ready_for_dispatch",
    label: "Ready for Dispatch",
    countKey: "ready_for_dispatch",
    icon: PackageCheck,
  },
];

export function ProductionDashboardPage(): React.ReactElement {
  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<ItemCategory | "">("");
  const [lanyardSizeFilter, setLanyardSizeFilter] = React.useState("");
  const [stageFilter, setStageFilter] = React.useState("");
  const [activeBucket, setActiveBucket] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const { data: overview } = useQuery({
    queryKey: ["production", "overview"],
    queryFn: () => productionService.getOverview(),
  });

  const { data: catalog } = useQuery({
    queryKey: ["catalog", "overview"],
    queryFn: () => catalogService.getCatalogOverview(),
  });

  const { data: queueData, isLoading, isError } = useQuery({
    queryKey: [
      "production",
      "queue",
      {
        search,
        categoryFilter,
        lanyardSizeFilter,
        stageFilter,
        activeBucket,
        dateFrom,
        dateTo,
        page,
        pageSize,
      },
    ],
    queryFn: () =>
      productionService.listQueue({
        search: search.trim() || undefined,
        category: categoryFilter || undefined,
        lanyard_size: lanyardSizeFilter || undefined,
        stage: stageFilter || undefined,
        bucket: activeBucket || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        page_size: pageSize,
      }),
  });

  const handleBucketToggle = (bucketKey: string) => {
    setActiveBucket((prev) => (prev === bucketKey ? "" : bucketKey));
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Production Management"
        subtitle="Track ID cards and lanyards across design, printing, assembly, and dispatch readiness."
        actions={
          activeBucket ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveBucket("");
                setPage(1);
              }}
            >
              Clear Overview Filter
            </Button>
          ) : undefined
        }
      />

      {/* Production Overview Buckets */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {OVERVIEW_BUCKETS.map((b) => {
          const Icon = b.icon;
          const isSelected = activeBucket === b.key;
          const countVal = overview ? overview[b.countKey] : 0;

          return (
            <button
              key={b.key}
              type="button"
              onClick={() => handleBucketToggle(b.key)}
              className={`flex flex-col justify-between rounded-[10px] border p-3.5 text-left transition-colors ${
                isSelected
                  ? "border-blue-600 bg-blue-50/70 ring-1 ring-blue-600"
                  : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50/50"
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[12px] font-medium leading-tight text-slate-600">
                  {b.label}
                </span>
                <Icon className="h-3.5 w-3.5 shrink-0 text-blue-700" />
              </div>
              <p className="mt-2 font-mono text-xl font-bold text-slate-900">{countVal}</p>
            </button>
          );
        })}
      </div>

      {/* Production Queue Filters & Table */}
      <Card>
        <CardHeader className="pb-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <SearchInput
                placeholder="Search by order #, client, or item..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                onClear={() => {
                  setSearch("");
                  setPage(1);
                }}
                aria-label="Search production queue"
              />
            </div>

            <div>
              <Select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value as ItemCategory | "");
                  setPage(1);
                }}
                aria-label="Filter by item category"
              >
                <option value="">All Categories</option>
                <option value="id_card">ID Card Items</option>
                <option value="lanyard">Lanyard Items</option>
              </Select>
            </div>

            <div>
              <Select
                value={lanyardSizeFilter}
                onChange={(e) => {
                  setLanyardSizeFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by lanyard size"
              >
                <option value="">All Lanyard Sizes</option>
                {(catalog?.lanyard_sizes || []).map((sz) => (
                  <option key={sz.id} value={sz.id}>
                    {sz.name} ({sz.batch_capacity || 30}/batch)
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Select
                value={stageFilter}
                onChange={(e) => {
                  setStageFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by production stage"
              >
                <option value="">All Workflow Stages</option>
                <option value="design">Stage: Design</option>
                <option value="printing">Stage: Printing</option>
                <option value="assembly">Stage: Assembly (Lanyard)</option>
                <option value="production_completed">Stage: Production Completed</option>
                <option value="ready_for_dispatch">Stage: Ready for Dispatch</option>
                <option value="dispatch">Stage: Dispatch (Lanyard)</option>
              </Select>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <DatePicker
                  value={dateFrom}
                  onChange={(v) => {
                    setDateFrom(v);
                    setPage(1);
                  }}
                  placeholder="From"
                  ariaLabel="Date from"
                />
              </div>
              <div className="min-w-0 flex-1">
                <DatePicker
                  value={dateTo}
                  onChange={(v) => {
                    setDateTo(v);
                    setPage(1);
                  }}
                  placeholder="To"
                  ariaLabel="Date to"
                  align="right"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center">
              <Spinner label="Loading production queue..." />
            </div>
          ) : isError || !queueData ? (
            <p className="py-6 text-center text-sm text-red-600">
              Unable to load production queue. Please refresh.
            </p>
          ) : queueData.results.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50/50 py-10 text-center">
              <Printer className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-800">
                No production items match the current filters
              </p>
              <p className="mt-1 text-[13px] text-slate-500">
                Order items enter the production queue upon order creation.
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order &amp; Client</TableHead>
                    <TableHead>Item &amp; Specs</TableHead>
                    <TableHead>Required Qty</TableHead>
                    <TableHead>1. Design</TableHead>
                    <TableHead>2. Printing</TableHead>
                    <TableHead>3. Assembly</TableHead>
                    <TableHead>Dispatch Readiness</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueData.results.map((job) => {
                    const isCard = job.item.category === "id_card";
                    return (
                      <TableRow key={job.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Link
                              to={`/orders/${job.item.order_id}`}
                              className="font-mono text-[13.5px] font-semibold text-blue-700 hover:underline"
                            >
                              {job.item.order_number}
                            </Link>
                            {job.item.order_type === "replacement" ? (
                              <Badge variant="warning">Replacement</Badge>
                            ) : null}
                          </div>
                          <Link
                            to={`/clients/${job.item.client_id}`}
                            className="mt-0.5 block text-[13px] font-medium text-slate-800 hover:text-blue-700 hover:underline"
                          >
                            {job.item.client_name}
                          </Link>
                          <span className="text-[12px] text-slate-400">{job.item.order_date}</span>
                        </TableCell>

                        <TableCell>
                          <Link
                            to={`/production/jobs/${job.id}`}
                            className="text-[13.5px] font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                          >
                            {job.item.item_name}
                          </Link>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant={isCard ? "default" : "neutral"}>
                              {isCard ? (
                                <>
                                  <CreditCard className="h-3 w-3" />
                                  ID Card
                                </>
                              ) : (
                                <>
                                  <Ribbon className="h-3 w-3" />
                                  Lanyard
                                </>
                              )}
                            </Badge>
                            {isCard ? (
                              <span className="text-[12px] text-slate-500">
                                {job.item.card_orientation_label} &bull; {job.item.card_printing_label}
                              </span>
                            ) : (
                              <span className="text-[12px] font-medium text-slate-600">
                                {job.item.lanyard_size_option_detail?.name || "Size"} ({job.batch_capacity}
                                /batch)
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="font-mono text-[13.5px] font-semibold text-slate-900">
                          {job.required_quantity.toLocaleString("en-IN")}
                        </TableCell>

                        <TableCell>
                          <Badge variant={getDesignBadgeVariant(job.design_status)}>
                            {job.design_status_label}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <Badge variant={getPrintingBadgeVariant(job.printing_status)}>
                            {job.printing_status_label}
                          </Badge>
                          <div className="mt-1 font-mono text-[12px] text-slate-600">
                            Good: {job.successful_printed_quantity.toLocaleString("en-IN")} /{" "}
                            {job.required_quantity.toLocaleString("en-IN")}
                            {job.total_rejected_quantity > 0 ? (
                              <span className="ml-1 text-red-600">
                                (Waste: {job.total_rejected_quantity})
                              </span>
                            ) : null}
                          </div>
                        </TableCell>

                        <TableCell>
                          {isCard ? (
                            <span className="text-[13px] text-slate-400">Not applicable</span>
                          ) : (
                            <div>
                              <Badge variant={getAssemblyBadgeVariant(job.assembly_status)}>
                                {job.assembly_status_label}
                              </Badge>
                              {job.completed_assembly_quantity > 0 ? (
                                <div className="mt-1 font-mono text-[12px] text-slate-600">
                                  {job.completed_assembly_quantity.toLocaleString("en-IN")} /{" "}
                                  {job.required_quantity.toLocaleString("en-IN")}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </TableCell>

                        <TableCell>
                          {job.is_ready_for_dispatch ? (
                            <Badge variant="success">
                              <CheckCircle2 className="h-3 w-3" />
                              Ready ({job.ready_for_packing_quantity.toLocaleString("en-IN")})
                            </Badge>
                          ) : (
                            <span className="text-[13px] text-slate-500">
                              Pending ({job.quantity_pending.toLocaleString("en-IN")})
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <Link
                            to={`/production/jobs/${job.id}`}
                            className="inline-flex items-center rounded-[6px] border border-blue-200 bg-blue-50 px-2.5 py-1 text-[13px] font-medium text-blue-800 hover:bg-blue-100"
                            data-testid={`manage-job-${job.id}`}
                          >
                            Manage
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <Pagination
                totalCount={queueData.count}
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
  );
}
