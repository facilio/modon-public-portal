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
// Beds-per-room on a room type → the occupancy label ("8 in 1").
const ROOMTYPE_BEDS_FIELD = "number_of_beds_custom_roomtype";
// Landing-page catalogs: services master + clusters (a "cluster" is the system
// zone module; building count comes from building records' cluster lookup).
const SERVICES_MODULE = process.env.FACILIO_SERVICES_MODULE ?? "custom_services_1";
// The grouping enum ON custom_services_1 (1=Accommodation 2=Primary 3=Additional
// 4=Penalty). Only Primary/Additional services are offered on the inquiry.
const SERVICE_GROUP_FIELD = "type_custom_services_1";
const SERVICE_GROUP_PRIMARY = 2;
const SERVICE_GROUP_ADDITIONAL = 3;
// Rate cards — offered as count rows under a service (mirrors the console form).
const RATECARD_MODULE = process.env.FACILIO_RATECARD_MODULE ?? "custom_ratecard";
const RATECARD_TYPE_FIELD = "card_type_custom_ratecard_1"; // lookup → custom_services_1
const RATECARD_ACTIVE_STATE = Number(process.env.FACILIO_RATECARD_ACTIVE_STATE ?? 162121);
// Facilio file-upload endpoint (API-key REST). UNVERIFIED against the live host —
// the exact path isn't in the public docs (the SDK's uploadFile() returns
// { fileId }). Override via env if the default 404s.
const FACILIO_UPLOAD_PATH = process.env.FACILIO_UPLOAD_PATH ?? "/api/v3/files";
const FACILIO_UPLOAD_FIELD = process.env.FACILIO_UPLOAD_FIELD ?? "file";
const CLUSTER_MODULE = process.env.FACILIO_CLUSTER_MODULE ?? "zone";
const BUILDING_MODULE = process.env.FACILIO_BUILDING_MODULE ?? "building";
// Building's cluster lookup field (→ zone/cluster). From the console's model.
const BUILDING_CLUSTER_FIELD = "zoneId";
// "Who is this for" — the client-type ENUM on the standard Clients module.
const CLIENT_STD_MODULE = process.env.FACILIO_CLIENT_MODULE ?? "client";
const CLIENT_TYPE_FIELD = process.env.FACILIO_CLIENT_TYPE_FIELD ?? "clienttype_client";
// Safe fallback if the live enum meta can't be read (keeps the page working).
const CLIENT_TYPE_FALLBACK = [
  { id: "1", name: "Company" },
  { id: "2", name: "Agency" },
];

// ── custom_inquiries field link names — SINGLE SOURCE OF TRUTH ───────────────
// Every custom_inquiries column the gateway reads or writes lives here, as plain
// literals from the module meta. Field names are code, not per-deployment config
// (unlike module names / URL / key, which stay in env). Rename in ONE place.
// Kept in lock-step with the console's inquiries/facilioApi.ts `IF` map — both
// apps write the SAME custom_inquiries columns, so the shapes must agree or a
// portal-created inquiry won't read/autofill correctly in the console (and vice
// versa). Verified against that map.
const IF = {
  // identity / contact
  name: "name", // AUTO general title ("Accommodation Inquiry — <company> · N beds")
  contactName: "contact_name_custom_inquiries", // the applicant/contact person's name
  code: "inquiry_code_custom_inquiries",
  persona: "persona_custom_inquiries",
  mobile: "mobile_custom_inquiries",
  email: "email_custom_inquiries",
  company: "company_name_custom_inquiries",
  tradeLicenseNumber: "trade_license_number_custom_inquiries", // TEXT
  // Uploaded documents — FILE fields, written as `<field>Id`.
  vatCertificate: "vat_certificate_custom_inquiries",
  tradeLicense: "trade_license_custom_inquiries",
  // requirement
  beds: "requested_beds_custom_inquiries", // total = Σ bedspaces
  duration: "duration_months_custom_inquiries", // auto-derived from move-in → move-out
  moveIn: "move_in_date_custom_inquiries", // "Date of Mobilization (Check-in)"
  moveOut: "move_out_date_custom_inquiries", // "Move-out Date"
  roomLines: "room_lines_custom_inquiries", // JSON [{kind,roomTypeId?,roomType?,description?,bedspaces}]
  serviceLines: "service_lines_custom_inquiries", // JSON structured services (replaces the old MULTI_ENUM)
  // Legacy (read of old records only; NEVER written now):
  //   services_custom_inquiries (MULTI_ENUM), gender_mix_custom_inquiries, room_type_custom_inquiries
  services: "services_custom_inquiries",
  // questionnaire
  template: "questionnaire_template_custom_inquiries",
  answers: "questionnaire_answers_custom_inquiries",
};

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
  clientType: "clienttype_custom_questionnairetemplate", // ENUM {1:Company,2:Agency}
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

