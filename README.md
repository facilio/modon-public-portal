# MODON Public Portal

Standalone public-facing portal for the MODON accommodation leasing funnel
(Module **M5**). Vite + React 18 + TypeScript + Tailwind. This is a **new sibling
app**, not part of `facilio-modon-accommodation/` and not a Facilio module.

## Current state — UI + API layer (mock fallback)

A full, bilingual (English + Arabic, RTL), Tailwind-styled portal for the three
public experiences, talking to the backend through a single API facade
(`src/lib/api`). When `VITE_BFF_BASE_URL` is **unset**, the facade transparently
uses in-browser mocks that return the exact backend contract shapes; set it to
the gateway URL and the same call sites hit the live backend — no code changes.

- **Landing** (`/`) — hero + CTAs, persona cards (each pre-selects a persona via
  `?persona=`), how-it-works, locations ("from AED X / bed / month"),
  what's-included, requirements callout, inline "track your inquiry" widget.
- **Inquiry wizard** (`/inquiry`) — 4 steps with a numbered stepper:
  1. **Your details** (FIXED: name, mobile, email, language) → on Continue,
     `POST /inquiries` creates the Draft and stores `inquiry_id` + `inquiry_code`.
  2. **Requirement** (FIXED: beds, gender mix, move-in date, duration).
  3. **Preferences** — FIXED ranked site + room-type, then **dynamic questions**
     fetched by persona (`GET /templates/active?persona=&layer=1`) and rendered
     by type (text/longtext/number/date/dropdown/multiselect/boolean). The portal
     has **zero hard-coded dynamic questions** — it renders whatever the template
     returns and keeps answers keyed by question `id`.
  4. **Review & Submit** → `POST /inquiries/{id}/submit` with `template_id`,
     `template_version`, and `answers` → success screen with the `inquiry_code`.
- **Status tracker** (`/status`) — two secured paths (never leak on one key):
  **Code + Email** (`POST /status/lookup`, uniform generic error for
  not-found/mismatch) and **Email + OTP** (`/status/otp/request` + `/verify`,
  6-digit, 3-try lockout). Result: a list of inquiries, each with a
  public-friendly stepper (Received → Under Review → Offer Sent → Offer Accepted,
  plus a soft "Closed"). **Demo OTP: `123456`**; demo code `INQ-2026-A7K3M9`.

Language toggle (header + footer) flips EN/AR and sets `<html dir="rtl">`.

### Backend contract (see `src/lib/api/types.ts`)
Question object: `{ id, order, label_en, label_ar, type, options, required, maps_to }`
(portal ignores `maps_to`). Template fetched in one bulk call; answers keyed by
`id`; `template_id` + `template_version` sent back on submit. Fixed fields
(contact, requirement, ranked preferences) are portal-owned Inquiry columns and
are **never** template questions.

### Project structure
```
src/
  App.tsx                    routes: / , /inquiry , /status
  main.tsx                   BrowserRouter + LanguageProvider
  i18n/                      LanguageContext + en/ar dictionaries
  lib/
    api/                     types (contract), index (facade), mocks (per-persona
                             templates + endpoint mocks)
    mockData, format, icons, cn
  components/{layout,ui}/     Header/Footer/PublicLayout; Button, Card, Field,
                             Input, Select, Stepper, StatusBadge, ProgressStepper
  features/
    landing/                 LandingPage
    inquiry/                 InquiryWizard, controls (RadioCards, ChipMultiSelect,
                             RankedListField), DynamicField, SuccessScreen
    status/                  StatusTracker
```

## Run

```bash
npm install
npm run dev             # http://localhost:5173  (mock mode — VITE_BFF_BASE_URL unset)
npm run build           # tsc --noEmit + vite build → dist/
npm run preview
```

To point at the live backend, set `VITE_BFF_BASE_URL` in `.env` to the gateway URL.

## Not yet wired (next steps)

OTP/email delivery, offer view + accept (M6), and security hardening (WAF, rate
limits, JWT/OTP lifecycle, honeypot enforcement server-side) are **out of scope
for this pass**. The mock endpoints in `src/lib/api/mocks.ts` mirror the exact
shapes agreed with the backend session, so the swap to live is a config change.
See `../facilio-modon-accommodation/PUBLIC_PORTAL_PLAN.md` for the full plan.
