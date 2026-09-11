# VitalLens — Roadmap & Owner Checklist

**Framing (2026-09-10):** VitalLens is a portfolio project. The bar is *complete,
honest, secure, accessible, viable* — not user growth. The full audit and its
remediation live in `AUDIT-2026-09.md`; per-area detail in `VitalLensMem/` and
the Obsidian vault in `docs/`.

---

## Part A — Done in the post-audit hardening (2026-09-10)

Every item below is committed, verified by a gate (lint / test / build / live
check), and described in the audit's remediation addendum.

**Honesty** — every fabrication removed: stool analyzer (random "microbiome %"
and urgent-care strings), mock step counts, mock product/OCR fallbacks,
hardcoded trend line, invented empty-account score, body-scan lab suggestions /
syndromes / risk tiers / triage. Wellness score reports `insufficient_data`
until two domains are logged; nutrition targets come only from the profile.

**Security** — local JWT verification (jose + JWKS); multipart ownership bypass
closed; billing IDORs closed (+3 regression tests); HMAC-signed OAuth state;
CSP/HSTS/nosniff/frame-ancestors; auth library bundled (no CDN); `esc()` at
every user/AI sink; Sentry actually capturing (with PHI scrubbed); `trust
proxy`; graceful shutdown; `/api/ready`.

**Cost control** — spend guard aggregated in Postgres (never a 1,000-row scan)
and failing *closed* on the global cap; atomic `increment_usage` RPC; three
formerly-ungated AI routes gated; embeddings priced; copilot tools no longer
401 and retry 5×.

**Data** — `user_id` unified to `uuid` on every table with cascade FKs to
`auth.users` (account deletion is complete by construction); hot-path indexes;
full `schema-baseline.sql` in the repo; `profiles.timezone`.

**Product** — Medications and Cycle tabs (backends that had no UI); Steps page
from real data; Profile: subscription (Stripe checkout $9.99/mo · $79/yr),
Oura connect, notifications, MFA enrol/disable, JSON export, email-confirmed
deletion; analytics React components mounted; weekly summary renders on load;
offline writes reported honestly; 404 / error-boundary / offline states;
consent gate fails closed; MFA skip remembered; onboarding Back buttons.

**Accessibility** — real buttons, associated labels, ARIA roles/live regions,
visible focus, ≥4.5:1 contrast, distinct error red, 44px touch targets,
pinch-zoom enabled, reduced-motion respected, web manifest + icons.

**Quality** — unit tests (frontend jsdom + server mocked) and 20 integration
tests; ESLint 9 + Prettier; CI runs lint → test → build in both repos.

**Post-review fixes** (second adversarial pass on the hardening diff; fe
`fbbcb67`, srv `d6794a3`) — orphan backends wired to UI: Analytics "Early
patterns" + "Explore a correlation" cards, Profile "AI usage" card, web-push
subscribe/unsubscribe; the never-used `water` route + `water_log` table removed
(`habits.water_glasses` is the one source); API contracts fixed (barcode lookup
sends the real user id, NutritionTracker reads `json.data`, dosha saves to
`profiles`, "Log to Food Diary" writes `meals` then ingests, Cycle renders
`events` + Ovulation, supplements `category` persists); no invented defaults
left (calorie target, step goal, trend, RPE, activity level, Strava calories,
food ratings, product score); OAuth state never throws; Sentry preloaded via
`--import`; per-attempt AI timeouts; validation before the daily gate; `0`
spend cap honoured; no health text in logs; PostHog bundled (CSP unchanged).

---

## Part B — Owner steps (cannot be done from the codebase)

| # | Step | Where | Time |
|---|---|---|---|
| 1 | **Restore the "Confirm signup" email template** (body has no `{{ .ConfirmationURL }}`; new users can't activate). Then do one real signup. | Supabase → Authentication → Email Templates | 2 min |
| 2 | **Rotate** the OpenAI, Anthropic, Supabase service-role, Stripe, Upstash keys that sat in `server/.env.test` (never committed; scrubbed). Paste new values into `server/.env` and `.env.test`. | Provider dashboards | 30 min |
| 3 | **Create the private GitHub repo** `vitallens-app` and push: `git remote add origin https://github.com/zacharyperrino/vitallens-app.git && git push -u origin main` | github.com/new | 2 min |
| 4 | **Add CI secrets** to the server repo (`SUPABASE_URL`, anon + service keys, `TEST_USER_A/B_EMAIL/PASSWORD`) so the integration suite runs in CI. | GitHub → Settings → Secrets | 5 min |
| 5 | Leaked-password protection toggle. | Supabase → Auth → Attack protection | 30 s |
| 6 | *Optional:* Oura developer credentials, Stripe live keys, a Pro Supabase plan (stops the weekly free-tier auto-pause). | — | — |
| 7 | *Optional:* VAPID keys (server `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` + frontend `VITE_VAPID_PUBLIC_KEY`) to turn on web push; a PostHog key (`VITE_POSTHOG_KEY`) for product analytics. Both are off until set. | server `.env` + frontend build env | 5 min |

---

## Part C — Nice-to-have polish

- Migrate the remaining inline `style=` attributes (795 at last count, down
  from ~1,500) to utility classes.
- Screenshots or a short demo clip in `README.md`.
- Populate `server/evals/meals/` with weighed-meal photos and run
  `npm run eval:food` to publish a measured scan-accuracy number.
