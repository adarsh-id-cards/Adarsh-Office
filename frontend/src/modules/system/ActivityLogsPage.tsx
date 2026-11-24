import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw } from "lucide-react";
import { systemService } from "@/services/systemService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTimeIST } from "@/lib/utils";

export function ActivityLogsPage(): React.ReactElement {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["system", "audit-logs", page, pageSize],
    queryFn: () => systemService.getAuditLogs({ page, page_size: pageSize }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Activity & Audit Logs"
        description="Immutable audit trail of authentication, session, and administrative operations."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Logs
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-700" />
                Recent Audit Events
              </CardTitle>
              <CardDescription>
                Authentication, session, and administrative actions with Asia/Kolkata timestamps.
              </CardDescription>
            </div>
            {data ? <Badge variant="neutral">{data.count} Total Entries</Badge> : null}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-6">
              <Spinner label="Loading audit trail..." />
            </div>
          ) : isError || !data ? (
            <p className="text-xs text-red-600">Unable to load audit logs.</p>
          ) : data.results.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              No audit events have been recorded yet.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp (IST)</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.results.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap text-[12.5px] text-slate-600">
                        {formatDateTimeIST(item.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.action.includes("FAILED")
                              ? "destructive"
                              : item.action.includes("LOGIN")
                                ? "success"
                                : "default"
                          }
                        >
                          {item.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        {item.module}
                      </TableCell>
                      <TableCell className="text-[13px] font-medium text-slate-800">
                        {item.actor_username || "system"}
                      </TableCell>
                      <TableCell className="text-[13px] text-slate-700">{item.summary}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">
                        {item.ip_address || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data.count > 0 ? (
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  totalCount={data.count}
                  onPageChange={setPage}
                  onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setPage(1);
                  }}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
