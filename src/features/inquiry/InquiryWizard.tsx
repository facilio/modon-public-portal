import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  FileText,
  Home,
  Loader2,
  Lock,
  Upload,
  X,
} from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Input, inputClass } from "../../components/ui/Input";
import { DatePicker } from "../../components/ui/DatePicker";
import { Stepper } from "../../components/ui/Stepper";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { RadioCards } from "./controls";
import { type AnswerValue } from "./DynamicField";
import { SuccessScreen } from "./SuccessScreen";
import { cn } from "../../lib/cn";
import {
  api,
  ApiError,
  type AccommodationEntry,
  type ClientTypeOption,
  type InquiryDoc,
  type InquiryService,
  type InquiryServiceRateCard,
  type Persona,
  type PublicStatus,
  type RoomTypeOption,
  type ServiceRequirement,
  type Template,
} from "../../lib/api";

// ── Error reporting ───────────────────────────────────────────────────────────
// Every wizard failure used to collapse into "Something went wrong", with the
// cause dropped on the floor — which made a live-backend failure impossible to
// place. Log the full cause always; show the detail in the UI only in dev, so a
// public applicant still sees the friendly copy in production.
function reportApiError(what: string, err: unknown) {
  if (err instanceof ApiError) {
    console.error(`[wizard] ${what} failed — ${err.detail}`, err.body ?? err);
  } else {
    console.error(`[wizard] ${what} failed`, err);
  }
}

function describeError(err: unknown, fallback: string): string {
  if (!import.meta.env.DEV) return fallback;
  if (err instanceof ApiError) return `${fallback} (${err.detail})`;
  return err instanceof Error ? `${fallback} (${err.message})` : fallback;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A plain 10-digit local number, or the same 10 digits behind a 1-4 digit
// country code (with or without a leading "+"). Spaces/dashes are stripped
// before testing.
const MOBILE_RE = /^\+?\d{0,4}\d{10}$/;
function isValidMobile(v: string): boolean {
  return MOBILE_RE.test(v.replace(/[\s-]/g, ""));
}
/**
 * Client-type enum INDEX -> the persona wire value the gateway expects.
 *
 * The labels shown in the picker come from /client-types (the client module's
 * clienttype_client enum) and are the org's to change — they currently read
 * "Residential" and "Commercial", and the inquiry field is labelled
 * "Client Type". These names are NOT those labels; they are the portal↔gateway
 * wire values, and only the INDEX is the real contract. Keep in step with the
 * gateway's PERSONA_INDEX.
 */
const PERSONA_BY_CLIENT_TYPE: Record<number, Persona> = {
  1: "Corporate",
  2: "Sponsor",
  3: "Individual",
};
// custom_services_1 group enum — Primary (2) / Additional (3) headings only.
// ── Draft persistence ─────────────────────────────────────────────────────────
// v3: structured requirement (accommodation matrix + service_lines) replaces the
// v2 room-lines + service-enum shape, so bump the key to start any stale draft
// fresh. sessionStorage: a fresh tab starts clean; a reload restores progress.
const DRAFT_KEY = "modon.inquiry.draft.v3";

interface Contact {
  fullName: string;
  company: string;
  mobile: string;
  email: string;
}
/** An editable accommodation matrix row (strings for the inputs). */
interface AccRow {
  kind: "ROOM_TYPE" | "CUSTOM";
  roomTypeId: string;
  roomType: string;
  occupancy: string; // read-only label ("8 in 1"); CUSTOM has none
  description: string; // CUSTOM only
  bedspaces: string;
}
/** One user-added quantity row under a service — picked via a rate-card
 *  dropdown ("Customized…" included), not one row per available card. */
interface SvcLine {
  kind: "RATE_CARD" | "CUSTOM";
  rateCardEntryId: string;
  rateCardName: string;
  description: string; // CUSTOM only
  quantity: string;
}
interface SvcBlock {
  serviceId: string;
  serviceName: string;
  group: number; // heading only
  isMealArrangement: boolean;
  enabled: boolean;
  /** The catalog's rate cards for this service — dropdown options. Empty ⇒
   *  boolean toggle (no lines, no dropdown). */
  rateCards: InquiryServiceRateCard[];
  lines: SvcLine[];
}
/** An uploaded document's UI state: a freshly picked `file` (uploaded + attached
 *  to the draft on Step-1 Continue), and/or an already-attached `fileId`/`name`
 *  (edit prefill, or after the Step-1 upload swaps the File for its id). */
type DocState = { fileId?: number; name?: string; url?: string; file?: File };

interface PersistedDraft {
  step: number;
  clientTypeId: string;
  contact: Contact;
  tradeLicenseNumber: string;
  additionalQuestions: string;
  mobilizationDate: string;
  moveOutDate: string;
  accommodation: AccommodationEntry[];
  services: ServiceRequirement[];
  answers: Record<string, AnswerValue>;
  inquiryId: string | null;
  inquiryCode: string | null;
}

function loadDraft(): Partial<PersistedDraft> {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Partial<PersistedDraft>) : {};
  } catch {
    return {};
  }
}
function saveDraft(d: PersistedDraft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* best-effort */
  }
}
function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

const num = (s: string) => Number(s) || 0;

/**
 * THE END DATE IS PART OF THE TERM. A term of 24 Sep 2026 → 23 Sep 2027 is one
 * full year, not "11 months, 30 days" — everything below measures to the
 * instant the term ENDS: midnight at the start of the day AFTER the end date.
 * Built with calendar arithmetic (not +24h) so a DST transition inside the
 * term can't shift the result by an hour and tip a whole-month boundary over.
 * Mirrors the console/contracts' single shared implementation (src/lib/
 * duration.ts) — the two apps used to compute this differently and drifted,
 * which is exactly this bug; don't reintroduce the exclusive-end version.
 */
function inclusiveEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}

/** Whole completed months between two yyyy-mm-dd dates (0 when unset/invalid or
 *  end < start) — mirrors the console's mobilization → move-out derivation. */
function monthsBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const a = new Date(start);
  const b0 = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b0.getTime()) || b0 < a) return 0;
  const b = inclusiveEnd(b0);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return Math.max(0, months);
}

/** Whole days between two yyyy-mm-dd dates, end date included (0 when unset/
 *  invalid or end < start). Same-day start/end is a 1-day term. */
function daysBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const a = new Date(start);
  const b0 = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b0.getTime()) || b0 < a) return 0;
  return Math.round((inclusiveEnd(b0).getTime() - a.getTime()) / 86_400_000);
}

/**
 * Day-level term between two yyyy-mm-dd dates as "Y years, M months, D days"
 * (trimming leading zero units) — mirrors the console/contract durationText so
 * the portal shows the exact term (e.g. "1 year", not "11 months, 30 days").
 * `t` localizes the unit words. "—" when unset/invalid or end < start.
 */
