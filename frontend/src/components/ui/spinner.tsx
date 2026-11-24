import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  label?: string;
}

export function Spinner({ className, label }: SpinnerProps): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-2 text-slate-600" role="status">
      <Loader2 className={cn("h-4 w-4 animate-spin text-blue-700", className)} />
      {label ? <span className="text-xs font-medium">{label}</span> : null}
    </span>
  );
}
