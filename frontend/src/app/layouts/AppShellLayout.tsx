import * as React from "react";
import { Outlet } from "react-router-dom";
import { SidebarNav } from "@/app/layouts/SidebarNav";
import { TopHeader } from "@/app/layouts/TopHeader";

export function AppShellLayout(): React.ReactElement {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900">
      <SidebarNav />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopHeader />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1440px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
