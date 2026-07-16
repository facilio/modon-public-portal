import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Stepper } from "../../components/ui/Stepper";
import { RadioCards, ChipMultiSelect } from "./controls";
import { DynamicField, formatAnswer, type AnswerValue } from "./DynamicField";
import { SuccessScreen } from "./SuccessScreen";
import { INQUIRY_SERVICES } from "../../lib/mockData";
import {
  api,
  ApiError,
  type Persona,
  type RoomTypeOption,
  type Template,
} from "../../lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PERSONAS: Persona[] = ["Corporate", "Sponsor"];

const personaLabelKey: Record<Persona, "f.persona.company" | "f.persona.agency" | "f.persona.individual"> = {
  Corporate: "f.persona.company",
  Sponsor: "f.persona.agency",
  Individual: "f.persona.individual",
};

interface Contact {
  fullName: string;
  company: string;
  mobile: string;
  email: string;
}
interface Requirement {
  beds: string;
  male: string;
  female: string;
  moveIn: string;
  duration: string;
}

export function InquiryWizard() {
  const { t, lang } = useLang();
  const [params] = useSearchParams();
  const initialPersona = (PERSONAS.find((p) => p === params.get("persona")) ??
    "Corporate") as Persona;

  const [step, setStep] = useState(0);
  const [persona, setPersona] = useState<Persona>(initialPersona);

  const [contact, setContact] = useState<Contact>({
    fullName: "",
    company: "",
    mobile: "",
    email: "",
  });
  const [requirement, setRequirement] = useState<Requirement>({
    beds: "",
    male: "",
    female: "",
    moveIn: "",
    duration: "",
  });
  const [roomTypeIds, setRoomTypeIds] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Room-type options — a lookup to the custom_roomtype module, fetched once.
  const [roomTypeOptions, setRoomTypeOptions] = useState<RoomTypeOption[]>([]);
  const [roomTypesLoading, setRoomTypesLoading] = useState(false);

  // Inquiry lifecycle
  const [inquiryId, setInquiryId] = useState<string | null>(null);
  const [inquiryCode, setInquiryCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);

  // Dynamic template (fetched by persona, one bulk call)
  const [template, setTemplate] = useState<Template | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  const stepLabels = [t("wiz.step1"), t("wiz.step2"), t("wiz.step3"), t("wiz.step4")];

  // Fetch the room-type lookup options once on mount.
  useEffect(() => {
    let cancelled = false;
    setRoomTypesLoading(true);
    api
      .getRoomTypes()
      .then((rts) => {
        if (!cancelled) setRoomTypeOptions(rts);
      })
      .finally(() => {
        if (!cancelled) setRoomTypesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the active template whenever the persona changes.
  useEffect(() => {
    let cancelled = false;
    setTemplateLoading(true);
    setTemplate(null);
    api
      .getActiveTemplate(persona, 1)
      .then((tpl) => {
        if (!cancelled) setTemplate(tpl);
      })
      .finally(() => {
        if (!cancelled) setTemplateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [persona]);

  function clearError(key: string) {
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  // ── Validation per step ─────────────────────────────────────────────────────
  function validate(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!contact.fullName.trim()) e.fullName = t("err.required");
      if (!contact.company.trim()) e.company = t("err.required");
      if (!contact.mobile.trim()) e.mobile = t("err.required");
      if (!contact.email.trim()) e.email = t("err.required");
      else if (!EMAIL_RE.test(contact.email.trim())) e.email = t("err.email");
    }
    if (s === 1) {
      const beds = Number(requirement.beds) || 0;
      if (!requirement.beds.trim() || beds <= 0) e.beds = t("err.beds");
      if (!requirement.moveIn.trim()) e.moveIn = t("err.required");
      if (!requirement.duration.trim() || Number(requirement.duration) <= 0)
        e.duration = t("err.required");
      // Male + Female must add up to the total beds.
      const sum = (Number(requirement.male) || 0) + (Number(requirement.female) || 0);
      if (beds > 0 && sum !== beds) e.genderMix = t("err.genderSum", { n: beds });
    }
    if (s === 2 && template) {
      for (const q of template.questions) {
        if (!q.required) continue;
        const v = answers[q.id];
        const empty =
          v === undefined ||
          v === "" ||
          (Array.isArray(v) && v.length === 0);
        if (empty) e[q.id] = t("err.required");
      }
    }
    return e;
  }

  // ── Step transitions ─────────────────────────────────────────────────────────
  async function next() {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).some((k) => e[k])) return;

    // Step 1 → create the Draft inquiry (once).
    if (step === 0 && !inquiryId) {
      setBusy(true);
      setApiError(null);
      try {
        const res = await api.createInquiry({
          persona,
          name: contact.fullName.trim(),
          company: contact.company.trim(),
          mobile: contact.mobile.trim(),
          email: contact.email.trim(),
        });
        setInquiryId(res.inquiry_id);
        setInquiryCode(res.inquiry_code);
      } catch {
        setApiError(t("err.generic"));
        setBusy(false);
        return;
      }
      setBusy(false);
    }

    if (step < 3) setStep(step + 1);
    window.scrollTo({ top: 0 });
  }

  function back() {
    if (step > 0) setStep(step - 1);
    window.scrollTo({ top: 0 });
  }

  async function submit() {
    if (!inquiryId || !template) return;
    setBusy(true);
    setApiError(null);
    try {
      const res = await api.submitInquiry(
        inquiryId,
        {
          template_id: template.template_id,
          template_version: template.version,
          answers,
          requirement: {
            requested_beds: Number(requirement.beds) || 0,
            gender_mix: {
              male: Number(requirement.male) || 0,
              female: Number(requirement.female) || 0,
            },
            move_in_date: requirement.moveIn,
            duration_months: Number(requirement.duration) || 0,
          },
          room_type_ids: roomTypeIds,
          services,
        },
        inquiryCode ?? undefined
      );
      // Fall back to the code we already have from create, so an empty response
      // code can never leave the user on a "nothing happened" review screen.
      setSubmittedCode(res.inquiry_code || inquiryCode || "");
      window.scrollTo({ top: 0 });
    } catch (err) {
      setApiError(err instanceof ApiError ? t("err.generic") : t("err.generic"));
    } finally {
      setBusy(false);
    }
  }

  const timeLeft = useMemo(() => Math.max(1, 3 - step), [step]);

  if (submittedCode) {
    return <SuccessScreen code={submittedCode} email={contact.email} />;
  }

  return (
    <div className="container-page max-w-4xl py-10">
      <Card className="p-6">
        <Stepper steps={stepLabels} current={step} />
      </Card>

      <Card className="mt-6 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">{stepLabels[step]}</h1>
            <p className="mt-1 text-sm text-muted">
              {step === 0 ? t("wiz.sub") : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-canvas px-3 py-1.5 text-xs font-medium text-muted">
            {t("wiz.step", { n: step + 1, total: 4 })} · {t("wiz.timeleft", { n: timeLeft })}
          </span>
        </div>

        <div className="mt-8">
          {step === 0 && (
            <StepContact
              persona={persona}
              setPersona={setPersona}
              contact={contact}
              setContact={setContact}
              errors={errors}
              clearError={clearError}
            />
          )}
          {step === 1 && (
            <StepRequirement
              req={requirement}
              setReq={setRequirement}
              errors={errors}
              clearError={clearError}
              lang={lang}
              roomTypeOptions={roomTypeOptions}
              roomTypesLoading={roomTypesLoading}
              roomTypeIds={roomTypeIds}
              setRoomTypeIds={setRoomTypeIds}
              services={services}
              setServices={setServices}
            />
          )}
          {step === 2 && (
            <StepQuestions
              lang={lang}
              template={template}
              loading={templateLoading}
              answers={answers}
              setAnswers={setAnswers}
              errors={errors}
              clearError={clearError}
            />
          )}
          {step === 3 && (
            <StepReview
              persona={persona}
              contact={contact}
              requirement={requirement}
              roomTypeIds={roomTypeIds}
              roomTypeOptions={roomTypeOptions}
              services={services}
              template={template}
              answers={answers}
              lang={lang}
              goto={setStep}
            />
          )}
        </div>

        {apiError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {apiError}
          </div>
        )}

        <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
          {step > 0 ? (
            <Button variant="ghost" onClick={back} disabled={busy}>
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              {t("wiz.back")}
            </Button>
          ) : (
            <Link to="/">
              <Button variant="ghost">
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                {t("nav.home")}
              </Button>
            </Link>
          )}

          {step < 3 ? (
            <Button onClick={next} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("wiz.creating")}
                </>
              ) : (
                <>
                  {t("wiz.next")}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </>
              )}
            </Button>
          ) : (
            <Button onClick={submit} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("wiz.submitting")}
                </>
              ) : (
                t("wiz.submit")
              )}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Step 1: Contact (FIXED) ───────────────────────────────────────────────────
function StepContact({
  persona,
  setPersona,
  contact,
  setContact,
  errors,
  clearError,
}: {
  persona: Persona;
  setPersona: (p: Persona) => void;
  contact: Contact;
  setContact: (fn: (c: Contact) => Contact) => void;
  errors: Record<string, string>;
  clearError: (k: string) => void;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-6">
      <Field label={t("f.persona")}>
        <RadioCards
          value={persona}
          onChange={(v) => setPersona(v as Persona)}
          options={PERSONAS.map((p) => ({ value: p, label: t(personaLabelKey[p]) }))}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("f.fullName")} required error={errors.fullName} htmlFor="fullName">
          <Input
            id="fullName"
            value={contact.fullName}
            onChange={(e) => {
              clearError("fullName");
              setContact((c) => ({ ...c, fullName: e.target.value }));
            }}
            placeholder={t("f.fullName.ph")}
            invalid={!!errors.fullName}
          />
        </Field>
        <Field
          label={t("f.company")}
          required
          error={errors.company}
          hint={t("f.company.hint")}
          htmlFor="company"
        >
          <Input
            id="company"
            value={contact.company}
            onChange={(e) => {
              clearError("company");
              setContact((c) => ({ ...c, company: e.target.value }));
            }}
            placeholder={t("f.company.ph")}
            invalid={!!errors.company}
          />
        </Field>
        <Field label={t("f.mobile")} required error={errors.mobile} htmlFor="mobile">
          <Input
            id="mobile"
            value={contact.mobile}
            onChange={(e) => {
              clearError("mobile");
              setContact((c) => ({ ...c, mobile: e.target.value }));
            }}
            placeholder={t("f.mobile.ph")}
            invalid={!!errors.mobile}
          />
        </Field>
        <Field
          label={t("f.email")}
          required
          error={errors.email}
          hint={t("f.email.hint")}
          htmlFor="email"
        >
          <Input
            id="email"
            type="email"
            value={contact.email}
            onChange={(e) => {
              clearError("email");
              setContact((c) => ({ ...c, email: e.target.value }));
            }}
            placeholder={t("f.email.ph")}
            invalid={!!errors.email}
          />
        </Field>
      </div>
    </div>
  );
}

// ── Step 2: Requirement (FIXED) ───────────────────────────────────────────────
function StepRequirement({
  req,
  setReq,
  errors,
  clearError,
  lang,
  roomTypeOptions,
  roomTypesLoading,
  roomTypeIds,
  setRoomTypeIds,
  services,
  setServices,
}: {
  req: Requirement;
  setReq: (fn: (r: Requirement) => Requirement) => void;
  errors: Record<string, string>;
  clearError: (k: string) => void;
  lang: "en" | "ar";
  roomTypeOptions: RoomTypeOption[];
  roomTypesLoading: boolean;
  roomTypeIds: string[];
  setRoomTypeIds: (v: string[]) => void;
  services: string[];
  setServices: (v: string[]) => void;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("f.beds")} required error={errors.beds} htmlFor="beds">
          <Input
            id="beds"
            type="number"
            min={1}
            value={req.beds}
            onChange={(e) => {
              clearError("beds");
              setReq((r) => ({ ...r, beds: e.target.value }));
            }}
            placeholder={t("f.beds.ph")}
            invalid={!!errors.beds}
          />
        </Field>
        <Field label={t("f.moveIn")} required error={errors.moveIn} htmlFor="moveIn">
          <Input
            id="moveIn"
            type="date"
            value={req.moveIn}
            onChange={(e) => {
              clearError("moveIn");
              setReq((r) => ({ ...r, moveIn: e.target.value }));
            }}
            invalid={!!errors.moveIn}
          />
        </Field>
      </div>

      <Field label={t("f.genderMix")} error={errors.genderMix}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SmallNumber
            label={t("f.male")}
            value={req.male}
            onChange={(v) => {
              clearError("genderMix");
              setReq((r) => ({ ...r, male: v }));
            }}
          />
          <SmallNumber
            label={t("f.female")}
            value={req.female}
            onChange={(v) => {
              clearError("genderMix");
              setReq((r) => ({ ...r, female: v }));
            }}
          />
        </div>
      </Field>

      <Field label={t("f.duration")} required error={errors.duration} htmlFor="duration">
        <div className="flex items-center gap-3">
          <Input
            id="duration"
            type="number"
            min={1}
            value={req.duration}
            onChange={(e) => {
              clearError("duration");
              setReq((r) => ({ ...r, duration: e.target.value }));
            }}
            placeholder={t("f.duration.ph")}
            invalid={!!errors.duration}
            className="max-w-[12rem]"
          />
          <span className="text-sm text-muted">{t("f.months")}</span>
        </div>
      </Field>

      <Field label={t("f.roomTypes")} hint={t("f.roomTypes.hint")}>
        {roomTypesLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("f.roomTypes.loading")}
          </div>
        ) : roomTypeOptions.length === 0 ? (
          <p className="text-sm text-muted">{t("f.roomTypes.empty")}</p>
        ) : (
          <ChipMultiSelect
            selected={roomTypeIds}
            onChange={setRoomTypeIds}
            options={roomTypeOptions.map((rt) => ({ value: rt.id, label: rt.name }))}
          />
        )}
      </Field>

      <Field label={t("f.services")} hint={t("f.services.hint")}>
        <ChipMultiSelect
          selected={services}
          onChange={setServices}
          options={INQUIRY_SERVICES.map((s) => ({ value: s.value, label: s.label[lang] }))}
        />
      </Field>
    </div>
  );
}

function SmallNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <span className="text-xs font-medium text-muted">{label}</span>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="mt-1.5 h-9"
      />
    </div>
  );
}

// ── Step 3: Additional questions (template-driven only) ───────────────────────
function StepQuestions({
  lang,
  template,
  loading,
  answers,
  setAnswers,
  errors,
  clearError,
}: {
  lang: "en" | "ar";
  template: Template | null;
  loading: boolean;
  answers: Record<string, AnswerValue>;
  setAnswers: (fn: (a: Record<string, AnswerValue>) => Record<string, AnswerValue>) => void;
  errors: Record<string, string>;
  clearError: (k: string) => void;
}) {
  const { t } = useLang();
  const questions = template?.questions ?? [];
  void lang;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("wiz.loadingQuestions")}
      </div>
    );
  }

  // Template-driven customized fields ONLY. No fixed preferences here anymore.
  if (questions.length === 0) {
    return <p className="text-sm text-muted">{t("wiz.noQuestions")}</p>;
  }

  return (
    <div className="space-y-6">
      {questions
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((q) => (
          <DynamicField
            key={q.id}
            question={q}
            value={answers[q.id]}
            error={errors[q.id]}
            onChange={(v) => {
              clearError(q.id);
              setAnswers((a) => ({ ...a, [q.id]: v }));
            }}
          />
        ))}
    </div>
  );
}

