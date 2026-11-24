/**
 * Workflow-centered navigation structure for Pro Office (Adarsh ID Cards).
 *
 * Primary Navigation:
 * - Dashboard (/dashboard)
 * - OPERATIONS (4 Core Working Modules): Clients, Orders, Labour, Stock
 *
 * Secondary Navigation:
 * - ADMINISTRATION: Settings & Health, Users & Roles, Activity Logs
 */
import {
  Activity,
  Building2,
  FileSpreadsheet,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import type { AuthUser } from "@/types/auth";
import type { NavigationItem, NavigationSection } from "@/types/navigation";

export const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
    section: "TODAY",
    description: "Daily work queue, quick actions, and items needing attention.",
  },
  {
    id: "clients",
    label: "Clients",
    path: "/clients",
    matchPaths: ["/clients"],
    icon: Building2,
    section: "OPERATIONS",
    description: "Client directory, profiles, and order history.",
    requiredPermission: "clients.view",
  },
  {
    id: "orders",
    label: "Orders",
    path: "/orders",
    matchPaths: ["/orders", "/production"],
    icon: FileSpreadsheet,
    section: "OPERATIONS",
    description: "Orders, multi-item specifications, and production jobs.",
    requiredPermission: "orders.view",
  },
  {
    id: "users",
    label: "Users & Roles",
    path: "/system/users",
    matchPaths: ["/system/users"],
    icon: Users,
    section: "ADMINISTRATION",
    description: "Internal staff accounts and role access controls.",
    requiredPermission: "users.view",
    ownerAdminOnly: true,
  },
  {
    id: "activity-logs",
    label: "Activity Logs",
    path: "/system/activity-logs",
    matchPaths: ["/system/activity-logs"],
    icon: Activity,
    section: "ADMINISTRATION",
    description: "System audit trail and sign-in activity.",
    requiredPermission: "audit_logs.view",
  },
  {
    id: "settings",
    label: "Settings & Health",
    path: "/system/settings",
    matchPaths: ["/system/settings"],
    icon: Settings,
    section: "ADMINISTRATION",
    description: "Account settings, machine setup, and system health.",
  },
];

export function canAccessNavigationItem(item: NavigationItem, user: AuthUser | null): boolean {
  if (!user) return false;
  if (item.ownerAdminOnly && !user.is_owner_admin) return false;
  if (item.requiredPermission && !user.permissions.includes(item.requiredPermission)) {
    return false;
  }
  return true;
}

export function getVisibleNavigationSections(user: AuthUser | null): NavigationSection[] {
  const visible = NAVIGATION_ITEMS.filter((item) => canAccessNavigationItem(item, user));
  return (["TODAY", "OPERATIONS", "ADMINISTRATION"] as const)
    .map((title) => ({
      title,
      items: visible.filter((item) => item.section === title),
    }))
    .filter((section) => section.items.length > 0);
}

export function isNavigationItemActive(item: NavigationItem, pathname: string): boolean {
  const prefixes = item.matchPaths && item.matchPaths.length > 0 ? item.matchPaths : [item.path];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function findNavigationItemByPath(pathname: string): NavigationItem | undefined {
  return NAVIGATION_ITEMS.find((item) => isNavigationItemActive(item, pathname));
}