interface DurationUnits {
  year: string; years: string; month: string; months: string; day: string; days: string;
}
function durationText(start: string, end: string, u: DurationUnits): string {
  if (!start || !end) return "—";
  const a = new Date(start);
  const b0 = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b0.getTime()) || b0 < a) return "—";
  const b = inclusiveEnd(b0);
  let years = b.getFullYear() - a.getFullYear();
  let months = b.getMonth() - a.getMonth();
  let days = b.getDate() - a.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); // days in prev month
  }
  if (months < 0) { years -= 1; months += 12; }
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? u.year : u.years}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? u.month : u.months}`);
  if (days > 0 || parts.length === 0) parts.push(`${days} ${days === 1 ? u.day : u.days}`);
  return parts.join(", ");
}

/**
 * A commercial applicant is leasing a SHOP, not bedspaces, so the Requirement
 * step asks something else entirely. Keyed off the same client-type index the
 * persona is: the picker on step 1 is the one answer that decides it.
 */
const CLIENT_TYPE_COMMERCIAL = 2;
function isCommercialClientType(id: string): boolean {
  return Number(id) === CLIENT_TYPE_COMMERCIAL;
}

/**
 * The commercial answers ride in `answers` — the questionnaire map the wizard
 * already carries and already submits — so the inquiry module needs no new
 * fields for any of this. Prefixed so they cannot collide with a template
 * question id.
 */
const SHOP_USE = "shop.use";
const SHOP_ACTIVITY = "shop.activity";
const SHOP_AREA = "shop.areaSqm";

/** Client-type enum index -> persona. Unknown index falls back to index 1. */
function personaForClientType(id: string): Persona {
  return PERSONA_BY_CLIENT_TYPE[Number(id)] ?? "Corporate";
}

/** Build the accommodation matrix: one row per room type (+ one CUSTOM row),
 *  overlaying any stored bedspaces / custom description. */
function buildAccommodation(roomTypes: RoomTypeOption[], stored?: AccommodationEntry[]): AccRow[] {
  const byRt = new Map<string, AccommodationEntry>();
  let custom: AccommodationEntry | undefined;
  (stored ?? []).forEach((e) => {
    if (e.kind === "CUSTOM") custom = e;
    else if (e.roomTypeId) byRt.set(e.roomTypeId, e);
  });
  const rows: AccRow[] = roomTypes.map((rt) => {
    const s = byRt.get(rt.id);
    return {
      kind: "ROOM_TYPE" as const,
      roomTypeId: rt.id,
      roomType: rt.name,
      occupancy: rt.occupancy,
      description: "",
      bedspaces: s?.bedspaces ? String(s.bedspaces) : "",
    };
  });
  rows.push({
    kind: "CUSTOM",
    roomTypeId: "",
    roomType: "Customized",
    occupancy: "",
    description: custom?.description ?? "",
    bedspaces: custom?.bedspaces ? String(custom.bedspaces) : "",
  });
  return rows;
}

/**
 * Build service toggles: one per catalog service, each carrying its OWN
 * rate-card list (dropdown options) plus whatever lines the applicant already
 * picked (draft restore / edit prefill) or, if none were stored yet, a single
 * blank line to start from — so a service with rate cards never opens with
 * zero rows to fill in. Services with no rate cards stay boolean toggles
 * (lines stays empty). Locked/dependent services (Access Card, Food Parcel)
 * are corrected by applyServiceRules, not here.
 */
/**
 * The ONLY services the public form offers — a plain checklist of what the
 * applicant needs. Matched by serviceId (stable) with a name fallback, so a
 * rename in Facilio can't silently empty the list.
 *
 * Everything else in the catalogue (Mess Hall, Food Parcel, Access Card, Wifi,
 * Gym Subscription) is decided by staff inside Facilio after the inquiry
 * arrives — the applicant no longer sees or sets them, and the old mandatory
 * rules (Access Card always-on, Mess Hall without Catering, meal-coverage
 * totals) no longer apply on this form.
 */
const PUBLIC_SERVICE_IDS = ["3184033", "3184034", "3283083"] as const; // Catering, Laundry, Self Cooking
const PUBLIC_SERVICE_NAMES = ["catering", "laundry", "self cooking"];

function isPublicService(svc: { serviceId: string; serviceName: string }): boolean {
  if ((PUBLIC_SERVICE_IDS as readonly string[]).includes(String(svc.serviceId))) return true;
  const n = svc.serviceName.trim().toLowerCase().replace(/[-_]+/g, " ");
  return PUBLIC_SERVICE_NAMES.includes(n);
}

/** Catalogue order varies; show the checklist in a fixed, predictable order. */
function publicServiceRank(svc: { serviceId: string; serviceName: string }): number {
  const i = (PUBLIC_SERVICE_IDS as readonly string[]).indexOf(String(svc.serviceId));
  if (i >= 0) return i;
  const n = svc.serviceName.trim().toLowerCase().replace(/[-_]+/g, " ");
  const j = PUBLIC_SERVICE_NAMES.indexOf(n);
  return j >= 0 ? j : PUBLIC_SERVICE_IDS.length;
}

function buildServices(available: InquiryService[], stored?: ServiceRequirement[]): SvcBlock[] {
  const byId = new Map<string, ServiceRequirement>();
  (stored ?? []).forEach((s) => byId.set(s.serviceId, s));
  const blocks = available
    .filter(isPublicService)
    .sort((a, b) => publicServiceRank(a) - publicServiceRank(b))
    .map((svc) => {
    const st = byId.get(svc.serviceId);
    const storedLines: SvcLine[] = (st?.lines ?? []).map((l) => ({
      kind: l.kind,
      rateCardEntryId: l.rateCardEntryId,
      rateCardName: l.rateCardName,
      description: l.description,
      quantity: l.quantity != null ? String(l.quantity) : "",
    }));
    return {
      serviceId: svc.serviceId,
      serviceName: svc.serviceName,
      group: svc.group,
      isMealArrangement: Boolean(svc.isMealArrangement),
      enabled: st?.enabled ?? false,
      rateCards: svc.rateCards,
      lines: storedLines,
    };
  });
  // No lock rules and no seeded rate-card line: the public form captures only
  // WHICH services are wanted. Quantities and rate cards are set by staff.
  return blocks;
}

/** Matrix rows → storable entries (bedspaces > 0 only). */
function accToEntries(rows: AccRow[]): AccommodationEntry[] {
  return rows
    .filter((r) => num(r.bedspaces) > 0)
    .map((r) => ({
      kind: r.kind,
      roomTypeId: r.roomTypeId,
      roomType: r.roomType,
      description: r.description.trim(),
      bedspaces: num(r.bedspaces),
    }));
}
/** Service blocks → storable requirements (enabled only; blank lines dropped). */
function svcToRequirements(blocks: SvcBlock[]): ServiceRequirement[] {
  return blocks
    .filter((b) => b.enabled)
    .map((b) => ({
      serviceId: b.serviceId,
      serviceName: b.serviceName,
      enabled: true,
      lines: b.lines
        .filter((l) => num(l.quantity) > 0 || (l.kind === "CUSTOM" && !!l.description.trim()))
        .map((l) => ({
          kind: l.kind,
          rateCardEntryId: l.rateCardEntryId,
          rateCardName: l.rateCardName,
          description: l.description.trim(),
          quantity: l.quantity === "" ? null : num(l.quantity),
        })),
    }));
}

export function InquiryWizard() {
  const { t, lang } = useLang();

  // ── Edit-via-link mode ────────────────────────────────────────────────────
  const [params] = useSearchParams();
  const editCode = params.get("code");
  const isEdit = Boolean(editCode);

  type EditPhase = "loading" | "ready" | "locked" | "notfound";
  const [editPhase, setEditPhase] = useState<EditPhase>(isEdit ? "loading" : "ready");
  const [lockedStatus, setLockedStatus] = useState<PublicStatus | null>(null);

  const [saved] = useState<Partial<PersistedDraft>>(() => (isEdit ? {} : loadDraft()));

  const [step, setStep] = useState(saved.step ?? 0);
  const [clientTypeId, setClientTypeId] = useState<string>(saved.clientTypeId ?? "1");
  const [contact, setContact] = useState<Contact>(
    saved.contact ?? { fullName: "", company: "", mobile: "", email: "" }
  );
  const [tradeLicenseNumber, setTradeLicenseNumber] = useState(saved.tradeLicenseNumber ?? "");
  const [additionalQuestions, setAdditionalQuestions] = useState(saved.additionalQuestions ?? "");
  const [mobilizationDate, setMobilizationDate] = useState(saved.mobilizationDate ?? "");
  const [moveOutDate, setMoveOutDate] = useState(saved.moveOutDate ?? "");
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(saved.answers ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isCommercial = isCommercialClientType(clientTypeId);

  // Uploaded documents. Freshly-picked files are uploaded + attached to the
  // draft on Step-1 Continue (see next()); the id then lives in DocState.fileId.
  const [vatDoc, setVatDoc] = useState<DocState>({});
  const [tradeDoc, setTradeDoc] = useState<DocState>({});

  // Masters + dynamic requirement.
  const [roomTypeOptions, setRoomTypeOptions] = useState<RoomTypeOption[]>([]);
  const [roomTypesLoading, setRoomTypesLoading] = useState(false);
  const [svcLoading, setSvcLoading] = useState(false);
  const [serviceOptions, setServiceOptions] = useState<InquiryService[]>([]);
  const [clientTypes, setClientTypes] = useState<ClientTypeOption[]>([]);
  const [accRows, setAccRows] = useState<AccRow[]>([]);
  const [svcBlocks, setSvcBlocks] = useState<SvcBlock[]>([]);
  // Stored requirement (draft restore OR edit prefill) overlaid onto the masters.
  const [storedReq, setStoredReq] = useState<{ acc: AccommodationEntry[]; svc: ServiceRequirement[] } | null>(
    saved.accommodation || saved.services
      ? { acc: saved.accommodation ?? [], svc: saved.services ?? [] }
      : null
  );

  // Inquiry lifecycle.
  const [inquiryId, setInquiryId] = useState<string | null>(saved.inquiryId ?? null);
  const [inquiryCode, setInquiryCode] = useState<string | null>(saved.inquiryCode ?? null);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  // Shown when leaving the Requirement step OR at final submit, whichever
  // comes first, if a service was left without a rate card picked — see
  // withDefaultRateCards()/next()/submit()/confirmDefaultAndProceed().
  const [showDefaultConfirm, setShowDefaultConfirm] = useState(false);
  const [pendingDefaultAction, setPendingDefaultAction] = useState<"advance" | "submit" | null>(null);

  const [template, setTemplate] = useState<Template | null>(null);

  // Three stages: Your details -> Requirement -> Review. The questionnaire step
  // ("wiz.step3") is no longer shown to applicants; the template is still
  // loaded because the submit payload carries template_id/version.
  const stepLabels = [t("wiz.step1"), t("wiz.step2"), t("wiz.step4")];

  const totalBedspaces = accRows.reduce((s, r) => s + num(r.bedspaces), 0);
  const durationMonths = monthsBetween(mobilizationDate, moveOutDate);
  // Day-level term for display (e.g. "1 month, 10 days"); whole months still go
  // to the gateway as duration_months. Any positive term is allowed.
  const durationDaysVal = daysBetween(mobilizationDate, moveOutDate);
  const durationLabel = durationText(mobilizationDate, moveOutDate, {
    year: t("f.duration.year"), years: t("f.duration.years"),
    month: t("f.duration.month"), months: t("f.duration.months"),
    day: t("f.duration.day"), days: t("f.duration.days"),
  });

  // Rebuild the matrix / services whenever the masters or stored requirement change.
  useEffect(() => {
    setAccRows(buildAccommodation(roomTypeOptions, storedReq?.acc));
  }, [roomTypeOptions, storedReq]);
  useEffect(() => {
    setSvcBlocks(buildServices(serviceOptions, storedReq?.svc));
  }, [serviceOptions, storedReq]);

  // Masters — room types (with occupancy) + services (with rate cards).
  useEffect(() => {
    let cancelled = false;
    setRoomTypesLoading(true);
    api
      .getRoomTypes()
      .then((rts) => !cancelled && setRoomTypeOptions(rts))
      // Without room types the matrix is empty, so Step 2 can never reach a
      // positive bed total and Continue blocks with no way forward — an
      // unhandled rejection here would leave that unexplained.
      .catch((err) => {
        reportApiError("load room types", err);
        if (!cancelled) setApiError(describeError(err, t("err.generic")));
      })
      .finally(() => !cancelled && setRoomTypesLoading(false));
    setSvcLoading(true);
    api
      .getInquiryServices()
      .then((svcs) => !cancelled && setServiceOptions(svcs))
      // Without this, a slow/cold gateway or a dropped request leaves the
      // services list silently empty forever — indistinguishable from there
      // genuinely being no services, with no way to tell or retry.
      .catch((err) => {
        reportApiError("load inquiry services", err);
        if (!cancelled) setApiError(describeError(err, t("err.generic")));
      })
      .finally(() => !cancelled && setSvcLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Client-type options ("This inquiry is for").
  useEffect(() => {
    let cancelled = false;
    api
      .getClientTypes()
      .then((ct) => {
        if (cancelled) return;
        setClientTypes(ct);
        setClientTypeId((prev) => (ct.some((c) => c.id === prev) ? prev : ct[0]?.id ?? prev));
      })
      .catch(() => !cancelled && setClientTypes([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const clientTypeOptions: { value: string; label: string }[] = clientTypes.length
    ? clientTypes.map((ct) => ({ value: ct.id, label: ct.name }))
    : [
        { value: "1", label: t("f.persona.company") },
        { value: "2", label: t("f.persona.agency") },
      ];

  // Active template per client type.
  useEffect(() => {
    let cancelled = false;
    setTemplate(null);
    api
      .getActiveTemplate(clientTypeId)
      .then((tpl) => !cancelled && setTemplate(tpl))
      // The questionnaire step is gone, but a null template still BLOCKS
      // submit() (it carries template_id/version in the payload) — surface the
      // failure here rather than dead-ending on the Review step.
      .catch((err) => {
        reportApiError(`load template for clientType=${clientTypeId}`, err);
        if (!cancelled) setApiError(describeError(err, t("err.generic")));
      });
    return () => {
      cancelled = true;
    };
  }, [clientTypeId]);

  // Edit mode: fetch the existing inquiry once and prefill.
  useEffect(() => {
    if (!isEdit || !editCode) return;
    let cancelled = false;
    setEditPhase("loading");
    api
      .getInquiryForEdit(editCode)
      .then((d) => {
        if (cancelled) return;
        if (!d.editable) {
          setLockedStatus(d.status);
          setEditPhase("locked");
          return;
        }
        setInquiryId(d.inquiry_id);
        setInquiryCode(d.inquiry_code);
        setClientTypeId(d.clientTypeId || "1");
        setContact({
          fullName: d.contact.fullName,
          company: d.contact.company,
          mobile: d.contact.mobile,
          email: d.contact.email,
        });
        setTradeLicenseNumber(d.trade_license_number ?? "");
        setAdditionalQuestions(d.additional_questions ?? "");
        setMobilizationDate(d.requirement.moveIn);
        setMoveOutDate(d.requirement.moveOut);
        setStoredReq({ acc: d.accommodation ?? [], svc: d.services ?? [] });
        if (d.vat_certificate) setVatDoc(docToState(d.vat_certificate));
        if (d.trade_license) setTradeDoc(docToState(d.trade_license));
        setAnswers((d.answers ?? {}) as Record<string, AnswerValue>);
        setStep(0);
        setEditPhase("ready");
      })
      .catch(() => {
        if (!cancelled) setEditPhase("notfound");
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, editCode]);

  // Persist the draft (create flow only). Derive the structured requirement from
  // the live matrix / service state so a reload restores everything.
  useEffect(() => {
    if (isEdit) return;
    saveDraft({
      step,
      clientTypeId,
      contact,
      tradeLicenseNumber,
      additionalQuestions,
      mobilizationDate,
      moveOutDate,
      accommodation: isCommercial ? [] : accToEntries(accRows),
      services: isCommercial ? [] : svcToRequirements(svcBlocks),
      answers,
      inquiryId,
      inquiryCode,
    });
  }, [
    step,
    clientTypeId,
    contact,
    tradeLicenseNumber,
    additionalQuestions,
    mobilizationDate,
    moveOutDate,
    accRows,
    svcBlocks,
    answers,
    inquiryId,
    inquiryCode,
    isEdit,
  ]);

  function clearError(key: string) {
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  // ── Validation per step ─────────────────────────────────────────────────────
  // Services — each enabled quantity service needs ≥1 count, custom needs a
  // description, and its lines must add up to EXACTLY the total bedspaces
  // (every resident accounted for, not just "some"). Catering and Mess Hall
  // are the exception: they're alternative ways to cover the same residents,
  // so their COMBINED count is what has to match, not each on its own.
  /**
   * The public checklist carries no quantities or rate cards, so the old
   * per-service count / bedspace-match / meal-coverage rules no longer apply.
   * Ticking nothing is allowed — a resident may need no services at all.
   */
  function validateServices(_blocks: SvcBlock[]): string | undefined {
    return undefined;
  }

  function validate(s: number, opts?: { skipServices?: boolean }): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!contact.fullName.trim()) e.fullName = t("err.required");
      if (!contact.mobile.trim()) e.mobile = t("err.required");
      else if (!isValidMobile(contact.mobile)) e.mobile = t("err.mobile");
      if (!contact.email.trim()) e.email = t("err.required");
      else if (!EMAIL_RE.test(contact.email.trim())) e.email = t("err.email");
      if (!tradeLicenseNumber.trim()) e.tradeLicenseNo = t("err.tradeLicenseNo");
      if (!tradeDoc.file && tradeDoc.fileId == null) e.tradeDoc = t("err.tradeDoc");
    }
    if (s === 1) {
      // Dates are asked of everyone; what sits beside them is what differs.
      if (!mobilizationDate) e.mobilization = t("err.required");
      if (!moveOutDate) e.moveOut = t("err.required");
      else if (durationDaysVal < 1) e.moveOut = t("err.moveOutAfter");

      if (isCommercial) {
        if (!String(answers[SHOP_USE] ?? "")) e[SHOP_USE] = t("err.shopUse");
        if (answers[SHOP_USE] === "service" && !String(answers[SHOP_ACTIVITY] ?? "").trim()) {
          e[SHOP_ACTIVITY] = t("err.shopActivity");
        }
        if (!(Number(answers[SHOP_AREA]) > 0)) e[SHOP_AREA] = t("err.shopArea");
        return e;
      }

      if (totalBedspaces <= 0) e.accommodation = t("err.bedspaces");
      const customAcc = accRows.find((r) => r.kind === "CUSTOM" && num(r.bedspaces) > 0);
      if (customAcc && !customAcc.description.trim()) e.accommodation = t("err.customAcc");
      if (!opts?.skipServices) {
        const svcErr = validateServices(svcBlocks);
        if (svcErr) e.services = svcErr;
      }
    }
    return e;
  }

  // ── Step transitions ─────────────────────────────────────────────────────────
  async function next() {
    // Services are checked separately below (after a default-fill attempt),
    // so a blank mandatory service doesn't hard-block before it's even had a
    // chance to be auto-filled.
    const e = validate(step, { skipServices: step === 1 });
    setErrors(e);
    if (Object.keys(e).some((k) => e[k])) return;

    // The Requirement step is a plain checklist now — no rate cards to default
    // in, and nothing to confirm before advancing.
    await advanceStep();
  }

  async function advanceStep() {
    // Step 1 → create the Draft inquiry (once), then upload any freshly-picked
    // documents NOW and attach their file ids to the draft — so the file lands
    // in Facilio at Step 1 rather than being deferred to the final submit.
    if (step === 0) {
      setBusy(true);
      setApiError(null);
      try {
        let id = inquiryId;
        if (!id) {
          const res = await api.createInquiry({
            persona: personaForClientType(clientTypeId),
            contactName: contact.fullName.trim(),
            company: contact.company.trim(),
            mobile: contact.mobile.trim(),
            email: contact.email.trim(),
          });
          id = res.inquiry_id;
          setInquiryId(res.inquiry_id);
          setInquiryCode(res.inquiry_code);
        }
        if (id && (vatDoc.file || tradeDoc.file)) {
          const vatFileId = vatDoc.file ? (await api.uploadFile(vatDoc.file)).fileId : vatDoc.fileId ?? null;
          const tradeFileId = tradeDoc.file ? (await api.uploadFile(tradeDoc.file)).fileId : tradeDoc.fileId ?? null;
          await api.attachInquiryDocuments(id, {
            vat_certificate_file_id: vatFileId,
            trade_license_file_id: tradeFileId,
          });
          // Swap the local File for its attached id so the final submit doesn't re-upload it.
          if (vatDoc.file && vatFileId != null) setVatDoc({ fileId: vatFileId, name: vatDoc.name ?? vatDoc.file.name });
          if (tradeDoc.file && tradeFileId != null) setTradeDoc({ fileId: tradeFileId, name: tradeDoc.name ?? tradeDoc.file.name });
        }
      } catch (err) {
        reportApiError("create/attach inquiry", err);
        setApiError(describeError(err, t("err.generic")));
        setBusy(false);
        return;
      }
      setBusy(false);
    }

    if (step < 2) setStep(step + 1);
    window.scrollTo({ top: 0 });
  }

  function back() {
    if (step > 0) setStep(step - 1);
    setErrors({}); // don't carry a step's validation summary back to the previous step
    window.scrollTo({ top: 0 });
  }

  // The checklist has no rate cards to default in, so submit goes straight
  // through — staff pick the price cards in Facilio afterwards.
  function submit() {
    void doSubmit(svcBlocks);
  }

  /** Confirms the default rate card fill from EITHER trigger point — the
   *  Requirement step's Continue, or final submit (see pendingDefaultAction). */
  function confirmDefaultAndProceed() {
    setShowDefaultConfirm(false);
    const action = pendingDefaultAction;
    setPendingDefaultAction(null);
    if (action === "advance") void advanceStep();
    else if (action === "submit") void doSubmit(svcBlocks);
  }

  async function doSubmit(blocksForSubmit: SvcBlock[]) {
    // Both are set earlier in the flow (inquiryId by the Step-1 create, template
    // by the client-type effect). If either is missing the click would otherwise
    // do nothing at all — say so instead of dead-ending on a silent return.
    if (!inquiryId || !template) {
      console.error("[wizard] submit blocked before any request was sent", {
        inquiryId,
        templateLoaded: Boolean(template),
      });
      setApiError(
        import.meta.env.DEV
          ? `${t("err.generic")} (submit blocked: ${
              !inquiryId ? "no inquiry id from POST /inquiries" : "questionnaire template not loaded"
            })`
          : t("err.generic")
      );
      return;
    }
    setBusy(true);
    setApiError(null);
    try {
      // Upload any freshly-picked documents first → file ids (existing docs keep
      // their id; nothing picked → null so an unchanged field isn't touched).
      const vatFileId = vatDoc.file
        ? (await api.uploadFile(vatDoc.file)).fileId
        : vatDoc.fileId ?? null;
      const tradeFileId = tradeDoc.file
        ? (await api.uploadFile(tradeDoc.file)).fileId
        : tradeDoc.fileId ?? null;

      const res = await api.submitInquiry(
        inquiryId,
        {
          template_id: template.template_id,
          template_version: template.version,
          answers,
          requirement: {
            move_in_date: mobilizationDate,
            move_out_date: moveOutDate,
            duration_months: durationMonths,
          },
          // Empty on a commercial inquiry, and empty EXPLICITLY: the rows are
          // never shown so they would be empty anyway, but relying on that
          // means a stale draft from a client-type switch could submit
          // bedspaces against a shop.
          accommodation: isCommercial ? [] : accToEntries(accRows),
          services: isCommercial ? [] : svcToRequirements(blocksForSubmit),
          trade_license_number: tradeLicenseNumber.trim(),
          additional_questions: additionalQuestions.trim(),
          vat_certificate_file_id: vatFileId,
          trade_license_file_id: tradeFileId,
          company: contact.company.trim(),
          contact_name: contact.fullName.trim(),
        },
        inquiryCode ?? undefined
      );
      setSubmittedCode(res.inquiry_code || inquiryCode || "");
      clearDraft();
      window.scrollTo({ top: 0 });
    } catch (err) {
      reportApiError("submit inquiry", err);
      setApiError(describeError(err, t("err.generic")));
    } finally {
      setBusy(false);
    }
  }

  const timeLeft = useMemo(() => Math.max(1, 3 - step), [step]);

  // The VAT certificate is optional — on the Review step we warn (not block)
  // when it hasn't been attached, so the client can submit knowingly or go
  // back to add it. Trade license is now mandatory (blocked at Step 1 by
  // validate()), so it can never reach Review missing.
  const missingDocLabels = [
    !vatDoc.file && vatDoc.fileId == null ? t("f.vat") : null,
  ].filter(Boolean) as string[];

  // A summary of the current step's validation errors, shown next to Continue so
  // the user isn't left hunting for the inline messages. Generic-required fields
  // get a field-label prefix; descriptive messages (accommodation / services /
  // dynamic questions) already name their subject, so they show as-is.
  const ERROR_FIELD_LABELS: Record<string, string> = {
    fullName: "f.fullName", mobile: "f.mobile", email: "f.email",
    tradeLicenseNo: "f.tradeLicenseNo", tradeDoc: "f.tradeLicense",
    mobilization: "f.mobilization", moveOut: "f.moveOut",
  };
  const errorSummary = Object.entries(errors)
    .filter(([, msg]) => !!msg)
    .map(([key, msg]) => {
      if (ERROR_FIELD_LABELS[key]) return `${t(ERROR_FIELD_LABELS[key] as Parameters<typeof t>[0])}: ${msg}`;
      const q = template?.questions.find((qq) => qq.id === key);
      if (q) return `${lang === "ar" ? q.label_ar : q.label_en}: ${msg}`;
      return msg;
    });

  if (submittedCode) {
    return <SuccessScreen code={submittedCode} email={contact.email} isEdit={isEdit} />;
  }

  if (isEdit && editPhase === "loading") return <EditLoading />;
  if (isEdit && editPhase === "notfound") return <EditNotFound />;
  if (isEdit && editPhase === "locked") return <EditLocked status={lockedStatus} />;

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
              {step === 0 ? (isEdit ? t("wiz.editSub") : t("wiz.sub")) : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-canvas px-3 py-1.5 text-xs font-medium text-muted">
            {t("wiz.step", { n: step + 1, total: stepLabels.length })} · {t("wiz.timeleft", { n: timeLeft })}
          </span>
        </div>

        <div className="mt-8">
          {step === 0 && (
            <StepContact
              clientTypeId={clientTypeId}
              setClientTypeId={setClientTypeId}
              clientTypeOptions={clientTypeOptions}
              contact={contact}
              setContact={setContact}
              tradeLicenseNumber={tradeLicenseNumber}
              setTradeLicenseNumber={setTradeLicenseNumber}
              additionalQuestions={additionalQuestions}
              setAdditionalQuestions={setAdditionalQuestions}
              vatDoc={vatDoc}
              setVatDoc={setVatDoc}
              tradeDoc={tradeDoc}
              setTradeDoc={setTradeDoc}
              errors={errors}
              clearError={clearError}
              locked={isEdit}
            />
          )}
          {step === 1 && (
            <StepRequirement
              lang={lang}
              isCommercial={isCommercial}
              answers={answers}
              setAnswers={setAnswers}
              roomTypesLoading={roomTypesLoading}
              svcLoading={svcLoading}
              accRows={accRows}
              setAccRows={setAccRows}
              totalBedspaces={totalBedspaces}
              svcBlocks={svcBlocks}
              setSvcBlocks={setSvcBlocks}
              mobilizationDate={mobilizationDate}
              setMobilizationDate={setMobilizationDate}
              moveOutDate={moveOutDate}
              setMoveOutDate={setMoveOutDate}
              durationLabel={durationLabel}
              errors={errors}
              clearError={clearError}
            />
          )}
          {step === 2 && (
            <StepReview
              isCommercial={isCommercial}
              answers={answers}
              whoLabel={clientTypeOptions.find((o) => o.value === clientTypeId)?.label ?? ""}
              contact={contact}
              tradeLicenseNumber={tradeLicenseNumber}
              additionalQuestions={additionalQuestions}
              vatDoc={vatDoc}
              tradeDoc={tradeDoc}
              accRows={accRows}
              totalBedspaces={totalBedspaces}
              svcBlocks={svcBlocks}
              mobilizationDate={mobilizationDate}
              moveOutDate={moveOutDate}
              durationLabel={durationLabel}
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

        {step === 2 && missingDocLabels.length > 0 && (
          <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">{t("wiz.docsMissing.title")}</p>
              <p className="mt-0.5">
                {t("wiz.docsMissing.body", { docs: missingDocLabels.join(lang === "ar" ? "، " : ", ") })}
              </p>
            </div>
          </div>
        )}

        {step < 2 && errorSummary.length > 0 && (
          <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">{t("wiz.fixErrors.title")}</p>
              <ul className="mt-1 list-disc space-y-0.5 ps-4">
                {errorSummary.map((txt, i) => <li key={i}>{txt}</li>)}
              </ul>
            </div>
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

          {step < 2 ? (
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
                  {t(isEdit ? "wiz.saving" : "wiz.submitting")}
                </>
              ) : isEdit ? (
                t("wiz.saveChanges")
              ) : (
                t("wiz.submit")
              )}
            </Button>
          )}
        </div>
      </Card>

      {showDefaultConfirm && (
        <DefaultRateCardDialog
          onCancel={() => {
            setShowDefaultConfirm(false);
            setPendingDefaultAction(null);
          }}
          onConfirm={confirmDefaultAndProceed}
        />
      )}
    </div>
  );
}

/** Confirms the standard rate card was auto-applied before actually submitting. */
function DefaultRateCardDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-ink">{t("dlg.defaultRateCard.title")}</h2>
        <p className="mt-2 text-sm text-muted">{t("dlg.defaultRateCard.body")}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            {t("dlg.cancel")}
          </Button>
          <Button onClick={onConfirm}>{t("dlg.ok")}</Button>
        </div>
      </Card>
    </div>
  );
}

/** Stored InquiryDoc → form DocState. */
function docToState(d: InquiryDoc): DocState {
  return {
    fileId: d.fileId,
    url: d.url,
    name: d.name ?? (d.fileId != null ? `Attached file #${d.fileId}` : "Attached document"),
  };
}

