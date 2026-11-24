import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  backLink?: { to: string; label: string } | React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  description,
  badge,
  backLink,
  actions,
  className,
}: PageHeaderProps): React.ReactElement {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {backLink ? (
          <div className="mb-1">
            {typeof backLink === "object" &&
            backLink !== null &&
            "to" in backLink &&
            "label" in backLink ? (
              <Link
                to={(backLink as { to: string; label: string }).to}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {(backLink as { to: string; label: string }).label}
              </Link>
            ) : (
              (backLink as React.ReactNode)
            )}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-2xl">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle || description ? (
          <p className="text-[13px] leading-normal text-slate-500">{subtitle || description}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
      ) : null}
    </div>
  );
}
