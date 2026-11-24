import * as React from "react";
import { Spinner } from "@/components/ui/spinner";

interface GlobalLoadingScreenProps {
  message?: string;
}

export function GlobalLoadingScreen({
  message = "Loading Pro Office workspace...",
}: GlobalLoadingScreenProps): React.ReactElement {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <Spinner className="h-5 w-5" />
        <p className="text-xs font-medium text-slate-600">{message}</p>
      </div>
    </div>
  );
}
