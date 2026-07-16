// ─────────────────────────────────────────────────────────────────────────────
// MODON Public Portal — thin BFF / gateway (LOCAL DEV runner)
//
// Why this exists: the browser cannot call Facilio directly (CORS), and the
// Facilio API key must never ship in the browser bundle. This tiny server runs
// on localhost, accepts requests from the portal origin, forwards them to
// Facilio server-side with the x-api-key attached here, and reshapes Facilio's
// responses into the contract the portal expects (src/lib/api/types.ts).
//
// Same role the AWS Lambda BFF will play in production. Zero npm deps — Node's
// built-in http + global fetch; loads .env via `node --env-file=.env`.
// ─────────────────────────────────────────────────────────────────────────────

import { createServer } from "node:http";

const PORT = process.env.PORT ?? 8787;
const FACILIO_BASE_URL =
  process.env.FACILIO_BASE_URL ?? "https://app.facilio.co.ae/AccommodationManagement";
const FACILIO_API_KEY = process.env.FACILIO_API_KEY;
// ── Module names ─────────────────────────────────────────────────────────────
// These vary by deployment/org (dev/sandbox/prod clones), so they stay in env.
const INQUIRY_MODULE = process.env.FACILIO_INQUIRY_MODULE ?? "custom_inquiries";
const TEMPLATE_MODULE =
  process.env.FACILIO_TEMPLATE_MODULE ?? "custom_questionnairetemplate";
// Room type is a LOOKUP to this module (same one rate cards / accommodation use).
// Read to serve GET /room-types.
const ROOMTYPE_MODULE = process.env.FACILIO_ROOMTYPE_MODULE ?? "custom_roomtype";

// ── custom_inquiries field link names — SINGLE SOURCE OF TRUTH ───────────────
// Every custom_inquiries column the gateway reads or writes lives here, as plain
// literals from the module meta. Field names are code, not per-deployment config
// (unlike module names / URL / key, which stay in env). Rename in ONE place.
const IF = {
  // identity / contact (written at create)
  name: "name", // main field — holds the contact's full name
  code: "inquiry_code_custom_inquiries",
  persona: "persona_custom_inquiries",
  mobile: "mobile_custom_inquiries",
  email: "email_custom_inquiries",
  company: "company_name_custom_inquiries",
  // requirement (written at submit)
  beds: "requested_beds_custom_inquiries",
  duration: "duration_months_custom_inquiries",
  gender: "gender_mix_custom_inquiries",
  moveIn: "move_in_date_custom_inquiries",
  roomType: "room_type_custom_inquiries",
  services: "services_custom_inquiries",
  // questionnaire (written at submit)
  template: "questionnaire_template_custom_inquiries",
  answers: "questionnaire_answers_custom_inquiries",
};

// Service option values in the SAME order as the Facilio services multi-enum
// (mirrors services_custom_proposal / services_custom_contract). A submitted
// value maps to its 1-based enum option id by this index.
const INQUIRY_SERVICE_VALUES = [
  "cleaning",
  "catering",
  "laundry",
  "mess_hall",
  "food_parcel",
  "wifi",
  "access_card",
];
function serviceValuesToIds(values) {
  return (values ?? [])
    .map((v) => INQUIRY_SERVICE_VALUES.indexOf(v) + 1)
    .filter((n) => n > 0);
}
const CORS_ORIGINS = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

// Persona enum order matches the module's enumMap {1:Corporate,2:Sponsor,3:Individual}.
// Facilio's v3 API uses the 1-based OPTION INDEX for enum fields (not the label).
const PERSONA_ORDER = ["Corporate", "Sponsor", "Individual"];
function personaIndex(persona) {
  const i = PERSONA_ORDER.indexOf(persona);
  return i >= 0 ? i + 1 : 1;
}

// Template module field link names (custom_questionnairetemplate).
const T = {
  persona: "persona_custom_questionnairetemplate",
  layer: "layer_custom_questionnairetemplate",
  version: "version_custom_questionnairetemplate",
  active: "isActive_custom_questionnairetemplate",
  questions: "questions_custom_questionnairetemplate",
};

