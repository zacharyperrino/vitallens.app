# Database (Supabase project `vitallens`, id `nlxptctihrotizvaywdo`)

**Reproducible from the repo:** `server/supabase/schema-baseline.sql` is the full
schema (extensions, 39 tables, constraints, indexes, RLS, policies, functions,
sequences `OWNED BY` their columns) introspected from the live project on
2026-09-10 and refreshed after that day's last migrations (duplicate indexes
gone, `user_consents` policies in `(select auth.uid())` form, `water_log`
dropped). **Rebuild = baseline + `server/supabase/seed/additive_classifications.sql`**
(28 reference rows — the only non-user table with content; without it every
additive scores `unknown`). `server/supabase/migrations/` is the incremental
history (see its `README.md`).

## Access model

- **Frontend** uses the anon key → every query passes RLS owner policies.
- **API** uses the service-role key → bypasses RLS; safety comes from local JWT
  verification + the global ownership guard in Express.
- RLS is enabled on every table; policies use the initplan-optimized form
  `(select auth.uid()) = user_id`.
- **`user_id` is `uuid` everywhere** (2026-09-10 migration converted the nine
  legacy `text` columns and `scan_history`'s `varchar`) with a foreign key to
  `auth.users(id) ON DELETE CASCADE` (or to `profiles(id)`, which itself
  cascades from `auth.users`). Deleting the auth user erases every row the
  account ever wrote — account deletion is complete.

## Tables by domain

**Identity / platform** — `profiles` (keyed on auth `id`; subscription fields,
`onboarding_completed`, `timezone`), `user_consents` (append-only, versioned,
unique per user/document/version), `usage_tracking` (unique per
user/feature/window), `api_cost_log`.

**Logging** — `meals`, `daily_nutrition` (rollup via `increment_daily_nutrition`),
`habits` (unique per user/date; `steps`, `mood`, `stress_level`,
`water_glasses`), `sleep_log`, `exercise_log`, `supplement_logs` (with `category`),
`lab_results`, `medication_log`, `cycle_log` (`event_type` ∈ `period_start` /
`period_end` / `symptom` / `ovulation` — check constraint widened 2026-09-10),
`environment_logs`, `hr_readings`,
`hygiene_scans`, `product_scans`, `scan_history`, `body_scans`,
`biomarker_scans`. (`stool_scans` remains in the schema but the feature was
removed — it generated fabricated results. `water_log` was dropped 2026-09-10:
0 rows, and `habits.water_glasses` is the single water source.)

**Derived / AI** — `health_events` (RAG store, 1536-dim pgvector `embedding`,
ivfflat index), `health_correlations`, `health_predictions`, `health_insights`,
`weekly_reports`, `weekly_scores`, `chat_history`, `meal_memory`,
`food_corrections`, `portion_corrections`, `health_profile` (targets),
`tcm_profile`, `user_goals`, `genomics_traits` (experimental).

**Sharing / products** — `practitioner_links` (experimental), `products`
(shared barcode cache), `wearable_connections`.

## Functions (RPC)

| Function | Notes |
|---|---|
| `match_health_events(embedding, user, count=10, threshold=0.3, days_back=90)` | pgvector cosine search, user-scoped, pinned `search_path`. |
| `sum_ai_spend(since, user?)` | Aggregates `api_cost_log` in Postgres for the spend guard. service_role only. |
| `increment_usage(user, feature, window_start, window_type, limit)` | Atomic increment-if-under-limit; returns `(allowed, current_count)`. service_role only. |
| `get_user_id_by_email(email)` | SECURITY DEFINER, service_role only (email-enumeration guard). |
| `increment_daily_nutrition(uuid, date, …)` | SECURITY INVOKER; RLS enforces ownership. |

## Hot-path indexes (all present)

`daily_nutrition(user_id,date)`, `meals(user_id,logged_at desc)`,
`exercise_log(user_id,logged_at desc)`, `habits(user_id,date desc)`,
`biomarker_scans/environment_logs/hygiene_scans(user_id, *_at desc)`,
`supplement_logs(user_id,active)`, `lab_results(user_id,collected_at desc)`,
`health_correlations/health_predictions(user_id,generated_at desc)`,
`weekly_reports(user_id,week_of desc)`, `api_cost_log(user_id,logged_at)`,
unique `usage_tracking(user_id,feature,window_start)`. Five exact duplicates
were dropped 2026-09-10 (`20260910120000_drop_duplicate_indexes.sql`); the kept
index is always the unique/constraint or pre-existing one, so the read path is
unchanged.

## Migrations applied 2026-09-10

| File | Effect |
|---|---|
| `20260910100000_unify_user_id_fks_indexes_rpcs.sql` | nine `text` `user_id` columns → `uuid`, cascade FKs, hot-path indexes, `sum_ai_spend` / `increment_usage` RPCs |
| `20260910120000_drop_duplicate_indexes.sql` | five duplicate indexes dropped |
| `20260910120500_user_consents_policies_initplan.sql` | `user_consents` select/insert policies use `(select auth.uid())` |
| `20260910121000_cycle_ovulation_and_drop_water_log.sql` | `cycle_log` check constraint adds `ovulation`; `water_log` dropped |

## Ops facts

- ivfflat index builds need `SET LOCAL maintenance_work_mem='128MB'`.
- Free-tier project auto-pauses after ~1 week idle (DNS disappears); restore
  via dashboard/MCP takes 2–5 minutes. Pro removes this.
- Test users A/B exist for the integration suite (`server/.env.test` — git-ignored; the repo copy holds placeholders only).
