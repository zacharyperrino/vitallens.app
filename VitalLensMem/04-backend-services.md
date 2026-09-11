# Backend services (`server/services/`, `middleware/`, `db/`, `utils/`)

| Module | Responsibility |
|---|---|
| `env.js` | Loads `.env` once; MUST be the first import of every entrypoint (ESM hoists imports). |
| `db/supabase.js` | The one shared service-role Supabase client (was constructed 36× across routes). Bypasses RLS — every consumer must take the user from `req.user`, never from the client. |
| `middleware/auth.js` | `requireAuth`: verifies the Supabase JWT **locally** against the project JWKS with `jose` (issuer + audience checked, keys cached); falls back to a remote `getUser` only for legacy HS256 tokens; returns 503 (never hangs) if auth is unreachable. Sets `req.user {id,email,role}` and an RLS-scoped `req.supabase`. `requireSelf(param)` for explicit per-route checks. |
| `utils/errors.js` | `sendError(res, err, status)` — Sentry capture + log + JSON response. Used by every route catch (65 sites). The production sanitizer in `server.js` still generifies 5xx bodies. |
| `prompts.js` | Canonical `WELLNESS_SYSTEM_PROMPT` — observational, non-clinical framing for every Claude call. |
| `context-builder.js` | `buildFullContext(userId, {window})` assembles the 7/30-day snapshot (15 queries) and caches it in Upstash Redis (REST, 5-min TTL). **Single-flight lock** (`SET NX`) prevents a thundering herd on a cold key; `invalidateContextCache(userId)` deletes both window keys and is called by `/api/ingest` after every write. |
| `rag.js` | `retrieveRelevantHistory(userId, query, count=8)` — embeds the query (billed to the user) and calls the `match_health_events` pgvector RPC. |
| `embeddingService.js` | `embed(text, {userId, route})` — `text-embedding-3-small`; every call is priced via `trackCost` when a user is known. |
| `eventIngestion.js` | `ingestEvent(userId, type, data, sourceId)` inserts into `health_events` and embeds asynchronously. **Now actually invoked** by `/api/ingest` (it was a stub). |
| `spend-guard.js` | Hard monthly USD ceilings checked before every model call, summed in Postgres via `sum_ai_spend()` (never a row scan — PostgREST caps at 1,000 rows). **Global cap fails CLOSED** on error; per-user check fails open. Caps: $5 free / $50 premium / $250 global. |
| `usage-gates.js` | Free-tier windowed counters via the atomic `increment_usage()` RPC (increment-if-under-limit in one statement — no race). Premium bypasses counts, never the spend guard. Limits table in `05-algorithms.md`. |
| `cost-tracker.js` | `trackCost({...})` → USD by per-model pricing → `api_cost_log`. Pricing for GPT-4o, Haiku 4.5, `text-embedding-3-small`; no double-counted image fee. |
| `ai-fetch.js` | `fetchWithRetry` — retries 429/5xx with full-jitter backoff inside a **total time budget** (45 s default) so a flaky provider can't hold a request for minutes. |
| `ai-limiters.js` | Per-endpoint `express-rate-limit`s keyed on **`req.user.id`** (client-supplied ids are never a rate-limit key). |
| `ai-validators.js` | Zod schemas (`CorrelationSchema`, `PredictionSchema`, …) + `validateOrThrow` — model JSON is validated before storage; failures → 422. |
| `oauth-state.js` | `signState(userId, provider)` / `verifyState(state, provider)` — HMAC-signed, 10-minute, provider-bound OAuth `state`. The raw user id is never in the round-trip. |
| `sanitize.js`, `healthScorer.js`, `additiveAnalyzer.js`, `openFoodFacts.js`, `openBeautyFacts.js` | Input sanitation, server-side scoring, ingredient concern classification, product-DB clients. |

**Removed:** `queue.js`/`worker.js` (BullMQ; nothing ever enqueued) and `routes/correlate.js` (two stubs and a committed heredoc terminator).

## AI call pattern (every engine follows it)

```
checkAndIncrementUsage(userId, feature)      // spend guard (fail-closed global) → premium → atomic counter
  → buildFullContext (Redis-cached, single-flight)
  → fetchWithRetry(model, WELLNESS_SYSTEM_PROMPT + task prompt, timeout, time budget)
  → trackCost(usage tokens)
  → strip ```json fences → JSON.parse → validateOrThrow(schema)
  → persist → (correlation only: Haiku language-safety second pass)
  → sendError(res, err) on any failure (Sentry sees it)
```
