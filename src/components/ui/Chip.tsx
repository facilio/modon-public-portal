import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/** Small pill used in the hero + callouts (icon + label on a white surface). */
export function Chip({
  icon,
  children,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-medium text-ink-soft shadow-card",
        className
      )}
    >
      {icon && <span className="text-primary">{icon}</span>}
      {children}
    </span>
  );
}
