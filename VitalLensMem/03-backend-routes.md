# Backend routes (`server/routes/`)

All mounted at `/api`, all behind `requireAuth` + the global ownership guard
except `GET /api/health`, `GET /api/ready`, the Stripe webhook (signature-authenticated; also exempt from the per-IP limiter) and the public Oura callback (signed state). AI-calling routes additionally
pass `checkAndIncrementUsage` (usage gate + spend guard) and log to
`api_cost_log` via `trackCost`.

## Scanning & nutrition

| Route file | Endpoints / behavior |
|---|---|
| `vision.js` | Meal photo analysis (multipart; user from the JWT, usage-gated). **Barcode-first gate**: if a barcode is detected in the image, resolve via product DBs and skip the model call. Otherwise GPT-4o vision with a strict `MEAL_SCAN_SCHEMA` (json_schema response format), `temperature: 0`, `max_tokens: 2000`. Model outputs food labels + gram estimates only; calories are computed by lookup (see 05-algorithms). |
| `barcode.js` | Barcode → product resolution (Open Food Facts + `products` cache table + `scan_history`). |
| `nutrition.js` | 3-tier nutrition lookup: HARDCODED table → USDA FoodData Central (`USDA_API_KEY`, falls back to `DEMO_KEY`) → Open Food Facts. |
| `restaurant.js` | Restaurant-dish nutrition matching. |
| `food-correction.js` | User corrections of detected foods (`food_corrections`, `portion_corrections`) — feeds meal memory. |
| `meal-memory.js` | Per-user remembered meals (`meal_memory`): repeat-scan shortcut with averaged macros. |
| `ocr.js` | Google Cloud Vision OCR (nutrition labels). |
| `parse-labs.js` | Lab-report PDF/photo parsing → `lab_results` (usage-gated). |
| `hygiene.js` | Personal-care product scans → ingredient concern analysis (`hygiene_scans`). |
| `biomarker.js`, `biomarker-history.js` | Wellness photo check-in analysis (Claude; face/body/tongue only; user from the JWT) + history. Scan type and image are validated *before* the daily gate is consumed; the face prompt no longer asks for `skin_barrier`, `hydration`, or `collagen` fields; 30 s per-attempt timeout. |

## Profile, targets, logging

| Route file | Endpoints / behavior |
|---|---|
| `health-profile.js` | Profile CRUD + `POST /health-profile/calculate-targets` (Mifflin-St Jeor; see 05-algorithms). |
| `user-goals.js`, `supplements.js`, `cycle.js`, `medications.js` | Plain CRUD loggers. `supplements.js` persists `category` (validated against the Substances form's options). `cycle.js` accepts `period_start` / `period_end` / `symptom` / `ovulation`, and `GET /cycle/history` returns the raw `events` (newest first — what the Cycle tab renders) alongside the derived `cycles`. Medications is **logging only** — no interactions/dosage/clinical logic, by design. `water.js` was removed 2026-09-10 together with the empty `water_log` table: `habits.water_glasses` is the one source of water. |
| `tcm-profile.js` | TCM wellness profile storage. |
| `environment.js` | AQI/environment logging (`environment_logs`; the empty `environmental_log` twin table was dropped). |
| `health-score.js` | Server-side score endpoints (see also `services/healthScorer.js`). |

## AI analysis engines (all Claude, usage-gated, cost-tracked)

| Route file | What it does |
|---|---|
| `health-copilot.js` | Chat with RAG: embeds the question, retrieves similar `health_events` via `match_health_events`, injects into the prompt. Logs carry no health text — message lengths and tool names/input keys only (console breadcrumbs reach Sentry); early promises carry a no-op handler so a rejection during the intervening awaits is never unhandled; 35 s per-attempt timeout. |
| `correlation-engine.js` | 30-day cross-domain pattern analysis (Sonnet, `CorrelationSchema`-validated) + **Haiku secondary language-safety check** that flags clinical language. Persists to `health_correlations`. |
| `prediction-engine.js` | Trend extrapolation + intervention ranking (Sonnet, `PredictionSchema`-validated) → `health_predictions`, worth-watching items → `health_insights`. |
| `weekly-report.js` | Weekly patterns summary → `weekly_reports`. |
| `early-patterns.js` | `GET /early-patterns` — early-signal detection over the last 7 days of logs (usage-gated, 5/day free). Driven by the Analytics "Early patterns" card. |
| `custom-correlation.js` | `POST /custom-correlation` — user-picked variable-pair correlation from logged data (8 variables in `VARIABLE_MAP`; `water` reads `habits.water_glasses`; `days` bounded 7–180). Validates the variables and data sufficiency *before* consuming the daily gate (5/day free). Driven by the Analytics "Explore a correlation" card. |
| `ingest.js` | Event ingestion → `health_events` + async embedding + context-cache invalidation. User from the JWT. |

## Frozen / consent-heavy features

| Route file | Status |
|---|---|
| `genomics.js` | Wellness-framed local DNA-file parse; mounted only when `ENABLE_EXPERIMENTAL_ROUTES=true`. |
| `practitioner.js` | Read-only consented practitioner access via `practitioner_links` (invite by email through service-role-only RPC `get_user_id_by_email`; consent link must be `status='active'`; 403 otherwise — covered by integration tests). Mounted only when `ENABLE_EXPERIMENTAL_ROUTES=true`. |

## Platform

| Route file | Endpoints / behavior |
|---|---|
| `consents.js` | Consent status + acceptance recording (`user_consents`, versioned, append-only). |
| `user-data.js` | Full data export (all user tables) + deletion. |
| `usage.js` | `GET /usage/status` (per-feature counts, limits, windows — drives the Profile "AI usage" card) + `GET /usage/spend` (month-to-date, `getUserSpend`). |
| `billing.js` | Stripe checkout + status (both `requireAuth` inline, user from the JWT — the old unauthenticated `?userId=` IDOR is closed) and the signed webhook (raw body, public). |
| `push.js` | Web push (VAPID): `POST /push/subscribe`, `DELETE /push/unsubscribe`, `POST /push/send`. The frontend subscribes only when `VITE_VAPID_PUBLIC_KEY` is set; the server needs `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL`. |
| `oura.js` + `oura-public.js` | Oura OAuth: `/oura/connect` returns a URL with HMAC-signed state; the public `/oura/callback` verifies the state inside its `try` (`verifyState` never throws — it returns `null`) and stores tokens; status/sync use the JWT user; token exchange and refresh have 10 s timeouts. Needs developer credentials to activate. |
