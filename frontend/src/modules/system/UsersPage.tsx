import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, Users as UsersIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { authService } from "@/services/authService";
import { Badge } from "@/components/ui/badge";
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

export function UsersPage(): React.ReactElement {
  const { user } = useAuth();
  const isOwnerAdmin = Boolean(user?.is_owner_admin);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["auth", "users", page, pageSize],
    queryFn: () => authService.listUsers({ page, page_size: pageSize }),
    enabled: isOwnerAdmin,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Internal Users & Roles"
        description="Phase 1 role and permission foundation. Only internal staff accounts (Owner/Admin and Office Worker) are permitted."
        actions={
          <Badge variant="default" className="text-xs">
            <UsersIcon className="h-3.5 w-3.5" />
            No Labourer Logins Policy Active
          </Badge>
        }
      />

      {!isOwnerAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Owner / Admin Access Required</CardTitle>
            <CardDescription>
              Your account is signed in with the <strong>{user?.role_label}</strong> role. Viewing
              the full internal staff directory is restricted to Owner / Admin accounts.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Registered Internal Accounts</CardTitle>
            <CardDescription>
              View and manage internal operational and administrative team accounts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-6">
                <Spinner label="Loading user accounts..." />
              </div>
            ) : isError || !data ? (
              <p className="text-xs text-red-600">Unable to load user directory.</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Full Name</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Sign In (IST)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.results.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="text-[13.5px] font-medium text-slate-900">
                          {account.full_name}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{account.username}</TableCell>
                        <TableCell className="text-[13px] text-slate-600">{account.email}</TableCell>
                        <TableCell>
                          <Badge variant={account.is_owner_admin ? "default" : "neutral"}>
                            <Shield className="h-3 w-3" />
                            {account.role_label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={account.is_active ? "success" : "destructive"}>
                            {account.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {formatDateTimeIST(account.last_login)}
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
      )}
    </div>
  );
}
