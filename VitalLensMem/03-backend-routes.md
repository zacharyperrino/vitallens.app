# Backend routes (`server/routes/`)

All mounted at `/api`, all behind `requireAuth` + the global ownership guard
except `GET /api/health` and the Stripe webhook. AI-calling routes additionally
pass `checkAndIncrementUsage` (usage gate + spend guard) and log to
`api_cost_log` via `trackCost`.

## Scanning & nutrition

| Route file | Endpoints / behavior |
|---|---|
| `vision.js` | Meal photo analysis. **Barcode-first gate**: if a barcode is detected in the image, resolve via product DBs and skip the model call. Otherwise GPT-4o vision with a strict `MEAL_SCAN_SCHEMA` (json_schema response format), `temperature: 0`, `max_tokens: 2000`. Model outputs food labels + gram estimates only; calories are computed by lookup (see 05-algorithms). |
| `barcode.js` | Barcode → product resolution (Open Food Facts + `products` cache table + `scan_history`). |
| `nutrition.js` | 3-tier nutrition lookup: HARDCODED table → USDA FoodData Central (`USDA_API_KEY`, falls back to `DEMO_KEY`) → Open Food Facts. |
| `restaurant.js` | Restaurant-dish nutrition matching. |
| `food-correction.js` | User corrections of detected foods (`food_corrections`, `portion_corrections`) — feeds meal memory. |
| `meal-memory.js` | Per-user remembered meals (`meal_memory`): repeat-scan shortcut with averaged macros. |
| `ocr.js` | Google Cloud Vision OCR (nutrition labels). |
| `parse-labs.js` | Lab-report PDF/photo parsing → `lab_results` (usage-gated). |
| `hygiene.js` | Personal-care product scans → ingredient concern analysis (`hygiene_scans`). |
| `biomarker.js`, `biomarker-history.js` | Wellness photo check-in analysis (Claude; wellness framing) + history. |

## Profile, targets, logging

| Route file | Endpoints / behavior |
|---|---|
| `health-profile.js` | Profile CRUD + `POST /health-profile/calculate-targets` (Mifflin-St Jeor; see 05-algorithms). |
| `user-goals.js`, `supplements.js`, `water.js`, `cycle.js`, `medications.js` | Plain CRUD loggers. Medications is **logging only** — no interactions/dosage/clinical logic, by design. |
| `tcm-profile.js` | TCM wellness profile storage. |
| `environment.js` | AQI/environment logging (`environment_logs`; the empty `environmental_log` twin table was dropped). |
| `health-score.js` | Server-side score endpoints (see also `services/healthScorer.js`). |

## AI analysis engines (all Claude, usage-gated, cost-tracked)

| Route file | What it does |
|---|---|
| `health-copilot.js` | Chat with RAG: embeds the question, retrieves similar `health_events` via `match_health_events`, injects into the prompt. |
| `correlation-engine.js` | 30-day cross-domain pattern analysis (Sonnet, `CorrelationSchema`-validated) + **Haiku secondary language-safety check** that flags clinical language. Persists to `health_correlations`. |
| `prediction-engine.js` | Trend extrapolation + intervention ranking (Sonnet, `PredictionSchema`-validated) → `health_predictions`, worth-watching items → `health_insights`. |
| `weekly-report.js` | Weekly patterns summary → `weekly_reports`. |
| `early-patterns.js` | Early-signal detection over recent logs. |
| `custom-correlation.js` | User-picked variable-pair correlation (e.g. sleep × calories) computed from logged data. |
| `correlate.js` | Legacy/simple correlation endpoint. |
| `ingest.js` | Event ingestion → `health_events` (+ embedding via `eventIngestion.js`). |

## Frozen / consent-heavy features

| Route file | Status |
|---|---|
| `genomics.js` | Phase 1, wellness-framed, local file parse only, **frozen** behind hardening flags. |
| `practitioner.js` | Read-only consented practitioner access via `practitioner_links` (invite by email through service-role-only RPC `get_user_id_by_email`; consent link must be `status='active'`; 403 otherwise — covered by integration tests). **Frozen.** |

## Platform

| Route file | Endpoints / behavior |
|---|---|
| `consents.js` | Consent status + acceptance recording (`user_consents`, versioned, append-only). |
| `user-data.js` | Full data export (all user tables) + deletion. |
| `usage.js` | Free-tier usage summary + month-to-date spend (`getUserSpend`). |
| `billing.js` | Stripe checkout/portal/webhook (webhook uses raw body, mounted pre-auth). |
| `push.js` | Web-push (VAPID) subscription + notifications. |
| `oura.js` | Oura OAuth scaffold (needs real client id/secret). |
