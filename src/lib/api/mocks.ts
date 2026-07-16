// ─────────────────────────────────────────────────────────────────────────────
// Mock implementations of the backend endpoints, returning the EXACT contract
// shapes (§7 of the brief). Active whenever VITE_BFF_BASE_URL is unset so the
// portal is fully clickable before the backend is live; swapping to real is a
// no-op at the call sites.
// ─────────────────────────────────────────────────────────────────────────────

import {
  MOCK_INQUIRIES,
  MOCK_ROOM_TYPES,
  inquiriesForEmail,
  generateInquiryCode,
  roomTypeLabel,
} from "../mockData";
import {
  ApiError,
  type AnswerRow,
  type CreateInquiryInput,
  type CreateInquiryResult,
  type InquiryDetail,
  type OfferDecision,
  type OfferDecisionResult,
  type Persona,
  type RoomTypeOption,
  type StatusInquiry,
  type SubmitInquiryResult,
  type Template,
} from "./types";

const DELAY = 450; // simulate network latency so loading states are visible
function wait<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY));
}

// ── Persona-specific Layer-1 templates (dynamic questions only) ───────────────
// Fixed fields (contact / requirement / ranked prefs) are NEVER here.
const TEMPLATES: Record<Persona, Template> = {
  Corporate: {
    template_id: "tpl-corporate-l1",
    version: 3,
    questions: [
      {
        id: "q_trade_license",
        order: 1,
        label_en: "Trade license number",
        label_ar: "رقم الرخصة التجارية",
        type: "text",
        options: [],
        required: true,
        maps_to: "trade_license_no",
      },
      {
        id: "q_budget",
        order: 2,
        label_en: "Budget band (per bed / month)",
        label_ar: "فئة الميزانية (لكل سرير / شهر)",
        type: "dropdown",
        options: ["Below AED 800", "AED 800–1,200", "AED 1,200–1,800", "Above AED 1,800"],
        required: true,
        maps_to: "budget_band",
      },
      {
        id: "q_services",
        order: 3,
        label_en: "Services you’re interested in",
        label_ar: "الخدمات التي تهمّك",
        type: "multiselect",
        options: ["Catering", "Cleaning", "Laundry", "Transport"],
        required: false,
        maps_to: "services_interested",
      },
      {
        id: "q_urgency",
        order: 4,
        label_en: "How soon do you need this?",
        label_ar: "ما مدى سرعة احتياجك؟",
        type: "dropdown",
        options: ["Immediately", "Within 30 days", "30–90 days", "Just exploring"],
        required: true,
        maps_to: "urgency",
      },
      {
        id: "q_current_provider",
        order: 5,
        label_en: "Current accommodation provider (if any)",
        label_ar: "مزوّد السكن الحالي (إن وجد)",
        type: "text",
        options: [],
        required: false,
        maps_to: "current_provider",
      },
    ],
  },
  Sponsor: {
    template_id: "tpl-sponsor-l1",
    version: 2,
    questions: [
      {
        id: "q_program_name",
        order: 1,
        label_en: "Program name",
        label_ar: "اسم البرنامج",
        type: "text",
        options: [],
        required: true,
        maps_to: "program_name",
      },
      {
        id: "q_program_id",
        order: 2,
        label_en: "Program / reference ID",
        label_ar: "معرّف البرنامج / المرجع",
        type: "text",
        options: [],
        required: false,
        maps_to: "program_id",
      },
      {
        id: "q_beneficiaries",
        order: 3,
        label_en: "Number of beneficiaries",
        label_ar: "عدد المستفيدين",
        type: "number",
        options: [],
        required: true,
        maps_to: "beneficiary_count",
      },
      {
        id: "q_family_composition",
        order: 4,
        label_en: "Family composition notes",
        label_ar: "ملاحظات تكوين الأسرة",
        type: "longtext",
        options: [],
        required: false,
        maps_to: "family_composition",
      },
      {
        id: "q_funded_services",
        order: 5,
        label_en: "Funded services scope",
        label_ar: "نطاق الخدمات الممولة",
        type: "multiselect",
        options: ["Catering", "Cleaning", "Laundry", "Transport", "Medical"],
        required: false,
        maps_to: "funded_services",
      },
      {
        id: "q_urgency",
        order: 6,
        label_en: "How soon do you need this?",
        label_ar: "ما مدى سرعة احتياجك؟",
        type: "dropdown",
        options: ["Immediately", "Within 30 days", "30–90 days", "Just exploring"],
        required: true,
        maps_to: "urgency",
      },
    ],
  },
  Individual: {
    template_id: "tpl-individual-l1",
    version: 1,
    questions: [
      {
        id: "q_nationality",
        order: 1,
        label_en: "Nationality",
        label_ar: "الجنسية",
        type: "text",
        options: [],
        required: true,
        maps_to: "nationality",
      },
      {
        id: "q_gender",
        order: 2,
        label_en: "Gender",
        label_ar: "الجنس",
        type: "dropdown",
        options: ["Male", "Female"],
        required: true,
        maps_to: "gender",
      },
      {
        id: "q_budget",
        order: 3,
        label_en: "Budget band (per bed / month)",
        label_ar: "فئة الميزانية (لكل سرير / شهر)",
        type: "dropdown",
        options: ["Below AED 800", "AED 800–1,200", "AED 1,200–1,800", "Above AED 1,800"],
        required: true,
        maps_to: "budget_band",
      },
      {
        id: "q_services",
        order: 4,
        label_en: "Services you’re interested in",
        label_ar: "الخدمات التي تهمّك",
        type: "multiselect",
        options: ["Catering", "Cleaning", "Laundry", "Transport"],
        required: false,
        maps_to: "services_interested",
      },
      {
        id: "q_source",
        order: 5,
        label_en: "How did you hear about us?",
        label_ar: "كيف سمعت عنّا؟",
        type: "dropdown",
        options: ["Search engine", "Social media", "Referral", "Walk-in", "Other"],
        required: false,
        maps_to: "source",
      },
      {
        id: "q_has_pets",
        order: 6,
        label_en: "Will you bring pets?",
        label_ar: "هل ستحضر حيوانات أليفة؟",
        type: "boolean",
        options: [],
        required: false,
        maps_to: "has_pets",
      },
    ],
  },
};

