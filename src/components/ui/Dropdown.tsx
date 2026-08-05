import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";
import { inputClass } from "./Input";
import { useLang } from "../../i18n/LanguageContext";

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** Extra classes for the positioning wrapper (e.g. `flex-1` inside a row). */
  wrapperClassName?: string;
  "aria-label"?: string;
}

/**
 * A styled single-select dropdown that replaces the native `<select>`.
 * Same value contract (a string), so it's a drop-in for the native control,
 * with a custom popover list, keyboard support, and RTL awareness.
 */
export function Dropdown({
  id,
  value,
  onChange,
  options,
  placeholder,
  invalid,
  disabled,
  wrapperClassName,
  "aria-label": ariaLabel,
}: DropdownProps) {
  const { t, dir } = useLang();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);
  const ph = placeholder ?? t("f.select.ph");

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Scroll the selected option into view when opening.
  useEffect(() => {
    if (open && listRef.current) {
      const active = listRef.current.querySelector<HTMLElement>('[data-active="true"]');
      active?.scrollIntoView({ block: "nearest" });
    }
  }, [open]);

  // Flip the list above the trigger when there isn't room below it.
  useEffect(() => {
    if (!open || !rootRef.current) return;
    const POPOVER_H = 240; // matches max-h-60
    const rect = rootRef.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    setPlacement(below < POPOVER_H && rect.top > below ? "top" : "bottom");
  }, [open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", wrapperClassName)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          inputClass,
          "flex items-center justify-between pe-10 text-start",
          invalid ? "border-red-400" : "border-line",
          !selected && "text-muted/70",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <span className="truncate">{selected ? selected.label : ph}</span>
      </button>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition-transform",
          open && "rotate-180"
        )}
      />

      {open && (
        <ul
          ref={listRef}
          dir={dir}
          role="listbox"
          className={cn(
            "absolute z-50 max-h-60 w-full overflow-auto rounded-xl border border-line bg-white p-1 shadow-lg",
            placement === "top" ? "bottom-full mb-2" : "mt-2"
          )}
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">—</li>
          ) : (
            options.map((opt) => {
              const active = opt.value === value;
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    onClick={() => choose(opt.value)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm transition-colors",
                      active
                        ? "bg-primary-soft font-medium text-primary"
                        : "text-ink hover:bg-primary-soft/60"
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {active && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
