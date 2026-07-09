import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ShieldCheck,
  ArrowLeft,
  LogOut,
  Plus,
  MessageCircle,
  KeyRound,
  Loader2,
} from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ProgressStepper } from "../../components/ui/ProgressStepper";
import { siteById, roomTypeLabel } from "../../lib/mockData";
import { api, type StatusInquiry } from "../../lib/api";
import { formatDate, formatNumber } from "../../lib/format";
import { cn } from "../../lib/cn";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 30;
const MAX_TRIES = 3;

type Phase = "auth" | "otp" | "list";
type Method = "code" | "otp";

export function StatusTracker() {
  const { t } = useLang();
  const [params] = useSearchParams();

  const [phase, setPhase] = useState<Phase>("auth");
  const [method, setMethod] = useState<Method>("code");

  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [authError, setAuthError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string>();
  const [triesLeft, setTriesLeft] = useState(MAX_TRIES);
  const [locked, setLocked] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const [inquiries, setInquiries] = useState<StatusInquiry[]>([]);

  const timerRef = useRef<number>();
  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = window.setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => window.clearInterval(timerRef.current);
  }, [cooldown]);

  // ── Code + Email path ────────────────────────────────────────────────────────
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

  // ── Email + OTP path ─────────────────────────────────────────────────────────
  async function requestOtp(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setAuthError(t("err.email"));
      return;
    }
    setBusy(true);
    setAuthError(undefined);
    try {
      await api.otpRequest(email.trim());
      setPhase("otp");
      setOtp("");
      setOtpError(undefined);
      setTriesLeft(MAX_TRIES);
      setLocked(false);
      setCooldown(RESEND_SECONDS);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    if (locked) return;
    setBusy(true);
    try {
      const found = await api.otpVerify(email.trim(), otp.trim());
      setInquiries(found);
      setPhase("list");
    } catch {
      const left = triesLeft - 1;
      setTriesLeft(left);
      if (left <= 0) {
        setLocked(true);
        setOtpError(t("st.otp.locked"));
      } else {
        setOtpError(t("st.otp.error", { n: left }));
      }
    } finally {
      setBusy(false);
    }
  }

  function resend() {
    if (cooldown > 0) return;
    setOtp("");
    setOtpError(undefined);
    setTriesLeft(MAX_TRIES);
    setLocked(false);
    setCooldown(RESEND_SECONDS);
    api.otpRequest(email.trim());
  }

  function signOut() {
    setPhase("auth");
    setOtp("");
    setCode("");
    setInquiries([]);
  }

  return (
    <div className="container-page max-w-3xl py-12">
      {phase === "auth" && (
        <AuthCard icon={<ShieldCheck className="h-6 w-6" />} title={t("st.title")} sub={t("st.sub")}>
          {/* Method tabs */}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-canvas p-1">
            <TabButton active={method === "code"} onClick={() => { setMethod("code"); setAuthError(undefined); }}>
              {t("st.tab.code")}
            </TabButton>
            <TabButton active={method === "otp"} onClick={() => { setMethod("otp"); setAuthError(undefined); }}>
              {t("st.tab.otp")}
            </TabButton>
          </div>

          {method === "code" ? (
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
          ) : (
            <form onSubmit={requestOtp} className="space-y-5">
              <Field
                label={t("st.email.label")}
                hint={t("st.email.hint")}
                htmlFor="st-email"
              >
                <Input
                  id="st-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("st.email.ph")}
                />
              </Field>
              {authError && <ErrorNote>{authError}</ErrorNote>}
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("st.email.cta")}
              </Button>
            </form>
          )}
        </AuthCard>
      )}

      {phase === "otp" && (
        <AuthCard
          icon={<KeyRound className="h-6 w-6" />}
          title={t("st.otp.title")}
          sub={t("st.otp.sent", { email })}
        >
          <form onSubmit={verifyOtp} className="space-y-5">
            <Field label={t("st.otp.label")} error={otpError} htmlFor="st-otp">
              <Input
                id="st-otp"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                invalid={!!otpError}
                disabled={locked}
                autoFocus
                className="text-center text-2xl tracking-[0.6em] font-semibold"
              />
            </Field>
            <p className="text-xs text-muted">{t("st.otp.devhint")}</p>
            <Button type="submit" size="lg" className="w-full" disabled={locked || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("st.otp.cta")}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => setPhase("auth")}
                className="inline-flex items-center gap-1.5 text-muted hover:text-ink"
              >
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                {t("st.otp.change")}
              </button>
              <button
                type="button"
                onClick={resend}
                disabled={cooldown > 0}
                className="font-medium text-primary hover:underline disabled:text-muted disabled:no-underline"
              >
                {cooldown > 0 ? t("st.otp.resentIn", { n: cooldown }) : t("st.otp.resend")}
              </button>
            </div>
          </form>
        </AuthCard>
      )}

      {phase === "list" && (
        <InquiryList email={email} inquiries={inquiries} onSignOut={signOut} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-white text-ink shadow-card" : "text-muted hover:text-ink"
      )}
    >
      {children}
    </button>
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
  onSignOut,
}: {
  email: string;
  inquiries: StatusInquiry[];
  onSignOut: () => void;
}) {
  const { t } = useLang();
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t("st.list.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("st.list.sub", { email })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/inquiry">
            <Button variant="secondary">
              <Plus className="h-4 w-4" />
              {t("st.list.startNew")}
            </Button>
          </Link>
          <Button variant="ghost" onClick={onSignOut}>
            <LogOut className="h-4 w-4 rtl:rotate-180" />
            {t("st.list.signout")}
          </Button>
        </div>
      </div>

      {inquiries.length === 0 ? (
        <Card className="mt-6 p-10 text-center text-muted">{t("st.list.empty")}</Card>
      ) : (
        <div className="mt-6 space-y-5">
          {inquiries.map((inq) => (
            <InquiryCard key={inq.code} inq={inq} />
          ))}
        </div>
      )}
    </div>
  );
}

function InquiryCard({ inq }: { inq: StatusInquiry }) {
  const { t, lang } = useLang();
  const site = siteById(inq.siteId);
  const room = roomTypeLabel(inq.roomType);

  return (
    <Card className="p-6">
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

      <div className="mt-5 flex items-center gap-2 text-sm text-muted">
        <span>{t("st.card.help")}</span>
        <a
          href="https://wa.me/9718006636"
          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
        >
          <MessageCircle className="h-4 w-4" />
          {t("st.card.helpCta")}
        </a>
      </div>
    </Card>
  );
}