const DEMO_OTP = "123456";

export const mockApi = {
  getActiveTemplate(persona: Persona): Promise<Template> {
    return wait(TEMPLATES[persona]);
  },

  getRoomTypes(): Promise<RoomTypeOption[]> {
    return wait(MOCK_ROOM_TYPES);
  },

  createInquiry(input: CreateInquiryInput): Promise<CreateInquiryResult> {
    return wait({
      inquiry_id: `mock-${Math.floor(Math.random() * 1e6)}`,
      inquiry_code: generateInquiryCode(),
      _persona: input.persona,
    } as CreateInquiryResult);
  },

  submitInquiry(inquiryCode?: string): Promise<SubmitInquiryResult> {
    return wait({ ok: true, inquiry_code: inquiryCode ?? generateInquiryCode() });
  },

  // ── Status: Code + Email ───────────────────────────────────────────────────
  async statusLookup(code: string, email: string): Promise<StatusInquiry[]> {
    await wait(null);
    const c = code.trim().toUpperCase();
    const e = email.trim().toLowerCase();
    const match = MOCK_INQUIRIES.find(
      (i) => i.code.toUpperCase() === c && i.email.toLowerCase() === e
    );
    // Demo convenience: also accept the known demo code with ANY email.
    const demoMatch =
      !match && MOCK_INQUIRIES.find((i) => i.code.toUpperCase() === c);
    const found = match ?? demoMatch;
    if (!found) {
      // Uniform generic error — never distinguish not-found vs mismatch (E-21).
      throw new ApiError("generic");
    }
    return [stripEmail(found)];
  },

  // ── Status: Email + OTP ────────────────────────────────────────────────────
  otpRequest(): Promise<{ ok: true }> {
    // Say nothing about existence either way.
    return wait({ ok: true });
  },

  async otpVerify(email: string, otp: string): Promise<StatusInquiry[]> {
    await wait(null);
    if (otp.trim() !== DEMO_OTP) throw new ApiError("generic");
    return inquiriesForEmail(email).map(stripEmail);
  },

  // ── Inquiry detail (read-only status view) ─────────────────────────────────
  async getInquiryDetail(code: string): Promise<InquiryDetail> {
    await wait(null);
    const inq = MOCK_INQUIRIES.find(
      (i) => i.code.toUpperCase() === code.trim().toUpperCase()
    );
    if (!inq) throw new ApiError("generic");
    return buildDetail(inq);
  },

  // ── Approve / reject the offer (Offer Sent) ────────────────────────────────
  async respondOffer(
    _code: string,
    decision: OfferDecision
  ): Promise<OfferDecisionResult> {
    await wait(null);
    return { ok: true, status: decision === "approve" ? "accepted" : "declined" };
  },
};

