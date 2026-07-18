# Operations

## Run locally (two terminals)

```bash
cd ~/Desktop/Antigravity/Archive3/server && npm start   # API  → http://localhost:3001
cd ~/Desktop/Antigravity/Archive3 && npm run dev        # app  → http://localhost:3000
```

Health check: `curl http://localhost:3001/api/health` →
`{"status":"ok","service":"vitallens-api",...}`. If the app shows
"Failed to load … Make sure the server is running", the API process is down.

## Environment

Templates: `.env.example` (frontend) and `server/.env.example` — every var
documented there. Key groups:

- **Frontend (build-time)**: `VITE_API_BASE` (deployed API origin in prod),
  `VITE_POSTHOG_KEY`/`VITE_POSTHOG_HOST` (analytics on/off switch).
- **API**: Supabase URL + anon + service-role keys, `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, `GOOGLE_CLOUD_API_KEY`, `USDA_API_KEY` (DEMO_KEY fallback),
  Upstash REST url/token (context cache), Stripe keys + price ids + webhook
  secret, VAPID keys, `SENTRY_DSN`, `FRONTEND_URL` (CORS allow-list),
  spend caps (`MAX_USER_MONTHLY_USD` 5 / `_PREMIUM` 50 /
  `MAX_GLOBAL_MONTHLY_USD` 250), optional `INTERNAL_API_BASE`.
- `NODE_ENV=production` on deploy — the error sanitizer only engages then.

## Tests & checks

| Command | What |
|---|---|
| `npx vitest run tests/security.test.js` (in `server/`) | 19 auth/consent/ownership integration tests against real Supabase test users (`server/.env.test`) |
| `node scripts/check-regulatory-language.mjs` (repo root) | Fails on disease/diagnostic language in user-facing copy + prompts |
| `npm run build` (repo root) | Vite production build |
| `npm run eval:food` (in `server/`) | Food-scan accuracy harness — needs weighed-meal photos in `server/evals/meals/` |
| `node --check --input-type=module < file.js` | Syntax gate for frontend ESM files (root package.json is commonjs) |

## Deploy state (not yet deployed)

- `server/Procfile`: `web: node server.js` (single process — worker deleted).
- `vercel.json` present for the frontend; hosting decision still open.
- CI workflow lives in the repo (syntax + tests).
- Deploy checklist = `ROADMAP.md` Part B #5.

## Git

- Server repo (`server/`): on GitHub, pushed regularly.
- Frontend repo (root): local-only — remote creation is a user step
  (`vitallens-app`, commands in ROADMAP Part B #4).
- Migrations exported in-repo: `server/supabase/migrations/`.

## Background facts that bite

- Service worker registers only in prod builds (`import.meta.env.PROD`) — dev
  caching bugs were caused by it and it must stay dev-disabled.
- The Supabase dashboard SPA won't hydrate in an occluded/background Chrome
  window — bring the window to the foreground for dashboard automation.
- Root `package.json` is `"type": "commonjs"` while `src/` is ESM (Vite
  handles it); plain `node --check` on frontend files needs
  `--input-type=module` via stdin.
