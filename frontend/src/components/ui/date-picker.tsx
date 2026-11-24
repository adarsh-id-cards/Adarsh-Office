import * as React from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDisplayDate(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return "";
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (isoDate: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  align?: "left" | "right";
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Select date",
  ariaLabel,
  clearable = true,
  disabled = false,
  className,
  align = "left",
}: DatePickerProps): React.ReactElement {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const today = React.useMemo(() => {
    const now = new Date();
    return toIsoDate(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const initialParsed = parseIsoDate(value) || new Date();
  const [viewYear, setViewYear] = React.useState(initialParsed.getFullYear());
  const [viewMonth, setViewMonth] = React.useState(initialParsed.getMonth());

  React.useEffect(() => {
    if (isOpen) {
      const target = parseIsoDate(value) || new Date();
      setViewYear(target.getFullYear());
      setViewMonth(target.getMonth());
    }
  }, [isOpen, value]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  const calendarCells = React.useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

    const cells: Array<{
      iso: string;
      day: number;
      inMonth: boolean;
    }> = [];

    for (let i = firstWeekday - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      cells.push({ iso: toIsoDate(prevY, prevM, d), day: d, inMonth: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ iso: toIsoDate(viewYear, viewMonth, d), day: d, inMonth: true });
    }

    const trailing = 42 - cells.length;
    for (let d = 1; d <= trailing; d++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      cells.push({ iso: toIsoDate(nextY, nextM, d), day: d, inMonth: false });
    }

    return cells;
  }, [viewYear, viewMonth]);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const displayValue = formatDisplayDate(value);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative flex items-center">
        <button
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label={ariaLabel || placeholder}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-[8px] border border-slate-300 bg-white px-3 text-left text-sm transition-colors hover:border-slate-400 focus-visible:border-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-75",
            clearable && value ? "pr-14" : "pr-9",
          )}
        >
          <span className={cn("truncate", displayValue ? "text-slate-900" : "text-slate-400")}>
            {displayValue || placeholder}
          </span>
        </button>

        {clearable && value && !disabled ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="absolute right-8 rounded-[6px] p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Clear date"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}

        <CalendarIcon
          className="pointer-events-none absolute right-2.5 h-4 w-4 text-slate-400"
          aria-hidden="true"
        />
      </div>

      {isOpen ? (
        <div
          role="dialog"
          aria-label="Calendar date picker"
          className={cn(
            "absolute z-50 mt-1.5 w-[280px] rounded-[12px] border border-slate-200 bg-white p-3 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {/* Month & Year Header */}
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={goPrevMonth}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-slate-900">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={goNextMonth}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="mb-1 grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((wd) => (
              <span key={wd} className="py-1 text-xs font-semibold text-slate-500">
                {wd}
              </span>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell) => {
              const isSelected = value === cell.iso;
              const isToday = today === cell.iso;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => {
                    onChange(cell.iso);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex h-8 w-full items-center justify-center rounded-[6px] text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600",
                    isSelected
                      ? "bg-blue-700 font-semibold text-white hover:bg-blue-800"
                      : isToday
                        ? "border border-blue-600 font-semibold text-blue-700 hover:bg-blue-50"
                        : cell.inMonth
                          ? "text-slate-800 hover:bg-slate-100"
                          : "text-slate-400 hover:bg-slate-50",
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Quick Footer */}
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(today);
                setIsOpen(false);
              }}
              className="rounded-[6px] px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
            >
              Today
            </button>
            {clearable && value ? (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                }}
                className="rounded-[6px] px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
