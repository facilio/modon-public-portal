// ─────────────────────────────────────────────────────────────────────────────
// MODON Public Portal — thin BFF / gateway (LOCAL DEV runner)
//
// Why this exists: the browser cannot call Facilio directly (CORS). This tiny
// server runs on localhost, accepts requests from the portal origin, and forwards
// them to Facilio server-side with the x-api-key attached here — so the key never
// ships in the browser bundle.
//
// This is the SAME role the AWS Lambda BFF will play in production. The core
// `createInquiry` logic below is transport-agnostic on purpose; porting to a
// Lambda handler is just: read body → call createInquiry() → return {statusCode,
// headers, body}. Zero npm deps — uses Node's built-in http + global fetch, and
// loads .env via `node --env-file=.env` (see package.json start script).
// ─────────────────────────────────────────────────────────────────────────────

import { createServer } from "node:http";

const PORT = process.env.PORT ?? 8787;
const FACILIO_BASE_URL =
  process.env.FACILIO_BASE_URL ?? "https://app.facilio.co.ae/AccommodationManagement";
const FACILIO_API_KEY = process.env.FACILIO_API_KEY;
const INQUIRY_MODULE = process.env.FACILIO_INQUIRY_MODULE ?? "custom_inquiries";
// Comma-separated list of allowed browser origins.
const CORS_ORIGINS = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

/** Resolve the CORS origin header value for a given request origin. */
function corsOrigin(reqOrigin) {
  if (reqOrigin && CORS_ORIGINS.includes(reqOrigin)) return reqOrigin;
  return CORS_ORIGINS[0];
}

function corsHeaders(reqOrigin) {
  return {
    "Access-Control-Allow-Origin": corsOrigin(reqOrigin),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Core, transport-agnostic action: create an Inquiry in Facilio.
 * Returns { status, body } where body is the (parsed) Facilio response.
 */
async function createInquiry({ name, mobile, email }) {
  if (!FACILIO_API_KEY) {
    return { status: 500, body: { error: "Gateway missing FACILIO_API_KEY" } };
  }

  const payload = {
    data: {
      name,
      mobile_custom_inquiries: mobile,
      email_custom_inquiries: email,
      stage: "NEW", 
      questionnaire: "Draft",
    },
  };

  const url = `${FACILIO_BASE_URL}/api/v3/modules/${INQUIRY_MODULE}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": FACILIO_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

/** Read and JSON-parse a request body stream. */
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
  const origin = req.headers.origin;
  const cors = corsHeaders(origin);

  // Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  console.log('hello');
  if (req.method === "POST" && req.url === "/inquiries") {
    try {
      const input = await readJson(req);
      console.log('input', input);
      const { name, mobile, email } = input ?? {};
      if (!name || !mobile || !email) {
        return send(res, 400, cors, { error: "name, mobile and email are required" });
      }
      const { status, body } = await createInquiry({ name, mobile, email });
      return send(res, status, cors, body);
    } catch (err) {
      return send(res, 400, cors, { error: err?.message ?? "Bad request" });
    }
  }

  send(res, 404, cors, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`[gateway] listening on http://localhost:${PORT}`);
  console.log(`[gateway] forwarding to ${FACILIO_BASE_URL}/api/v3/modules/${INQUIRY_MODULE}`);
  console.log(`[gateway] allowed origins: ${CORS_ORIGINS.join(", ")}`);
  if (!FACILIO_API_KEY) console.warn("[gateway] WARNING: FACILIO_API_KEY is not set");
});
