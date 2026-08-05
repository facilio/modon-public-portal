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
  /** The applicant/contact person's name → stored in contact_name. */
  contactName: string;
  /** Company / organisation name (optional). Stored on the inquiry; used by the
   *  staff "Qualify" script to create/link the Account. */
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

// ── Structured requirement (mirrors the console form / facilioApi) ────────────
export type AccommodationKind = "ROOM_TYPE" | "CUSTOM";
export type ServiceLineKind = "RATE_CARD" | "CUSTOM";

/** One accommodation matrix entry (stored in room_lines JSON). */
export interface AccommodationEntry {
  kind: AccommodationKind;
  roomTypeId: string; // ROOM_TYPE
  roomType: string; // ROOM_TYPE label
  description: string; // CUSTOM
  bedspaces: number;
}

/** One service quantity line (stored inside service_lines JSON). */
export interface ServiceRequirementLine {
  kind: ServiceLineKind;
  rateCardEntryId: string; // RATE_CARD
  rateCardName: string; // RATE_CARD label
  description: string; // CUSTOM
  quantity: number | null;
}

/** One service requirement block (stored in service_lines JSON). */
export interface ServiceRequirement {
  serviceId: string;
  serviceName: string;
  enabled: boolean;
  lines: ServiceRequirementLine[];
}

/** Structured requirement dates (duration auto-derived from the two dates). */
export interface RequirementDates {
  move_in_date: string; // "Date of Mobilization (Check-in)"
  move_out_date: string;
  duration_months: number;
}

/** One room-type master record → an accommodation matrix row. */
export interface RoomTypeOption {
  id: string;
  name: string;
  /** number_of_beds_custom_roomtype, or null when unset. */
  bedsPerRoom: number | null;
  /** Read-only occupancy label ("8 in 1"), derived from bedsPerRoom. "" if none. */
  occupancy: string;
}

/** A service from the custom_services_1 master catalog (landing page). */
export interface ServiceOption {
  id: string;
  name: string;
}

/** A rate card offered as a count row under a service. */
export interface InquiryServiceRateCard {
  id: string;
  name: string;
}

/** A service available on the inquiry — mirrors the console's InquiryService.
 *  `rateCards` empty ⇒ boolean toggle; non-empty ⇒ per-card count rows.
 *  `group` is the catalog group (2 Primary / 3 Additional) — heading only. */
export interface InquiryService {
  serviceId: string;
  serviceName: string;
  group: number;
  rateCards: InquiryServiceRateCard[];
}

/** A client-type option (client.clienttype_client enum) — the "who is this for". */
export interface ClientTypeOption {
  id: string;
  name: string;
}

/** A cluster (system zone module) + how many buildings it contains (landing). */
export interface ClusterOption {
  id: string;
  name: string;
  buildingCount: number;
}

/** An uploaded document (VAT certificate / trade license) off a FILE field. */
export interface InquiryDoc {
  fileId?: number;
  url?: string;
  name?: string;
}

/** Result of POST /uploads — the Facilio file id to write to a FILE field. */
export interface UploadResult {
  fileId: number | null;
}

export interface SubmitInquiryInput {
  template_id: string;
  template_version: number;
  /** Dynamic answers keyed by question id. */
  answers: Record<string, unknown>;
  /** Structured requirement dates (duration auto-derived). */
  requirement: RequirementDates;
  /** Structured accommodation matrix → stored as JSON on the inquiry. */
  accommodation: AccommodationEntry[];
  /** Structured service requirements → stored as JSON on the inquiry. */
  services: ServiceRequirement[];
  /** Trade licence number (text). */
  trade_license_number: string;
  /** Uploaded document file ids (from POST /uploads). */
  vat_certificate_file_id: number | null;
  trade_license_file_id: number | null;
  /** Carried so the gateway can recompute the auto `name` title with the bed total. */
  company: string;
  contact_name: string;
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
    move_in_date: string;
    duration_months: number;
  };
  /** Resolved labels for display on the status page. */
  requirement_extra: {
    room_lines: { roomType: string; beds: number }[];
    services: string[]; // service labels
  };
  /** Resolved dynamic questionnaire answers. */
  answers: AnswerRow[];
  offer?: OfferSummary;
}

// ── Edit-via-link (GET /inquiries/{code}/edit) ───────────────────────────────
/**
 * Full editable inquiry payload for the portal edit-via-link flow: an admin
 * creates the record on a call, then sends the client `…/inquiry?code=INQ-…`.
 * Carries the raw ids the wizard needs to re-select (roomTypeId, service enum
 * ids, template id) plus the parsed questionnaire answers. Contact/client
 * fields are DISPLAY-ONLY — the wizard locks them. `editable` is true only
 * while the inquiry is still in its draft (New) state.
 */
export interface InquiryEditData {
  inquiry_id: string;
  inquiry_code: string;
  editable: boolean;
  status: PublicStatus;
  /** client-type enum index (index-aligned with persona: "1"=Company, "2"=Agency). */
  clientTypeId: string;
  contact: {
    fullName: string;
    company: string;
    mobile: string;
    email: string;
  };
  /** Trade licence number (text). */
  trade_license_number: string;
  requirement: {
    moveIn: string; // YYYY-MM-DD — Date of Mobilization
    moveOut: string; // YYYY-MM-DD
    duration: string; // months (auto-derived), as a string
  };
  /** Structured requirement — the wizard overlays these onto the master rows. */
  accommodation: AccommodationEntry[];
  services: ServiceRequirement[];
  /** Existing uploaded documents (so edit shows what's already attached). */
  vat_certificate: InquiryDoc | null;
  trade_license: InquiryDoc | null;
  template_id: string;
  answers: Record<string, unknown>;
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
