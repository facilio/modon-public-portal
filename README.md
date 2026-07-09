# MODON Public Portal

The public, applicant-facing web app for MODON's accommodation leasing.
People use it to **submit a housing inquiry** and to **track the status** of
inquiries they've already submitted. Built with Vite + React + TypeScript.

---

## Prerequisites

- Node.js 18+ and npm

---

## Run the web app

```bash
cd modon-public-portal
npm install
npm run dev
```

Open http://localhost:5173.

By default the app runs on built-in **mock data** — no backend needed. To make
it talk to the real backend, add this line to `modon-public-portal/.env` and
restart `npm run dev`:

```
VITE_BFF_BASE_URL=http://localhost:8787
```

---

## Run the gateway (only for the real backend)

The gateway is a small server that forwards the app's requests to Facilio and
keeps the Facilio API key off the browser. Start it before the web app when you
want real data.

```bash
cd modon-public-portal/gateway
cp .env.example .env      # then fill in FACILIO_API_KEY
npm start
```

It listens on http://localhost:8787.