// ── Step 1: Client details (contact locked in edit mode) ──────────────────────
function StepContact({
  clientTypeId,
  setClientTypeId,
  clientTypeOptions,
  contact,
  setContact,
  tradeLicenseNumber,
  setTradeLicenseNumber,
  additionalQuestions,
  setAdditionalQuestions,
  vatDoc,
  setVatDoc,
  tradeDoc,
  setTradeDoc,
  errors,
  clearError,
  locked = false,
}: {
  clientTypeId: string;
  setClientTypeId: (id: string) => void;
  clientTypeOptions: { value: string; label: string }[];
  contact: Contact;
  setContact: (fn: (c: Contact) => Contact) => void;
  tradeLicenseNumber: string;
  setTradeLicenseNumber: (v: string) => void;
  additionalQuestions: string;
  setAdditionalQuestions: (v: string) => void;
  vatDoc: DocState;
  setVatDoc: (d: DocState) => void;
  tradeDoc: DocState;
  setTradeDoc: (d: DocState) => void;
  errors: Record<string, string>;
  clearError: (k: string) => void;
  locked?: boolean;
}) {
  const { t } = useLang();
  const personaLabel = clientTypeOptions.find((o) => o.value === clientTypeId)?.label ?? "—";

  return (
    <div className="space-y-6">
      {locked && (
        <div className="flex items-start gap-2.5 rounded-lg border border-line bg-canvas px-4 py-3 text-sm text-muted">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("wiz.contactLocked")}</span>
        </div>
      )}

      <Field label={t("f.persona")}>
        {locked ? (
          <ReadOnlyValue>{personaLabel}</ReadOnlyValue>
        ) : (
          <RadioCards value={clientTypeId} onChange={setClientTypeId} options={clientTypeOptions} />
        )}
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
            disabled={locked}
          />
        </Field>
        <Field label={t("f.company")} htmlFor="company">
          <Input
            id="company"
            value={contact.company}
            onChange={(e) => setContact((c) => ({ ...c, company: e.target.value }))}
            placeholder={t("f.company.ph")}
            disabled={locked}
          />
        </Field>
        <Field label={t("f.tradeLicenseNo")} required error={errors.tradeLicenseNo} htmlFor="tradeLicenseNo">
          <Input
            id="tradeLicenseNo"
            value={tradeLicenseNumber}
            onChange={(e) => {
              clearError("tradeLicenseNo");
              setTradeLicenseNumber(e.target.value);
            }}
            placeholder={t("f.tradeLicenseNo.ph")}
            invalid={!!errors.tradeLicenseNo}
            disabled={locked}
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
            disabled={locked}
          />
        </Field>
        <Field
          label={t("f.email")}
          required
          error={errors.email}
          hint={locked ? undefined : t("f.email.hint")}
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
            disabled={locked}
          />
        </Field>
      </div>

      {/* Documents — VAT certificate (optional) + trade license (required) */}
      <div>
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2.5">
          <span className="text-sm font-medium text-ink-soft">{t("f.docs")}</span>
          <span className="text-xs text-muted">{t("f.docs.hint")}</span>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <DocField
            label={t("f.vat")}
            doc={vatDoc}
            onPick={(f) => setVatDoc({ file: f, name: f.name })}
            onRemove={() => setVatDoc({})}
          />
          <DocField
            label={t("f.tradeLicense")}
            required
            error={errors.tradeDoc}
            doc={tradeDoc}
            onPick={(f) => {
              clearError("tradeDoc");
              setTradeDoc({ file: f, name: f.name });
            }}
            onRemove={() => setTradeDoc({})}
          />
        </div>
      </div>

      <Field
        label={t("f.additionalQuestions")}
        hint={t("f.additionalQuestions.hint")}
        htmlFor="additionalQuestions"
      >
        <textarea
          id="additionalQuestions"
          rows={3}
          className={cn(inputClass, "h-auto resize-y border-line py-2.5 leading-relaxed")}
          value={additionalQuestions}
          onChange={(e) => setAdditionalQuestions(e.target.value)}
          placeholder={t("f.additionalQuestions.ph")}
          disabled={locked}
        />
      </Field>
    </div>
  );
}

