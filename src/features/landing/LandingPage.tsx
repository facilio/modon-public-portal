import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Clock,
  CheckCircle2,
  Building2,
  HeartHandshake,
  ClipboardList,
  Search,
  FileText,
  KeyRound,
  MapPin,
  Upload,
} from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { Input } from "../../components/ui/Input";
import { SITES, SERVICES } from "../../lib/mockData";
import { SERVICE_ICONS } from "../../lib/icons";
import { formatNumber } from "../../lib/format";

export function LandingPage() {
  return (
    <>
      <Hero />
      <PersonaSection />
      <HowItWorks />
      <Locations />
      <Included />
      <RequirementsCallout />
      <TrackWidget />
    </>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  const { t } = useLang();
  return (
    <section className="border-b border-line bg-white">
      <div className="container-page py-16 lg:py-20">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {t("hero.eyebrow")}
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-[1.1] text-ink lg:text-5xl">
          {t("hero.title")}
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">{t("hero.subtitle")}</p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/inquiry">
            <Button size="lg">
              {t("hero.cta.primary")}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          </Link>
          <Link to="/status">
            <Button size="lg" variant="secondary">
              {t("hero.cta.secondary")}
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Persona cards ─────────────────────────────────────────────────────────────
function PersonaSection() {
  const { t } = useLang();
  const personas = [
    {
      icon: Building2,
      tint: "bg-tint-blue text-primary",
      title: t("persona.company.title"),
      desc: t("persona.company.desc"),
      persona: "Corporate",
    },
    {
      icon: HeartHandshake,
      tint: "bg-tint-purple text-violet-600",
      title: t("persona.agency.title"),
      desc: t("persona.agency.desc"),
      persona: "Sponsor",
    },
  ];

  return (
    <Section title={t("persona.heading")} sub={t("persona.sub")}>
      <div className="grid gap-5 md:grid-cols-2">
        {personas.map((p) => (
          <Card key={p.title} hover className="flex flex-col p-6">
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-xl ${p.tint}`}
            >
              <p.icon className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-lg font-bold text-ink">{p.title}</h3>
            <p className="mt-2 flex-1 text-sm text-muted">{p.desc}</p>
            <Link
              to={`/inquiry?persona=${p.persona}`}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5"
            >
              {t("persona.cta")}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </Card>
        ))}
      </div>
    </Section>
  );
}

// ── How it works ───────────────────────────────────────────────────────────────
function HowItWorks() {
  const { t } = useLang();
  const steps = [
    { icon: ClipboardList, title: t("how.step1.title"), desc: t("how.step1.desc") },
    { icon: Search, title: t("how.step2.title"), desc: t("how.step2.desc") },
    { icon: FileText, title: t("how.step3.title"), desc: t("how.step3.desc") },
    { icon: KeyRound, title: t("how.step4.title"), desc: t("how.step4.desc") },
  ];
  return (
    <Section title={t("how.heading")} muted>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <Card key={s.title} className="relative p-6">
            <span className="absolute end-5 top-5 text-3xl font-extrabold text-line">
              {i + 1}
            </span>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <s.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-base font-bold text-ink">{s.title}</h3>
            <p className="mt-1.5 text-sm text-muted">{s.desc}</p>
          </Card>
        ))}
      </div>
    </Section>
  );
}

// ── Locations ──────────────────────────────────────────────────────────────────
function Locations() {
  const { t, lang } = useLang();
  return (
    <Section title={t("loc.heading")} sub={t("loc.sub")}>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {SITES.map((site) => (
          <Card key={site.id} hover className="overflow-hidden">
            <div className={`h-32 bg-gradient-to-br ${site.gradient}`} />
            <div className="p-5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <MapPin className="h-3.5 w-3.5" />
                {site.emirate[lang]}
              </div>
              <h3 className="mt-1.5 text-base font-bold text-ink">
                {site.name[lang]}
              </h3>
              <p className="mt-1 text-xs text-muted">
                {formatNumber(site.capacity, lang)} {t("loc.capacity")}
              </p>
              <p className="mt-3 text-sm text-ink-soft">
                <span className="text-muted">{t("loc.from")} </span>
                <span className="text-lg font-bold text-ink">
                  AED {formatNumber(site.fromRate, lang)}
                </span>
                <span className="text-muted"> {t("loc.perMonth")}</span>
              </p>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}

// ── What's included ─────────────────────────────────────────────────────────────
function Included() {
  const { t } = useLang();
  return (
    <Section title={t("incl.heading")} sub={t("incl.sub")} muted>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {SERVICES.map((s) => {
          const Icon = SERVICE_ICONS[s.icon];
          return (
            <Card key={s.value} className="flex flex-col items-center p-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon className="h-6 w-6" />
              </span>
              <span className="mt-3 text-sm font-semibold text-ink">
                {t(s.key)}
              </span>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}

// ── Requirements callout ─────────────────────────────────────────────────────────
function RequirementsCallout() {
  const { t } = useLang();
  return (
    <div className="container-page py-6">
      <Card className="grid gap-6 border-primary/20 bg-primary-soft/60 p-8 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <h3 className="text-xl font-bold text-ink">{t("req.title")}</h3>
          <p className="mt-2 max-w-2xl text-sm text-muted">{t("req.desc")}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Chip icon={<Clock className="h-4 w-4" />}>{t("req.chip.time")}</Chip>
          <Chip icon={<CheckCircle2 className="h-4 w-4" />}>
            {t("req.chip.steps")}
          </Chip>
          <Chip icon={<Upload className="h-4 w-4" />}>{t("req.chip.nodocs")}</Chip>
        </div>
      </Card>
    </div>
  );
}

// ── Track widget ─────────────────────────────────────────────────────────────────
function TrackWidget() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    navigate(`/status${email ? `?email=${encodeURIComponent(email)}` : ""}`);
  }

  return (
    <div className="container-page py-6">
      <Card className="p-8">
        <h3 className="text-xl font-bold text-ink">{t("track.title")}</h3>
        <p className="mt-1.5 text-sm text-muted">{t("track.sub")}</p>
        <form
          onSubmit={handleSubmit}
          className="mt-5 flex flex-col gap-3 sm:flex-row"
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("track.placeholder")}
            className="sm:max-w-md"
          />
          <Button type="submit" size="lg" className="shrink-0">
            {t("track.cta")}
          </Button>
        </form>
      </Card>
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────────────
function Section({
  title,
  sub,
  muted,
  children,
}: {
  title: string;
  sub?: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={muted ? "bg-canvas" : "bg-white"}>
      <div className="container-page py-14">
        <h2 className="text-2xl font-bold text-ink lg:text-3xl">{title}</h2>
        {sub && <p className="mt-2 text-muted">{sub}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}
