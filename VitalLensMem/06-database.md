# Database (Supabase project `vitallens`, id `nlxptctihrotizvaywdo`)

## Access model

- **Frontend** uses the anon key → every query passes RLS owner policies.
- **API** uses the service-role key → bypasses RLS; safety comes from
  `requireAuth` + the global ownership guard in Express.
- RLS is enabled on every user table; policies use the initplan-optimized
  form `(select auth.uid()) = user_id` (evaluated once per query, not per row).

## Tables by domain

**Identity / platform**
- `profiles` — keyed on auth `id`; `subscription_status`, `trial_end`,
  `onboarding_completed`.
- `user_consents` — append-only versioned consent records
  (`document ∈ {terms_of_service, privacy_policy, health_data_processing,
  ai_processing}`, unique on `user_id, document, version`; select+insert only).
- `usage_tracking` — free-tier feature counters per window.
- `api_cost_log` — per-AI-call cost rows (feeds the spend guard).

**Logging**
- `meals`, `daily_nutrition` (upserted via uuid SECURITY INVOKER
  `increment_daily_nutrition`), `water_log`, `habits` (unique `user_id,date`;
  includes `steps`, `mood`, `stress_level`, `water_glasses`), `sleep_log`,
  `exercise_log`, `supplement_logs`, `lab_results`, `medication_log`,
  `cycle_log`, `environment_logs` (canonical; empty twin `environmental_log`
  was dropped), `hr_readings`, `hygiene_scans`, `product_scans`, `scan_history`,
  `stool_scans`, `body_scans`, `biomarker_scans`.

**Derived / AI**
- `health_events` — the RAG store: every log becomes an event row with a
  1536-dim pgvector `embedding`.
- `health_correlations`, `health_predictions`, `health_insights`,
  `weekly_reports` (AI weekly summaries), `weekly_scores` (numeric score
  history — different feature, both live), `chat_history`.
- `meal_memory`, `food_corrections`, `portion_corrections` — scan-accuracy loop.
- `health_profile` — baseline stats + computed targets (snake_case columns:
  `bmr`, `tdee`, `target_calories`, `target_protein`, …, `goal_weight_kg`).
- `tcm_profile`, `user_goals`, `genomics_traits` (frozen feature).

**Sharing**
- `practitioner_links` — `practitioner_id`/`client_id`/`status`; consent gate
  for the read-only practitioner view; client-only insert, either-party
  update/select policies; indexed on `client_id`.

**Products**
- `products` — shared barcode cache; authenticated-insert policy.

## Functions (RPC)

| Function | Notes |
|---|---|
| `match_health_events(query_embedding, match_user_id, match_count=10, match_threshold=0.3, days_back=90)` | Canonical 5-arg pgvector similarity search; pinned `search_path`; the accidental 3-arg overload was dropped (it caused silent PostgREST ambiguity). |
| `get_user_id_by_email(p_email)` | SECURITY DEFINER, **service_role-execute only** (revoked from anon/authenticated to block email enumeration); used by practitioner invites. |
| `increment_daily_nutrition(uuid, date, …)` | SECURITY INVOKER (RLS enforces ownership); the SECURITY DEFINER text-arg overload was dropped (IDOR). |

## Migrations

All applied migrations are exported to `server/supabase/migrations/`
(11 files, 2026-07-04 → 2026-07-08): steps column, onboarding flag,
goal weight, function hardening, RLS owner policies + initplan optimization
passes, consent table, dead-table drop. The **base schema** predates these —
run `supabase db pull` once for a full baseline.

## Known DB ops facts

- ivfflat index building needs `SET LOCAL maintenance_work_mem='128MB'`.
- Security advisor: clean except the leaked-password-protection dashboard
  toggle (user step). Performance advisor: only unused-index noise.
- Test users A/B exist for integration tests (`server/.env.test`).
