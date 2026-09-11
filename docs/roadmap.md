---
tags: [roadmap, changelog]
status: living
---

# Roadmap

**Framing (2026-09-10):** VitalLens is a portfolio project. The goal is a
complete, honest, secure, accessible app — not user growth. The operational
checklist lives in the repo root `ROADMAP.md`; the audit and its remediation
in `AUDIT-2026-09.md`.

## Owner steps (cannot be done from the codebase)

1. **Supabase dashboard**: restore the "Confirm signup" email template (2 min);
   enable leaked-password protection.
2. **Rotate** the API keys that lived in `server/.env.test` (never committed).
3. **GitHub**: create the private `vitallens-app` repo and push the frontend;
   add the CI secrets to the server repo so the integration suite runs.
4. Optional: Oura developer credentials, Stripe live keys; VAPID keys (server
   `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` + frontend
   `VITE_VAPID_PUBLIC_KEY`) to turn on web push; a PostHog key
   (`VITE_POSTHOG_KEY`) for product analytics.

## Done (2026-09-10 hardening)

- All fabricated data removed; wellness score honest; targets real.
- Security: local JWT verification, multipart guard bypass closed, billing
  IDORs closed, signed OAuth state, CSP/HSTS, bundled auth library, esc() at
  every sink, Sentry actually capturing.
- Cost control: Postgres-aggregated spend guard (fails closed), atomic usage
  counters, embeddings priced.
- Data: `user_id` unified to uuid, cascade FKs everywhere, hot-path indexes,
  full schema baseline in the repo.
- Product: Medications + Cycle UI, Steps page from real data, Profile account
  controls (billing, wearables, notifications, MFA, export, delete),
  analytics components mounted, honest offline writes, 404/error/offline
  states, accessibility foundations (buttons, labels, focus, contrast, 44px).
- Quality: unit + integration tests (60 frontend; 74 unit + 20 integration on
  the server), ESLint/Prettier, CI in both repos.
- Post-review fixes: orphan backends wired (Early patterns, Explore a
  correlation, AI usage card, web push); `water` route + table removed; API
  contracts fixed (barcode user id, NutritionTracker, dosha, Log to Food
  Diary, Cycle events, supplement category); no invented defaults left; OAuth
  state never throws; Sentry preloaded; per-attempt AI timeouts; PostHog
  bundled.

## Later (nice-to-have for the portfolio)

- Migrate the remaining inline styles (455 at last count) to utility classes.
- Screenshots / short demo video in the README.

Related: [[_home]] · [[features]] · [[decision-log]]
