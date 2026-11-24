import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

function extractLabel(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractLabel).join("");
  if (React.isValidElement(node)) {
    return extractLabel((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

export interface OptionItem {
  value: string;
  label: string;
  disabled?: boolean;
}

function extractOptions(children: React.ReactNode): OptionItem[] {
  const options: OptionItem[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === "option") {
      const p = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
      const val = p.value !== undefined ? String(p.value) : extractLabel(p.children);
      const label = extractLabel(p.children) || val;
      options.push({
        value: val,
        label,
        disabled: Boolean(p.disabled),
      });
    } else if (child.type === "optgroup") {
      const p = child.props as React.OptgroupHTMLAttributes<HTMLOptGroupElement>;
      options.push(...extractOptions(p.children));
    }
  });
  return options;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
  compact?: boolean;
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      hasError,
      compact = false,
      placeholder,
      children,
      id,
      name,
      value,
      defaultValue,
      onChange,
      disabled,
      required,
      ...props
    },
    ref,
  ) => {
    const nativeSelectRef = React.useRef<HTMLSelectElement>(null);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = React.useState(false);
    const [highlightedIndex, setHighlightedIndex] = React.useState(-1);

    // Merge external ref with nativeSelectRef
    React.useImperativeHandle(ref, () => nativeSelectRef.current as HTMLSelectElement);

    const options = React.useMemo(() => extractOptions(children), [children]);

    const isControlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = React.useState<string>(() => {
      if (defaultValue !== undefined) return String(defaultValue);
      return options[0]?.value ?? "";
    });

    const currentValue = isControlled ? String(value) : uncontrolledValue;

    // Find the currently selected option
    const selectedOption = React.useMemo(() => {
      return options.find((opt) => opt.value === currentValue);
    }, [options, currentValue]);

    const displayLabel = selectedOption?.label || placeholder || (options[0]?.label ?? "");

    // Close on outside click
    React.useEffect(() => {
      if (!isOpen) return;
      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    // Handle Option Selection
    const handleSelectOption = (optVal: string) => {
      if (disabled) return;
      if (!isControlled) {
        setUncontrolledValue(optVal);
      }
      setIsOpen(false);

      if (nativeSelectRef.current) {
        nativeSelectRef.current.value = optVal;
        const changeEvent = new Event("change", { bubbles: true });
        nativeSelectRef.current.dispatchEvent(changeEvent);
      }
    };

    // When the native select triggers an onChange (e.g. from Playwright .selectOption())
    const handleNativeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (!isControlled) {
        setUncontrolledValue(e.target.value);
      }
      onChange?.(e);
    };

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;

      if (e.key === "ArrowDown" || e.key === "Down") {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          const currIdx = options.findIndex((o) => o.value === currentValue);
          setHighlightedIndex(currIdx >= 0 ? currIdx : 0);
        } else {
          setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
        }
      } else if (e.key === "ArrowUp" || e.key === "Up") {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          const currIdx = options.findIndex((o) => o.value === currentValue);
          setHighlightedIndex(currIdx >= 0 ? currIdx : options.length - 1);
        } else {
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
        }
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0 && options[highlightedIndex]) {
          handleSelectOption(options[highlightedIndex].value);
        } else {
          setIsOpen((prev) => !prev);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
      } else if (e.key === "Tab") {
        setIsOpen(false);
      }
    };

    return (
      <div ref={containerRef} className="relative w-full">
        {/* Hidden but fully attached native select for Playwright, form submission & accessibility */}
        <select
          ref={nativeSelectRef}
          id={id}
          name={name}
          value={currentValue}
          onChange={handleNativeChange}
          onInput={(e) => handleNativeChange(e as unknown as React.ChangeEvent<HTMLSelectElement>)}
          onFocus={() => triggerRef.current?.focus()}
          disabled={disabled}
          required={required}
          tabIndex={-1}
          aria-hidden="true"
          className="absolute inset-0 -z-10 h-full w-full opacity-0 pointer-events-none"
          {...props}
        >
          {children}
        </select>

        {/* Custom Styled Trigger Button */}
        <button
          ref={triggerRef}
          type="button"
          id={id ? `${id}-custom-trigger` : undefined}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className={cn(
            "group flex w-full items-center justify-between rounded-[8px] border bg-white px-3 text-left font-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 select-none",
            compact ? "h-8 text-[13px]" : "h-9 text-[13.5px]",
            hasError
              ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/20"
              : isOpen
                ? "border-blue-600 ring-2 ring-blue-600/20"
                : "border-slate-300 hover:border-slate-400 focus-visible:border-blue-600",
            className,
          )}
        >
          <span className="truncate text-slate-800">
            {displayLabel}
          </span>
          <ChevronDown
            className={cn(
              "ml-2 h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:text-slate-600",
              isOpen && "rotate-180 text-blue-600",
            )}
            aria-hidden="true"
          />
        </button>

        {/* Custom Floating Options Menu */}
        {isOpen && (
          <div
            role="listbox"
            tabIndex={-1}
            className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-[10px] border border-slate-200 bg-white p-1 shadow-xl ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95"
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === currentValue;
              const isHighlighted = idx === highlightedIndex;

              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => !opt.disabled && handleSelectOption(opt.value)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-[6px] px-2.5 py-2 text-[13.5px] transition-colors select-none",
                    isSelected
                      ? "bg-blue-50 font-medium text-blue-700"
                      : isHighlighted
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                    opt.disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="ml-2 h-4 w-4 shrink-0 text-blue-600" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  },
);
Select.displayName = "Select";
