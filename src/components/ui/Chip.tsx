import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/** Small pill used in the hero + callouts (icon + label on a white surface). */
export function Chip({
  icon,
  children,
  className,
  iconClassName,
}: {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Overrides the icon tint — the hero banner needs a light icon on navy,
   *  where the default `text-primary` has too little contrast. */
  iconClassName?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-medium text-ink-soft shadow-card",
        className
      )}
    >
      {icon && <span className={cn("text-primary", iconClassName)}>{icon}</span>}
      {children}
    </span>
  );
}