// Static per-code extras that aren't on the lightweight list record.
const DETAIL_EXTRA: Record<
  string,
  { persona: Persona; name: string; mobile: string; gender: [number, number, number]; moveIn: string; duration: number; answers: AnswerRow[] }
> = {
  "INQ-2026-A7K3M9": {
    persona: "Corporate",
    name: "Apex Facilities LLC",
    mobile: "+971 50 123 4567",
    gender: [80, 40, 0],
    moveIn: "2026-09-01",
    duration: 12,
    answers: [
      { label: "Trade license number", value: "TL-88421" },
      { label: "Budget band (per bed / month)", value: "AED 800–1,200" },
      { label: "Services you’re interested in", value: "Catering, Cleaning" },
      { label: "How soon do you need this?", value: "Within 30 days" },
    ],
  },
  "INQ-2026-B4X8T2": {
    persona: "Corporate",
    name: "Nexus Contracting",
    mobile: "+971 55 987 6543",
    gender: [40, 0, 0],
    moveIn: "2026-07-15",
    duration: 6,
    answers: [
      { label: "Trade license number", value: "TL-20031" },
      { label: "Budget band (per bed / month)", value: "AED 1,200–1,800" },
    ],
  },
  "INQ-2026-C9R5N6": {
    persona: "Sponsor",
    name: "Hope Welfare Program",
    mobile: "+971 52 444 1122",
    gender: [150, 50, 5],
    moveIn: "2026-10-15",
    duration: 24,
    answers: [
      { label: "Program name", value: "Seasonal Workforce 2026" },
      { label: "Number of beneficiaries", value: "205" },
      { label: "How soon do you need this?", value: "Immediately" },
    ],
  },
  "INQ-2026-D2H7P4": {
    persona: "Individual",
    name: "Rahul Sharma",
    mobile: "+971 56 200 3040",
    gender: [1, 0, 0],
    moveIn: "2026-04-01",
    duration: 3,
    answers: [
      { label: "Nationality", value: "Indian" },
      { label: "Gender", value: "Male" },
    ],
  },
};

function buildDetail(inq: (typeof MOCK_INQUIRIES)[number]): InquiryDetail {
  const x = DETAIL_EXTRA[inq.code] ?? {
    persona: "Corporate" as Persona,
    name: "Applicant",
    mobile: "+971 50 000 0000",
    gender: [inq.beds, 0, 0] as [number, number, number],
    moveIn: "2026-09-01",
    duration: 12,
    answers: [] as AnswerRow[],
  };
  return {
    code: inq.code,
    status: inq.status,
    submittedAt: inq.submittedAt,
    updatedAt: inq.updatedAt,
    persona: x.persona,
    contact: {
      name: x.name,
      mobile: x.mobile,
      email: inq.email,
      preferred_language: "en",
    },
    requirement: {
      requested_beds: inq.beds,
      gender_mix: { male: x.gender[0], female: x.gender[1] },
      move_in_date: x.moveIn,
      duration_months: x.duration,
    },
    requirement_extra: {
      room_types: [roomTypeLabel(inq.roomType)?.label.en ?? inq.roomType],
      services: ["Catering", "Cleaning"],
    },
    answers: x.answers,
    offer:
      inq.status === "offer"
        ? { proposal_no: "PRP-2026-00042", valid_until: "2026-07-20", currency: "AED", total: 138000 }
        : undefined,
  };
}

function stripEmail(i: (typeof MOCK_INQUIRIES)[number]): StatusInquiry {
  const { email: _email, ...rest } = i;
  void _email;
  return rest;
}
