import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export interface PaginationProps {
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
  pageSizeOptions?: number[];
  isLoading?: boolean;
}

export function Pagination({
  totalCount,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  isLoading = false,
}: PaginationProps): React.ReactElement | null {
  if (totalCount === 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(totalCount, safePage * pageSize);

  return (
    <div className="flex flex-col justify-between gap-3 border-t border-slate-200 pt-3 text-[13px] text-slate-600 sm:flex-row sm:items-center">
      <p>
        Showing{" "}
        <span className="font-semibold text-slate-900">
          {start.toLocaleString("en-IN")}–{end.toLocaleString("en-IN")}
        </span>{" "}
        of <span className="font-semibold text-slate-900">{totalCount.toLocaleString("en-IN")}</span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-slate-500">Rows</span>
          <div className="w-20">
            <Select
              compact
              value={String(pageSize)}
              onChange={(e) => {
                onPageSizeChange(parseInt(e.target.value, 10));
                onPageChange(1);
              }}
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(safePage - 1)}
            disabled={isLoading || safePage <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </Button>
          <span className="px-2 font-mono text-[13px] font-medium text-slate-700">
            {safePage} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(safePage + 1)}
            disabled={isLoading || safePage >= totalPages}
            aria-label="Next page"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
