// ─────────────────────────────────────────────────────────────────────────────
// API facade. When VITE_BFF_BASE_URL is set, calls the real gateway/BFF; when
// unset, transparently uses the in-browser mocks (mocks.ts). The UI imports
// only from here, so switching to the live backend needs no call-site changes.
// ─────────────────────────────────────────────────────────────────────────────

import { mockApi } from "./mocks";
import {
  ApiError,
  type CreateInquiryInput,
  type CreateInquiryResult,
  type Persona,
  type StatusInquiry,
  type SubmitInquiryInput,
  type SubmitInquiryResult,
  type Template,
} from "./types";

const BASE = (import.meta.env.VITE_BFF_BASE_URL as string | undefined)?.trim();
console.log('base', BASE);
export const isBackendConfigured = Boolean(BASE);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  console.log(`${BASE}${path}`);
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(
      (body && typeof body === "object" && body.error) || "generic"
    );
  }
  return body as T;
}

export const api = {
  // GET /templates/active?persona=&layer=1
  getActiveTemplate(persona: Persona, layer = 1): Promise<Template> {
    if (!isBackendConfigured) return mockApi.getActiveTemplate(persona);
    return request<Template>(
      `/templates/active?persona=${encodeURIComponent(persona)}&layer=${layer}`
    );
  },

  // POST /inquiries  → creates Inquiry (NEW + Draft)
  createInquiry(input: CreateInquiryInput): Promise<CreateInquiryResult> {
    if (!isBackendConfigured) return mockApi.createInquiry(input);
    return request<CreateInquiryResult>("/inquiries", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  // POST /inquiries/{id}/submit
  submitInquiry(
    inquiryId: string,
    input: SubmitInquiryInput,
    inquiryCode?: string
  ): Promise<SubmitInquiryResult> {
    console.log('backend configured', isBackendConfigured);
    if (!isBackendConfigured) return mockApi.submitInquiry(inquiryCode);
    return request<SubmitInquiryResult>(
      `/inquiries/${encodeURIComponent(inquiryId)}/submit`,
      { method: "POST", body: JSON.stringify(input) }
    );
  },

  // POST /status/lookup  (Code + Email)
  statusLookup(code: string, email: string): Promise<StatusInquiry[]> {
    if (!isBackendConfigured) return mockApi.statusLookup(code, email);
    return request<StatusInquiry[]>("/status/lookup", {
      method: "POST",
      body: JSON.stringify({ code, email }),
    });
  },

  // POST /status/otp/request
  otpRequest(email: string): Promise<{ ok: true }> {
    if (!isBackendConfigured) return mockApi.otpRequest();
    return request<{ ok: true }>("/status/otp/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  // POST /status/otp/verify  → list of the caller's inquiries
  otpVerify(email: string, otp: string): Promise<StatusInquiry[]> {
    if (!isBackendConfigured) return mockApi.otpVerify(email, otp);
    return request<StatusInquiry[]>("/status/otp/verify", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
    });
  },
};

export * from "./types";
