/**
 * Workflow-centered navigation metadata types.
 */
import type { LucideIcon } from "lucide-react";

export type NavigationSectionTitle = "TODAY" | "OPERATIONS" | "ADMINISTRATION";

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  matchPaths?: string[];
  icon: LucideIcon;
  section: NavigationSectionTitle;
  description: string;
  requiredPermission?: string;
  ownerAdminOnly?: boolean;
}

export interface NavigationSection {
  title: NavigationSectionTitle;
  items: NavigationItem[];
}