// ── CORS ─────────────────────────────────────────────────────────────────────
// A localhost origin only ever exists on the developer's own machine and the
// browser sets Origin itself (a page can't spoof it), so reflecting ANY
// localhost/127.0.0.1 port is safe and saves chasing Vite's auto-incremented
// port. Non-localhost origins still must be in the CORS_ORIGIN allowlist — in
// production that's the real portal domain, and localhost never appears there.
function isLocalhostOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin ?? "");
}

function corsHeaders(reqOrigin) {
  const allowed = CORS_ORIGINS.includes(reqOrigin) || isLocalhostOrigin(reqOrigin);
  const allow = allowed ? reqOrigin : CORS_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// ── Facilio helper ───────────────────────────────────────────────────────────
async function facilioFetch(path, init) {
  // Facilio errors on a GET that carries a Content-Type header, so only set it
  // when the request actually has a body.
  const headers = { "x-api-key": FACILIO_API_KEY, ...(init?.headers ?? {}) };
  if (init?.body) headers["Content-Type"] = "application/json";
  const method = init?.method ?? "GET";

  let res;
  try {
    res = await fetch(`${FACILIO_BASE_URL}${path}`, { ...init, headers });
  } catch (err) {
    // Network/DNS/TLS failure — the request never reached Facilio.
    console.error(
      `[facilio] FETCH FAILED ${method} ${path}: ${err?.message ?? err}`
    );
    if (init?.body) console.error(`[facilio]   request body: ${init.body}`);
    throw err;
  }

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  // Log every non-2xx from Facilio with enough context to see WHY it failed.
  if (res.status >= 400) {
    console.error(`[facilio] ${res.status} ${method} ${path}`);
    if (init?.body) console.error(`[facilio]   request body: ${init.body}`);
    console.error(`[facilio]   response: ${text || "(empty)"}`);
  }

  return { status: res.status, body };
}

/** Random public inquiry code, unambiguous charset (no 0/O/1/I) — E-22. */
function generateInquiryCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i++)
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `INQ-2026-${suffix}`;
}

// ── GET /templates/active?persona=&layer= ─────────────────────────────────────
// Fetches the active Layer-N questionnaire template for a persona and reshapes
// it into { template_id, version, questions[] } for the portal's dynamic step.
async function getActiveTemplate(persona) {
  if (!FACILIO_API_KEY)
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };

  // The API-key list endpoint is `/api/v3/modules/{module}` (the UI's /view/all
  // needs session auth). Filter by persona server-side (operatorId 54 = enum is);
  // then keep only ACTIVE templates (layer is no longer part of the model).
  const filters = {
    [T.persona]: {
      operatorId: 54,
      value: [String(personaIndex(persona))],
      operatorLookupModule: null,
    },
    oneLevelLookup: {},
  };
  const qs = new URLSearchParams({
    filters: JSON.stringify(filters),
    perPage: "200",
  });
  const { status, body } = await facilioFetch(
    `/api/v3/modules/${TEMPLATE_MODULE}?${qs.toString()}`,
    { method: "GET" }
  );
  if (status >= 400) return { status, body };

  const list = unwrapList(body, TEMPLATE_MODULE);
  // Only active templates count; if several, the highest version wins.
  console.log('list', list);
  const rec = list
    .filter((r) => isActive(r[T.active]))
    .sort((a, b) => Number(b[T.version] ?? 0) - Number(a[T.version] ?? 0))[0];
  console.log('rec', rec);

  // No active template for this persona → empty question set (portal shows only
  // the fixed preferences, no error, no dynamic section).
  if (!rec)
    return { status: 200, body: { template_id: "", version: 0, questions: [] } };

  return {
    status: 200,
    body: {
      template_id: String(rec.id),
      version: Number(rec[T.version] ?? 1) || 1,
      questions: parseQuestions(rec[T.questions]),
    },
  };
}

/** Facilio may return the boolean as true, "true", or 1. */
function isActive(v) {
  return v === true || v === "true" || v === 1;
}

