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
const INQUIRY_MODULE = process.env.FACILIO_INQUIRY_MODULE ?? "custom_inquiries";
const TEMPLATE_MODULE =
  process.env.FACILIO_TEMPLATE_MODULE ?? "custom_questionnairetemplate";
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
function corsHeaders(reqOrigin) {
  const allow = CORS_ORIGINS.includes(reqOrigin) ? reqOrigin : CORS_ORIGINS[0];
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
  const res = await fetch(`${FACILIO_BASE_URL}${path}`, { ...init, headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
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
async function getActiveTemplate(persona, layer) {
  if (!FACILIO_API_KEY)
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };

  // The API-key list endpoint is `/api/v3/modules/{module}` (the UI's /view/all
  // needs session auth). It returns { code, data: { <module>: [...] } }. We fetch
  // the module's records and filter for the active template server-side.
  const { status, body } = await facilioFetch(
    `/api/v3/modules/${TEMPLATE_MODULE}?perPage=200`,
    { method: "GET" }
  );
  if (status >= 400) return { status, body };

  const list = unwrapList(body, TEMPLATE_MODULE);
  const wantPersona = personaIndex(persona);
  const wantLayer = Number(layer);

  const matches = list.filter(
    (r) =>
      Number(r[T.persona]) === wantPersona && Number(r[T.layer]) === wantLayer
  );
  // Prefer the active one; if several, the highest version wins.
  const rec =
    matches
      .filter((r) => r[T.active] === true)
      .sort((a, b) => Number(b[T.version] ?? 0) - Number(a[T.version] ?? 0))[0] ??
    matches.sort((a, b) => Number(b[T.version] ?? 0) - Number(a[T.version] ?? 0))[0];

  // No template for this persona/layer → empty question set (portal shows only
  // the fixed preferences, no error).
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

// ── POST /inquiries ───────────────────────────────────────────────────────────
// Creates the Draft inquiry. Sends only the fields the portal collects, using
// the module's _custom_inquiries link names; the gateway mints the public code.
async function createInquiry({ persona, name, mobile, email }) {
  if (!FACILIO_API_KEY)
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };

  const inquiryCode = generateInquiryCode();
  const payload = {
    data: {
      name,
      inquiry_code_custom_inquiries: inquiryCode,
      persona_custom_inquiries: personaIndex(persona),
      mobile_custom_inquiries: mobile,
      email_custom_inquiries: email,
    },
  };

  const { status, body } = await facilioFetch(`/api/v3/modules/${INQUIRY_MODULE}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (status >= 400) return { status, body };

  // Facilio wraps the created record under data.<module> (array or object).
  const created = body?.data?.[INQUIRY_MODULE] ?? body?.[INQUIRY_MODULE] ?? body?.data;
  const rec = (Array.isArray(created) ? created[0] : created) ?? {};

  return {
    status: 200,
    body: {
      inquiry_id: String(rec.id ?? ""),
      inquiry_code: rec.inquiry_code_custom_inquiries ?? inquiryCode,
    },
  };
}

// ── HTTP plumbing ──────────────────────────────────────────────────────────────
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

function send(res, status, headers, body) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const cors = corsHeaders(req.headers.origin);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    // Preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }

    // GET /templates/active
    if (req.method === "GET" && path === "/templates/active") {
      const persona = url.searchParams.get("persona") ?? "Corporate";
      const layer = url.searchParams.get("layer") ?? "1";
      const { status, body } = await getActiveTemplate(persona, layer);
      return send(res, status, cors, body);
    }

    // POST /inquiries
    if (req.method === "POST" && path === "/inquiries") {
      const input = (await readJson(req)) ?? {};
      const { persona, name, mobile, email } = input;
      if (!name || !mobile || !email)
        return send(res, 400, cors, { error: "name, mobile and email are required" });
      const { status, body } = await createInquiry({ persona, name, mobile, email });
      return send(res, status, cors, body);
    }

    // Routes still needing their Facilio call shapes before they can be wired.
    const notWired =
      (req.method === "POST" && /^\/inquiries\/[^/]+\/submit$/.test(path)) ||
      (req.method === "POST" && path === "/status/lookup") ||
      (req.method === "POST" && path === "/status/otp/request") ||
      (req.method === "POST" && path === "/status/otp/verify");
    if (notWired) {
      return send(res, 501, cors, {
        error: "Not implemented yet in the gateway",
        route: `${req.method} ${path}`,
      });
    }

    send(res, 404, cors, { error: "Not found" });
  } catch (err) {
    send(res, 400, cors, { error: err?.message ?? "Bad request" });
  }
});

server.listen(PORT, () => {
  console.log(`[gateway] listening on http://localhost:${PORT}`);
  console.log(`[gateway] Facilio: ${FACILIO_BASE_URL}`);
  console.log(`[gateway] modules: inquiry=${INQUIRY_MODULE} template=${TEMPLATE_MODULE}`);
  console.log(`[gateway] allowed origins: ${CORS_ORIGINS.join(", ")}`);
  console.log(`[gateway] routes: GET /templates/active · POST /inquiries · (501) submit/status`);
  if (!FACILIO_API_KEY) console.warn("[gateway] WARNING: FACILIO_API_KEY is not set");
});
