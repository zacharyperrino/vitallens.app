---
tags: [database, schema, supabase]
status: verified-2026-07-18
---

# Data model

Supabase Postgres. Every user table has RLS owner policies
(`(select auth.uid()) = user_id`, initplan-optimized). The API's service-role
client bypasses RLS; its safety is the Express ownership guard
(see [[architecture]]). `user_id` is `uuid` on every table with `ON DELETE CASCADE` to `auth.users`
(directly or via `profiles`), so deleting an account erases everything.

## Identity & platform

| Table | Fields (key ones) | Represents |
|---|---|---|
| `profiles` | `id` (= auth uid), `subscription_status`, `trial_end`, `onboarding_completed` | One row per account; premium = `active` (or unexpired `trialing`) |
| `user_consents` | `user_id`, `document`, `version`, `accepted`, `accepted_at`, `user_agent`; unique `(user_id, document, version)` | Append-only versioned consent history for 4 documents (ToS, privacy, health-data, AI-processing) |
| `usage_tracking` | `user_id`, `feature`, `count`, `window_start`, `window_type` | Free-tier feature counters per day/week/month window |
| `api_cost_log` | `user_id`, `route`, `model`, tokens, `cost_usd`, `logged_at` | Every AI call's cost — the spend guard sums this |

## Health profile & targets

| Table | Fields | Represents |
|---|---|---|
| `health_profile` | `user_id` (uuid), `sex`, `age`, `height_cm`, `weight_kg`, `activity_level`, `bmr`, `tdee`, `target_calories/protein/carbs/fat/fiber`, `goal_weight_kg`, `conditions`, `allergies`, `medications_note` | Baseline stats + Mifflin-St Jeor computed targets (see [[glossary]]) |
| `user_goals`, `tcm_profile` | — | Goal selections; TCM wellness profile |

## Logging (one row per event/day)

`meals`, `daily_nutrition` (day rollup via `increment_daily_nutrition` RPC),
`water_log`, `habits` (unique `user_id,date`; `water_glasses`, `smoking`,
`alcohol`, `caffeine`, `stress_level`, `mood`, **`steps`**, `notes`),
`sleep_log`, `exercise_log`, `supplement_logs`, `lab_results`,
`medication_log` (logging only — no clinical fields by design),
`cycle_log`, `environment_logs`, `hr_readings`, `hygiene_scans`,
`product_scans`, `scan_history` (barcode-indexed), `stool_scans`,
`body_scans`, `biomarker_scans`.

## AI / derived

| Table | Represents |
|---|---|
| `health_events` | The RAG store — every log becomes an event row with a 1536-dim pgvector `embedding`; searched by `match_health_events` |
| `health_correlations` | Engine findings: `correlation_type` ("domainA-domainB" or "summary"), `description`, `confidence` (0.9/0.6/0.3 by strength), `actionable`, `direction`, `data_window_days` |
| `health_predictions` | Trend runs: `overall_trajectory`, `trend_extrapolations` (json), `intervention_ranking` (json), `data_sufficiency` |
| `health_insights` | Surfaced watch-items/insights with `insight_type`, `confidence`, `priority` |
| `weekly_reports` | AI weekly summary (headline, `week_score`, wins, gaps, focus, `report_data` json) |
| `weekly_scores` | Numeric score history for the dashboard trend (distinct feature from `weekly_reports`) |
| `chat_history` | Copilot conversation log |
| `meal_memory` | Remembered repeat meals: `meal_name`, `avg_calories`, `scan_count` |
| `food_corrections`, `portion_corrections` | User corrections feeding scan accuracy |
| `genomics_traits` | Frozen feature (wellness-framed, local parse only) |

## Sharing & products

| Table | Represents |
|---|---|
| `practitioner_links` | `practitioner_id`, `client_id`, `status` — the consent record gating the read-only practitioner view (client-only insert; either party select/update; indexed `client_id`) |
| `products` | Shared barcode→product cache (authenticated insert) |
| `wearable_connections` | Per-user wearable auth state |

## Functions (RPC)

- `match_health_events(embedding, user, count=10, threshold=0.3, days_back=90)` — cosine similarity search, user-scoped.
- `sum_ai_spend(since, user?)` / `increment_usage(user, feature, window_start, window_type, limit)` — the cost-control plane, computed atomically in Postgres (service_role only).
- `get_user_id_by_email(email)` — SECURITY DEFINER, service-role-only (email-enumeration guard).
- `increment_daily_nutrition(uuid, …)` — SECURITY INVOKER (RLS enforces ownership); DEFINER text overload dropped (IDOR — see [[gotchas]]).

Schema: `server/supabase/schema-baseline.sql` reproduces the whole database;
`server/supabase/migrations/` is the history (12 files, 2026-07-04→09-10).
