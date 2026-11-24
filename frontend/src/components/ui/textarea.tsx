import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hasError, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[84px] w-full rounded-[8px] border bg-white px-3 py-2 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-75",
          hasError
            ? "border-red-500 focus-visible:ring-red-500"
            : "border-slate-300 hover:border-slate-400 focus-visible:border-blue-600 focus-visible:ring-blue-600",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
