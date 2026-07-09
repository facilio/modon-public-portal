import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  optionalText?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

/** Label + helper/error scaffolding shared by every form control. */
export function Field({
  label,
  required,
  hint,
  error,
  optionalText,
  htmlFor,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 text-sm font-medium text-ink-soft"
      >
        {label}
        {required && <span className="text-red-500 ms-0.5">*</span>}
        {!required && optionalText && (
          <span className="ms-1 font-normal text-muted">({optionalText})</span>
        )}
      </label>
      {children}
      {error ? (
        <span className="mt-1 text-xs text-red-500">{error}</span>
      ) : (
        hint && <span className="mt-1 text-xs text-muted">{hint}</span>
      )}
    </div>
  );
}
