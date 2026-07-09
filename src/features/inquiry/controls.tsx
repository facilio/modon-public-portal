import { Check, X } from "lucide-react";
import { cn } from "../../lib/cn";

interface Opt {
  value: string;
  label: string;
}

/** Segmented radio cards (single select) — used for persona + urgency. */
export function RadioCards({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Opt[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary-soft text-primary"
                : "border-line bg-white text-ink-soft hover:border-primary/40"
            )}
          >
            <span>{o.label}</span>
            <span
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-full border",
                active ? "border-primary bg-primary" : "border-line"
              )}
            >
              {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Multi-select chips — used for site + service preferences. */
export function ChipMultiSelect({
  selected,
  onChange,
  options,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
  options: Opt[];
}) {
  function toggle(v: string) {
    onChange(
      selected.includes(v)
        ? selected.filter((x) => x !== v)
        : [...selected, v]
    );
  }
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary-soft text-primary"
                : "border-line bg-white text-ink-soft hover:border-primary/40"
            )}
          >
            {active && <Check className="h-3.5 w-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Ranked preference list — tap an option to append it as the next choice
 * (1 = most preferred); tap a chosen option to remove it and re-rank the rest.
 * Used for site_preference and room_type_preference (fixed fields).
 */
export function RankedListField({
  selected,
  onChange,
  options,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
  options: Opt[];
}) {
  function toggle(v: string) {
    onChange(
      selected.includes(v)
        ? selected.filter((x) => x !== v)
        : [...selected, v]
    );
  }
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((o) => {
        const rank = selected.indexOf(o.value);
        const active = rank >= 0;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary-soft text-primary"
                : "border-line bg-white text-ink-soft hover:border-primary/40"
            )}
          >
            {active && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                {rank + 1}
              </span>
            )}
            {o.label}
            {active && <X className="h-3.5 w-3.5 opacity-70" />}
          </button>
        );
      })}
    </div>
  );
}
