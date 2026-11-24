import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  KeyRound,
  Server,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { systemService } from "@/services/systemService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { Spinner } from "@/components/ui/spinner";
import { ChangePasswordDialog } from "@/components/forms/ChangePasswordDialog";
import { envConfig } from "@/lib/env";
import { formatDateTimeIST } from "@/lib/utils";

export function SettingsPage(): React.ReactElement {
  const { user } = useAuth();
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = React.useState(false);

  const {
    data: health,
    isLoading: isHealthLoading,
    isError: isHealthError,
  } = useQuery({
    queryKey: ["system", "health"],
    queryFn: () => systemService.getHealth(),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administration & Settings"
        description="Account preferences, staff access controls, machine configuration, and system health."
        actions={
          <Button size="sm" onClick={() => setIsPasswordDialogOpen(true)}>
            <KeyRound className="h-3.5 w-3.5" />
            Change Password
          </Button>
        }
      />

      {/* Quick Administrative Tools Strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        {user?.is_owner_admin ? (
          <Link
            to="/system/users"
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3.5 transition-colors hover:border-blue-300"
          >
            <Users className="h-5 w-5 text-blue-700" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Users &amp; Roles</p>
              <p className="text-xs text-slate-500">Manage internal staff access</p>
            </div>
          </Link>
        ) : null}
        {user?.permissions.includes("audit_logs.view") ? (
          <Link
            to="/system/activity-logs"
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3.5 transition-colors hover:border-blue-300"
          >
            <Activity className="h-5 w-5 text-blue-700" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Activity &amp; Audit Logs</p>
              <p className="text-xs text-slate-500">Review recorded security &amp; audit events</p>
            </div>
          </Link>
        ) : null}
        <Link
          to="/machines"
          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3.5 transition-colors hover:border-blue-300"
        >
          <Cpu className="h-5 w-5 text-blue-700" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Machine Configuration</p>
            <p className="text-xs text-slate-500">Register &amp; manage physical presses</p>
          </div>
        </Link>
      </div>

      {/* Live System & Database Health (Moved off Daily Operations Dashboard) */}
      <Card>
        <CardHeader className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-blue-700" />
              System &amp; Database Health
            </CardTitle>
            <CardDescription>
              Live status reported by <code>GET /api/v1/health/</code>
            </CardDescription>
          </div>
          {isHealthLoading ? (
            <Spinner label="Checking health..." />
          ) : isHealthError || !health ? (
            <Badge variant="destructive">API Unreachable</Badge>
          ) : (
            <Badge variant={health.status === "healthy" ? "success" : "warning"}>
              <CheckCircle2 className="h-3 w-3" />
              System {health.status === "healthy" ? "Healthy" : "Degraded"}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <Server className="h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs font-medium text-slate-700">REST API Service</p>
                  <p className="text-xs text-slate-500">
                    {health?.service || "pro-office-api"}
                  </p>
                </div>
              </div>
              <Badge variant={health?.checks.application === "up" ? "success" : "neutral"}>
                {health?.checks.application || "checking"}
              </Badge>
            </div>

            <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <Database className="h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs font-medium text-slate-700">PostgreSQL Database</p>
                  <p className="text-xs text-slate-500">Primary store</p>
                </div>
              </div>
              <Badge variant={health?.checks.database === "connected" ? "success" : "destructive"}>
                {health?.checks.database || "checking"}
              </Badge>
            </div>

            <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <Clock className="h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs font-medium text-slate-700">Last Check</p>
                  <p className="text-xs text-slate-500">
                    {health ? formatDateTimeIST(health.timestamp) : "Pending..."}
                  </p>
                </div>
              </div>
              <Badge variant="neutral">{health?.timezone || "Asia/Kolkata"}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Signed-In Profile</CardTitle>
            <CardDescription>Active user account and granted permissions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Full Name</span>
              <span className="font-semibold text-slate-900">{user?.full_name}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Username</span>
              <span className="font-mono text-slate-800">{user?.username}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Work Email</span>
              <span className="text-slate-800">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Assigned Role</span>
              <Badge variant={user?.is_owner_admin ? "default" : "neutral"}>
                <ShieldCheck className="h-3 w-3" />
                {user?.role_label}
              </Badge>
            </div>
            <div>
              <p className="mb-1.5 text-slate-500">Effective Capabilities</p>
              <div className="flex flex-wrap gap-1.5">
                {user?.permissions.map((perm) => (
                  <span
                    key={perm}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700"
                  >
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Workspace Configuration</CardTitle>
            <CardDescription>Environment parameters for {envConfig.companyName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Application</span>
              <span className="font-medium text-slate-900">{envConfig.appName}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Company</span>
              <span className="font-medium text-slate-900">{envConfig.companyName}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">API Base Path</span>
              <code className="font-mono text-slate-800">{envConfig.apiBaseUrl}</code>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Timezone</span>
              <span className="font-medium text-slate-900">Asia/Kolkata (IST)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Authentication</span>
              <span className="font-medium text-emerald-700">HTTP-Only Session Cookie + CSRF</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <ChangePasswordDialog
        open={isPasswordDialogOpen}
        onOpenChange={setIsPasswordDialogOpen}
      />
    </div>
  );
}