/** A single document upload field. Upload happens on submit. */
function DocField({
  label,
  doc,
  onPick,
  onRemove,
  required,
  error,
}: {
  label: string;
  doc: DocState;
  onPick: (f: File) => void;
  onRemove: () => void;
  required?: boolean;
  error?: string;
}) {
  const { t } = useLang();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const has = !!(doc.file || doc.name || doc.fileId != null);
  return (
    <Field label={label} required={required} error={error}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.doc,.docx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      {has ? (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
            {doc.name || doc.file?.name || "Document"}
          </span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink-soft hover:border-primary/40 hover:text-primary"
          >
            {t("f.doc.replace")}
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${t("f.doc.remove")} ${label}`}
            className="rounded-md p-1.5 text-muted hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-dashed border-line bg-white px-3 py-2.5 text-left hover:border-primary/40"
        >
          <Upload className="h-4 w-4 shrink-0 text-muted" />
          <span className="text-sm text-muted">{t("f.doc.upload")}</span>
        </button>
      )}
    </Field>
  );
}

// ── Step 2: Requirement (accommodation matrix + dates + services) ─────────────
function StepRequirement({
  lang,
  isCommercial,
  answers,
  setAnswers,
  roomTypesLoading,
  svcLoading,
  accRows,
  setAccRows,
  totalBedspaces,
  svcBlocks,
  setSvcBlocks,
  mobilizationDate,
  setMobilizationDate,
  moveOutDate,
  setMoveOutDate,
  durationLabel,
  errors,
  clearError,
}: {
  lang: "en" | "ar";
  isCommercial: boolean;
  answers: Record<string, AnswerValue>;
  setAnswers: (fn: (a: Record<string, AnswerValue>) => Record<string, AnswerValue>) => void;
  roomTypesLoading: boolean;
  svcLoading: boolean;
  accRows: AccRow[];
  setAccRows: (fn: (r: AccRow[]) => AccRow[]) => void;
  totalBedspaces: number;
  svcBlocks: SvcBlock[];
  setSvcBlocks: (fn: (b: SvcBlock[]) => SvcBlock[]) => void;
  mobilizationDate: string;
  setMobilizationDate: (v: string) => void;
  moveOutDate: string;
  setMoveOutDate: (v: string) => void;
  durationLabel: string;
  errors: Record<string, string>;
  clearError: (k: string) => void;
}) {
  const { t } = useLang();
  void lang;

  const patchAcc = (i: number, patch: Partial<AccRow>) => {
    clearError("accommodation");
    setAccRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  // Plain checklist: every row is freely toggleable, no locked or mandatory
  // rows, and no rate-card lines — the public form captures WHICH services are
  // wanted and nothing else.
  const toggleSvc = (i: number) => {
    clearError("services");
    setSvcBlocks((bs) => bs.map((b, idx) => (idx === i ? { ...b, enabled: !b.enabled } : b)));
  };

  return (
    <div className="space-y-6">
      {/* Dates */}
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label={t("f.mobilization")} required error={errors.mobilization} htmlFor="mobilization">
          <DatePicker
            id="mobilization"
            value={mobilizationDate}
            onChange={(v) => {
              clearError("mobilization");
              setMobilizationDate(v);
            }}
            invalid={!!errors.mobilization}
          />
        </Field>
        <Field label={t("f.moveOut")} required error={errors.moveOut} htmlFor="moveOut">
          <DatePicker
            id="moveOut"
            value={moveOutDate}
            onChange={(v) => {
              clearError("moveOut");
              setMoveOutDate(v);
            }}
            min={mobilizationDate || undefined}
            invalid={!!errors.moveOut}
          />
        </Field>
        <Field label={t("f.duration.auto")}>
          <div
            className={cn(
              "flex h-11 items-center rounded-lg border border-line bg-canvas px-3.5 text-[15px] font-medium",
              durationLabel !== "—" ? "text-ink-soft" : "text-muted/70"
            )}
          >
            {durationLabel}
          </div>
        </Field>
      </div>

      {/* A commercial applicant is leasing a shop: the accommodation matrix and
          the service checklist below are about bedspaces and have nothing to
          ask here. Three questions take their place. */}
      {isCommercial ? (
        <CommercialRequirement
          answers={answers}
          setAnswers={setAnswers}
          errors={errors}
          clearError={clearError}
        />
      ) : (
      <>
      {/* Accommodation matrix */}
      <Field
        label={t("f.rooms")}
        required
        error={errors.accommodation}
        hint={t("f.rooms.matrix.hint")}
      >
        {roomTypesLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("f.roomTypes.loading")}
          </div>
        ) : accRows.length <= 1 ? (
          <p className="text-sm text-muted">{t("f.roomTypes.empty")}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-[1.4fr_1.4fr_110px] items-center gap-3 border-b border-line bg-canvas px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <span>{t("f.col.roomType")}</span>
              <span>{t("f.col.occupancy")}</span>
              <span className="text-end">{t("f.col.bedspaces")}</span>
            </div>
            {accRows.map((r, i) => (
              <div
                key={r.kind === "CUSTOM" ? "custom" : r.roomTypeId}
                className="grid grid-cols-[1.4fr_1.4fr_110px] items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
              >
                <span className="text-sm font-medium text-ink">
                  {r.kind === "CUSTOM" ? t("f.custom") : r.roomType}
                </span>
                {r.kind === "CUSTOM" ? (
                  <Input
                    className="h-9"
                    placeholder={t("f.custom.explain")}
                    value={r.description}
                    onChange={(e) => patchAcc(i, { description: e.target.value })}
                  />
                ) : (
                  <span className="text-sm text-muted">{r.occupancy || "—"}</span>
                )}
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  aria-label={`${t("f.col.bedspaces")} — ${r.roomType}`}
                  className="h-9 text-end"
                  value={r.bedspaces}
                  onChange={(e) => patchAcc(i, { bedspaces: e.target.value })}
                />
              </div>
            ))}
            <div className="grid grid-cols-[1.4fr_1.4fr_110px] items-center gap-3 bg-canvas px-4 py-2.5">
              <span className="text-sm font-bold text-ink">{t("f.total")}</span>
              <span />
              <span className="text-end text-sm font-bold text-primary">{totalBedspaces}</span>
            </div>
          </div>
        )}
      </Field>

      {/* Services — a plain checklist of what the applicant needs. Quantities,
          rate cards and any mandatory extras are decided by staff in Facilio. */}
      <Field label={t("f.services")} error={errors.services} hint={t("f.services.hint2")}>
        {svcLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("f.services.loading")}
          </div>
        ) : svcBlocks.length === 0 ? (
          <p className="text-sm text-muted">{t("f.services.empty")}</p>
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {svcBlocks.map((b, si) => (
              <label
                key={b.serviceId}
                className="flex cursor-pointer items-center gap-3 px-4 py-3.5 hover:bg-surface-2"
              >
                <input
                  type="checkbox"
                  checked={b.enabled}
                  onChange={() => toggleSvc(si)}
                  className="h-4 w-4 shrink-0 accent-brand"
                />
                <span className="text-sm font-medium">{b.serviceName}</span>
              </label>
            ))}
          </div>
        )}
      </Field>
      </>
      )}
    </div>
  );
}

/**
 * The Requirement step for a commercial applicant.
 *
 * Three questions, and deliberately no rent, rate or shop number: an applicant
 * cannot say which unit they want or what it should cost, and both are settled
 * on the proposal. Asking here invites an answer nobody is in a position to
 * give, and a figure they would later feel quoted.
 *
 * Every answer lands in the questionnaire map the wizard already submits, so
 * none of this needs a new field on custom_inquiries.
 */
function CommercialRequirement({
  answers,
  setAnswers,
  errors,
  clearError,
}: {
  answers: Record<string, AnswerValue>;
  setAnswers: (fn: (a: Record<string, AnswerValue>) => Record<string, AnswerValue>) => void;
  errors: Record<string, string>;
  clearError: (k: string) => void;
}) {
  const { t } = useLang();
  const set = (key: string, v: AnswerValue) => {
    clearError(key);
    setAnswers((a) => ({ ...a, [key]: v }));
  };
  const use = String(answers[SHOP_USE] ?? "");

  return (
    <div className="space-y-6">
      <Field label={t("f.shopUse")} required error={errors[SHOP_USE]}>
        <RadioCards
          value={use}
          onChange={(v) => {
            set(SHOP_USE, v);
            // The follow-up only applies to an approved service; leaving a
            // stale answer behind would submit an activity for a shop that is
            // no longer one.
            if (v !== "service") set(SHOP_ACTIVITY, undefined);
          }}
          options={[
            { value: "serving", label: t("f.shopUse.serving") },
            { value: "retail", label: t("f.shopUse.retail") },
            { value: "service", label: t("f.shopUse.service") },
          ]}
        />
      </Field>

      {use === "service" && (
        <Field
          label={t("f.shopActivity")}
          required
          error={errors[SHOP_ACTIVITY]}
          hint={t("f.shopActivity.hint")}
          htmlFor="shopActivity"
        >
          <Input
            id="shopActivity"
            value={String(answers[SHOP_ACTIVITY] ?? "")}
            onChange={(e) => set(SHOP_ACTIVITY, e.target.value)}
            placeholder={t("f.shopActivity.ph")}
            invalid={!!errors[SHOP_ACTIVITY]}
          />
        </Field>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        <Field
          label={t("f.shopArea")}
          required
          error={errors[SHOP_AREA]}
          hint={t("f.shopArea.hint")}
          htmlFor="shopArea"
        >
          <Input
            id="shopArea"
            inputMode="numeric"
            value={String(answers[SHOP_AREA] ?? "")}
            onChange={(e) => set(SHOP_AREA, e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={t("f.shopArea.ph")}
            invalid={!!errors[SHOP_AREA]}
          />
        </Field>
      </div>
    </div>
  );
}

// ── Step 4: Review ─────────────────────────────────────────────────────────────
function StepReview({
  isCommercial,
  answers,
  whoLabel,
  contact,
  tradeLicenseNumber,
  additionalQuestions,
  vatDoc,
  tradeDoc,
  accRows,
  totalBedspaces,
  svcBlocks,
  mobilizationDate,
  moveOutDate,
  durationLabel,
  lang,
  goto,
}: {
  isCommercial: boolean;
  answers: Record<string, AnswerValue>;
  whoLabel: string;
  contact: Contact;
  tradeLicenseNumber: string;
  additionalQuestions: string;
  vatDoc: DocState;
  tradeDoc: DocState;
  accRows: AccRow[];
  totalBedspaces: number;
  svcBlocks: SvcBlock[];
  mobilizationDate: string;
  moveOutDate: string;
  durationLabel: string;
  lang: "en" | "ar";
  goto: (s: number) => void;
}) {
  const { t } = useLang();
  const dash = t("rev.notProvided");
  const sep = lang === "ar" ? "، " : ", ";

  const accText = accRows
    .filter((r) => num(r.bedspaces) > 0)
    .map((r) => `${r.kind === "CUSTOM" ? t("f.custom") : r.roomType} · ${r.bedspaces}`)
    .join(sep);

  const enabledSvcs = svcBlocks.filter((b) => b.enabled);

  // The stored answer is a stable key ("serving"), never the label — the label
  // is looked up so Review reads in whichever language the applicant chose.
  const SHOP_USE_LABEL: Record<string, Parameters<typeof t>[0]> = {
    serving: "f.shopUse.serving",
    retail: "f.shopUse.retail",
    service: "f.shopUse.service",
  };
  const useKey = String(answers[SHOP_USE] ?? "");
  const shopUseLabel = SHOP_USE_LABEL[useKey] ? t(SHOP_USE_LABEL[useKey]) : "";
  const shopAreaLabel = Number(answers[SHOP_AREA]) > 0 ? `${answers[SHOP_AREA]} ${t("f.shopArea.ph")}` : "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">{t("rev.heading")}</h2>
        <p className="mt-1 text-sm text-muted">{t("rev.sub")}</p>
      </div>

      <ReviewSection title={t("rev.section.contact")} onEdit={() => goto(0)}>
        <Row label={t("f.persona")} value={whoLabel || dash} />
        <Row label={t("f.fullName")} value={contact.fullName || dash} />
        <Row label={t("f.company")} value={contact.company || dash} />
        <Row label={t("f.tradeLicenseNo")} value={tradeLicenseNumber || dash} />
        <Row label={t("f.mobile")} value={contact.mobile || dash} />
        <Row label={t("f.email")} value={contact.email || dash} />
        <Row label={t("f.vat")} value={vatDoc.name || vatDoc.file?.name || dash} />
        <Row label={t("f.tradeLicense")} value={tradeDoc.name || tradeDoc.file?.name || dash} />
        <Row label={t("f.additionalQuestions")} value={additionalQuestions.trim() || dash} />
      </ReviewSection>

      <ReviewSection title={t("rev.section.requirement")} onEdit={() => goto(1)}>
        <Row label={t("f.mobilization")} value={mobilizationDate || dash} />
        <Row label={t("f.moveOut")} value={moveOutDate || dash} />
        <Row
          label={t("f.duration.auto")}
          value={durationLabel !== "—" ? durationLabel : dash}
        />
        {isCommercial ? (
          <>
            <Row label={t("f.shopUse")} value={shopUseLabel || dash} />
            {String(answers[SHOP_ACTIVITY] ?? "").trim() && (
              <Row label={t("f.shopActivity")} value={String(answers[SHOP_ACTIVITY])} />
            )}
            <Row label={t("f.shopArea")} value={shopAreaLabel || dash} />
          </>
        ) : (
          <>
            <Row label={t("f.rooms")} value={accText || dash} />
            <Row label={t("f.total")} value={totalBedspaces ? String(totalBedspaces) : dash} />
          </>
        )}
      </ReviewSection>

      {/* Services are a bedspace concern; a shop lease has none to list. */}
      {!isCommercial && enabledSvcs.length > 0 && (
        <ReviewSection title={t("f.services")} onEdit={() => goto(1)}>
          {enabledSvcs.map((b) => {
            const detail =
              b.lines.length === 0
                ? t("f.services.included")
                : b.lines
                    .filter((l) => num(l.quantity) > 0 || (l.kind === "CUSTOM" && l.description.trim()))
                    .map(
                      (l) =>
                        `${l.kind === "CUSTOM" ? t("f.custom") : l.rateCardName} · ${l.quantity || 0}`
                    )
                    .join(sep) || dash;
            return <Row key={b.serviceId} label={b.serviceName} value={detail} />;
          })}
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

/** Small read-only field value box — used for locked fields in edit mode. */
function ReadOnlyValue({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-11 items-center rounded-lg border border-line bg-canvas px-3.5 text-[15px] font-medium text-ink-soft">
      {children}
    </div>
  );
}

// ── Edit-via-link states (loading / not found / locked) ───────────────────────
function EditLoading() {
  const { t } = useLang();
  return (
    <div className="container-page max-w-2xl py-16">
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="text-sm text-muted">{t("wiz.edit.loading")}</p>
      </Card>
    </div>
  );
}

function EditNotFound() {
  const { t } = useLang();
  return (
    <div className="container-page max-w-2xl py-12">
      <Card className="p-8 text-center sm:p-10">
        <h1 className="text-2xl font-bold text-ink">{t("wiz.edit.notFound.title")}</h1>
        <p className="mt-2 text-muted">{t("wiz.edit.notFound.sub")}</p>
        <div className="mt-7 flex justify-center">
          <Link to="/">
            <Button size="lg" variant="secondary">
              <Home className="h-4 w-4" />
              {t("ok.home")}
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

function EditLocked({ status }: { status: PublicStatus | null }) {
  const { t } = useLang();
  return (
    <div className="container-page max-w-2xl py-12">
      <Card className="p-8 text-center sm:p-10">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Lock className="h-8 w-8" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink">{t("wiz.edit.locked.title")}</h1>
        <p className="mt-2 text-muted">{t("wiz.edit.locked.sub")}</p>

        {status && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-canvas px-4 py-2.5 text-sm">
            <span className="text-muted">{t("wiz.edit.locked.status")}:</span>
            <StatusBadge status={status} />
          </div>
        )}

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