/** Pull the record array out of a Facilio v3 list response ({data:{<module>:[]}}). */
function unwrapList(body, moduleName) {
  const candidates = [body?.data?.[moduleName], body?.[moduleName], body?.data];
  for (const c of candidates) if (Array.isArray(c)) return c;
  return [];
}

/** Parse the stored questions JSON and normalize to the portal Question shape. */
function parseQuestions(raw) {
  let stored = [];
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) stored = parsed;
    } catch {
      /* malformed → no questions */
    }
  }
  return stored
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((q, i) => ({
      id: q.id ?? `q${i + 1}`,
      order: q.order ?? i + 1,
      // New records store a single `label`; older ones store label_en/label_ar.
      label_en: q.label_en ?? q.label ?? "",
      label_ar: q.label_ar ?? q.label ?? "",
      type: q.type ?? "text",
      options: Array.isArray(q.options) ? q.options : [],
      required: !!q.required,
      maps_to: q.maps_to ?? null,
    }));
}

// ── GET /room-types ─────────────────────────────────────────────────────────
// Room-type lookup options (custom_roomtype records) → [{id, name}] for the
// portal's Requirement-step multi-select.
async function getRoomTypes() {
  if (!FACILIO_API_KEY)
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };
  const { status, body } = await facilioFetch(
    `/api/v3/modules/${ROOMTYPE_MODULE}?perPage=200`,
    { method: "GET" }
  );
  if (status >= 400) return { status, body };
  const opts = unwrapList(body, ROOMTYPE_MODULE)
    .filter((r) => r?.id != null)
    .map((r) => ({ id: String(r.id), name: String(r.name ?? r.id) }));
  return { status: 200, body: opts };
}

// ── POST /inquiries ───────────────────────────────────────────────────────────
// Creates the Draft inquiry. Stores ONLY the details the portal collects onto
// the inquiry itself (no Client/Account record is created here — that happens
// later via the staff "Qualify" button script, facilio-scripts/). The gateway
// mints the public code.
async function createInquiry({ persona, name, company, mobile, email }) {
  if (!FACILIO_API_KEY)
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };

  const inquiryCode = generateInquiryCode();
  const data = {
    [IF.name]: name,
    [IF.code]: inquiryCode,
    [IF.persona]: personaIndex(persona),
    [IF.mobile]: mobile,
    [IF.email]: email,
  };
  // Persist the company/organisation on the inquiry when a field is configured.
  if (IF.company && company) data[IF.company] = company;

  const { status, body } = await facilioFetch(`/api/v3/modules/${INQUIRY_MODULE}`, {
    method: "POST",
    body: JSON.stringify({ data }),
  });
  if (status >= 400) return { status, body };

  // Facilio wraps the created record under data.<module> (array or object).
  const created = body?.data?.[INQUIRY_MODULE] ?? body?.[INQUIRY_MODULE] ?? body?.data;
  const rec = (Array.isArray(created) ? created[0] : created) ?? {};

  return {
    status: 200,
    body: {
      inquiry_id: String(rec.id ?? ""),
      inquiry_code: rec[IF.code] ?? inquiryCode,
    },
  };
}

