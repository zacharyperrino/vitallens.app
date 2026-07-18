# Frontend (`src/`)

## Pages (`src/pages/`)

| File | Route | Purpose |
|---|---|---|
| `auth.js` | `#/auth` | Sign in / sign up (name, DOB, email, password, consent checkbox). Signup requires email confirmation. |
| `consent-gate.js` | (interstitial) | "Before you continue" — blocks the app until the current versions of ToS / Privacy / health-data / AI-processing consents are accepted; writes `user_consents` rows. |
| `onboarding.js` | `#/onboarding` | First-run flow gated by `profiles.onboarding_completed`: baseline (age/sex/height/weight/activity) → calls `POST /api/health-profile/calculate-targets` → shows BMR/TDEE/macros → optional allergies, conditions, dietary restrictions, goals, medications note → marks complete. |
| `dashboard.js` | `#/` | Health-score ring, steps card (reads `habits.steps`, "Tap to log" when empty), Oura card, quick actions, today's nutrition, recent activity. |
| `food-scanner.js` | `#/food-scanner` | Meal photo scan pipeline UI (camera → barcode-first gate → GPT-4o vision → portion/label correction → log). Also meal-memory quick logging and scan history. |
| `body-scanner.js` | `#/body-scanner` | Wellness photo check-ins (eye/skin/nail/tongue modes; wellness-only framing post-hardening). |
| `stool-scanner.js` | `#/stool-scanner` | Bristol-type gut check-in scan. |
| `hygiene-scanner.js` | `#/hygiene-scanner` | Personal-care product scan → ingredient concern levels (via Open Beauty Facts + additive analyzer). |
| `health-input.js` | `#/health-input` | Manual logging tabs: labs, exercise, sleep, habits (incl. water glasses, stress, mood, **steps**). |
| `health-chat.js` | `#/health-chat` | AI copilot chat (RAG over the user's `health_events`). |
| `analytics.js` | `#/analytics` | Charts + correlation/prediction engine results. |
| `eastern-medicine.js` | `#/eastern-medicine` | TCM/Ayurveda wellness profiling (tongue observation etc.). |
| `product-results.js` | `#/product-results` | Barcode-scan product detail view. |
| `profile.js` | `#/profile` | Profile + targets editing (shares constants with onboarding via `profile-shared.js`), integrations, billing, data export. |
| `step-details.js` | `#/step-details` | Steps detail page. |
| `legal.js` | `#/legal/*` | In-app ToS and Privacy Policy pages rendered from `legal/*.md` drafts. |

## Libraries (`src/lib/`)

- `supabase.js` — Supabase client (public anon key; RLS-protected).
- `db.js` — all direct table helpers (`profile`, `meals`, `dailyNutrition`,
  `sleepLog`, `exerciseLog`, `habits.logToday/getToday` (upsert on
  `user_id,date`; includes `steps`), `bodyScans`, water, wearables…). Each write
  also calls `ingestEvent()` so the event lands in `health_events` for RAG.

## Services (`src/services/`)

- `foodScanApi.js` — client half of the meal-scan pipeline; index-preserving
  batch nutrition lookup (see 05-algorithms).
- `visionApi.js` — wraps `POST /api/vision/*` calls (base64 image upload).
- `nutritionApi.js` — nutrition lookups via the API.

## Utils (`src/utils/`)

| File | What it is |
|---|---|
| `api.js` | `apiFetch` — attaches Bearer token, base URL from `src/config.js` (`VITE_API_BASE`). |
| `esc.js` | HTML-escaper used at every innerHTML interpolation of user/AI strings (XSS seal). |
| `toast.js` | Single shared `showToast` (uses `textContent` — XSS-safe). |
| `consent.js` | Consent status check + document versions (drives the consent gate). |
| `health-score.js` | Composite health-score algorithm (see 05-algorithms) + insight generator. |
| `charts.js` | `createRingProgress`, `createLineChart` — inline-SVG chart builders. |
| `profile-shared.js` | Shared `CONDITIONS`, `GOAL_OPTIONS`, unit converters (in↔cm, lb↔kg). |
| `camera-system.js` | getUserMedia capture + downscale/compress for scan uploads. |
| `biomarker-engine.js`, `food-analyzer.js`, `stool-analyzer.js`, `product-scanner.js` | Client-side glue for the respective scanners. |
| `eastern-medicine-data.js` | Static TCM/Ayurveda reference data. |
| `oura.js`, `strava.js`, `apple-health.js` | Wearable integration stubs (Oura flagged Off until real OAuth creds). |
| `analytics-events.js` | `trackEvent` wrapper; PostHog loads itself only when `VITE_POSTHOG_KEY` is set. |

## Design system

Tokens in `src/styles/variables.css` (quiet-luxury light theme): warm off-whites
(`#F5F0E8` / `#FBF8F3` / `#FFFFFF`), charcoal text ramp, **one accent**
`--accent: #2E6FF2`, muted data-viz colors (`--viz-green #6F8F6A`,
`--viz-amber #C09A55`, `--viz-neutral #8C877C`), small radii (4–14 px), Lora
serif for body and headings. Legacy color aliases keep ~1.5k inline styles
rendering correctly. `DESIGN_BRIEF.md` in the repo root is the authority.
