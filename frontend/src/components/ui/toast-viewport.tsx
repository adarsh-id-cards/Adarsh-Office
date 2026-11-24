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
      className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
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
              "flex items-start justify-between gap-3 rounded-[10px] border bg-white p-3.5 shadow-md",
              isError && "border-red-300 bg-red-50/95 text-red-900",
              isSuccess && "border-emerald-300 bg-emerald-50/95 text-emerald-900",
              isWarning && "border-amber-300 bg-amber-50/95 text-amber-900",
              !isError && !isSuccess && !isWarning && "border-slate-200 text-slate-900",
            )}
          >
            <div className="flex items-start gap-2.5">
              {isError ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              ) : isSuccess ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              )}
              <div>
                <p className="text-[13px] font-semibold">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-[12.5px] opacity-90">{toast.description}</p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="rounded-[6px] p-1 opacity-70 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
