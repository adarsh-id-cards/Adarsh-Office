import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, id, checked, label, description, disabled, ...props }, ref) => {
    return (
      <label
        htmlFor={id}
        className={cn(
          "inline-flex min-h-[32px] cursor-pointer select-none items-start gap-2.5 text-sm text-slate-700",
          disabled && "cursor-not-allowed opacity-60",
          className,
        )}
      >
        <span className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            className="peer sr-only"
            {...props}
          />
          <span
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600 peer-focus-visible:ring-offset-1",
              checked
                ? "border-blue-700 bg-blue-700 text-white"
                : "border-slate-300 bg-white hover:border-slate-400",
            )}
          >
            {checked ? <Check className="h-3 w-3 stroke-[3]" /> : null}
          </span>
        </span>
        {label || description ? (
          <span className="leading-snug">
            {label ? <span className="font-medium text-slate-800">{label}</span> : null}
            {description ? (
              <span className="mt-0.5 block text-[13px] text-slate-500">{description}</span>
            ) : null}
          </span>
        ) : null}
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";