// ── Step 4: Review ─────────────────────────────────────────────────────────────
function StepReview({
  persona,
  contact,
  requirement,
  roomTypeIds,
  roomTypeOptions,
  services,
  template,
  answers,
  lang,
  goto,
}: {
  persona: Persona;
  contact: Contact;
  requirement: Requirement;
  roomTypeIds: string[];
  roomTypeOptions: RoomTypeOption[];
  services: string[];
  template: Template | null;
  answers: Record<string, AnswerValue>;
  lang: "en" | "ar";
  goto: (s: number) => void;
}) {
  const { t } = useLang();
  const dash = t("rev.notProvided");
  const sep = lang === "ar" ? "، " : ", ";

  const roomNames = roomTypeIds
    .map((id) => roomTypeOptions.find((rt) => rt.id === id)?.name ?? "")
    .filter(Boolean)
    .join(sep);
  const serviceNames = services
    .map((v) => INQUIRY_SERVICES.find((s) => s.value === v)?.label[lang] ?? "")
    .filter(Boolean)
    .join(sep);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">{t("rev.heading")}</h2>
        <p className="mt-1 text-sm text-muted">{t("rev.sub")}</p>
      </div>

      <ReviewSection title={t("rev.section.contact")} onEdit={() => goto(0)}>
        <Row label={t("f.persona")} value={t(personaLabelKey[persona])} />
        <Row label={t("f.fullName")} value={contact.fullName || dash} />
        <Row label={t("f.company")} value={contact.company || dash} />
        <Row label={t("f.mobile")} value={contact.mobile || dash} />
        <Row label={t("f.email")} value={contact.email || dash} />
      </ReviewSection>

      <ReviewSection title={t("rev.section.requirement")} onEdit={() => goto(1)}>
        <Row label={t("f.beds")} value={requirement.beds || dash} />
        <Row
          label={t("f.genderMix")}
          value={`${t("f.male")}: ${requirement.male || 0} · ${t("f.female")}: ${requirement.female || 0}`}
        />
        <Row label={t("f.moveIn")} value={requirement.moveIn || dash} />
        <Row
          label={t("f.duration")}
          value={requirement.duration ? `${requirement.duration} ${t("f.months")}` : dash}
        />
        <Row label={t("f.roomTypes")} value={roomNames || dash} />
        <Row label={t("f.services")} value={serviceNames || dash} />
      </ReviewSection>

      {(template?.questions?.length ?? 0) > 0 && (
        <ReviewSection title={t("wiz.step3")} onEdit={() => goto(2)}>
          {template?.questions
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((q) => (
              <Row
                key={q.id}
                label={lang === "ar" ? q.label_ar : q.label_en}
                value={formatAnswer(q, answers[q.id], dash, t("f.yes"), t("f.no"))}
              />
            ))}
        </ReviewSection>
      )}
    </div>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  const { t } = useLang();
  return (
    <div className="rounded-xl border border-line">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <button onClick={onEdit} className="text-sm font-medium text-primary hover:underline">
          {t("rev.edit")}
        </button>
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
