import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Clock,
  ListChecks,
  Building2,
  HeartHandshake,
  ClipboardList,
  Search,
  FileText,
  KeyRound,
  Upload,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { serviceIcon } from "../../lib/icons";
import { api, type ClientTypeOption, type ServiceOption } from "../../lib/api";

// Content column — a portal, not a brochure. A touch wider than the wizard so
// the two-column "what you'll need" grid has room to breathe (per the design).
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-5 sm:px-6">{children}</div>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
      {children}
    </p>
  );
}

export function LandingPage() {
  return (
    <div>
      <Hero />
      <div className="space-y-14 py-12">
        {/* Track-your-inquiry card removed for now — the tracking flow isn't set
            up clearly yet. The StatusTracker page + API logic remain in place. */}
        <HowItWorks />
        <Included />
        <StartBar />
      </div>
    </div>
  );
}

// ── Hero (full-bleed banner with the "get ready" badges) ─────────────────────
function Hero() {
  const { t } = useLang();
  const [types, setTypes] = useState<ClientTypeOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getClientTypes()
      .then((r) => !cancelled && setTypes(r))
      .catch(() => !cancelled && setTypes([]));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="border-b border-line bg-white">
      <Shell>
        <div className="py-12">
          <Eyebrow>{t("hero.eyebrow")}</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-extrabold leading-tight text-ink sm:text-4xl">
            {t("hero.title")}
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
            {t("hero.subtitle")}
          </p>

          {/* "Get these ready" badges. */}
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Chip icon={<Clock className="h-4 w-4" />}>{t("before.pill.time")}</Chip>
            <Chip icon={<ListChecks className="h-4 w-4" />}>
              {t("before.pill.steps")}
            </Chip>
            <Chip icon={<Upload className="h-4 w-4" />}>
              {t("before.pill.nouploads")}
            </Chip>
          </div>

          {/* Who this is for — derived from the client-type enum (not hardcoded). */}
          {types.length > 0 && (
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
              {types.map((ct) => {
                const Icon = clientTypeIcon(ct.name);
                const descKey = clientTypeDescKey(ct.name);
                return (
                  <span
                    key={ct.id}
                    className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-4 py-2 text-sm"
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-ink">{ct.name}</span>
                    {descKey && <span className="text-muted">· {t(descKey)}</span>}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </Shell>
    </section>
  );
}

function clientTypeIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (/agenc|sponsor|ngo/.test(n)) return HeartHandshake;
  return Building2;
}
function clientTypeDescKey(
  name: string
): "who.company.desc" | "who.agency.desc" | null {
  const n = name.toLowerCase();
  if (/compan|corporate/.test(n)) return "who.company.desc";
  if (/agenc|sponsor|ngo/.test(n)) return "who.agency.desc";
  return null;
}

// Soft icon-tile colours for the "how it works" cards (per the design).
const stepTints = [
  { bg: "bg-tint-blue", fg: "text-blue-600" },
  { bg: "bg-tint-purple", fg: "text-violet-600" },
  { bg: "bg-tint-amber", fg: "text-amber-600" },
  { bg: "bg-tint-green", fg: "text-emerald-600" },
];

// ── How it works (the "what you'll need to know" card grid) ──────────────────
function HowItWorks() {
  const { t } = useLang();
  const steps = [
    { icon: ClipboardList, title: t("how.step1.title"), desc: t("how.step1.desc") },
    { icon: Search, title: t("how.step2.title"), desc: t("how.step2.desc") },
    { icon: FileText, title: t("how.step3.title"), desc: t("how.step3.desc") },
    { icon: KeyRound, title: t("how.step4.title"), desc: t("how.step4.desc") },
  ];
  return (
    <Shell>
      <Eyebrow>{t("how.eyebrow")}</Eyebrow>
      <h2 className="mt-2 text-[22px] font-bold text-ink">{t("how.heading")}</h2>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {steps.map((s, i) => {
          const tint = stepTints[i % stepTints.length];
          return (
            <Card key={s.title} className="flex gap-4 p-6" hover>
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tint.bg} ${tint.fg}`}
              >
                <s.icon className="h-5 w-5" />
              </span>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold text-muted">{i + 1}</span>
                  <h3 className="text-base font-bold text-ink">{s.title}</h3>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.desc}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* "Before you start" as a note box, echoing the design's helper callouts. */}
      <div className="mt-5 rounded-xl bg-primary-soft px-5 py-4">
        <p className="text-sm font-semibold text-ink">{t("before.heading")}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{t("before.desc")}</p>
      </div>
    </Shell>
  );
}

// ── What's included (services from Facilio) ──────────────────────────────────
function Included() {
  const { t } = useLang();
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getServices()
      .then((s) => !cancelled && setServices(s))
      .catch(() => !cancelled && setServices([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && services.length === 0) return null;

  return (
    <Shell>
      <Eyebrow>{t("incl.eyebrow")}</Eyebrow>
      <h2 className="mt-2 text-[22px] font-bold text-ink">{t("incl.heading")}</h2>
      <p className="mt-1 text-sm text-muted">{t("incl.sub")}</p>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {services.map((s) => {
            const Icon = serviceIcon(s.name);
            return (
              <Card key={s.id} className="flex flex-col items-center p-6 text-center" hover>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-6 w-6" />
                </span>
                <span className="mt-3 text-sm font-semibold text-ink">{s.name}</span>
              </Card>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

// ── Start inquiry (bottom CTA bar) ───────────────────────────────────────────
function StartBar() {
  const { t } = useLang();
  return (
    <Shell>
      <Card className="flex flex-col gap-5 p-6 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <Eyebrow>{t("start.eyebrow")}</Eyebrow>
          <h2 className="mt-2 text-2xl font-bold text-ink">{t("start.title")}</h2>
          <p className="mt-2 max-w-xl text-sm text-muted">{t("start.sub")}</p>
        </div>
        <Link to="/inquiry" className="shrink-0">
          <Button size="lg">
            {t("start.cta")}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </Link>
      </Card>
    </Shell>
  );
}