// ── POST /inquiries/{id}/submit ────────────────────────────────────────────────
// PATCHes onto the inquiry (custom_inquiries), in ONE update:
//   • the fixed Requirement fields, AND
//   • the dynamic questionnaire — answers (JSON → multiline text) + the template
//     that was answered (lookup). Stored on the inquiry itself; no separate
//     custom_questionnaireresponse row.
async function submitInquiry(inquiryId, input) {
  if (!FACILIO_API_KEY)
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };

  const r = input?.requirement ?? {};
  const data = {};
  if (r.requested_beds != null) data[IF.beds] = Number(r.requested_beds);
  if (r.duration_months != null) data[IF.duration] = Number(r.duration_months);
  if (r.gender_mix) data[IF.gender] = JSON.stringify(r.gender_mix);
  const moveInMs = toEpochMs(r.move_in_date); // DATE_TIME field expects epoch ms
  if (moveInMs != null) data[IF.moveIn] = moveInMs;

  // Requirement extras (only when their fields are configured):
  //   room types → MULTI_LOOKUP (array of {id}); services → MULTI_ENUM (ids).
  if (IF.roomType) {
    const ids = (input?.room_type_ids ?? [])
      .map((id) => Number(id))
      .filter((n) => !Number.isNaN(n));
    if (ids.length) data[IF.roomType] = ids.map((id) => ({ id }));
  }
  if (IF.services) {
    const serviceIds = serviceValuesToIds(input?.services);
    if (serviceIds.length) data[IF.services] = serviceIds;
  }

  // Dynamic questionnaire → stored on the inquiry itself.
  const templateId = Number(input?.template_id);
  const answers = input?.answers ?? {};
  const hasAnswers = answers && Object.keys(answers).length > 0;
  if (templateId) data[IF.template] = { id: templateId };
  if (hasAnswers) data[IF.answers] = JSON.stringify(answers);

  // Facilio v3 partial update: PATCH /api/v3/modules/{module}/{id}.
  const { status, body } = await facilioFetch(
    `/api/v3/modules/${INQUIRY_MODULE}/${encodeURIComponent(inquiryId)}`,
    { method: "PATCH", body: JSON.stringify({ data }) }
  );
  if (status >= 400) return { status, body };

  const updated = body?.data?.[INQUIRY_MODULE] ?? body?.[INQUIRY_MODULE] ?? body?.data;
  const rec = (Array.isArray(updated) ? updated[0] : updated) ?? {};

  return {
    status: 200,
    body: { ok: true, inquiry_code: rec[IF.code] ?? "" },
  };
}

/** "YYYY-MM-DD" → epoch ms (UTC midnight); undefined if empty/invalid. */
function toEpochMs(dateStr) {
  if (!dateStr) return undefined;
  const t = Date.parse(dateStr);
  return Number.isNaN(t) ? undefined : t;
}

// ── Status lookup + detail ──────────────────────────────────────────────────────
// Field names come from the shared IF map above (single source of truth).
function personaLabel(idx) {
  return PERSONA_ORDER[Number(idx) - 1] ?? "Corporate";
}

/** Facilio "equals" filter clause (operatorId 3). */
function eq(value) {
  return { operatorId: 3, value: [String(value)] };
}

function toIso(ms) {
  const n = Number(ms);
  return n ? new Date(n).toISOString() : "";
}

// The inquiry record only carries moduleState.id (the name is NOT expanded even
// with fetchLookupPrimary). State rows live in the `ticketstatus` module, so we
// fetch id→displayName once and cache it, then keyword-map the name → public
// status. Keyword matching is resilient to exact wording; ORDER MATTERS
// (accept/reject before the generic "proposal").
function stageToPublic(name) {
  const s = String(name ?? "").toLowerCase();
  if (/reject|declin/.test(s)) return "declined";
  if (/accept|won/.test(s)) return "accepted";
  if (/proposal|offer|sent/.test(s)) return "offer";
  if (/qualif|review|assign/.test(s)) return "review";
  if (/lost|cancel|close|expire|disqualif/.test(s)) return "closed";
  if (/new|draft/.test(s)) return "received";
  return "received"; // unknown → safest neutral
}

let _stateNames = null; // { [id]: displayName }
async function loadStateNames() {
  if (_stateNames) return _stateNames;
  const { status, body } = await facilioFetch(
    `/api/v3/modules/ticketstatus?perPage=200`,
    { method: "GET" }
  );
  _stateNames = {};
  if (status < 400) {
    for (const s of body?.data?.ticketstatus ?? []) {
      _stateNames[s.id] = s.displayName ?? s.status ?? "";
    }
  }
  return _stateNames;
}

/** Resolve a record's public status from its moduleState.id. */
async function resolvePublicStatus(rec) {
  const id = rec?.moduleState?.id;
  if (!id) return "received";
  const names = await loadStateNames();
  return stageToPublic(names[id]);
}

