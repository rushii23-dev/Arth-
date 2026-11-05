# Arth backend

TypeScript API for Arth, built for Google Cloud: Hono on Cloud Run, Firestore for data,
Firebase Auth for sign-in, Gemini API (Gemma 4) for the AI routes.
It serves the API contract in `docs/SPEC.md` §3, so the frontend works unchanged.

## Run locally

```bash
cp .env.example .env   # then fill in ARTH_FIREBASE_PROJECT_ID and GEMINI_API_KEY
npm install
npm run dev            # http://localhost:8000, the frontend's Vite proxy points here
npm test
```

`ARTH_STORE=memory` keeps data in memory (lost on restart); `firestore` uses Google Cloud.

## Layout

| Path | What |
|---|---|
| `src/index.ts` | Server entry: config, Firebase Admin, store |
| `src/app.ts` | Routes, CORS, security headers, error shape, request logs |
| `src/auth.ts` | Firebase ID-token check; the user ID comes only from the token |
| `src/schemas.ts` | zod schemas mirroring `frontend/src/lib/api/types.ts` |
| `src/store/` | `Store` interface with memory and Firestore versions |
| `src/routes/` | One file per API area |
| `src/services/` | Weather, mandi, sell advice, seasons, brief, AI (prompts + checks), Gemini client, PII redaction |
| `src/data/` | Districts (coordinates, Marathi names), crops (Agmarknet names, en/hi/mr), crop-doctor conditions + their hi/mr translations |
| `scripts/translate-conditions.ts` | Re-generates `conditions.{hi,mr}.json` after the English is edited; review and commit the result |
| `src/lib/` | IST dates and the en/hi/mr messages |

## Status

| Endpoint | Status |
|---|---|
| `GET /health` | done |
| `GET/PUT/DELETE /farmer/me` | done (soil type defaults to black until `/soil` lands) |
| `GET /weather` | done: Open-Meteo (no key), 30-min cache, rain/wind/heat/heavy-rain advisories in en/hi/mr |
| `GET /brief` | done: weather and price actions, price alerts, sowing nudge, season progress; crop stages come with the calendar |
| `GET /mandi/prices`, `POST /mandi/sell-advice` | done: Agmarknet via data.gov.in, 3-hour cache that keeps the last good prices; needs a personal data.gov.in key (the public sample key returns only 10 rows) |
| `POST /ai/crop-doctor` | done: Gemma 4 only **picks** one of the checked problems in `src/data/conditions.ts` (47 across the 10 crops, or "unknown"); the farmer reads that fixed advice, in en/hi/mr from committed translations. No sampling (temperature 0, top-1, fixed seed) and the same photo is answered from a hash cache, so the answer does not change. Unsure or unknown escalates to the Kisan Call Centre |
| `POST /ai/label-reader`, `/ai/explain-document` | done: Gemma 4 (`gemma-4-26b-a4b-it`) on photos sent inline, never stored; dose scaled in code from the printed label only; PII redacted; low confidence escalates |
| `POST /ai/voice` | done: `ARTH_AUDIO_MODEL` (default `gemini-2.5-flash`) since hosted Gemma 4 lists no audio input; screens and form fields checked against the app |
| `/calendar`, `/soil`, `/schemes/*` | to build |
