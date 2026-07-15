// ─────────────────────────────────────────────────────────────────────────────
// Shared API contract types — MUST match the connected-app (backend) session.
// ─────────────────────────────────────────────────────────────────────────────

export type Persona = "Corporate" | "Sponsor" | "Individual";

export type QuestionType =
  | "text"
  | "longtext"
  | "number"
  | "date"
  | "dropdown"
  | "multiselect"
  | "boolean";

export interface Question {
  id: string;
  order: number;
  label_en: string;
  label_ar: string;
  type: QuestionType;
  options: string[];
  required: boolean;
  /** Backend-only: which Inquiry column this maps to. The portal ignores it. */
  maps_to: string;
}

export interface Template {
  template_id: string;
  version: number;
  questions: Question[];
}

// ── POST /inquiries (Step 1: create Draft) ───────────────────────────────────
export interface CreateInquiryInput {
  persona: Persona;
  name: string;
  mobile: string;
  email: string;
}

export interface CreateInquiryResult {
  inquiry_id: string;
  inquiry_code: string;
}

// ── POST /inquiries/{id}/submit (Step 4) ─────────────────────────────────────
export interface GenderMix {
  male: number;
  female: number;
}

export interface FixedRequirement {
  requested_beds: number;
  gender_mix: GenderMix;
  move_in_date: string;
  duration_months: number;
}

export interface FixedPreferences {
  /** Ranked: index 0 = 1st choice. */
  site_preference: string[];
  room_type_preference: string[];
}

export interface SubmitInquiryInput {
  template_id: string;
  template_version: number;
  /** Dynamic answers keyed by question id. */
  answers: Record<string, unknown>;
  /**
   * Fixed Inquiry columns collected across Steps 2–3. Documented as a superset
   * of the brief's minimal {template_id, template_version, answers} body so no
   * data is lost; the backend session can consume or ignore these keys.
   */
  requirement: FixedRequirement;
  preferences: FixedPreferences;
}

export interface SubmitInquiryResult {
  ok: boolean;
  inquiry_code: string;
}

// ── Status lookup ─────────────────────────────────────────────────────────────
export type PublicStatus =
  | "received"
  | "review"
  | "offer"
  | "accepted"
  | "declined"
  | "closed";

export interface StatusInquiry {
  code: string;
  beds: number;
  siteId: string;
  roomType: string;
  submittedAt: string;
  updatedAt: string;
  status: PublicStatus;
}

// ── Inquiry detail (read-only view on the status page) ───────────────────────
/** A label/value pair already resolved for display (persona/site/room labels). */
export interface LabeledValue {
  label: string;
  value: string;
}

/** One resolved dynamic answer (question label + display value). */
export interface AnswerRow {
  label: string;
  value: string;
}

/** Optional offer summary shown when status = Offer Sent (Phase-2 proposal doc is separate). */
export interface OfferSummary {
  proposal_no?: string;
  valid_until?: string; // ISO
  currency?: string;
  total?: number;
}

export interface InquiryDetail {
  code: string;
  status: PublicStatus;
  submittedAt: string;
  updatedAt: string;
  persona: Persona;
  contact: {
    name: string;
    mobile: string;
    email: string;
    preferred_language: "en" | "ar";
  };
  requirement: {
    requested_beds: number;
    gender_mix: GenderMix;
    move_in_date: string;
    duration_months: number;
  };
  /** Ranked preferences as ids/values (index order = rank); UI resolves labels. */
  preferences: {
    sites: string[]; // site ids
    room_types: string[]; // room type values
  };
  /** Resolved dynamic questionnaire answers. */
  answers: AnswerRow[];
  offer?: OfferSummary;
}

export type OfferDecision = "approve" | "reject";

export interface OfferDecisionResult {
  ok: boolean;
  status: PublicStatus;
}

/** Uniform error thrown by the client for any public-lookup failure (E-21). */
export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}
