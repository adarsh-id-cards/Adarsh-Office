import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  Building2,
  ChevronRight,
  FileSpreadsheet,
  HardHat,
  KeyRound,
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
} from "lucide-react";
import { findNavigationItemByPath } from "@/app/router/navigationConfig";
import { useAuth } from "@/hooks/useAuth";
import { useUiShellStore } from "@/hooks/useToastStore";
import { clientService } from "@/services/clientService";
import { orderService } from "@/services/orderService";
import { phase4Service } from "@/services/phase4Service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChangePasswordDialog } from "@/components/forms/ChangePasswordDialog";

function resolveBreadcrumbTitle(pathname: string, fallback: string): string {
  if (pathname === "/orders/new") return "New Order";
  if (pathname === "/orders/replacements/new") return "Replacement Order";
  if (pathname.startsWith("/orders/")) return "Order Workspace";
  if (pathname.startsWith("/production")) return "Production";
  if (pathname === "/dispatch") return "Packing & Dispatch";
  if (pathname.startsWith("/clients/")) return "Client Profile";
  if (pathname.startsWith("/labour/")) return "Labourer Profile";
  if (pathname === "/machines") return "Machines";
  if (pathname === "/stock-audit") return "Stock Audits";
  return fallback;
}

export function TopHeader(): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { toggleMobileSidebar, addToast } = useUiShellStore();

  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isNotifOpen, setIsNotifOpen] = React.useState(false);
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [searchText, setSearchText] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = React.useState(false);

  const menuRef = React.useRef<HTMLDivElement>(null);
  const notifRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLDivElement>(null);

  const activeNav = findNavigationItemByPath(location.pathname);
  const pageTitle = resolveBreadcrumbTitle(location.pathname, activeNav?.label || "Dashboard");
  const sectionTitle =
    activeNav?.section === "ADMINISTRATION"
      ? "Administration"
      : activeNav?.section === "OPERATIONS"
        ? activeNav.label
        : "Home";

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchText.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) setIsMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(target)) setIsNotifOpen(false);
      if (searchRef.current && !searchRef.current.contains(target)) setIsSearchOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchEnabled = Boolean(user && debouncedSearch.length >= 2);
  const { data: searchOrders } = useQuery({
    queryKey: ["global-search", "orders", debouncedSearch],
    queryFn: () => orderService.listOrders({ search: debouncedSearch, page_size: 4 }),
    enabled: searchEnabled,
  });
  const { data: searchClients } = useQuery({
    queryKey: ["global-search", "clients", debouncedSearch],
    queryFn: () => clientService.listClients({ search: debouncedSearch, page_size: 4 }),
    enabled: searchEnabled,
  });
  const { data: searchLabourers } = useQuery({
    queryKey: ["global-search", "labourers", debouncedSearch],
    queryFn: () => phase4Service.listLabourers({ search: debouncedSearch }),
    enabled: searchEnabled && Boolean(user?.permissions.includes("labour.view")),
  });

  const { data: materialsPage } = useQuery({
    queryKey: ["inventory", "materials"],
    queryFn: async () => (await phase4Service.listMaterials()) ?? { results: [] },
    enabled: Boolean(user?.permissions.includes("inventory.view")),
    staleTime: 60_000,
  });
  const { data: assignmentsData } = useQuery({
    queryKey: ["assembly", "assignments", "summary"],
    queryFn: async () => (await phase4Service.listAssignments()) ?? { results: [] },
    enabled: Boolean(user?.permissions.includes("labour.view")),
    staleTime: 60_000,
  });
  const { data: consumptionList } = useQuery({
    queryKey: ["inventory", "consumption"],
    queryFn: async () => (await phase4Service.getConsumptionSummary()) ?? [],
    enabled: Boolean(user?.permissions.includes("inventory.view")),
    staleTime: 60_000,
  });

  const alerts = React.useMemo(() => {
    const items: Array<{ id: string; title: string; detail: string; to: string }> = [];
    const lowStock = (materialsPage?.results || []).filter(
      (m) => m.minimum_stock_level > 0 && m.office_usable_stock <= m.minimum_stock_level,
    );
    lowStock.slice(0, 3).forEach((m) =>
      items.push({
        id: `low-${m.id}`,
        title: `Low stock: ${m.name}`,
        detail: `${m.office_usable_stock.toLocaleString("en-IN")} ${m.base_unit} remaining`,
        to: "/stock",
      }),
    );

    const pendingAssignments = (assignmentsData?.results || []).filter(
      (a) => a.pending_quantity > 0 && a.status !== "cancelled",
    );
    const firstPending = pendingAssignments[0];
    if (pendingAssignments.length > 0 && firstPending) {
      items.push({
        id: "asm-pending",
        title: `${pendingAssignments.length} assembly return(s) pending`,
        detail: `${firstPending.order_number} • ${firstPending.labourer_name || "Office"}`,
        to: `/orders/${firstPending.order_id}?tab=assembly`,
      });
    }

    const diffCount = (consumptionList || []).filter((c) => c.unexplained_difference !== 0).length;
    if (diffCount > 0) {
      items.push({
        id: "stock-diff",
        title: `${diffCount} stock variance(s)`,
        detail: "Review Consumption & Stock Audits",
        to: "/stock?tab=consumption",
      });
    }
    return items;
  }, [materialsPage, assignmentsData, consumptionList]);

  const handleLogout = async () => {
    setIsMenuOpen(false);
    try {
      await logout();
      addToast({
        title: "Signed Out",
        description: "You have been signed out of Pro Office.",
        variant: "default",
      });
      navigate("/login", { replace: true });
    } catch {
      addToast({
        title: "Sign Out Error",
        description: "Could not complete sign out. Please refresh the page.",
        variant: "error",
      });
    }
  };

  const orderHits = searchOrders?.results || [];
  const clientHits = searchClients?.results || [];
  const labourerHits = (searchLabourers?.results || []).slice(0, 3);
  const totalSearchHits = orderHits.length + clientHits.length + labourerHits.length;

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
        {/* Left: Mobile Menu + Breadcrumbs */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={toggleMobileSidebar}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="min-w-0">
            <nav
              aria-label="Breadcrumb"
              className="hidden items-center gap-1 text-xs text-slate-500 sm:flex"
            >
              <span>Pro Office</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              <span>{sectionTitle}</span>
              {pageTitle !== sectionTitle ? (
                <>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                  <span className="truncate font-medium text-slate-700">{pageTitle}</span>
                </>
              ) : null}
            </nav>
            <h2 className="truncate text-sm font-semibold text-slate-900 sm:hidden">
              {pageTitle}
            </h2>
          </div>
        </div>

        {/* Right: Global Search + Operational Alerts + Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative hidden md:block md:w-64 lg:w-80" ref={searchRef}>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="search"
              value={searchText}
              onFocus={() => setIsSearchOpen(true)}
              onChange={(e) => {
                setSearchText(e.target.value);
                setIsSearchOpen(true);
              }}
              placeholder="Search orders, clients, labourers..."
              className="pl-9"
              aria-label="Global search"
              data-testid="global-search-input"
            />
            {isSearchOpen && debouncedSearch.length >= 2 ? (
              <div className="absolute right-0 mt-1.5 w-80 rounded-[12px] border border-slate-200 bg-white p-2 shadow-lg">
                {totalSearchHits === 0 ? (
                  <p className="px-3 py-4 text-center text-[13px] text-slate-500">
                    No matching orders, clients, or labourers.
                  </p>
                ) : (
                  <div className="space-y-2 text-[13.5px]">
                    {orderHits.length > 0 ? (
                      <div>
                        <p className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Orders
                        </p>
                        {orderHits.map((o) => (
                          <Link
                            key={o.id}
                            to={`/orders/${o.id}`}
                            onClick={() => setIsSearchOpen(false)}
                            className="flex items-center justify-between rounded-[6px] px-2.5 py-1.5 hover:bg-slate-100"
                          >
                            <span className="flex items-center gap-2 truncate font-medium text-slate-900">
                              <FileSpreadsheet className="h-4 w-4 shrink-0 text-blue-700" />
                              <span className="font-mono">{o.order_number}</span>
                              <span className="truncate text-slate-600">{o.client_name}</span>
                            </span>
                            <span className="ml-2 shrink-0 text-xs text-slate-500">
                              {o.status_label}
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : null}

                    {clientHits.length > 0 ? (
                      <div>
                        <p className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Clients
                        </p>
                        {clientHits.map((c) => (
                          <Link
                            key={c.id}
                            to={`/clients/${c.id}`}
                            onClick={() => setIsSearchOpen(false)}
                            className="flex items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-slate-900 hover:bg-slate-100"
                          >
                            <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
                            <span className="truncate font-medium">{c.name}</span>
                          </Link>
                        ))}
                      </div>
                    ) : null}

                    {labourerHits.length > 0 ? (
                      <div>
                        <p className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Labourers
                        </p>
                        {labourerHits.map((l) => (
                          <Link
                            key={l.id}
                            to={`/labour/${l.id}`}
                            onClick={() => setIsSearchOpen(false)}
                            className="flex items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-slate-900 hover:bg-slate-100"
                          >
                            <HardHat className="h-4 w-4 shrink-0 text-slate-500" />
                            <span className="truncate font-medium">{l.name}</span>
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setIsNotifOpen((prev) => !prev)}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              aria-label="Operational alerts"
              data-testid="notifications-trigger"
            >
              <Bell className="h-4 w-4" />
              {alerts.length > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-700 px-1 text-[11px] font-bold text-white">
                  {alerts.length}
                </span>
              ) : null}
            </button>

            {isNotifOpen ? (
              <div className="absolute right-0 mt-1.5 w-80 rounded-[12px] border border-slate-200 bg-white p-2.5 shadow-lg">
                <p className="border-b border-slate-100 px-2 pb-2 text-[13px] font-semibold text-slate-900">
                  Attention Items ({alerts.length})
                </p>
                {alerts.length === 0 ? (
                  <p className="px-2 py-4 text-center text-[13px] text-slate-500">
                    All workflows and stock levels look clear.
                  </p>
                ) : (
                  <div className="mt-1.5 space-y-1">
                    {alerts.map((al) => (
                      <Link
                        key={al.id}
                        to={al.to}
                        onClick={() => setIsNotifOpen(false)}
                        className="flex items-start gap-2.5 rounded-[8px] px-2.5 py-2 text-[13px] hover:bg-slate-50"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{al.title}</p>
                          <p className="truncate text-xs text-slate-500">{al.detail}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="flex h-9 items-center gap-2.5 rounded-[8px] border border-slate-200 bg-white px-2.5 text-left text-[13px] transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                data-testid="user-profile-menu-trigger"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800">
                  {user.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <p className="font-semibold leading-tight text-slate-900">{user.full_name}</p>
                  <p className="text-[11.5px] leading-tight text-slate-500">{user.role_label}</p>
                </div>
              </button>

              {isMenuOpen ? (
                <div
                  className="absolute right-0 mt-1.5 w-64 rounded-[12px] border border-slate-200 bg-white p-1.5 shadow-lg"
                  role="menu"
                >
                  <div className="border-b border-slate-100 px-3 py-2.5">
                    <p className="text-[13.5px] font-semibold text-slate-900">{user.full_name}</p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                    <div className="mt-2">
                      <Badge variant={user.is_owner_admin ? "default" : "neutral"}>
                        <Shield className="h-3 w-3" />
                        {user.role_label}
                      </Badge>
                    </div>
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsMenuOpen(false);
                        navigate("/system/settings");
                      }}
                      className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-[13.5px] text-slate-700 hover:bg-slate-100"
                    >
                      <Settings className="h-4 w-4 text-slate-500" />
                      Administration &amp; Settings
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsMenuOpen(false);
                        setIsPasswordDialogOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-[13.5px] text-slate-700 hover:bg-slate-100"
                    >
                      <KeyRound className="h-4 w-4 text-slate-500" />
                      Change Password
                    </button>
                  </div>

                  <div className="border-t border-slate-100 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLogout}
                      className="w-full justify-start text-red-700 hover:bg-red-50 hover:text-red-800"
                      data-testid="logout-button"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <ChangePasswordDialog
        open={isPasswordDialogOpen}
        onOpenChange={setIsPasswordDialogOpen}
      />
    </>
  );
}
