import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
}

export function Card({ children, className, hover, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-white shadow-card",
        hover && "transition-shadow hover:shadow-cardhover",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
