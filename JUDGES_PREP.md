# Arth — Judges Prep Guide (read this before you walk in)

Everything here is checked against the actual code, not just the README.
Read Parts 1–3 to understand the project. Part 4 is the frontend in depth. Part 7 is the
question bank: practise saying those answers out loud.

---

## PART 1 — The 30-second pitch (learn this by heart)

> "A small farmer in Maharashtra wakes up and asks one question: *what should I do on my farm
> today?* The answer is spread across a weather app, mandi prices, a pesticide label he can't
> read, and government papers full of jargon. **Arth** puts it all on one screen, in Marathi,
> Hindi or English, on a cheap phone, and can read it aloud.
> It takes live weather, live mandi prices, 40 years of IMD rainfall and Soil Health Card data,
> and turns them into the 2–3 jobs for today. Gemma 4 reads photos of sick leaves, pesticide
> labels and documents. Our one safety rule: **the AI reads and explains, but plain tested code
> makes every decision that could hurt a farmer**, like a pesticide dose."

**Name:** *Arth* (अर्थ) means "meaning" and also "money/economy" — making sense of farming and
making money from it.

---

## PART 2 — The problem and the user

- **User:** a smallholder farmer in Maharashtra (Nashik is the example: onion, grapes, tomato).
  Cheap Android phone, patchy 2G/3G, may not read well, speaks Marathi.
- **Problems we solve:**
  1. When should I spray? (rain washes the spray off and wastes money)
  2. Where and when should I sell? (the nearest mandi isn't always the best once you count transport)
  3. What's wrong with my crop? (photo → disease → remedy)
  4. How much pesticide goes in my 15 L tank? (labels give doses per litre/acre, in English)
  5. What does this bank or government letter say? (plain-language summary and deadlines)
  6. Which schemes can I get? (PM-KISAN, PMFBY, KCC, and so on)
  7. What should I sow now? (the monsoon has shifted, so old sowing dates are wrong)

---

## PART 3 — What each screen does (the demo walkthrough)

| Screen | Route | What it does | Where the answer comes from |
|---|---|---|---|
| Login | `/login` | Dawn animation, Arth/अर्थ wordmark, tagline in 3 languages, **Google sign-in only** | Firebase Auth |
| Consent | `/consent` | Plain-language privacy consent before anything is stored | — |
| Onboarding | `/onboarding` | **6 questions**: language, name, place, crops, land, water. **Soil is never asked** | Location → district → soil |
| Home "Aaj Ka Kaam" | `/` | Sky right now, season progress, **the one top job** in big type, each crop's usual stage today, 4-day weather, price moves, read-aloud | `/brief` (weather + mandi + calendar rules, **no AI**, so it's fast) |
| Weather | `/weather` | Now + 7 days + advisories ("Don't spray tomorrow — 80% rain") | Open-Meteo + fixed thresholds |
| Mandi & Sell Smart | `/mandi` | Nearby APMC prices, 30-day trend chart, **sell now or wait** after transport cost | MSAMB / Agmarknet + math |
| Crop Doctor | `/doctor` | Leaf photo → disease, severity, organic and chemical remedies | Gemma 4 vision |
| Label Reader | `/label` | Pesticide label photo → **dose for this farmer's tank** | Gemma copies, Python calculates |
| Kagaz Samjho | `/kagaz` | Document photo → summary, deadlines, next steps; Aadhaar/PAN hidden | PII redaction + Gemma |
| Crop Calendar | `/calendar` | Year map, crops in field now, what can be sown today (days left) | IMD onset + crop stages |
| Schemes | `/schemes` | One question per screen → eligible schemes, reasons, documents; voice-fillable form | Rules engine (no AI) |
| Voice (mic) | everywhere | Ask anything by voice; it answers aloud and can open a screen | Gemma 4 native audio |
| Profile / Settings | `/profile`, `/settings` | Farm, district soil card, language, tank size, delete account | Profile + Soil Health Card |

