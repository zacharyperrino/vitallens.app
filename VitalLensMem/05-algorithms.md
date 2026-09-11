# Algorithms

Exact formulas and constants, verified against the code.

## 1. Nutrition targets — Mifflin-St Jeor (`server/routes/health-profile.js`)

```
base = 10·weight_kg + 6.25·height_cm − 5·age
BMR  = base + 5   (male)     |  base − 161  (female/other)
TDEE = BMR × activity multiplier
```

| activity_level | multiplier |
|---|---|
| sedentary | 1.2 |
| light | 1.375 |
| moderate | 1.55 |
| active | 1.725 |
| very_active | 1.9 |

Targets:
- `calories` = TDEE rounded to nearest 50
- `protein_g` = `round(weight_kg × 2.2)` (≈1 g/lb bodyweight)
- `carbs_g` = `round(calories × 0.40 / 4)` (40% of calories, 4 kcal/g)
- `fat_g` = `round(calories × 0.30 / 9)` (30% of calories, 9 kcal/g)
- `fiber_g` = 28 (fixed)

Persisted to `health_profile` (upsert on `user_id`). E2E-verified:
29 y male, 180 cm, 78 kg, moderate → BMR 1765, TDEE 2736, 2750 kcal,
172 g protein, 275 g carbs, 92 g fat.

## 2. Composite wellness score (`src/utils/health-score.js`)

Scores **only the domains the user has logged**; weights are re-normalized over
the domains present. With fewer than 2 logged domains the result is
`{ state: 'insufficient_data', overall: null }` — never an invented number.

| Domain | Weight | Score formula (only when data exists) |
|---|---|---|
| nutrition | 0.25 | `clamp(85 − |cal−2000|/30, 40, 100)` |
| exercise | 0.20 | `min(100, 50 + 10·sessions)` |
| sleep | 0.20 | `max(30, 100 − |avgHours − 7.5|·15)` |
| habits | 0.15 | 80; smoking −30; heavy alcohol −20 (moderate −5); water ≥8 +10; clamp 20–100 |
| bodyMarkers | 0.10 | latest body-scan `overall_score` |
| environment | 0.10 | AQI good→85, moderate→65, else 45 |

`overall = round(Σ scoreᵢ · weightᵢ / Σ weightᵢ)` over present domains.
Grade: ≥90 A+, ≥80 A, ≥70 B, ≥60 C, else D. Trend = last − previous weekly score.
Insights are rule-based per logged domain; tips are neutral prompts with no
quantified physiological claims.

## 3. Food-scan pipeline (vision.js + foodScanApi.js + nutrition.js)

1. **Barcode-first gate**: detect a barcode in the photo → resolve via product
   DB (Open Food Facts / `products` cache) → skip the model entirely (cost 0).
2. **Vision call**: GPT-4o with `response_format: MEAL_SCAN_SCHEMA`
   (strict json_schema), `temperature: 0`, `max_tokens: 2000`. The model
   returns only *food labels + gram estimates + confidence* — never calories.
3. **3-tier nutrition lookup** (per item, server-side): HARDCODED common-foods
   table → USDA FoodData Central → Open Food Facts. Calories/macros = per-100g
   values × grams.
4. **Index-preserving batch lookup** (`batchNutritionLookupWithRestaurant`):
   unmatched items are NOT dropped — they get a generic ~1.5 kcal/g estimate so
   item indexes stay aligned with the model output (fixes a misalignment bug).
5. **Correction loop**: user relabels/re-portions → `food_corrections` /
   `portion_corrections` → informs meal memory.
6. **Meal memory**: repeat meals recognized (`meal_memory`), quick-log with
   averaged macros and `scan_count` tracking.

Accuracy harness: `server/evals/food-scan-eval.js` (`npm run eval:food`)
against weighed-meal photos in `server/evals/meals/` (user must supply).

## 4. RAG over health events (`rag.js`, `embeddingService.js`, DB RPC)

- Every log write → `health_events` row + `text-embedding-3-small` embedding
  (1536-dim, pgvector column).
- Query: embed question → `match_health_events(query_embedding, match_user_id,
  match_count=10, match_threshold=0.3, days_back=90)` — cosine similarity
  (`1 − (embedding <=> query)`), user-scoped, recency-windowed, threshold-filtered,
  ordered by similarity.
- Returned descriptions are injected into the health-copilot prompt.
- Ops note: rebuilding the ivfflat index needs
  `SET LOCAL maintenance_work_mem='128MB'` in a transaction (default 32 MB fails).

## 5. Cost control stack (spend-guard.js, usage-gates.js, cost-tracker.js)

Order of checks before ANY model call:

1. **Spend guard** (everyone, premium included): `sum_ai_spend(since, user?)`
   aggregates `api_cost_log` **in Postgres** (a client-side row sum silently
   broke past PostgREST's 1,000-row cap). Global cap $250 → deny and **fail
   closed** on error; per-user cap $5 free / $50 premium → deny.
2. **Premium bypass** of count gates (`profiles.subscription_status='active'`,
   or `trialing` with unexpired `trial_end`).
3. **Free-tier counters** via the atomic `increment_usage(user, feature,
   window_start, window_type, limit)` RPC — increment-if-under-limit in one
   statement, backed by a unique index on `(user_id, feature, window_start)`.

| feature | limit | window |
|---|---|---|
| food_vision_scan | 5 | day |
| ai_chat | 10 | day |
| biomarker_scan | 3 | day |
| early_patterns | 5 | day |
| custom_correlation | 5 | day |
| lab_upload | 2 | month |
| correlation_run | 3 | month |
| prediction_run | 3 | month |
| weekly_report | 1 | week (Mon-start) |
| narrative | 1 | month (checked AFTER the cache, so a cached read is free) |

`trackCost` prices every model call **and every embedding** and appends to
`api_cost_log` — the same table the guard reads (closed loop).

## 6. Correlation & prediction engines (Claude Sonnet)

- **Correlation**: `buildFullContext(30d)` → prompt demands data-grounded,
  observational findings across 8 domain pairs, JSON-only → `CorrelationSchema`
  validation → rows in `health_correlations` with confidence mapping
  `consistent→0.9, emerging→0.6, early_hint→0.3` + a summary row (confidence 1.0).
  Then a **Haiku second pass** reviews the output for clinical/diagnostic
  language ("PASS"/"FLAG: reason") — flags are logged, non-blocking.
- **Prediction**: same context → 7/14-day trend extrapolations with confidence
  tied to data volume (<5 points forced low), intervention ranking specific to
  the user's gaps → `health_predictions`; worth-watching items also become
  `health_insights` (confidence high→0.9, moderate→0.6, low→0.3).
- Both use `WELLNESS_SYSTEM_PROMPT`: observational language only, no condition
  names; 14-day persistent patterns get a "worth discussing with a healthcare
  provider" note.

## 7. Guardrail micro-algorithms

- **Global ownership guard** (server.js): any `userId` or `user_id` in query/body
  must equal the JWT's `sub`, else 403 — one middleware covering every authenticated
  route. Multipart routes take the user from the JWT because the body isn't parsed yet.
- **Production error sanitizer** (server.js): monkey-patches `res.json`; 5xx
  bodies with an `error` key are replaced by a generic message in production.
- **XSS escaper** (`src/utils/esc.js`): `& < > " '` → entities; applied at every
  innerHTML interpolation of user/AI-controlled strings in the scanner pages.
- **Consent gate versioning**: required docs each carry a version; the gate
  computes `missing = required − accepted(doc@version)`, so bumping a version
  automatically re-prompts existing users (append-only `user_consents`).
