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
| Monitoring | Sentry (`server/instrument.js`, loaded first), PostHog (env-gated, off by default) |

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

## Request lifecycle on the API

`server/server.js` middleware order (matters):

1. Stripe webhook raw-body exception (`/api/billing/webhook`)
2. CORS — allow-list from `FRONTEND_URL` (comma-separated), credentials on
3. JSON body (10 MB limit, for base64 scan images), urlencoded, morgan, helmet
4. **Production error sanitizer** — wraps `res.json`; any 5xx body with an
   `error` field is replaced with a generic message when `NODE_ENV=production`
5. Global rate limit: 60 req/min per IP on `/api`
6. Public routes: `GET /api/health`, billing routes
7. `requireAuth` — verifies the Bearer JWT, sets `req.user`
8. **Global ownership guard** — if `req.query.userId` or `req.body.userId`
   exists and ≠ `req.user.id` → 403 (one seal over every authenticated route)
9. ~35 feature routers, all mounted at `/api`
10. Error handler (message + stack in dev only), then Sentry error handler

## Frontend boot

`src/main.js` → registers service worker **only in prod builds** (dev HMR was
being sabotaged by SW caching) → `src/router.js` hash routing.
Route guards, in order: no session → `#/auth`; missing consents → consent gate
(`consent-gate.js`); `profiles.onboarding_completed=false` → `#/onboarding`;
otherwise the requested page.

## Repos

- Frontend repo = project root (`Archive3/`). **No git remote yet** (user step).
- Server repo = `server/` (its own git repo, pushed to GitHub).
- Applied DB migrations exported to `server/supabase/migrations/`.
