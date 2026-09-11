# Operations

## Run locally (two terminals)

```bash
cd ~/Desktop/Antigravity/Archive3/server && npm start   # API  → http://localhost:3001
cd ~/Desktop/Antigravity/Archive3 && npm run dev        # app  → http://localhost:3000
```

Liveness: `GET /api/health`. Readiness (probes the DB): `GET /api/ready`.
If the app shows "Can't reach the server", the API is down or the free-tier
Supabase project has auto-paused (restore it from the dashboard).

## Environment

Templates: `.env.example` (frontend), `server/.env.example`, `server/.env.test.example`.
- **Frontend (build-time)**: `VITE_API_BASE`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_POSTHOG_KEY`/`_HOST`.
- **API**: Supabase URL + anon + service-role, `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, `GOOGLE_CLOUD_API_KEY`, `USDA_API_KEY`, Upstash REST
  url/token, Stripe keys + price ids + webhook secret, VAPID keys,
  `SENTRY_DSN`, `FRONTEND_URL` (CORS allow-list, comma-separated),
  `API_PUBLIC_URL`, `OAUTH_STATE_SECRET`, spend caps, `NODE_ENV`,
  `ENABLE_EXPERIMENTAL_ROUTES`.

## Quality gates

| Command | What |
|---|---|
| `npm run lint` (both repos) | ESLint 9 flat config; `no-undef` is an error |
| `npm test` (root) | Vitest + jsdom unit tests (esc, health-score, consent, router, conversions) |
| `npm test` (server) | Unit tests, no network: spend guard, usage gates, OAuth state, retry budget, auth middleware, webhook signature, error helper |
| `npm run test:integration` (server) | 20 auth/ownership/consent tests against a real Supabase project (`.env.test`) |
| `node scripts/check-regulatory-language.mjs` | Wellness-only copy lint |
| `npm run build` | Vite production build |

CI (`.github/workflows/ci.yml` in each repo) runs lint → test → build on every
push; the server integration suite runs when the Supabase secrets are set.

## Schema

`server/supabase/schema-baseline.sql` reproduces the whole database on an
empty project; `server/supabase/migrations/` is history.

## Deploy state

Not deployed. `vercel.json` (frontend, with CSP/HSTS headers) and
`server/Procfile` + `server/railway.json` (API) are in place. Set
`NODE_ENV=production`, `VITE_API_BASE`, `FRONTEND_URL`, `API_PUBLIC_URL`.

## Gotchas that bite

- Service worker registers only in prod builds; dev actively unregisters stale ones.
- Root `package.json` is `"type": "commonjs"` while `src/` is ESM — check
  syntax with `node --check --input-type=module < file.js`.
- The Supabase dashboard SPA won't render in an occluded browser window.
