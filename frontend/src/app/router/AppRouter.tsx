import * as React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/app/router/ProtectedRoute";
import { AppShellLayout } from "@/app/layouts/AppShellLayout";
import { LoginPage } from "@/modules/auth/LoginPage";
import { DashboardPage } from "@/modules/dashboard/DashboardPage";
import { ClientsListPage } from "@/modules/clients/ClientsListPage";
import { ClientDetailPage } from "@/modules/clients/ClientDetailPage";
import { OrdersListPage } from "@/modules/orders/OrdersListPage";
import { OrderCreatePage } from "@/modules/orders/OrderCreatePage";
import { ReplacementOrderCreatePage } from "@/modules/orders/ReplacementOrderCreatePage";
import { OrderDetailPage } from "@/modules/orders/OrderDetailPage";
import { ProductionDashboardPage } from "@/modules/production/ProductionDashboardPage";
import { ProductionJobDetailPage } from "@/modules/production/ProductionJobDetailPage";
import { LabourPage } from "@/modules/labour/LabourPage";
import { LabourerDetailPage } from "@/modules/labour/LabourerDetailPage";
import { InventoryPage } from "@/modules/inventory/InventoryPage";
import { DispatchPage } from "@/modules/dispatch/DispatchPage";
import { UsersPage } from "@/modules/system/UsersPage";
import { ActivityLogsPage } from "@/modules/system/ActivityLogsPage";
import { SettingsPage } from "@/modules/system/SettingsPage";

export function AppRouter(): React.ReactElement {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShellLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Primary Module A: Clients */}
          <Route path="/clients" element={<ClientsListPage />} />
          <Route path="/clients/:clientId" element={<ClientDetailPage />} />

          {/* Primary Module B: Orders (includes inline Production, Assembly, Dispatch) */}
          <Route path="/orders" element={<OrdersListPage />} />
          <Route path="/orders/new" element={<OrderCreatePage />} />
          <Route path="/orders/replacements/new" element={<ReplacementOrderCreatePage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />

          {/* Direct Production & Dispatch Permalinks (Backward Compatible) */}
          <Route path="/production" element={<ProductionDashboardPage />} />
          <Route path="/production/jobs/:jobId" element={<ProductionJobDetailPage />} />
          <Route path="/dispatch" element={<DispatchPage />} />

          {/* Primary Module C: Labour (includes embedded Machines tab) */}
          <Route path="/labour" element={<LabourPage />} />
          <Route path="/labour/:labourerId" element={<LabourerDetailPage />} />
          <Route path="/machines" element={<LabourPage defaultTab="machines" />} />

          {/* Primary Module D: Stock (includes embedded Stock Audits tab) */}
          <Route path="/stock" element={<InventoryPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/stock-audit" element={<InventoryPage defaultTab="audits" />} />

          {/* Secondary Navigation: Administration */}
          <Route path="/system/settings" element={<SettingsPage />} />
          <Route path="/system/users" element={<UsersPage />} />
          <Route path="/system/activity-logs" element={<ActivityLogsPage />} />

          {/* Fallback inside authenticated shell */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