**Escalation:** whenever the app isn't sure, it shows the **Kisan Call Centre, 1800-180-1551**
instead of guessing.

---

## PART 4 — FRONTEND IN DEPTH (your strongest area, judges will dig here)

### 4.1 The stack, and why we chose each piece

| Tech | Version | Why we picked it (say this) |
|---|---|---|
| **React** | 19 | Component model, huge ecosystem, the team knows it |
| **TypeScript** | strict mode | Catches bugs at build time; API types match the backend contract exactly (`src/lib/api/types.ts`) |
| **Vite** | 8 | Very fast dev server, small production builds, easy PWA plugin |
| **Tailwind CSS** | v4 | Design tokens in one place (`@theme` in `index.css`), no CSS files to maintain, small output |
| **react-router-dom** | 7 | Client-side routing, nested layouts, route guards |
| **TanStack Query** | 5 | Server-state cache: loading/error/retry/stale handling for free; no Redux needed |
| **react-i18next** | — | Three languages, a namespace per feature |
| **vite-plugin-pwa (Workbox)** | 2 | Installable app, offline caching, service worker |
| **Recharts** | 3 | 30-day price trend chart (loaded only on the Mandi screen) |
| **browser-image-compression** | 2 | Shrinks photos to ≤1024 px before upload (works on 2G) |
| **Firebase Auth** | 12 | Google sign-in; free, secure, no passwords for us to store |

**"Why no Redux / Zustand?"** → Almost all our state is *server* state (profile, brief,
prices). TanStack Query handles that with caching and retries. The little client state left
(language, read-aloud setting) is a small `useSyncExternalStore` store. Adding Redux would be
extra code for no gain.

**"Why a PWA and not a native app?"** → No Play Store install, works from a link, small
download, works offline, one codebase. It's still installable to the home screen (manifest +
icons + standalone display).

### 4.2 Folder structure (feature-based)

```
frontend/src/
├── main.tsx            entry: QueryClientProvider + RouterProvider + crash boundary
├── app/                router.tsx, Layout.tsx (phone frame), BottomNav, MicSlot
├── lib/
│   ├── api/client.ts   ONE typed fetch wrapper for every endpoint
│   ├── api/queries.ts  QueryClient config + shared hooks (useFarmer, useSaveFarmer)
│   ├── api/types.ts    TypeScript types = the API contract in docs/SPEC.md
│   ├── firebase.ts     lazy-loads Firebase
│   ├── session.ts      token-getter seam between auth and the API client
│   └── env.ts          reads VITE_* env vars
├── components/
│   ├── ui/             shared design system: Card, Button, Chip, BottomSheet, ImagePicker,
│   │                   Skeleton/ErrorState/EmptyState/EscalateCard, AiTag, Icon
│   └── voice/          useVoice (record), speech.ts (text-to-speech), MicButton
├── features/           one folder per screen, each with its own locales/{en,hi,mr}.json
│   auth/ onboarding/ brief/ weather/ mandi/ doctor/ label/ kagaz/ calendar/ schemes/ profile/
└── i18n/               i18next setup + common strings
```

**Why feature folders?** Each feature owns its screen, its sub-components and its
translations, so several people could build features in parallel without merge conflicts.
Shared pieces live only in `components/ui` and `lib`.

### 4.3 App start-up and routing (`app/router.tsx`)

- `main.tsx` renders `<StrictMode>` → `<Crash>` (an **error boundary**) →
  `<QueryClientProvider>` → `<RouterProvider>`.
- The **Crash boundary** shows a "Something went wrong / Reopen" screen in the user's language.
  It deliberately uses no router and no i18n, because those might be what crashed.
- **Code splitting:** every feature page is `lazy(() => import(...))` inside `<Suspense>`.
  Only the Login screen ships in the first bundle; other screens download when first opened.
  The service worker still precaches them, so they also work offline.
