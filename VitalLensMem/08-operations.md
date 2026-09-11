# Operations

## Run locally (two terminals)

```bash
cd ~/Desktop/Antigravity/Archive3/server && npm start   # API  → http://localhost:3001  (= node --import ./instrument.js server.js)
cd ~/Desktop/Antigravity/Archive3 && npm run dev        # app  → http://localhost:3000
```

Liveness: `GET /api/health`. Readiness (one-row `select` on `profiles`): `GET /api/ready`.
`npm start`, `Procfile` and `railway.json` all preload `instrument.js` with
`--import`; that is what instruments Express for Sentry under ESM.
If the app shows "Can't reach the server", the API is down or the free-tier
Supabase project has auto-paused (restore it from the dashboard).

## Environment

Templates: `.env.example` (frontend), `server/.env.example`, `server/.env.test.example`.
- **Frontend (build-time)**: `VITE_API_BASE` (unset in a production build →
  falls back to `https://api.vitallens.app`; `vite.config.js` warns),
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_POSTHOG_KEY`/`_HOST`
  (optional; PostHog is bundled and off without the key),
  `VITE_VAPID_PUBLIC_KEY` (optional; enables web-push subscription).
- **API**: Supabase URL + anon + service-role, `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, `GOOGLE_CLOUD_API_KEY`, `USDA_API_KEY`, Upstash REST
  url/token, Stripe keys + price ids + webhook secret, `VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` (optional; web push),
  `SENTRY_DSN`, `FRONTEND_URL` (CORS allow-list, comma-separated),
  `API_PUBLIC_URL`, `OAUTH_STATE_SECRET`, spend caps (`0` = kill switch), `NODE_ENV`,
  `ENABLE_EXPERIMENTAL_ROUTES`.

## Quality gates

| Command | What |
|---|---|
| `npm run lint` (both repos) | ESLint 9 flat config; `no-undef` is an error |
| `npm test` (root) | 60 Vitest + jsdom unit tests (esc, health-score, consent, router, profile-shared conversions) |
| `npm test` (server) | 74 unit tests, no network: spend guard (incl. the `0` cap), usage gates, OAuth state (incl. multibyte signatures), ai-fetch retries + per-attempt timeout, auth middleware, webhook signature, error helper |
| `npm run test:integration` (server) | 20 auth/ownership/consent tests against a real Supabase project (`.env.test`) |
| `node scripts/check-regulatory-language.mjs` | Wellness-only copy lint |
| `npm run build` | Vite production build |

CI (`.github/workflows/ci.yml` in each repo) runs lint → test → build on every
push; the server integration suite runs when the Supabase secrets are set.

## Schema

`server/supabase/schema-baseline.sql` reproduces the whole database on an
empty project; then run `server/supabase/seed/additive_classifications.sql`
(28 reference rows — without it every additive scores `unknown`).
`server/supabase/migrations/` is history (see its `README.md`).

## Deploy state

Not deployed. `vercel.json` (frontend, with CSP/HSTS headers) and
`server/Procfile` + `server/railway.json` (API; start command
`node --import ./instrument.js server.js`, health check `/api/ready`) are in
place. Set `NODE_ENV=production`, `VITE_API_BASE`, `FRONTEND_URL`,
`API_PUBLIC_URL`. Optional: VAPID keys (web push) and a PostHog key.

## Gotchas that bite

- Service worker registers only in prod builds; dev actively unregisters stale ones.
- Root `package.json` is `"type": "commonjs"` while `src/` is ESM — check
  syntax with `node --check --input-type=module < file.js`.
- The Supabase dashboard SPA won't render in an occluded browser window.
- Sentry must be *preloaded* (`node --import ./instrument.js`). Importing
  `instrument.js` from `server.js` runs after Express is imported and
  instruments nothing.
- A spend cap of `0` is a kill switch — don't "fix" `envNumber` back to
  `Number(x) || default`.

## Web push reminders (optional)

`services/push-reminders.js` runs inside the API process when `VAPID_EMAIL`, `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set: every 15 minutes it selects profiles with `push_enabled` and a stored `push_subscription`, and sends one "Evening check-in" reminder per local day (8 pm in `profiles.timezone`, UTC fallback), recording `profiles.last_push_at`; a 404/410 from the push service unsubscribes the user. Without VAPID keys the scheduler is a no-op and `/api/push/*` answers 503, while in-page reminders keep working. Sentry tracing is off (`tracesSampleRate: 0`) and `beforeSendTransaction` scrubs URLs so query strings never leave the process.
