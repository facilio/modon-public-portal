import { Check } from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";
import {
  PUBLIC_STEPS,
  STATUS_LABEL,
  type PublicStatus,
} from "../../lib/mockData";
import { cn } from "../../lib/cn";

/**
 * Public-friendly progress bar for a single inquiry:
 * Received → Under Review → Offer Sent → Offer Accepted.
 * A "closed" inquiry shows a soft message instead of the stepper (doc §5.3 —
 * never reveal disqualification).
 */
export function ProgressStepper({ status }: { status: PublicStatus }) {
  const { t } = useLang();

  if (status === "closed") {
    return (
      <div className="rounded-lg bg-canvas px-4 py-3 text-sm text-muted">
        {t("status.closed.msg")}
      </div>
    );
  }

  const currentIndex = PUBLIC_STEPS.indexOf(status);

  return (
    <ol className="flex items-start">
      {PUBLIC_STEPS.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const isLast = i === PUBLIC_STEPS.length - 1;
        return (
          <li key={step} className={cn("flex items-start", !isLast && "flex-1")}>
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold",
                  active && "border-primary bg-primary text-white",
                  done && "border-primary bg-primary/10 text-primary",
                  !active && !done && "border-line bg-white text-muted"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "mt-1.5 max-w-[5.5rem] text-center text-[11px] font-medium leading-tight",
                  active ? "text-ink" : done ? "text-primary" : "text-muted"
                )}
              >
                {t(STATUS_LABEL[step])}
              </span>
            </div>
            {!isLast && (
              <span
                className={cn(
                  "mt-3.5 h-0.5 flex-1 rounded-full",
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