- Recharts goes into its own `charts` chunk (`manualChunks` in `vite.config.ts`).
- Three route groups:
  1. `/login`: public
  2. `/consent`, `/onboarding`: need sign-in, but no profile yet (`ProtectedRoute requireProfile={false}`)
  3. All main screens: need sign-in **and** a complete profile, inside `<Layout>` (nav + mic)
- Unknown path → redirect to `/`.

**The route guard (`ProtectedRoute.tsx`): learn this flow**
```
auth loading?             → splash screen (big "अर्थ" pulsing)
not signed in?            → /login
GET /farmer/me → 404      → /consent (or /onboarding if consent already given on this device)
profile has no consentAt  → /consent
onboardedVersion < 2      → /onboarding (we bump the version when the questions change)
otherwise                 → show the screen
```
On first profile load it also switches the app to the farmer's saved language.

**Phone frame (`Layout.tsx`):** on screens ≥500 px wide (a judge's laptop) the app is drawn
inside a 390×844 phone bezel. On a real phone the bezel is dropped and it fills the screen.
It uses a `ResizeObserver`.

### 4.4 Authentication flow (Firebase Google sign-in)

1. `firebase.ts` **lazy-loads** the Firebase SDK, which keeps it out of the first paint.
2. Login button → `signInWithPopup(GoogleAuthProvider)`.
   - **Interesting detail:** browsers block popups opened after an `await`. So we preload
     Firebase and open the popup *synchronously inside the click*. That fixed sign-in failing
     on slow networks.
3. `AuthProvider` listens to `onIdTokenChanged` and registers a **token getter** in
   `lib/session.ts`.
4. Every API call in `client.ts` asks that getter for a fresh token and sends
   `Authorization: Bearer <Firebase ID token>`. Firebase refreshes the 1-hour token itself.
5. **401 from the API → automatic sign-out** (`setUnauthorizedHandler`).
6. **Sign-out:** clears the TanStack cache, localStorage and sessionStorage (keeps only the
   language), then does a **full page reload** to `/login`. The reload drops the previous
   user's data from memory and avoids a Firebase re-login bug.
7. **Delete account:** `DELETE /farmer/me` first (server data goes while the token is still
   valid), then delete the Firebase user, then sign out.

**"Why does `session.ts` exist?"** → It's a seam. The API client doesn't import Firebase, and
auth doesn't know about fetch. You can test or swap either side alone.

### 4.5 The API client (`lib/api/client.ts`)

- One function, `request<T>(method, path, opts)`, used by every endpoint; it's typed with generics.
- **Timeouts:** an `AbortController`. AI calls get 20 s, the rest 15 s.
- **Errors:** an `ApiError` class with `status`, `code` and a `retryable` getter
  (network/timeout/429/5xx are retryable). The backend always sends
  `{ error: { code, message } }`.
- `credentials: 'omit'`: no cookies are ever sent, so there's no CSRF risk. Auth is the
  bearer token only.
- Multipart `FormData` for photos and audio, JSON for everything else.
- Base URL defaults to `/api`. In dev, Vite **proxies** `/api` to `localhost:8000`, so the
  browser sees one origin and there's no CORS in dev.

### 4.6 State and data fetching (TanStack Query, `lib/api/queries.ts`)

- `staleTime` 5 min, `gcTime` 30 min, no refetch on window focus (saves the farmer's data plan).
- **Smart retry:** never retry 400/401/403/404 (retrying won't fix them); otherwise retry twice.
- Query keys in one place (`qk.brief(lang)`, `qk.mandiPrices(...)`). The language is part of
  the key, so switching language refetches localized text.
- `useSaveFarmer`: after saving the profile it updates the cache and **invalidates everything
  else**, because the brief and prices depend on location and crops.
- **AI results use `gcTime: 0`**, so a diagnosis or document summary is dropped from memory
  the moment you leave the screen (privacy).
- `round2()`: coordinates are rounded to 2 decimals (~1 km) before they're sent anywhere.

### 4.7 Three languages (i18n)

- Marathi is the default (Nashik is Marathi-speaking). Then the browser language, then the saved choice.
- **Auto-discovered namespaces:** `import.meta.glob('../features/*/locales/*.json')` loads
  every feature's translation files at build time. A feature adds strings without touching
  shared files.
- `<html lang>` is updated on language change, which matters for screen readers and fonts.
- `rupees()` uses Indian grouping (₹1,23,456). Dates go through `Intl.DateTimeFormat` with
  **Latin digits** for legibility.
- **Fonts are self-hosted** (Tiro Devanagari for headings, Anek Devanagari for UI, Inter for
  numbers) with `unicode-range` subsets, so the browser downloads only the scripts a screen
  needs. They work offline and **no request goes to Google Fonts**.

### 4.8 Voice (input and output)

**Speaking to the app (`components/voice/useVoice.ts`):**
- `getUserMedia` with echo cancellation and noise suppression → `MediaRecorder` (it picks the
  best supported format: webm/opus, ogg or mp4, which is how Safari works too).
- Max **15 s**. Clips under 0.6 s or 800 bytes are rejected as "too short".
- States: `idle → recording → processing → idle/error/denied`.
- A `sessionRef` counter drops late answers from an old recording, so there are no race conditions.
- Mic tracks are released the moment recording stops.
- Audio is sent to `POST /ai/voice` with context `{screen, formFields}`.
- Answer: transcript + reply + intent (`navigate` / `question` / `fill_form`).
  - `navigate`: the app opens that screen after 1.8 s. Routes are **whitelisted** on the server
    and checked again on the client (`safeRoute` blocks `//evil.com` style redirects).
  - `fill_form`: fills the scheme application form. Voice values show as *unconfirmed* until
    the farmer taps a tick.

**The app speaking (`speech.ts`):**
- Browser `speechSynthesis`, running on the phone's own voice. **Nothing leaves the device.**
- Many phones have no Marathi voice → it **falls back to a Hindi voice** (same Devanagari script).
- Long text is split by sentence (including `।`), because some engines cut off long utterances.
- "Read answers aloud" is on by default. Each new AI result is spoken once, for farmers who can't read.

### 4.9 Camera and photos (`components/ui/ImagePicker.tsx`)

- Two buttons: **Camera** (`capture="environment"`, the back camera) and **Gallery**.
- Every photo is compressed to **≤1024 px, JPEG, ≤0.8 MB, in a web worker**. Uploads stay
  small on 2G and the re-encode **removes EXIF/GPS** metadata.
- The server strips EXIF again with Pillow (defence in depth).
- Object URLs are revoked on unmount, so memory doesn't leak.

### 4.10 Offline / PWA (`vite.config.ts`)

- App shell precached (js/css/html/png/svg).
- **API caching rules:**
  - `/brief`, `/weather`, `/mandi/prices`, `/farmer/me` → **NetworkFirst** (6 s timeout, then
    the cached copy, kept 3 days)
  - **`/ai/*` → NetworkOnly, never cached** (photos and documents are personal)
  - Fonts → CacheFirst for 1 year
- `registerType: 'autoUpdate'`: new versions install themselves.
- `sw.js` is served with `max-age=0`, so updates are never stuck behind a stale worker.

### 4.11 Design system and UX rules

- From the sister project **Rutu**: warm cream canvas, deep green `grow` = good/go,
  **orange `warn` is reserved for risk**, amber = wait/caution, red = label danger.
- **360 px first**, tap targets **≥48 px**, icons plus short text.
- **Every screen has 4 states:** loading (skeleton), error-with-retry, empty, escalate
  (`components/ui/states.tsx`).
- AI results carry a small **"Analyzed by Gemma 4"** tag (`AiTag`): we're open about where
  an answer came from.
- Login: CSS/SVG dawn with three hill layers and a rising sun. **Respects
  `prefers-reduced-motion`** (static if the user turned off animation).
- Accessibility: `aria-live` on loading and results, `aria-pressed` on toggles, `role="status"`,
  `inert` on forms while a request runs, labels on icon buttons.

### 4.12 Frontend security

- CSP in `public/_headers` and `customHttp.yml` (AWS Amplify hosting): `default-src 'self'`,
  scripts only from self, `frame-ancestors 'none'`.
- `X-Frame-Options: DENY` (no clickjacking), `nosniff`, strict referrer, HSTS.
- `Permissions-Policy`: camera/mic/geolocation only for our own origin.
- `npm run preview` sends the **same headers as production** (from `security-headers.json`), so
  CSP problems show up locally first.
- The only secrets in the frontend are the `VITE_FIREBASE_*` values, which are **public by
  design** (Firebase web config isn't secret; security comes from token verification on the server).
- React escapes all text by default. We never use `dangerouslySetInnerHTML`.

---

## PART 5 — Backend in brief (so you aren't stuck if asked)

- **FastAPI (Python 3.11+)** + **Pydantic v2** for validated request and response models.
- **AI:** **Gemma 4 E2B** (the small "effective 2B" multimodal version) running **locally via
  Ollama**. `app/llm.py` is the *only* file that talks to the model.
  - **Structured output:** every call sends a JSON schema (Ollama `format`), and the reply is
    validated by Pydantic. If it's invalid, it retries once with the error message attached.
  - Temperature 0.1 for extraction, `think: false`, a semaphore caps parallel calls at 2 (one
    laptop GPU), a warm-up at start-up, and `keep_alive` keeps the model loaded.
  - Prompts are plain text files in `app/prompts/`, readable and explainable.
- **Speech-to-text:** Gemma 4's own audio input (~0.5 s per clip once warm). Optional
  faster-whisper fallback. Audio is converted to 16 kHz WAV **in memory** with PyAV.
- **Deterministic engines (no AI):**
  - `dose.py`: label dose → per-tank dose. Uses the **lower end** of a range, and has
    plausibility limits (max 50 g or ml per litre). If anything is missing → **no dose**.
  - `mandi.py`: net = modal price × quantity − (distance × ₹2/quintal/km × quantity).
    Distance uses the haversine formula with market locations from Open-Meteo geocoding.
    Trend = **least-squares slope** over 7 days. **WAIT only if prices rise >0.5%/day AND the
    crop keeps** (tomato and grapes always SELL_NOW).
  - `weather.py`: rain >60% → don't spray (≥80% = danger); wind >20 km/h → don't spray;
    >38 °C → irrigate in the evening.
  - `schemes.py`: rules engine over `schemes.json`, checked in order, the first match decides,
    every result has a reason. Validated at load time.
  - `calendar.py` / `farm.py`: kharif sowing windows move with the district's monsoon onset
    (IMD 1985–2025, **Theil–Sen trend + Mann–Kendall significance**, computed offline in
    `scripts/build_districts.py`).
- **Auth:** verifies the Firebase RS256 token: Google public keys (JWKS, cached in memory and
  on disk), `aud`, `iss`, `exp`, `iat`, `auth_time`, `alg` pinned to RS256. **The user ID
  comes only from the token's `sub`.**
- **Database:** SQLite (WAL). **Profile encrypted with AES-256-GCM**, rows keyed by
  **HMAC(uid)** (never the raw UID), and the uid hash is used as associated data so an
  encrypted row can't be copied to another user. History is redacted, with a **30-day TTL** and
  a purge loop every 6 h.
- **PII redaction (`pii.py`):** Aadhaar (with the **Verhoeff checksum**), PAN, IFSC, bank
  account (keyword-based, including Marathi/Hindi words), phone, email; Devanagari digits are
  normalized first. Even a 12-digit number that *fails* the checksum is still masked, because a
  misread digit must not leak the other eleven.
- **Middleware:** token-bucket rate limit (10 rps, burst 20), body size cap (also for chunked
  uploads), security headers, `no-store` on personal responses, and access logs **without query
  strings** (they contain coordinates).
- **Optional cloud sync:** anonymous scheme interest (scheme, district, crop, land range), sent
  only if the farmer opts in, to an AWS Lambda → DynamoDB. The Lambda has **PutItem only**, so a
  leaked secret can't read data.
- **Tests:** ~200 pytest cases (162 test functions + parametrized cases), no network or model
  needed (fakes in `conftest.py`).

---

## PART 6 — Privacy and safety: the 8 lines to remember

1. Google sign-in only; the user ID comes **only from the verified token**.
2. **Photos and voice are never stored**: processed in memory, EXIF/GPS stripped, discarded.
3. **PII is redacted** before anything reaches Gemma, a log, a response or storage.
4. **Gemma never sees** name, email, phone, user ID or address.
5. Location is **rounded to ~1 km** on both the phone and the server.
6. Profiles are **encrypted** (AES-256-GCM); history expires after **30 days**.
7. **Delete my data** removes the profile, history and the Google account link.
8. The service worker **never caches `/ai/*`**; strict CSP; rate limiting.

**Safety rule:** "The model reads and explains; tested code decides." Doses, sell/wait, scheme
eligibility, sowing dates and spray advisories are all plain Python. Low confidence (<0.6) →
Kisan Call Centre. **We never guess a pesticide dose.**

---

## PART 7 — QUESTION BANK (practise these out loud)

### General / product

**Q: Who is this for, and why would they use it over WhatsApp groups or existing apps?**
A: Smallholder farmers in Maharashtra. Existing apps do one thing each (weather OR prices) and
are mostly in English. Arth combines them into *one decision for today*, in Marathi, by voice,
on a cheap phone, and it works offline.

**Q: What's novel?**
A: Three things: (1) sowing windows move with *your district's* monsoon shift, from 40 years of
IMD data; (2) the AI never makes the risky decision, code does, with tests; (3) everything is
known from location, so onboarding is only 6 questions and soil is never asked.

**Q: Is the data real or a demo?**
A: Real. No demo mode, no mock API, no sample data. Live Open-Meteo weather and live MSAMB /
Agmarknet prices. (Be honest: scheme eligibility is *simplified* from public guidelines and
farmers are told to verify on the official portal.)

**Q: How do you make money / is it sustainable?**
A: (Suggested answer.) Free for farmers. Possible routes: FPO/cooperative partnerships,
government extension departments (Krishi Vibhag), and anonymous, opt-in aggregate demand data
(which schemes and crops farmers in a district care about). That's exactly what the opt-in
cloud sync collects, with no personal data.

**Q: How would you scale beyond Maharashtra?**
A: The district data is built by a script (`build_districts.py`) from national datasets (IMD
gridded rainfall and Soil Health Card cover all of India). Add the districts, a mandi source and
languages (i18n is namespaced; adding a JSON file per language is enough). Crop stage calendars
need agronomist review per state.

### Frontend technical

**Q: Why React + Vite and not Next.js?**
A: We don't need server rendering: the app sits behind a login and is an offline PWA. A
static SPA is simpler to host (Amplify/CDN), caches fully in a service worker, and Vite builds
fast.

**Q: How do you manage state?**
A: Server state in TanStack Query (cache, retries, stale times, invalidation). Tiny client
state (language, read-aloud) in a `useSyncExternalStore` store. No Redux needed.

**Q: How does offline work?**
A: Workbox service worker. The app shell is precached. Brief, weather, prices and profile are
NetworkFirst with a 6 s timeout, then the cached copy (up to 3 days). AI endpoints are
NetworkOnly and never cached, for privacy.

**Q: How do you keep the app fast on a cheap phone / 2G?**
A: Route-level code splitting (lazy pages), Recharts in its own chunk, Firebase lazy-loaded,
font subsets with `unicode-range`, images compressed to ≤1024 px in a web worker before upload,
no refetch on focus, and a 5-minute stale time.

**Q: How does the frontend authenticate requests?**
A: Firebase gives a 1-hour ID token. `AuthProvider` registers a getter, the API client adds
`Authorization: Bearer`, Firebase auto-refreshes it, and a 401 signs the user out. No cookies
(`credentials: 'omit'`), so no CSRF.

**Q: Isn't the Firebase API key in the frontend a security hole?**
A: No. Firebase web config is public by design. It identifies the project, it isn't a password.
Security comes from the backend verifying the token's RS256 signature, audience and issuer.

**Q: How do you handle errors?**
A: An `ApiError` class with a `retryable` flag; every screen has loading, error-with-retry,
empty and escalate states; plus a top-level React error boundary so a crash never shows a blank page.

**Q: How do you protect the voice-navigation feature from abuse?**
A: Routes come from a whitelist on the server, and the client checks again (`safeRoute`): it
only accepts paths starting with a single `/`, with no `//` or backslash, so it can't redirect
off-site.

**Q: How is i18n structured?**
A: i18next with a namespace per feature, auto-loaded by `import.meta.glob`. Marathi by default,
saved in localStorage and in the profile. `<html lang>` is updated; Indian number grouping;
Latin digits.

**Q: What about accessibility?**
A: 48 px tap targets, `aria-live` regions for results, labels on icon buttons,
`prefers-reduced-motion` respected, read-aloud in the farmer's language, big type for the main job.

**Q: How does text-to-speech work in Marathi when phones lack a Marathi voice?**
A: We fall back to a Hindi voice (same Devanagari script), then to the browser default. Text is
split into sentences so long answers aren't cut off.

**Q: How do you test the frontend?**
A: Honest answer: TypeScript strict mode + ESLint + a production build as the check, plus
manual testing at 360/414 px. Automated tests are on the backend (~200). *Next step:*
Playwright end-to-end tests.

**Q: Why TypeScript strict?**
A: The API types mirror the backend contract, so if a field changes, the build breaks instead
of the farmer's screen.

**Q: How did you make the login animation?**
A: Pure CSS + inline SVG: a linear-gradient sky, a radial-gradient sun with a glow, three SVG
hill paths with furrow lines, and a tagline crossfading between languages every 3.2 s. All of
it is static under reduced motion. No image or animation library.

### AI

**Q: Why Gemma 4 and why E2B?**
A: Open-weight (Apache 2.0), multimodal (vision + native audio), small enough to run on a
laptop GPU (~3 GB VRAM), so it can run **locally/privately** without sending farmer photos to
a cloud API.

**Q: How do you stop the model from hallucinating a dose?**
A: The model only *copies* printed values (dose number, unit, basis) into a strict JSON
schema; Python does the math. It must first say whether the photo is readable (`photo_problem`).
If anything is missing, implausible, or confidence <0.6 → no dose, Kisan Call Centre instead.

**Q: How do you get reliable JSON from a small model?**
A: Ollama structured outputs with the Pydantic JSON schema, Pydantic validation, and one retry
with the validation errors fed back. Fields are length-limited. We also turn "null" strings
into real nulls.

**Q: What if the model is down or slow?**
A: AI calls time out at 18 s on the server and 20 s on the client, with a friendly retry. Sell
advice still returns the numbers without the AI explanation. The home screen uses no AI at
all, so it always loads.

**Q: What does the AI actually do vs your code?**
A: The AI does *perception* (reads a leaf, label, document, voice) and *explanation* (writes
the sell reasoning in Marathi). Code does every *decision*.

### Security / privacy

**Q: Where are photos stored?**
A: Nowhere. They're processed in memory and discarded. EXIF/GPS is stripped on the phone and
again on the server.

**Q: How is Aadhaar detected?**
A: A regex for 12 digits starting 2–9, plus the **Verhoeff checksum** UIDAI uses. It also
handles Devanagari digits. A failed checksum is still masked.

**Q: What if someone steals your database file?**
A: Profiles are AES-256-GCM encrypted with a key stored outside the DB, and rows are keyed by
HMAC of the user ID, so the file alone reveals nothing.

**Q: Can a user's data be deleted?**
A: Yes. Delete account removes the profile, history and the outbox in one transaction, then
the Firebase account, then clears the device.

---

## PART 8 — Weak spots: know these BEFORE a judge finds them

Be honest if asked; honesty scores better than bluffing. **Fix the doc ones before judging if you can.**

1. **README vs reality:** the license table says "Google Gemma 2B" but the code uses
   **Gemma 4 E2B** (`gemma4:e2b`). It also says PII redaction is "client-side"; it actually
   runs **on the backend** (`backend/app/pii.py`), before the model. Fix those lines.
2. **SPEC.md says** "Gemma 4 via the Gemini API", "API Gateway JWT authorizer", "Gemini key in
   SSM" and "CloudWatch". The code runs Gemma **locally through Ollama** with **FastAPI**
   verifying tokens itself. If asked: "the spec described the cloud design; for the hackathon
   we run Gemma locally for privacy, and the backend does the same JWT checks itself."
3. **`toolCalls` on the Home brief** is in the API, but no screen shows it yet (the spec says
   it would be on About).
4. **Transport cost is an estimate** (₹2 per quintal per km), not a real quote. The app labels it
   as an estimate.
5. **Soil is district-level odds**, not the farmer's field. The app says so and points to a free
   Soil Health Card test.
6. **Scheme rules are simplified** (`schemes.json` says so); farmers must verify on the official site.
7. **No automated frontend tests** (backend has ~200).
8. `vite.config.ts` still has a comment about a "mock resolver" and ignores
   `mockServiceWorker.js`, left over from the removed demo mode. The CSP still allows
   `api.open-meteo.com` / `api.data.gov.in` from the browser, although the browser no longer
   calls them directly. Harmless, but tidy it up if you have time.
9. **The model needs a GPU machine running Ollama**; it isn't on the phone. "On-device" means
   *your own server/laptop*, not the phone.

---

## PART 9 — Numbers cheat sheet

| Thing | Number |
|---|---|
| Languages | 3 (Marathi default, Hindi, English) |
| Onboarding questions | 6 (was 14) |
| Districts covered | 36 (all of Maharashtra) |
| Rainfall history | IMD 1985–2025 (40 years), 0.25° grid |
| Image limit | ≤1024 px on the phone, ≤5 MB on the server |
| Voice limit | 15 s |
| AI timeout | 18 s server / 20 s client |
| Confidence threshold | 0.6 (below → Kisan Call Centre) |
| Spray rules | rain >60% (≥80% danger), wind >20 km/h, heat >38 °C |
| WAIT rule | price rising >0.5%/day and the crop isn't perishable |
| Location precision | 2 decimals ≈ 1 km |
| History TTL | 30 days |
| Rate limit | 10 req/s, burst 20 |
| Backend tests | ~200 (162 functions + parametrized) |
| Kisan Call Centre | 1800-180-1551 |

---

## PART 10 — Suggested 3-minute demo script

1. **Login** (10 s): point out the dawn animation, the 3-language tagline and the trust chips.
2. **Home** (40 s): "the top job today", the sky card, crop stages, then tap **read aloud**.
3. **Label Reader** (40 s): photo of a label → the dose for a 15 L tank. *Say the safety rule.*
4. **Mandi → Sell Smart** (30 s): enter quantity → best market *after transport*, sell or wait.
5. **Voice** (30 s): tap the mic, ask in Marathi "कांद्याचा भाव काय?" (what's the onion price?) → it answers and opens Mandi.
6. **Calendar** (20 s): the year map, and the monsoon shift moving the kharif dates.
7. **Close** (10 s): privacy (photos never stored, delete anytime) + "AI reads, code decides."

**Before the demo:** start Ollama and the backend 5 minutes early (the model warm-up loads
Gemma; the first request after a cold start is slow). Keep a clear label photo and a leaf
photo ready on the phone. Have the Kisan Call Centre fallback ready to show if the AI is slow:
that's a feature, not a failure.
