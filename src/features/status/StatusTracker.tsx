import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck, Loader2, ChevronRight } from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ProgressStepper } from "../../components/ui/ProgressStepper";
import { InquiryDetailView } from "./InquiryDetail";
import { siteById, roomTypeLabel } from "../../lib/mockData";
import { api, type StatusInquiry, type PublicStatus } from "../../lib/api";
import { formatDate, formatNumber } from "../../lib/format";
import { cn } from "../../lib/cn";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Phase = "auth" | "list";

export function StatusTracker() {
  const { t } = useLang();
  const [params] = useSearchParams();

  const [phase, setPhase] = useState<Phase>("auth");

  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [authError, setAuthError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const [inquiries, setInquiries] = useState<StatusInquiry[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  // ── Code + Email lookup (both required) ──────────────────────────────────────
  async function lookupByCode(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || !EMAIL_RE.test(email.trim())) {
      setAuthError(t("st.lookup.error"));
      return;
    }
    setBusy(true);
    setAuthError(undefined);
    try {
      const found = await api.statusLookup(code.trim(), email.trim());
      setInquiries(found);
      setPhase("list");
    } catch {
      // Uniform generic error — identical for not-found vs mismatch (E-21).
      setAuthError(t("st.lookup.error"));
    } finally {
      setBusy(false);
    }
  }

  function handleStatusChange(changedCode: string, status: PublicStatus) {
    setInquiries((list) =>
      list.map((i) => (i.code === changedCode ? { ...i, status } : i))
    );
  }

  return (
    <div className="container-page max-w-3xl py-12">
      {phase === "auth" && (
        <AuthCard icon={<ShieldCheck className="h-6 w-6" />} title={t("st.title")} sub={t("st.sub")}>
          <form onSubmit={lookupByCode} className="space-y-5">
            <Field label={t("st.code.label")} htmlFor="st-code">
              <Input
                id="st-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t("st.code.ph")}
                className="font-mono tracking-wide"
              />
            </Field>
            <Field label={t("st.email.label")} htmlFor="st-email-code">
              <Input
                id="st-email-code"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("st.email.ph")}
              />
            </Field>
            {authError && <ErrorNote>{authError}</ErrorNote>}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("st.lookup.cta")}
            </Button>
          </form>
        </AuthCard>
      )}

      {phase === "list" &&
        (selectedCode ? (
          <InquiryDetailView
            code={selectedCode}
            onBack={() => setSelectedCode(null)}
            onStatusChange={handleStatusChange}
          />
        ) : (
          <InquiryList
            email={email}
            inquiries={inquiries}
            onSelect={setSelectedCode}
          />
        ))}
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
      {children}
    </div>
  );
}

function AuthCard({
  icon,
  title,
  sub,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mx-auto max-w-md p-8">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
        {icon}
      </span>
      <h1 className="mt-4 text-xl font-bold text-ink">{title}</h1>
      <p className="mt-1.5 text-sm text-muted">{sub}</p>
      <div className="mt-6">{children}</div>
    </Card>
  );
}

function InquiryList({
  email,
  inquiries,
  onSelect,
}: {
  email: string;
  inquiries: StatusInquiry[];
  onSelect: (code: string) => void;
}) {
  const { t } = useLang();
  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("st.list.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("st.list.sub", { email })}</p>
      </div>

      {inquiries.length === 0 ? (
        <Card className="mt-6 p-10 text-center text-muted">{t("st.list.empty")}</Card>
      ) : (
        <div className="mt-6 space-y-5">
          {inquiries.map((inq) => (
            <InquiryCard key={inq.code} inq={inq} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function InquiryCard({
  inq,
  onSelect,
}: {
  inq: StatusInquiry;
  onSelect: (code: string) => void;
}) {
  const { t, lang } = useLang();
  const site = siteById(inq.siteId);
  const room = roomTypeLabel(inq.roomType);

  return (
    <Card className={cn("p-6", inq.status === "offer" && "border-primary/30")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg font-bold tracking-wide text-ink">
              {inq.code}
            </span>
            <StatusBadge status={inq.status} />
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {t("st.card.beds", { n: formatNumber(inq.beds, lang) })}
            {site ? ` · ${site.name[lang]}` : ""}
            {room ? ` · ${room.label[lang]}` : ""}
          </p>
        </div>
        <div className="text-end text-xs text-muted">
          <div>
            {t("st.card.submitted")}: {formatDate(inq.submittedAt, lang)}
          </div>
          <div>
            {t("st.card.updated")}: {formatDate(inq.updatedAt, lang)}
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-line pt-6">
        <ProgressStepper status={inq.status} />
      </div>

      <div className="mt-5 flex items-center justify-end">
        <Button
          variant={inq.status === "offer" ? "primary" : "secondary"}
          onClick={() => onSelect(inq.code)}
        >
          {inq.status === "offer" ? t("st.card.reviewOffer") : t("st.card.viewDetails")}
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>
    </Card>
  );
}
