import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { CreditCard, X } from "lucide-react";
import {
  getVisibleNavigationSections,
  isNavigationItemActive,
} from "@/app/router/navigationConfig";
import { useAuth } from "@/hooks/useAuth";
import { useUiShellStore } from "@/hooks/useToastStore";
import { cn } from "@/lib/utils";
import { envConfig } from "@/lib/env";

export function SidebarNav(): React.ReactElement {
  const location = useLocation();
  const { user } = useAuth();
  const { isMobileSidebarOpen, setMobileSidebarOpen } = useUiShellStore();

  const sections = React.useMemo(() => getVisibleNavigationSections(user), [user]);
  const primarySections = sections.filter((s) => s.title !== "ADMINISTRATION");
  const adminSection = sections.find((s) => s.title === "ADMINISTRATION");

  const renderSectionItems = (items: (typeof sections)[number]["items"]) => (
    <ul className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isNavigationItemActive(item, location.pathname);

        return (
          <li key={item.id}>
            <NavLink
              to={item.path}
              onClick={() => setMobileSidebarOpen(false)}
              className={cn(
                "group flex h-9 items-center gap-2.5 rounded-[8px] px-3 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600",
                active
                  ? "bg-blue-50 font-semibold text-blue-800"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  active ? "text-blue-700" : "text-slate-500 group-hover:text-slate-800",
                )}
              />
              <span className="truncate">{item.label}</span>
            </NavLink>
          </li>
        );
      })}
    </ul>
  );

  const renderNavContent = () => (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white">
      {/* Brand Header */}
      <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-blue-700 text-white">
            <CreditCard className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight tracking-tight text-slate-900">
              PRO OFFICE
            </p>
            <p className="text-xs font-medium text-slate-500">{envConfig.companyName}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(false)}
          className="rounded-[6px] p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Primary Workflow Navigation */}
      <nav
        className="flex-1 space-y-5 overflow-y-auto px-3 py-4"
        aria-label="Primary Sidebar Navigation"
      >
        {primarySections.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {section.title === "TODAY" ? "Home" : "Workspace"}
            </p>
            {renderSectionItems(section.items)}
          </div>
        ))}
      </nav>

      {/* Compact Secondary Navigation: Administration */}
      {adminSection ? (
        <div className="border-t border-slate-200 bg-slate-50/70 px-3 py-3">
          <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Administration
          </p>
          {renderSectionItems(adminSection.items)}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <aside className="hidden w-56 shrink-0 lg:block">{renderNavContent()}</aside>

      {isMobileSidebarOpen ? (
        <div className="fixed inset-0 z-40 flex lg:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 flex w-64 max-w-[82vw] flex-col bg-white">
            {renderNavContent()}
          </div>
        </div>
      ) : null}
    </>
  );
}
