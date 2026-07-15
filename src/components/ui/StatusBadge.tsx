import { useLang } from "../../i18n/LanguageContext";
import { STATUS_LABEL, type PublicStatus } from "../../lib/mockData";
import { cn } from "../../lib/cn";

const styles: Record<PublicStatus, string> = {
  received: "bg-slate-100 text-slate-700",
  review: "bg-tint-amber text-amber-700",
  offer: "bg-tint-blue text-primary",
  accepted: "bg-tint-green text-emerald-700",
  declined: "bg-tint-red text-red-600",
  closed: "bg-slate-100 text-slate-500",
};

export function StatusBadge({ status }: { status: PublicStatus }) {
  const { t } = useLang();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        styles[status]
      )}
    >
      {t(STATUS_LABEL[status])}
    </span>
  );
}
