// ─────────────────────────────────────────────────────────────────────────────
// Static mock data for the UI-only build. No backend calls anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import type { StringKey } from "../i18n/strings";

// ── Sites (landing "Our locations") ─────────────────────────────────────────
export interface Site {
  id: string;
  name: { en: string; ar: string };
  emirate: { en: string; ar: string };
  fromRate: number; // AED / bed / month
  capacity: number;
  // A soft gradient for the card photo placeholder
  gradient: string;
}

export const SITES: Site[] = [
  {
    id: "site-icad",
    name: { en: "ICAD Residential City", ar: "مدينة إيكاد السكنية" },
    emirate: { en: "Abu Dhabi", ar: "أبوظبي" },
    fromRate: 850,
    capacity: 6400,
    gradient: "from-blue-500 to-indigo-600",
  },
  {
    id: "site-kizad",
    name: { en: "KEZAD Communities", ar: "مجتمعات كيزاد" },
    emirate: { en: "Abu Dhabi", ar: "أبوظبي" },
    fromRate: 780,
    capacity: 9200,
    gradient: "from-teal-500 to-emerald-600",
  },
  {
    id: "site-dip",
    name: { en: "Dubai Investment Park", ar: "مجمع دبي للاستثمار" },
    emirate: { en: "Dubai", ar: "دبي" },
    fromRate: 990,
    capacity: 4100,
    gradient: "from-violet-500 to-purple-600",
  },
  {
    id: "site-sajaa",
    name: { en: "Sajaa Industrial Oasis", ar: "واحة الساجعة الصناعية" },
    emirate: { en: "Sharjah", ar: "الشارقة" },
    fromRate: 720,
    capacity: 3300,
    gradient: "from-amber-500 to-orange-600",
  },
];

// ── Room types (inquiry preferences) ─────────────────────────────────────────
export interface Option {
  value: string;
  label: { en: string; ar: string };
}

export const ROOM_TYPES: Option[] = [
  { value: "2-sharing", label: { en: "2-Sharing (AC)", ar: "ثنائية (مكيّفة)" } },
  { value: "4-sharing", label: { en: "4-Sharing (AC)", ar: "رباعية (مكيّفة)" } },
  { value: "6-sharing", label: { en: "6-Sharing (AC)", ar: "سداسية (مكيّفة)" } },
  { value: "studio", label: { en: "Studio", ar: "استوديو" } },
  { value: "family", label: { en: "Family unit", ar: "وحدة عائلية" } },
];

export const BUDGET_BANDS: Option[] = [
  { value: "any", label: { en: "No preference", ar: "لا تفضيل" } },
  { value: "u800", label: { en: "Under AED 800", ar: "أقل من ٨٠٠ درهم" } },
  { value: "800-1200", label: { en: "AED 800 – 1,200", ar: "٨٠٠ – ١٢٠٠ درهم" } },
  { value: "1200-1800", label: { en: "AED 1,200 – 1,800", ar: "١٢٠٠ – ١٨٠٠ درهم" } },
  { value: "1800+", label: { en: "AED 1,800+", ar: "١٨٠٠ درهم فأكثر" } },
];

// Services — value + icon name (lucide) + i18n key
export interface ServiceItem {
  value: string;
  key: StringKey;
  icon:
    | "sparkles"
    | "utensils"
    | "shirt"
    | "wifi"
    | "shield"
    | "wrench"
    | "bus"
    | "plug";
}

export const SERVICES: ServiceItem[] = [
  { value: "cleaning", key: "incl.cleaning", icon: "sparkles" },
  { value: "catering", key: "incl.catering", icon: "utensils" },
  { value: "laundry", key: "incl.laundry", icon: "shirt" },
  { value: "wifi", key: "incl.wifi", icon: "wifi" },
  { value: "security", key: "incl.security", icon: "shield" },
  { value: "maintenance", key: "incl.maintenance", icon: "wrench" },
  { value: "transport", key: "incl.transport", icon: "bus" },
  { value: "utilities", key: "incl.utilities", icon: "plug" },
];

// ── Public status model (doc §5.3 mapping) ───────────────────────────────────
// Internal stages map onto four public-friendly steps + a terminal "Closed".
export type PublicStatus =
  | "received"
  | "review"
  | "offer"
  | "accepted"
  | "closed";

export const PUBLIC_STEPS: Exclude<PublicStatus, "closed">[] = [
  "received",
  "review",
  "offer",
  "accepted",
];

export const STATUS_LABEL: Record<PublicStatus, StringKey> = {
  received: "status.received",
  review: "status.review",
  offer: "status.offer",
  accepted: "status.accepted",
  closed: "status.closed",
};

// ── Mock inquiries (status tracker list) ─────────────────────────────────────
export interface MockInquiry {
  code: string;
  email: string;
  beds: number;
  siteId: string;
  roomType: string;
  submittedAt: string; // ISO
  updatedAt: string; // ISO
  status: PublicStatus;
}

// The demo account: any email verifies with OTP 123456, but this fixed list is
// returned so the UI shows a realistic spread of statuses (incl. a closed one).
export const MOCK_INQUIRIES: MockInquiry[] = [
  {
    code: "INQ-2026-A7K3M9",
    email: "demo@company.com",
    beds: 120,
    siteId: "site-icad",
    roomType: "4-sharing",
    submittedAt: "2026-06-18T09:12:00Z",
    updatedAt: "2026-07-02T14:30:00Z",
    status: "offer",
  },
  {
    code: "INQ-2026-B4X8T2",
    email: "demo@company.com",
    beds: 40,
    siteId: "site-dip",
    roomType: "2-sharing",
    submittedAt: "2026-05-04T08:00:00Z",
    updatedAt: "2026-06-28T11:15:00Z",
    status: "accepted",
  },
  {
    code: "INQ-2026-C9R5N6",
    email: "demo@company.com",
    beds: 200,
    siteId: "site-kizad",
    roomType: "6-sharing",
    submittedAt: "2026-07-01T16:45:00Z",
    updatedAt: "2026-07-06T10:05:00Z",
    status: "review",
  },
  {
    code: "INQ-2026-D2H7P4",
    email: "demo@company.com",
    beds: 15,
    siteId: "site-sajaa",
    roomType: "studio",
    submittedAt: "2026-03-11T12:00:00Z",
    updatedAt: "2026-04-01T09:00:00Z",
    status: "closed",
  },
];

export const DEMO_OTP = "123456";

/** Look up mock inquiries for an email; the demo set is returned for any email. */
export function inquiriesForEmail(email: string): MockInquiry[] {
  const trimmed = email.trim().toLowerCase();
  const own = MOCK_INQUIRIES.filter((i) => i.email === trimmed);
  if (own.length) return own;
  // For any other email, reuse the demo set but stamp the entered email so the
  // list header reads naturally in this UI-only build.
  return MOCK_INQUIRIES.map((i) => ({ ...i, email: trimmed }));
}

/** Generate a demo inquiry code (unambiguous charset, no 0/O/1/I) per E-22. */
export function generateInquiryCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `INQ-2026-${suffix}`;
}

export function siteById(id: string): Site | undefined {
  return SITES.find((s) => s.id === id);
}

export function roomTypeLabel(value: string): Option | undefined {
  return ROOM_TYPES.find((r) => r.value === value);
}
