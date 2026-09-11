# Architecture

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla-JS hash-router SPA, Vite (port 3000), PWA (`sw.js`, prod-only) |
| Backend | Express (port 3001), single process (`server/server.js`) |
| Database | Supabase Postgres (project `vitallens`, id `nlxptctihrotizvaywdo`), RLS everywhere, pgvector |
| Auth | Supabase Auth (email+password, email confirmation required); API verifies Bearer JWTs |
| AI | OpenAI GPT-4o (vision meal scan, structured outputs), `text-embedding-3-small` (RAG), Anthropic Claude Sonnet/Haiku (analysis engines) |
| Cache | Upstash Redis (REST) — context-snapshot cache only |
| Billing | Stripe (subscription: free / premium) |
| Monitoring | Sentry (`server/instrument.js`, preloaded by `node --import` so Express is instrumented), PostHog (`posthog-js` bundled, dynamic-imported only when `VITE_POSTHOG_KEY` is set; no session recording, surveys, or external scripts) |

## Processes

One frontend dev server + one API process. The former BullMQ worker/queue stack
was **deleted** (2026-07-09) — nothing ever enqueued; all AI analysis runs
synchronously in-request behind rate limiters and spend caps.

```
Browser (SPA) ──Bearer JWT──▶ Express API :3001 ──service-role──▶ Supabase
     │                              │
     └── Supabase JS client         ├─▶ OpenAI / Anthropic / Google Vision
         (auth + RLS-scoped         ├─▶ USDA FDC / Open Food Facts / Open Beauty Facts
          direct table reads)       └─▶ Upstash Redis (context cache)
```

## Two data paths

1. **Direct Supabase from the frontend** (`src/lib/db.js`): CRUD on the user's
   own rows (meals, habits, sleep, water…). Safety = RLS owner policies.
2. **API routes** (`src/utils/api.js` → `apiFetch`): anything involving AI,
   secrets, cross-table aggregation, or third-party APIs. Safety = `requireAuth`
   JWT check + global ownership guard (see 07-security).

## Frontend boot

`src/main.js` registers the service worker only in prod builds (dev unregisters stale ones), builds the bottom nav as real `<button>`s, and hands off to `src/router.js`. Once a session exists it writes `profiles.timezone` (`syncProfileTimezone` — the zone the API uses for that user's "today") and, when `VITE_VAPID_PUBLIC_KEY` is set, keeps the web-push subscription in step with the Notifications toggle (`POST /api/push/subscribe` / `DELETE /api/push/unsubscribe`); both are best-effort and never block first render.
Guards, in order: no session → `#/auth`; consent incomplete (fails closed) → consent gate; onboarding status unknown → "Can't reach the server" retry screen; onboarding incomplete → `#/onboarding`. Unknown hashes render a 404; a route that throws renders an error boundary with retry; an offline banner appears on the `offline` event. The router owns bottom-nav visibility.

## Request lifecycle on the API

`server/server.js` middleware order (matters):

1. `instrument.js` is preloaded by the start command (`node --import ./instrument.js server.js` — `npm start`, `Procfile`, `railway.json`); it imports `env.js` (dotenv) first, then initialises Sentry with a `beforeSend` that strips bodies, query strings, cookies, and auth headers
2. Stripe webhook raw-body exception (`/api/billing/webhook`)
3. CORS allow-list from `FRONTEND_URL`, JSON body (10 MB, base64 scans), helmet, `trust proxy`
4. **Production error sanitizer** — 5xx bodies generified when `NODE_ENV=production`
5. Global rate limit: 60 req/min per IP on `/api` (the Stripe webhook is exempt — it authenticates by signature)
6. Public routes: `GET /api/health` (liveness), `GET /api/ready` (one-row `select` on `profiles`), billing (self-authenticating), Oura OAuth callback (signed state)
7. `requireAuth` — **local JWT verification** against the project JWKS (`jose`); sets `req.user`
8. **Global ownership guard** — any `userId`/`user_id` in query or body must equal the token's `sub` → else 403; multipart routes take the user from the token
9. 35 feature routers (AI routes: usage gate → spend guard → `trackCost`)
10. Sentry error handler, then the responding handler; graceful `SIGTERM`/`SIGINT` drain with a 60 s grace; `unhandledRejection` → Sentry and keep serving, `uncaughtException` → Sentry, flush, exit

## Repos

- Frontend repo = project root (`Archive3/`). **No git remote yet** (user step).
- Server repo = `server/` (its own git repo, pushed to GitHub).
- Applied DB migrations exported to `server/supabase/migrations/`; reference data in `server/supabase/seed/`.