// ── POST /uploads ─────────────────────────────────────────────────────────────
// File-upload proxy for the public form's document fields. The browser sends
// JSON { filename, contentType, dataBase64 } (base64 avoids inbound multipart
// parsing in this zero-dep server); we forward it to Facilio as multipart via
// the global FormData/Blob (Node 18+) and return the { fileId } the submit then
// writes to the FILE field. NOTE: FACILIO_UPLOAD_PATH is UNVERIFIED — override
// via env if it 404s.
async function uploadFacilioFile({ filename, contentType, dataBase64 } = {}) {
  if (!FACILIO_API_KEY)
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };
  if (!dataBase64) return { status: 400, body: { error: "file data required" } };

  let buf;
  try {
    buf = Buffer.from(String(dataBase64), "base64");
  } catch {
    return { status: 400, body: { error: "invalid base64" } };
  }

  const form = new FormData();
  const blob = new Blob([buf], { type: contentType || "application/octet-stream" });
  form.append(FACILIO_UPLOAD_FIELD, blob, filename || "upload");

  let res;
  try {
    res = await fetch(`${FACILIO_BASE_URL}${FACILIO_UPLOAD_PATH}`, {
      method: "POST",
      headers: { "x-api-key": FACILIO_API_KEY }, // let fetch set the multipart boundary
      body: form,
    });
  } catch (err) {
    console.error(`[upload] FETCH FAILED ${FACILIO_UPLOAD_PATH}: ${err?.message ?? err}`);
    return { status: 502, body: { error: "upload failed" } };
  }

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (res.status >= 400) {
    console.error(`[upload] ${res.status} ${FACILIO_UPLOAD_PATH}: ${text || "(empty)"}`);
    return { status: res.status, body };
  }

  // Defensively pull the file id out of common Facilio response shapes.
  const fileId =
    body?.fileId ?? body?.id ?? body?.data?.fileId ?? body?.data?.id ?? null;
  return { status: 200, body: { fileId: fileId != null ? Number(fileId) : null } };
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
// Fetches the active questionnaire template for a CLIENT TYPE (1=Company,
// 2=Agency — the clienttype enum index) and reshapes it into
// { template_id, version, questions[] } for the portal's dynamic step.
async function getActiveTemplate(clientTypeIndex) {
  if (!FACILIO_API_KEY)
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };

  // The API-key list endpoint is `/api/v3/modules/{module}` (the UI's /view/all
  // needs session auth). Filter by client type server-side (operatorId 54 =
  // enum is); then keep only ACTIVE templates.
  const idx = Number(clientTypeIndex) || 1;
  const filters = {
    [T.clientType]: {
      operatorId: 54,
      value: [String(idx)],
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
  const rec = list
    .filter((r) => isActive(r[T.active]))
    .sort((a, b) => Number(b[T.version] ?? 0) - Number(a[T.version] ?? 0))[0];

  // No active template for this client type → empty question set (portal shows
  // no dynamic section, no error).
  if (!rec)
    return { status: 200, body: { template_id: "", version: 0, questions: [] } };

  // The Questions field is Rich Text (LARGE_TEXT), which Facilio does NOT inline
  // in list responses — only on a single-record fetch. The list above gives us
  // the id/version; re-fetch the full record to actually read the questions.
  let questionsRaw = rec[T.questions];
  const { status: recStatus, body: recBody } = await facilioFetch(
    `/api/v3/modules/${TEMPLATE_MODULE}/${rec.id}`,
    { method: "GET" }
  );
  if (recStatus < 400) {
    let full = recBody?.data?.[TEMPLATE_MODULE] ?? recBody?.[TEMPLATE_MODULE];
    if (Array.isArray(full)) full = full[0];
    if (full && full[T.questions] != null) questionsRaw = full[T.questions];
  }

  return {
    status: 200,
    body: {
      template_id: String(rec.id),
      version: Number(rec[T.version] ?? 1) || 1,
      questions: parseQuestions(questionsRaw),
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
// Room-type master records (custom_roomtype) → matrix rows for the Requirement
// step: [{id, name, bedsPerRoom, occupancy}]. Occupancy ("8 in 1") is derived
// from number_of_beds. Mirrors the console's fetchRoomTypeOptions.
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
    .map((r) => {
      const beds = Number(r[ROOMTYPE_BEDS_FIELD]) || null;
      return {
        id: String(r.id),
        name: String(r.name ?? r.id),
        bedsPerRoom: beds,
        occupancy: beds ? `${beds} in 1` : "",
      };
    });
  return { status: 200, body: opts };
}

// ── GET /services ────────────────────────────────────────────────────────────
// Service master catalog (custom_services_1) → [{id, name}] for the landing
// "What's included" section.
async function getServices() {
  if (!FACILIO_API_KEY)
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };
  const { status, body } = await facilioFetch(
    `/api/v3/modules/${SERVICES_MODULE}?perPage=200`,
    { method: "GET" }
  );
  if (status >= 400) return { status, body };
  const opts = unwrapList(body, SERVICES_MODULE)
    .filter((r) => r?.id != null)
    .map((r) => ({ id: String(r.id), name: String(r.name ?? r.id) }));
  return { status: 200, body: opts };
}

// ── GET /inquiry-services ─────────────────────────────────────────────────────
// Structured services for the Requirement step, mirroring the console's
// fetchInquiryServices: every custom_services_1 record in the Primary (2) or
// Additional (3) group, each carrying its ACTIVE rate cards (custom_ratecard,
// moduleState = RATECARD_ACTIVE_STATE, card_type lookup → the service). A
// service with rate cards expands to count rows; one with none is a boolean
// toggle. → [{ serviceId, serviceName, group, rateCards:[{id,name}] }].
async function getInquiryServices() {
  if (!FACILIO_API_KEY) return { status: 200, body: [] };
  try {
    // 1) Catalog — services grouped by type_custom_services_1.
    const { status: cStatus, body: cBody } = await facilioFetch(
      `/api/v3/modules/${SERVICES_MODULE}?perPage=200`,
      { method: "GET" }
    );
    if (cStatus >= 400) return { status: 200, body: [] };
    const catalog = unwrapList(cBody, SERVICES_MODULE)
      .filter((r) => r?.id != null)
      .map((r) => ({
        id: String(r.id),
        name: String(r.name ?? r.id),
        group: Number(refId(r[SERVICE_GROUP_FIELD])) || 0,
      }))
      .filter((s) => s.group === SERVICE_GROUP_PRIMARY || s.group === SERVICE_GROUP_ADDITIONAL);

    // 2) Active rate cards, grouped by their service (card_type lookup).
    const cardsByService = new Map();
    const { status: rStatus, body: rBody } = await facilioFetch(
      `/api/v3/modules/${RATECARD_MODULE}?perPage=500`,
      { method: "GET" }
    );
    if (rStatus < 400) {
      for (const r of unwrapList(rBody, RATECARD_MODULE)) {
        if (Number(refId(r.moduleState)) !== RATECARD_ACTIVE_STATE) continue;
        const svcId = refId(r[RATECARD_TYPE_FIELD]);
        if (svcId == null) continue;
        const key = String(svcId);
        const list = cardsByService.get(key) ?? [];
        list.push({ id: String(r.id), name: String(r.name ?? r.id) });
        cardsByService.set(key, list);
      }
    }

    const out = catalog.map((c) => ({
      serviceId: c.id,
      serviceName: c.name,
      group: c.group,
      rateCards: cardsByService.get(c.id) ?? [],
    }));
    return { status: 200, body: out };
  } catch (err) {
    console.error(`[inquiry-services] read failed: ${err?.message ?? err}`);
  }
  return { status: 200, body: [] }; // never block the wizard
}

/** A lookup value may be an { id } object or a raw id — pull the id either way. */
function refId(v) {
  if (v == null) return null;
  return typeof v === "object" ? v.id ?? null : v;
}

// ── GET /client-types ────────────────────────────────────────────────────────
// The "who is this for" options = the client module's clienttype_client ENUM.
// Reads live field meta; falls back to Company/Agency so the landing never breaks.
async function getClientTypes() {
  if (!FACILIO_API_KEY)
    return { status: 200, body: CLIENT_TYPE_FALLBACK };
  try {
    const { status, body } = await facilioFetch(
      `/api/module/meta?moduleName=${encodeURIComponent(CLIENT_STD_MODULE)}&optimized=true`,
      { method: "GET" }
    );
    if (status < 400) {
      // Locate the fields array wherever the meta response nests it.
      const fields =
        body?.meta?.fields ?? body?.data?.fields ?? body?.fields ??
        body?.module?.fields ?? [];
      const field = fields.find((f) => f?.name === CLIENT_TYPE_FIELD);
      // Prefer the values[] array; else enumMap {index:label}.
      let opts = [];
      if (Array.isArray(field?.values)) {
        opts = field.values
          .filter((v) => v?.value)
          .map((v) => ({ id: String(v.index ?? v.id ?? ""), name: String(v.value) }));
      } else if (field?.enumMap && typeof field.enumMap === "object") {
        opts = Object.entries(field.enumMap).map(([k, v]) => ({ id: String(k), name: String(v) }));
      }
      if (opts.length) return { status: 200, body: opts };
    }
  } catch (err) {
    console.error(`[client-types] meta read failed: ${err?.message ?? err}`);
  }
  return { status: 200, body: CLIENT_TYPE_FALLBACK }; // never block the landing
}

// ── GET /clusters ────────────────────────────────────────────────────────────
// The first 4 clusters (system `zone` module) → [{id, name, buildingCount}].
// Building count = number of building records whose cluster lookup points here.
async function getClusters() {
  if (!FACILIO_API_KEY)
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };

  const clustersRes = await facilioFetch(
    `/api/v3/modules/${CLUSTER_MODULE}?perPage=200`,
    { method: "GET" }
  );
  if (clustersRes.status >= 400) return clustersRes;
  const clusters = unwrapList(clustersRes.body, CLUSTER_MODULE)
    .filter((r) => r?.id != null)
    .slice(0, 4);

  // Count buildings per cluster (best-effort — don't fail the endpoint on this).
  const counts = {};
  const buildingsRes = await facilioFetch(
    `/api/v3/modules/${BUILDING_MODULE}?perPage=500`,
    { method: "GET" }
  );
  if (buildingsRes.status < 400) {
    for (const b of unwrapList(buildingsRes.body, BUILDING_MODULE)) {
      const cid = refId(b[BUILDING_CLUSTER_FIELD]);
      if (cid != null) counts[String(cid)] = (counts[String(cid)] ?? 0) + 1;
    }
  }

  const out = clusters.map((c) => ({
    id: String(c.id),
    name: String(c.name ?? c.id),
    buildingCount: counts[String(c.id)] ?? 0,
  }));
  return { status: 200, body: out };
}

/** Auto "general" record title — mirrors the console's generalInquiryName so
 *  `name` is a readable title while the person's name lives in contact_name. */
function generalInquiryName(company, contactName, totalBeds) {
  const label = (company || "").trim() || (contactName || "").trim();
  const beds = totalBeds > 0 ? ` · ${totalBeds} beds` : "";
  return label ? `Accommodation Inquiry — ${label}${beds}` : `Accommodation Inquiry${beds}`;
}

/** Clean accommodation rows → storage JSON + Σ bedspaces (mirrors the console). */
function buildAccommodationJson(rows) {
  const clean = (rows ?? [])
    .filter((a) => (Number(a?.bedspaces) || 0) > 0)
    .map((a) =>
      a.kind === "CUSTOM"
        ? { kind: "CUSTOM", description: String(a.description ?? ""), bedspaces: Number(a.bedspaces) || 0 }
        : {
            kind: "ROOM_TYPE",
            roomTypeId: String(a.roomTypeId ?? ""),
            roomType: String(a.roomType ?? ""),
            bedspaces: Number(a.bedspaces) || 0,
          }
    );
  const total = clean.reduce((n, a) => n + a.bedspaces, 0);
  return { json: JSON.stringify(clean), total };
}

/** Clean service blocks → storage JSON — enabled only, blank lines dropped. */
function buildServiceLinesJson(blocks) {
  const clean = (blocks ?? [])
    .filter((s) => s?.enabled)
    .map((s) => ({
      serviceId: String(s.serviceId ?? ""),
      serviceName: String(s.serviceName ?? ""),
      enabled: true,
      lines: (s.lines ?? [])
        .filter((l) => (Number(l?.quantity) || 0) > 0 || (l?.kind === "CUSTOM" && !!l?.description))
        .map((l) =>
          l.kind === "CUSTOM"
            ? { kind: "CUSTOM", description: String(l.description ?? ""), quantity: l.quantity == null || l.quantity === "" ? null : Number(l.quantity) || 0 }
            : {
                kind: "RATE_CARD",
                rateCardEntryId: String(l.rateCardEntryId ?? ""),
                rateCardName: String(l.rateCardName ?? ""),
                quantity: l.quantity == null || l.quantity === "" ? null : Number(l.quantity) || 0,
              }
        ),
    }));
  return JSON.stringify(clean);
}

// ── POST /inquiries ───────────────────────────────────────────────────────────
// Creates the Draft inquiry with the client/contact details (no Client/Account
// record — that's the staff "Qualify" script). The gateway mints the public
// code. `name` is the auto title; the applicant's name lives in contact_name.
async function createInquiry({ persona, name, contactName, company, mobile, email }) {
  if (!FACILIO_API_KEY)
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };

  const person = contactName || name || ""; // tolerate the old `name` key
  const inquiryCode = generateInquiryCode();
  const data = {
    [IF.contactName]: person,
    [IF.name]: generalInquiryName(company, person, 0),
    [IF.code]: inquiryCode,
    [IF.persona]: personaIndex(persona),
    [IF.mobile]: mobile,
    [IF.email]: email,
  };
  if (company) data[IF.company] = company;

  const { status, body } = await facilioFetch(`/api/v3/modules/${INQUIRY_MODULE}`, {
    method: "POST",
    body: JSON.stringify({ data }),
  });
  if (status >= 400) return { status, body };

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
// PATCHes the full STRUCTURED requirement onto the inquiry in ONE update — the
// same shape the console form writes (kept in lock-step): structured
// accommodation + service_lines JSON, move-in/move-out/auto-duration, trade
// licence number, uploaded document file ids, and the questionnaire. Also
// rewrites `name` with the bed total.
async function submitInquiry(inquiryId, input) {
  if (!FACILIO_API_KEY)
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };

  const r = input?.requirement ?? {};
  const data = {};

  // Dates — DATE_TIME fields expect epoch ms. Duration is auto-derived upstream.
  const moveInMs = toEpochMs(r.move_in_date);
  if (moveInMs != null) data[IF.moveIn] = moveInMs;
  const moveOutMs = toEpochMs(r.move_out_date);
  if (moveOutMs != null) data[IF.moveOut] = moveOutMs;
  if (r.duration_months != null) data[IF.duration] = Number(r.duration_months) || 0;

  // Structured accommodation → JSON; requested_beds = Σ bedspaces.
  const { json: accJson, total } = buildAccommodationJson(input?.accommodation);
  data[IF.roomLines] = accJson;
  if (total) data[IF.beds] = total;

  // Structured services → JSON (always written so clearing services persists).
  data[IF.serviceLines] = buildServiceLinesJson(input?.services);

  // Rewrite the auto title with the bed total (contact/company come from create).
  data[IF.name] = generalInquiryName(input?.company, input?.contact_name, total);

  // Trade licence number + uploaded document file ids (FILE → `<field>Id`).
  if (input?.trade_license_number) data[IF.tradeLicenseNumber] = String(input.trade_license_number);
  if (input?.vat_certificate_file_id != null) data[`${IF.vatCertificate}Id`] = Number(input.vat_certificate_file_id);
  if (input?.trade_license_file_id != null) data[`${IF.tradeLicense}Id`] = Number(input.trade_license_file_id);

  // Dynamic questionnaire.
  const templateId = Number(input?.template_id);
  const answers = input?.answers ?? {};
  if (templateId) data[IF.template] = { id: templateId };
  if (answers && Object.keys(answers).length > 0) data[IF.answers] = JSON.stringify(answers);

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
  if (/publish|qualif|review|assign|process/.test(s)) return "review";
  if (/lost|cancel|close|expire|disqualif/.test(s)) return "closed";
  if (/new|draft/.test(s)) return "received";
  return "received"; // unknown → safest neutral
}

