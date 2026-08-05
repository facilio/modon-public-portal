import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Loader2, Mail } from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ProgressStepper } from "../../components/ui/ProgressStepper";
import { formatDate, formatNumber } from "../../lib/format";
import { api, type InquiryDetail as Detail, type Persona } from "../../lib/api";

const personaKey: Record<Persona, "f.persona.company" | "f.persona.agency" | "f.persona.individual"> = {
  Corporate: "f.persona.company",
  Sponsor: "f.persona.agency",
  Individual: "f.persona.individual",
};

export function InquiryDetailView({
  code,
  onBack,
}: {
  code: string;
  onBack: () => void;
}) {
  const { t, lang } = useLang();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .getInquiryDetail(code)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t("st.detail.back")}
      </button>

      {loading && (
        <Card className="flex items-center justify-center gap-2 p-12 text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </Card>
      )}

      {error && !loading && (
        <Card className="p-10 text-center text-muted">{t("st.lookup.error")}</Card>
      )}

      {detail && !loading && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-2xl font-bold tracking-wide text-ink">
                  {detail.code}
                </span>
                <StatusBadge status={detail.status} />
              </div>
              <p className="mt-1.5 text-sm text-muted">
                {t("st.card.submitted")}: {formatDate(detail.submittedAt, lang)} ·{" "}
                {t("st.card.updated")}: {formatDate(detail.updatedAt, lang)}
              </p>
            </div>
          </div>

          {/* Progress */}
          <Card className="p-6">
            <ProgressStepper status={detail.status} />
          </Card>

          {/* Offer notice — proposal is sent by email; the team decides manually */}
          {detail.status === "offer" && <OfferNotice offer={detail.offer} />}

          {/* Read-only inquiry summary */}
          <ReadonlySection title={t("rev.section.contact")}>
            <Row label={t("f.persona")} value={t(personaKey[detail.persona])} />
            <Row label={t("f.fullName")} value={detail.contact.name} />
            <Row label={t("f.mobile")} value={detail.contact.mobile} />
            <Row label={t("f.email")} value={detail.contact.email} />
            <Row
              label={t("f.lang")}
              value={detail.contact.preferred_language === "ar" ? t("f.lang.ar") : t("f.lang.en")}
            />
          </ReadonlySection>

          <ReadonlySection title={t("rev.section.requirement")}>
            <Row
              label={t("f.roomTypes")}
              value={
                detail.requirement_extra.room_lines
                  .map((l) => `${l.roomType} · ${formatNumber(l.beds, lang)}`)
                  .join(", ") || t("rev.notProvided")
              }
            />
            <Row label={t("f.beds")} value={formatNumber(detail.requirement.requested_beds, lang)} />
            <Row label={t("f.moveIn")} value={formatDate(detail.requirement.move_in_date, lang)} />
            <Row
              label={t("f.duration")}
              value={`${detail.requirement.duration_months} ${t("f.months")}`}
            />
            <Row
              label={t("f.services")}
              value={detail.requirement_extra.services.join(", ") || t("rev.notProvided")}
            />
          </ReadonlySection>

          {detail.answers.length > 0 && (
            <ReadonlySection title={t("st.detail.additional")}>
              {detail.answers.map((a, i) => (
                <Row key={i} label={a.label} value={a.value || t("rev.notProvided")} />
              ))}
            </ReadonlySection>
          )}
        </div>
      )}
    </div>
  );
}

// ── Offer notice (info only) ─────────────────────────────────────────────────
// The proposal is emailed to the applicant; they reply by email and MODON staff
// mark it approved/rejected manually. No decision buttons on the portal.
function OfferNotice({ offer }: { offer?: Detail["offer"] }) {
  const { t, lang } = useLang();
  return (
    <Card className="border-primary/20 bg-primary-soft/60 p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary">
          <FileText className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h3 className="text-base font-bold text-ink">{t("st.offer.title")}</h3>
          <p className="mt-1 text-sm text-muted">{t("st.offer.sub")}</p>

          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-sm font-medium text-primary">
            <Mail className="h-4 w-4" />
            {t("st.offer.checkEmail")}
          </p>

          {offer && (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-soft">
              {offer.proposal_no && (
                <span>
                  <span className="text-muted">{t("st.offer.proposalNo")}: </span>
                  <span className="font-medium">{offer.proposal_no}</span>
                </span>
              )}
              {offer.valid_until && (
                <span>
                  <span className="text-muted">{t("st.offer.validUntil")}: </span>
                  <span className="font-medium">{formatDate(offer.valid_until, lang)}</span>
                </span>
              )}
              {offer.total != null && (
                <span>
                  <span className="text-muted">{t("st.offer.total")}: </span>
                  <span className="font-medium">
                    {offer.currency ?? "AED"} {formatNumber(offer.total, lang)}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Read-only helpers ────────────────────────────────────────────────────────
function ReadonlySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-white">
      <div className="border-b border-line px-5 py-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      <dl className="divide-y divide-line">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 px-5 py-3 text-sm">
      <dt className="w-44 shrink-0 text-muted">{label}</dt>
      <dd className="font-medium text-ink-soft">{value}</dd>
    </div>
  );
}
