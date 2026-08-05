import { Link } from "react-router-dom";
import { CheckCircle2, Copy, Home } from "lucide-react";
import { useState } from "react";
import { useLang } from "../../i18n/LanguageContext";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";

export function SuccessScreen({
  code,
  email,
  isEdit = false,
}: {
  code: string;
  email: string;
  isEdit?: boolean;
}) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="container-page max-w-2xl py-12">
      <Card className="p-8 text-center sm:p-10">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-tint-green text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink">
          {t(isEdit ? "ok.edit.title" : "ok.title")}
        </h1>
        <p className="mt-2 text-muted">{t(isEdit ? "ok.edit.sub" : "ok.sub")}</p>

        {/* Code */}
        <div className="mt-7 rounded-xl border border-dashed border-primary/40 bg-primary-soft/60 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("ok.codeLabel")}
          </p>
          <div className="mt-2 flex items-center justify-center gap-3">
            <span className="font-mono text-2xl font-bold tracking-wider text-ink sm:text-3xl">
              {code}
            </span>
            <button
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-muted hover:text-primary"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "✓" : ""}
            </button>
          </div>
          <p className="mt-3 text-sm text-muted">{t("ok.emailed", { email })}</p>
        </div>

        {/* Next steps */}
        <div className="mt-6 rounded-xl bg-canvas p-5 text-start">
          <p className="text-sm font-semibold text-ink">{t("ok.slaTitle")}</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {[t("ok.sla1"), t("ok.sla2"), t("ok.sla3")].map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-7 flex justify-center">
          {/* Track button removed for now (tracking flow not set up clearly). */}
          <Link to="/">
            <Button size="lg" variant="secondary" className="w-full sm:w-auto">
              <Home className="h-4 w-4" />
              {t("ok.home")}
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
