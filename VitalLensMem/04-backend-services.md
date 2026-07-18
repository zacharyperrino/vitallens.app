# Backend services (`server/services/`)

| Service | Responsibility |
|---|---|
| `prompts.js` | Canonical `WELLNESS_SYSTEM_PROMPT` — the single source for the observational, non-clinical framing every Claude call uses ("your logs suggest…", never condition names). Consolidated from 5 drifted copies during the audit. |
| `context-builder.js` | `buildFullContext(userId, {window})` — assembles the user's full snapshot (meals, sleep, exercise, habits, environment, supplements, TCM, check-ins) over N days; `snapshotToText` serializes it for prompts. **Caches snapshots in Upstash Redis (REST)** with a TTL; reads/writes are non-blocking on failure; cache keys `context:<userId>:*` invalidated on new writes. |
| `rag.js` | `retrieveRelevantHistory(userId, queryText, count=8)` — embeds the query, calls the `match_health_events` RPC (pgvector cosine), returns most-similar past event descriptions, filtered to the user. |
| `embeddingService.js` | `embed(text)` — OpenAI `text-embedding-3-small` (1536-dim), used for both stored events and queries (must stay symmetric). |
| `eventIngestion.js` | Inserts a row into `health_events` + generates its embedding, from every logging path. |
| `spend-guard.js` | Hard monthly dollar ceilings checked **before** any model call. Caps: free user $5, premium $50, global $250 (env-overridable). Sums the current calendar month from `api_cost_log`. Global cap → "AI paused"; user cap → "monthly limit". Fails open with a loud log on DB errors (per-request rate limits still apply). |
| `cost-tracker.js` | `trackCost({userId, route, model, inputTokens, outputTokens})` — computes USD from per-model token pricing and inserts into `api_cost_log`. Every AI route calls it. |
| `usage-gates.js` | Free-tier feature counters (see 05-algorithms for the exact limits table). `checkAndIncrementUsage` = spend guard (everyone, incl. premium) → premium bypass → per-feature windowed counter in `usage_tracking`. Fails open on DB errors. |
| `ai-fetch.js` | `fetchWithRetry` — retries transient AI-API failures with backoff; tags logs by routeName. |
| `ai-limiters.js` | `heavyAILimiter` — express-rate-limit for the expensive engines. |
| `ai-validators.js` | Zod-style schemas (`CorrelationSchema`, `PredictionSchema`, …) + `validateOrThrow` — every model JSON response is parsed then schema-validated before storage; failures → 422. |
| `sanitize.js` | Input sanitation helpers. |
| `healthScorer.js` | Server-side scoring used by the health-score routes. |
| `additiveAnalyzer.js` | Ingredient/additive concern-level classification for hygiene + food products. |
| `openFoodFacts.js` / `openBeautyFacts.js` | Third-party product DB clients (barcode → product/ingredients). |

**Deleted (2026-07-09):** `queue.js` + `worker.js` (BullMQ). The API process is
now the only backend process; analysis runs synchronously behind
`heavyAILimiter` + usage gates + spend guard.

## AI call pattern (every engine follows it)

```
usage gate (spend guard inside) → buildFullContext (Redis-cached)
  → fetchWithRetry(model, WELLNESS_SYSTEM_PROMPT + task prompt, timeout)
  → trackCost(usage tokens)
  → strip ```json fences → JSON.parse → validateOrThrow(schema)
  → persist → (correlation only: Haiku language-safety second pass)
```