/** Query custom_inquiries with an equals-filter object; returns matched records. */
async function findInquiries(filters) {
  const qs = new URLSearchParams({
    filters: JSON.stringify(filters),
    perPage: "50",
  });
  const { status, body } = await facilioFetch(
    `/api/v3/modules/${INQUIRY_MODULE}?${qs.toString()}`,
    { method: "GET" }
  );
  if (status >= 400) return { error: { status, body } };
  return { records: unwrapList(body, INQUIRY_MODULE) };
}

/** Raw record → portal StatusInquiry (list summary). */
function mapStatusInquiry(rec, status) {
  return {
    code: rec[IF.code] ?? "",
    beds: Number(rec[IF.beds] ?? 0),
    siteId: "", // site_preference not persisted yet
    roomType: "", // room_type_preference not persisted yet
    submittedAt: toIso(rec.sysCreatedTime),
    updatedAt: toIso(rec.sysModifiedTime),
    status,
  };
}

/** Raw record → portal InquiryDetail (read-only view). */
function mapInquiryDetail(rec, status) {
  let gender = { male: 0, female: 0 };
  try {
    if (rec[IF.gender]) gender = JSON.parse(rec[IF.gender]);
  } catch {
    /* leave zeros on malformed JSON */
  }
  const moveMs = Number(rec[IF.moveIn]);
  return {
    code: rec[IF.code] ?? "",
    status,
    submittedAt: toIso(rec.sysCreatedTime),
    updatedAt: toIso(rec.sysModifiedTime),
    persona: personaLabel(rec[IF.persona]),
    contact: {
      name: rec.name ?? "",
      mobile: rec[IF.mobile] ?? "",
      email: rec[IF.email] ?? "",
      preferred_language: "en", // not persisted yet
    },
    requirement: {
      requested_beds: Number(rec[IF.beds] ?? 0),
      gender_mix: gender,
      move_in_date: moveMs ? new Date(moveMs).toISOString().slice(0, 10) : "",
      duration_months: Number(rec[IF.duration] ?? 0),
    },
    requirement_extra: { room_types: [], services: [] }, // resolved labels TODO
    answers: [], // questionnaire response not persisted yet
  };
}

// POST /status/lookup — verify code + email match the same inquiry.
async function statusLookup(code, email) {
  if (!FACILIO_API_KEY)
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };
  const { records, error } = await findInquiries({
    [IF.email]: eq(email),
    [IF.code]: eq(code),
    oneLevelLookup: {},
  });
  if (error) return error;
  // Uniform generic error — identical for not-found vs mismatch (E-21).
  if (!records.length) return { status: 404, body: { error: "generic" } };
  const status = await resolvePublicStatus(records[0]);
  return { status: 200, body: [mapStatusInquiry(records[0], status)] };
}

// GET /inquiries/{code} — read-only detail (looked up by public code).
async function getInquiryByCode(code) {
  if (!FACILIO_API_KEY)
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };
  const { records, error } = await findInquiries({
    [IF.code]: eq(code),
    oneLevelLookup: {},
  });
  if (error) return error;
  if (!records.length) return { status: 404, body: { error: "generic" } };
  const status = await resolvePublicStatus(records[0]);
  return { status: 200, body: mapInquiryDetail(records[0], status) };
}