// EDITABILITY is decided by the RAW state name, NOT the coarse public status —
// stageToPublic() defaults unknown states to "received", so keying "editable"
// off it would wrongly treat any unrecognized state (e.g. "Published") as a
// draft. Only an explicit draft/New state is editable on the portal; everything
// else (published, under review, …) and any unknown/unresolved state → locked.
const DRAFT_STATE_TOKENS = (process.env.FACILIO_INQUIRY_DRAFT_STATES ?? "new,draft")
  .split(",")
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);
function isDraftStateName(name) {
  const s = String(name ?? "").trim().toLowerCase();
  if (!s) return false; // no/unresolved state → NOT editable (safe default)
  return DRAFT_STATE_TOKENS.some((tok) => s === tok || s.includes(tok));
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

/** A record's raw state displayName. Prefers the name inlined on moduleState
 *  (displayName/status/name); falls back to the ticketstatus id→name lookup.
 *  "" if unresolved. */
async function resolveStateName(rec) {
  const st = rec?.moduleState;
  if (st && typeof st === "object") {
    const inline = st.displayName ?? st.status ?? st.name;
    if (inline) return String(inline);
    if (st.id) {
      const names = await loadStateNames();
      if (names[st.id]) return names[st.id];
    }
  }
  return "";
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
  let roomLines = [];
  try {
    const raw = rec[IF.roomLines];
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      roomLines = parsed.map((l) => ({
        roomType: String(l?.roomType ?? ""),
        beds: Number(l?.beds) || 0,
      }));
    }
  } catch {
    /* malformed JSON → no lines */
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
      move_in_date: moveMs ? new Date(moveMs).toISOString().slice(0, 10) : "",
      duration_months: Number(rec[IF.duration] ?? 0),
    },
    requirement_extra: { room_lines: roomLines, services: [] }, // service labels TODO
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

// ── GET /inquiries/{code}/edit ────────────────────────────────────────────────
// Full EDITABLE payload for the portal edit-via-link flow (admin creates the
// record on a call, sends the client `…/inquiry?code=INQ-…`). Unlike the
// read-only detail, this keeps the raw ids the wizard needs to re-select
// (roomTypeId, service enum ids, template id) and parses the stored
// questionnaire answers. `editable` is true only while the inquiry is still in
// its draft (New) state — the portal locks editing once staff move it forward.

/** Parse a LARGE_TEXT JSON field → array (tolerant of stringified / already-array). */
function toJsonArray(v) {
  let arr = v;
  if (typeof v === "string" && v.trim()) {
    try { arr = JSON.parse(v); } catch { return []; }
  }
  return Array.isArray(arr) ? arr : [];
}

/** room_lines JSON → structured accommodation entries (mirrors the console). */
function parseAccommodation(v) {
  return toJsonArray(v)
    .map((l) => {
      const o = l ?? {};
      const kind = o.kind === "CUSTOM" ? "CUSTOM" : "ROOM_TYPE";
      return {
        kind,
        roomTypeId: o.roomTypeId != null ? String(o.roomTypeId) : "",
        roomType: String(o.roomType ?? ""),
        description: String(o.description ?? ""),
        bedspaces: Number(o.bedspaces ?? o.beds) || 0, // tolerate legacy `beds`
      };
    })
    .filter((l) => l.bedspaces > 0);
}

/** service_lines JSON → structured service requirements (mirrors the console). */
function parseServiceRequirements(v) {
  return toJsonArray(v).map((s) => {
    const o = s ?? {};
    const lines = (Array.isArray(o.lines) ? o.lines : []).map((l) => {
      const lo = l ?? {};
      const kind = lo.kind === "CUSTOM" ? "CUSTOM" : "RATE_CARD";
      const q = lo.quantity;
      return {
        kind,
        rateCardEntryId: lo.rateCardEntryId != null ? String(lo.rateCardEntryId) : "",
        rateCardName: String(lo.rateCardName ?? ""),
        description: String(lo.description ?? ""),
        quantity: q == null || q === "" ? null : Number(q) || 0,
      };
    });
    return {
      serviceId: o.serviceId != null ? String(o.serviceId) : "",
      serviceName: String(o.serviceName ?? ""),
      enabled: o.enabled === true,
      lines,
    };
  });
}

/** Uploaded document off a FILE field — id on `<field>Id`, hydrated object may
 *  carry a url + name. Null when nothing attached (mirrors the console docInfo). */
function docInfo(rec, field) {
  const doc = {};
  const directId = rec[`${field}Id`];
  if (directId != null && !Number.isNaN(Number(directId))) doc.fileId = Number(directId);
  const raw = rec[field];
  if (raw && typeof raw === "object") {
    const nested = raw.file && typeof raw.file === "object" ? raw.file : {};
    const id = raw.fileId ?? raw.id ?? nested.fileId ?? nested.id;
    if (doc.fileId == null && id != null && !Number.isNaN(Number(id))) doc.fileId = Number(id);
    const url = raw.url ?? raw.downloadUrl ?? raw.fileUrl ?? raw.previewUrl ?? nested.url ?? nested.downloadUrl;
    if (typeof url === "string" && url) doc.url = url;
    const name = raw.fileName ?? raw.name ?? raw.originalFileName ?? nested.fileName ?? nested.name;
    if (typeof name === "string" && name) doc.name = name;
  }
  return doc.fileId != null || doc.url != null ? doc : null;
}

/** Raw record → editable payload. Client/contact fields are display-only; the
 *  requirement is the full structured shape for autopopulation. `editable` is
 *  computed by the caller from the RAW state name (draft-only). */
function mapInquiryForEdit(rec, status, editable) {
  // Questionnaire answers — a JSON object keyed by question id.
  let answers = {};
  try {
    const raw = rec[IF.answers];
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) answers = parsed;
  } catch {
    /* malformed JSON → no answers */
  }

  const moveInMs = Number(rec[IF.moveIn]);
  const moveOutMs = Number(rec[IF.moveOut]);
  const personaIdx = Number(rec[IF.persona]) || 1;
  const tplId = refId(rec[IF.template]);

  return {
    inquiry_id: String(rec.id ?? ""),
    inquiry_code: rec[IF.code] ?? "",
    // Only the draft/New state is editable (see isDraftStateName) — NOT keyed off
    // the coarse public status, which defaults unknown states to "received".
    editable: !!editable,
    status,
    // clientTypeId is index-aligned with persona (1=Company/Corporate, 2=Agency/Sponsor).
    clientTypeId: String(personaIdx),
    contact: {
      fullName: rec[IF.contactName] || rec[IF.name] || "",
      company: rec[IF.company] || "",
      mobile: rec[IF.mobile] || "",
      email: rec[IF.email] || "",
    },
    trade_license_number: rec[IF.tradeLicenseNumber] || "",
    requirement: {
      moveIn: moveInMs ? new Date(moveInMs).toISOString().slice(0, 10) : "",
      moveOut: moveOutMs ? new Date(moveOutMs).toISOString().slice(0, 10) : "",
      duration: rec[IF.duration] != null ? String(rec[IF.duration]) : "",
    },
    accommodation: parseAccommodation(rec[IF.roomLines]),
    services: parseServiceRequirements(rec[IF.serviceLines]),
    vat_certificate: docInfo(rec, IF.vatCertificate),
    trade_license: docInfo(rec, IF.tradeLicense),
    template_id: tplId != null ? String(tplId) : "",
    answers,
  };
}

