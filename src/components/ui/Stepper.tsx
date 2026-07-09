import { Check } from "lucide-react";
import { cn } from "../../lib/cn";

/** Horizontal numbered wizard stepper (matches the reference registration flow). */
export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number; // 0-based index of the active step
}) {
  return (
    <ol className="flex items-start">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const isLast = i === steps.length - 1;
        return (
          <li
            key={label}
            className={cn("flex items-start", !isLast && "flex-1")}
          >
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                  active && "border-primary bg-primary text-white",
                  done && "border-primary bg-primary/10 text-primary",
                  !active &&
                    !done &&
                    "border-line bg-white text-muted"
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  "mt-2 max-w-[6.5rem] text-center text-xs font-medium leading-tight",
                  active ? "text-ink" : "text-muted"
                )}
              >
                {label}
              </span>
            </div>
            {!isLast && (
              <span
                className={cn(
                  "mt-4 h-0.5 flex-1 rounded-full transition-colors",
                  done ? "bg-primary" : "bg-line"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