// ── Shared router ────────────────────────────────────────────────────────────
// Transport-agnostic: takes the parsed request, returns { status, headers, body }.
// Both the local dev HTTP server and the Lambda handler call this — one source
// of routing truth, so dev and prod behave identically.
async function route({ method, path, query, body, origin }) {
  const cors = corsHeaders(origin);
  const done = (status, resBody) => ({ status, headers: cors, body: resBody });

  try {
    if (method === "OPTIONS") return { status: 204, headers: cors, body: null };

    if (method === "GET" && path === "/templates/active") {
      const persona = query.persona ?? "Corporate";
      const { status, body: b } = await getActiveTemplate(persona);
      return done(status, b);
    }

    if (method === "GET" && path === "/room-types") {
      const { status, body: b } = await getRoomTypes();
      return done(status, b);
    }

    if (method === "POST" && path === "/inquiries") {
      const { persona, name, company, mobile, email } = body ?? {};
      if (!name || !mobile || !email)
        return done(400, { error: "name, mobile and email are required" });
      const { status, body: b } = await createInquiry({ persona, name, company, mobile, email });
      return done(status, b);
    }

    const submitMatch = path.match(/^\/inquiries\/([^/]+)\/submit$/);
    if (method === "POST" && submitMatch) {
      const { status, body: b } = await submitInquiry(
        decodeURIComponent(submitMatch[1]),
        body ?? {}
      );
      return done(status, b);
    }

    if (method === "POST" && path === "/status/lookup") {
      const { code, email } = body ?? {};
      if (!code || !email)
        return done(400, { error: "code and email are required" });
      const { status, body: b } = await statusLookup(String(code), String(email));
      return done(status, b);
    }

    const detailMatch = path.match(/^\/inquiries\/([^/]+)$/);
    if (method === "GET" && detailMatch) {
      const { status, body: b } = await getInquiryByCode(decodeURIComponent(detailMatch[1]));
      return done(status, b);
    }

    // Not wired yet (need their Facilio call shapes).
    if (method === "POST" && (path === "/status/otp/request" || path === "/status/otp/verify")) {
      return done(501, { error: "Not implemented yet in the gateway", route: `${method} ${path}` });
    }

    return done(404, { error: "Not found" });
  } catch (err) {
    console.error(`[gateway] ERROR ${method} ${path}: ${err?.message ?? err}`);
    if (err?.stack) console.error(err.stack);
    return done(400, { error: err?.message ?? "Bad request" });
  }
}

// ── Lambda entry point (Function URL / API Gateway HTTP API, payload v2) ──────
export async function handler(event) {
  const method = event?.requestContext?.http?.method ?? "GET";
  const path = event?.rawPath ?? "/";
  const query = event?.queryStringParameters ?? {};
  const origin = event?.headers?.origin ?? event?.headers?.Origin;

  let body = {};
  if (event?.body) {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        body: JSON.stringify({ error: "Invalid JSON body" }),
      };
    }
  }

  const res = await route({ method, path, query, body, origin });
  return {
    statusCode: res.status,
    headers: { "Content-Type": "application/json", ...(res.headers ?? {}) },
    body: res.body == null ? "" : JSON.stringify(res.body),
  };
}

// ── Local dev HTTP server ────────────────────────────────────────────────────
// Only runs when executed directly (node server.mjs). On Lambda the module is
// imported for its `handler` export, so AWS_LAMBDA_FUNCTION_NAME is set and we
// never bind a port.
function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error("Body too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let body = {};
    if (req.method === "POST") {
      try {
        body = await readJson(req);
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders(req.headers.origin) });
        return res.end(JSON.stringify({ error: err?.message ?? "Bad request" }));
      }
    }
    const q = Object.fromEntries(url.searchParams);
    const r = await route({
      method: req.method,
      path: url.pathname,
      query: q,
      body,
      origin: req.headers.origin,
    });
    res.writeHead(r.status, { "Content-Type": "application/json", ...(r.headers ?? {}) });
    res.end(r.body == null ? "" : JSON.stringify(r.body));
  });

  server.listen(PORT, () => {
    console.log(`[gateway] listening on http://localhost:${PORT}`);
    console.log(`[gateway] Facilio: ${FACILIO_BASE_URL}`);
    console.log(
      `[gateway] modules: inquiry=${INQUIRY_MODULE} template=${TEMPLATE_MODULE} roomtype=${ROOMTYPE_MODULE}`
    );
    console.log(
      `[gateway] inquiry fields: company=${IF.company || "(off)"} roomTypes=${
        IF.roomType || "(off)"
      } services=${IF.services || "(off)"}`
    );
    console.log(`[gateway] allowed origins: ${CORS_ORIGINS.join(", ")}`);
    console.log(`[gateway] routes: GET /templates/active · GET /room-types · POST /inquiries · POST /inquiries/{id}/submit · POST /status/lookup · GET /inquiries/{code} · (501) status/otp/*`);
    if (!FACILIO_API_KEY) console.warn("[gateway] WARNING: FACILIO_API_KEY is not set");
  });
}
