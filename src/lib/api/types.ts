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
  /** Primary contact person's name. Stored on the inquiry. */
  name: string;
  /** Company / organisation name. Stored on the inquiry; used by the staff
   *  "Qualify" script to create/link the Account. */
  company: string;
  /** Stored on the inquiry. */
  mobile: string;
  /** Stored on the inquiry; also the status-lookup key. */
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

/** One room-type option — a record from the custom_roomtype module (lookup). */
export interface RoomTypeOption {
  id: string;
  name: string;
}

export interface SubmitInquiryInput {
  template_id: string;
  template_version: number;
  /** Dynamic answers keyed by question id. */
  answers: Record<string, unknown>;
  /**
   * Fixed Inquiry columns collected in the Requirement step. Documented as a
   * superset of the brief's minimal {template_id, template_version, answers}
   * body so no data is lost; the backend session can consume or ignore keys.
   */
  requirement: FixedRequirement;
  /** Selected custom_roomtype record ids (multi-lookup). */
  room_type_ids: string[];
  /** Selected service option values (multi-enum), see INQUIRY_SERVICES. */
  services: string[];
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
  /** Resolved labels for display on the status page. */
  requirement_extra: {
    room_types: string[]; // room-type names
    services: string[]; // service labels
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