async function getInquiryForEdit(code) {
  if (!FACILIO_API_KEY)
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };
  const { records, error } = await findInquiries({
    [IF.code]: eq(code),
    oneLevelLookup: {},
  });
  if (error) return error;
  if (!records.length) return { status: 404, body: { error: "generic" } };

  const listRec = records[0];
  // Resolve the raw state name ONCE → public status (display) + editability
  // (draft-only). Editability must NOT be inferred from the public status.
  const stateName = await resolveStateName(listRec);
  const status = stageToPublic(stateName);
  const editable = isDraftStateName(stateName);

  // room_lines / questionnaire_answers are LARGE_TEXT, and services is a
  // MULTI_ENUM — none are inlined in LIST responses, only on a single-record
  // fetch. Re-fetch by id to actually read them (same two-step as templates).
  let rec = listRec;
  const { status: recStatus, body: recBody } = await facilioFetch(
    `/api/v3/modules/${INQUIRY_MODULE}/${listRec.id}`,
    { method: "GET" }
  );
  if (recStatus < 400) {
    let full = recBody?.data?.[INQUIRY_MODULE] ?? recBody?.[INQUIRY_MODULE] ?? recBody?.data;
    if (Array.isArray(full)) full = full[0];
    if (full) rec = { ...listRec, ...full };
  }

  return { status: 200, body: mapInquiryForEdit(rec, status, editable) };
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
      const clientType = query.clientType ?? "1";
      const { status, body: b } = await getActiveTemplate(clientType);
      return done(status, b);
    }

    if (method === "GET" && path === "/room-types") {
      const { status, body: b } = await getRoomTypes();
      return done(status, b);
    }

    if (method === "GET" && path === "/services") {
      const { status, body: b } = await getServices();
      return done(status, b);
    }

    if (method === "GET" && path === "/inquiry-services") {
      const { status, body: b } = await getInquiryServices();
      return done(status, b);
    }

    if (method === "GET" && path === "/clusters") {
      const { status, body: b } = await getClusters();
      return done(status, b);
    }

    if (method === "GET" && path === "/client-types") {
      const { status, body: b } = await getClientTypes();
      return done(status, b);
    }

    if (method === "POST" && path === "/inquiries") {
      const { persona, name, contactName, company, mobile, email } = body ?? {};
      const person = contactName || name;
      if (!person || !mobile || !email)
        return done(400, { error: "contactName, mobile and email are required" });
      const { status, body: b } = await createInquiry({ persona, contactName: person, company, mobile, email });
      return done(status, b);
    }

    if (method === "POST" && path === "/uploads") {
      const { status, body: b } = await uploadFacilioFile(body ?? {});
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

    const editMatch = path.match(/^\/inquiries\/([^/]+)\/edit$/);
    if (method === "GET" && editMatch) {
      const { status, body: b } = await getInquiryForEdit(
        decodeURIComponent(editMatch[1])
      );
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
      // Larger cap so base64-encoded document uploads (POST /uploads) fit.
      if (data.length > 20_000_000) reject(new Error("Body too large"));
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
      `[gateway] inquiry fields: company=${IF.company} roomLines=${IF.roomLines} services=${IF.services}`
    );
    console.log(`[gateway] allowed origins: ${CORS_ORIGINS.join(", ")}`);
    console.log(`[gateway] routes: GET /templates/active · GET /room-types · GET /services · GET /inquiry-services · GET /clusters · GET /client-types · POST /inquiries · POST /inquiries/{id}/submit · POST /uploads · POST /status/lookup · GET /inquiries/{code}/edit · GET /inquiries/{code} · (501) status/otp/*`);
    if (!FACILIO_API_KEY) console.warn("[gateway] WARNING: FACILIO_API_KEY is not set");
  });
}
