# Frontend (`src/`)

## Pages (`src/pages/`)

| File | Route | Purpose |
|---|---|---|
| `auth.js` | `#/auth` | Sign in / sign up (name, DOB, email, password, consent checkbox). Signup requires email confirmation. |
| `consent-gate.js` | (interstitial) | "Before you continue" — blocks the app until the current versions of ToS / Privacy / health-data / AI-processing consents are accepted; writes `user_consents` rows. |
| `onboarding.js` | `#/onboarding` | First-run flow gated by `profiles.onboarding_completed`: baseline (age/sex/height/weight/activity) → calls `POST /api/health-profile/calculate-targets` → shows BMR/TDEE/macros → optional allergies, conditions, dietary restrictions, goals, medications note → marks complete. Activity level starts on a "Select…" placeholder — nothing is pre-filled. |
| `dashboard.js` | `#/` | Health-score ring ("No trend yet" until two weekly scores), steps card (reads `habits.steps`, "Tap to log" when empty), Oura card, quick actions, today's nutrition, recent activity. |
| `food-scanner/` (`index`, `meal-scan`, `results`, `cards`, `memory`, `nutrition-gaps`, `result-actions`, `tcm-data`; `food-scanner.js` is a re-export shim) | `#/food-scanner` | Meal photo scan pipeline UI (camera → barcode-first gate → GPT-4o vision → portion/label correction → log). Also meal-memory quick logging and scan history. Items with no database match show "Rating unavailable" and are excluded from the meal average; OCR label scans are saved as "Label scan · <date>". |
| `body-scanner/` (`index`, `hr`, `results`, `history`, `shared`; `body-scanner.js` is a shim) | `#/body-scanner` | Wellness photo check-ins (face/body/tongue + camera pulse; wellness-only framing). Face results carry no Collagen / Skin-barrier / hydration tiles; a pulse check-in stores `overall_score: null` (signal confidence stays in the results JSON), so history shows "No score". |
| `hygiene-scanner.js` | `#/hygiene-scanner` | Personal-care product scan → ingredient concern levels (via Open Beauty Facts + additive analyzer). |
| `health-input/` (`index`, `labs`, `exercise`, `sleep-habits`, `substances`, `background-goals`, `environment`, `medications-cycle`; `health-input.js` is a shim) | `#/health-input` | Manual logging tabs: labs (PDF parse, fields escaped), exercise (RPE saves `null` until the slider is touched), sleep, habits (water, stress, mood, steps — no invented defaults), substances (`category` persists), background, goals, environment, **medications** (log only), **cycle** (renders `events` from `GET /api/cycle/history`; period start/end, symptom, ovulation; "Select…" placeholder). |
| `health-chat.js` | `#/health-chat` | AI copilot chat (RAG over the user's `health_events`). |
| `analytics.js` + `analytics-explore.js` | `#/analytics` | Charts (log streak over 90 days; missing days charted as "No entry", never zero) + correlation/prediction engine results. `analytics-explore.js` adds two click-only cards: **Early patterns** (`GET /api/early-patterns`, 5/day free) and **Explore a correlation** (`POST /api/custom-correlation`; 8 variables mirroring the server's `VARIABLE_MAP`; 30/60/90/180-day window; 5/day free). Nothing runs on page load. |
| `eastern-medicine.js` | `#/eastern-medicine` | TCM/Ayurveda wellness profiling (tongue observation etc.). Tabs use the WAI-ARIA tablist helper; the dosha quiz result saves via `profile.update({ dosha })`. |
| `product-results.js` | `#/product-results` | Barcode-scan product detail view. "Score unavailable" when the API fails (no local fallback score); "Log to Food Diary" writes a `meals` row via `meals.log`, then ingests. |
| `profile.js` | `#/profile` | Profile + targets; **Subscription** (Stripe checkout, $9.99/mo · $79/yr), **Wearables** (Oura OAuth), **Notifications**, **Security** (TOTP enrol/disable), **Your data** (JSON export, email-confirmed deletion), **AI usage** card (`GET /api/usage/status`; labels, limits and windows come from the server). Enabling notifications also subscribes to web push when `VITE_VAPID_PUBLIC_KEY` is set. Activity level has a "Select…" placeholder (TDEE shows "—" until chosen). A failed load renders an error, never an empty form. |
| `step-details.js` | `#/step-details` | Real step history from `habits.steps` (7/30-day views); no estimates and no goal ("No step goal set" — the profile has none). |
| `legal.js` | `#/legal/*` | In-app ToS and Privacy Policy pages rendered from `legal/*.md` drafts. |

## Libraries (`src/lib/`)

- `supabase.js` — bundled `@supabase/supabase-js` client (no CDN import); URL/anon key from `VITE_*` env with dev defaults.
- `db.js` — all direct table helpers (`profile`, `meals`, `dailyNutrition`,
  `sleepLog`, `exerciseLog`, `habits.logToday/getToday` (upsert on
  `user_id,date`; includes `steps`), `bodyScans`, wearables…; water lives on `habits.water_glasses` — there is no separate water helper or table). Each write
  also calls `ingestEvent()` so the event lands in `health_events` for RAG.

## Services (`src/services/`)

- `foodScanApi.js` — client half of the meal-scan pipeline; index-preserving
  batch nutrition lookup (see 05-algorithms).
- `visionApi.js` — wraps `POST /api/vision/*` calls (base64 image upload).
- `nutritionApi.js` — nutrition lookups via the API.

## Utils (`src/utils/`)

| File | What it is |
|---|---|
| `api.js` | `apiFetch` — Bearer token, base URL from `src/config.js` (production build with `VITE_API_BASE` unset → `https://api.vitallens.app`), 45 s timeout. |
| `tablist.js` | `initTablist(el, onSelect)` — WAI-ARIA tabs pattern: roving tabindex, Arrow/Home/End keys; used by the TCM page. |
| `dates.js` | `todayLocalISO`, `daysAgoLocalISO`, … — local-calendar day strings for `date` columns. |
| `esc.js` | HTML-escaper used at every innerHTML interpolation of user/AI strings (XSS seal). |
| `toast.js` | Single shared `showToast` (uses `textContent` — XSS-safe). |
| `consent.js` | Consent status check + document versions (drives the consent gate). |
| `health-score.js` | Composite health-score algorithm (see 05-algorithms) + insight generator. Nutrition is scored only against the profile's `target_calories` (no 2,000 kcal default); `trend` is `null` until two weekly scores exist. |
| `charts.js` | `createRingProgress`, `createLineChart` — inline-SVG chart builders. |
| `profile-shared.js` | Shared `CONDITIONS`, `GOAL_OPTIONS`, unit converters (in↔cm, lb↔kg). |
| `camera-system.js` | getUserMedia capture + downscale/compress for scan uploads. |
| `biomarker-engine.js`, `product-scanner.js` | Client-side glue for the respective scanners (`food-analyzer.js` and `stool-analyzer.js` were deleted — fabricated output). |
| `eastern-medicine-data.js` | Static TCM/Ayurveda reference data. |
| `oura.js` | Real Oura client: `refreshOuraStatus`, `startOuraConnect` (server issues a signed-state OAuth URL). `strava.js` handles the Strava OAuth callback; imported activities keep `calories: null` when Strava omits them (no MET estimate). |
| `analytics-events.js` | `trackEvent` wrapper; `posthog-js` is bundled and dynamically imported only when `VITE_POSTHOG_KEY` is set, with external-dependency loading, session recording, and surveys off — CSP `script-src` stays `'self'`. |

## Design system

Tokens in `src/styles/variables.css` (quiet-luxury light theme): warm off-whites
(`#F5F0E8` / `#FBF8F3` / `#FFFFFF`), charcoal text ramp, **one accent**
`--accent: #2E6FF2`, muted data-viz colors (`--viz-green #6F8F6A`,
`--viz-amber #C09A55`, `--viz-neutral #8C877C`), small radii (4–14 px), Lora
serif for body and headings. Legacy color aliases keep the remaining inline
styles (795 at last count, down from ~1.5k) rendering correctly. `DESIGN_BRIEF.md` in the repo root is the authority.
