import * as React from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useUiShellStore } from "@/hooks/useToastStore";
import { cn } from "@/lib/utils";

export function ToastViewport(): React.ReactElement | null {
  const { toasts, dismissToast } = useUiShellStore();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed top-4 right-4 z-50 flex w-full max-w-xs flex-col gap-2 pointer-events-none px-4 sm:px-0"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const isError = toast.variant === "error";
        const isSuccess = toast.variant === "success";
        const isWarning = toast.variant === "warning";

        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start justify-between gap-2.5 rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur-xs animate-in fade-in slide-in-from-top-2 duration-200",
              isError && "border-red-300 bg-red-50/95 text-red-900",
              isSuccess && "border-emerald-300 bg-emerald-50/95 text-emerald-900",
              isWarning && "border-amber-300 bg-amber-50/95 text-amber-900",
              !isError && !isSuccess && !isWarning && "border-slate-200 text-slate-900",
            )}
          >
            <div className="flex items-start gap-2">
              {isError ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              ) : isSuccess ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-tight">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-[11.5px] opacity-85 leading-tight">{toast.description}</p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="rounded-[4px] p-0.5 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss notification"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
