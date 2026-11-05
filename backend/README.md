# Arth backend

TypeScript API for Arth, built for Google Cloud: Hono on Cloud Run, Firestore for data,
Firebase Auth for sign-in, Gemini API (Gemma 4) for the AI routes.
It serves the API contract in `docs/SPEC.md` §3, so the frontend works unchanged.

## Run locally

```bash
cp .env.example .env   # then fill in ARTH_FIREBASE_PROJECT_ID
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
| `src/services/` | Weather, seasons, brief logic |
| `src/lib/` | IST dates and the en/hi/mr messages |

## Status

| Endpoint | Status |
|---|---|
| `GET /health` | done |
| `GET/PUT/DELETE /farmer/me` | done (soil type defaults to black until `/soil` lands) |
| `GET /weather` | done: Open-Meteo (no key), 30-min cache, rain/wind/heat/heavy-rain advisories in en/hi/mr |
| `GET /brief` | done: weather actions, sowing nudge, season progress; price alerts and crop stages come with mandi and calendar |
| `/mandi/*`, `/ai/*`, `/calendar`, `/soil`, `/schemes/*` | to build |
