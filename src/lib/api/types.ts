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
  preferred_language: "en" | "ar";
}

export interface CreateInquiryResult {
  inquiry_id: string;
  inquiry_code: string;
}

// ── POST /inquiries/{id}/submit (Step 4) ─────────────────────────────────────
export interface GenderMix {
  male: number;
  female: number;
  family_units: number;
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

/** Uniform error thrown by the client for any public-lookup failure (E-21). */
export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}
