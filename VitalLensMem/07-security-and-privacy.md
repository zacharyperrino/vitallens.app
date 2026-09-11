# Security & privacy

## Auth chain (API)

1. `requireAuth` — Supabase JWT verified **locally** against the project JWKS
   (`jose`; issuer + audience checked). 401 on bad/expired token; 503 if the
   key set can't be fetched (never a hung request).
2. **Global ownership guard** (`server.js`) — any `userId` **or `user_id`** in
   query/body must equal the token's `sub`, else 403. One middleware, every
   authenticated route.
3. Multipart routes (`/vision-scan`, `/biomarker-scan`, `/parse-labs`,
   `/genomics/upload`) take the user from `req.user.id` — the body isn't
   parsed until after the guard, so it is never trusted.
4. Public-by-design routes each authenticate themselves or verify a
   signature: Stripe webhook (signature; exempt from the per-IP limiter), Oura callback (HMAC-signed state, verified inside its `try` — `verifyState` never throws),
   billing status/checkout (`requireAuth` inline; user from the token).

Proven by `server/tests/security.test.js` — **20 integration tests** with real
JWTs (practitioner consent gate, export 401/403/200, cross-user 403s on ten
routes, billing IDOR regressions) — plus unit tests for the spend guard,
usage gates, OAuth state, retry budget, auth middleware, and webhook
signatures (see `08-operations.md`).

## Defense layers

| Layer | Mechanism |
|---|---|
| DB | RLS owner policies on every table; `uuid` user ids with cascade FKs; hardened RPCs (service_role-only where they read `auth.users` or write counters) |
| API | local JWT verify, ownership guard, `trust proxy`, per-user rate limits on AI routes, helmet, CORS allow-list, 5xx sanitizer, Sentry preloaded via `--import` with body/query/cookie/auth-header scrubbing, `unhandledRejection`/`uncaughtException` captured, graceful shutdown (60 s grace), one-row `/api/ready`; timeouts on every outbound call (per-attempt AI, 15 s DB, 10 s Oura) |
| Cost | spend guard (Postgres aggregate, global cap fails closed) → premium → atomic usage counters; every model AND embedding call priced; caps read with `envNumber` (`0` = kill switch); validation precedes the gate so a 400 never burns quota |
| Web | CSP (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`), HSTS, nosniff, referrer + permissions policies; auth library and `posthog-js` bundled (no CDN; PostHog dynamic-imported only when keyed, no session recording); `connect-src` allow-lists Supabase, the API, `*.posthog.com`, `www.strava.com`; `esc()` at every user/AI string sink; session tokens never in URLs |
| OAuth | HMAC-signed, 10-minute, provider-bound `state`; callback resolves the user only from it |
| Logs | copilot logs carry message lengths and tool names/input keys only — never question text or tool inputs (console breadcrumbs reach Sentry) |
| Secrets | none in tracked files; `.env.example` / `.env.test.example` are placeholder templates; `server/.env.test` is git-ignored and holds placeholders |

## Honesty guarantees (product-level security)

- No fabricated data anywhere: the stool analyzer, mock step counts, mock
  product/OCR fallbacks, hardcoded trend lines, and the invented empty-account
  score were all removed. The wellness score reports `insufficient_data`
  until two domains are logged; nutrition is scored only against the
  profile's calorie target (no 2,000 kcal default); there is no 10,000-step
  goal; the trend is `null` until two weekly scores; Strava calories,
  untouched RPE, unmatched food ratings, and failed product scores stay
  `null` rather than estimated.
- Body-scan output is observational: no "suggested lab tests", syndromes,
  risk tiers, or triage chips; face results carry no Collagen / Skin-barrier /
  hydration tiles and the prompt no longer asks for those fields; pulse
  check-ins store no overall score.
- A CI lint (`scripts/check-regulatory-language.mjs`) fails the build on
  disease/diagnostic terms in user-facing copy or prompts (and bans the retired
  `pallor_present` / `drooping_present` / `fungal_pattern` identifiers); the correlation
  engine runs a Haiku second pass on its own output.
- Medications is logging only. Practitioner sharing and genomics ship OFF
  behind `ENABLE_EXPERIMENTAL_ROUTES`.

## Consent & data rights

- Versioned consent gate (append-only `user_consents`); a version bump
  re-prompts; the gate **fails closed**.
- Export (JSON of every table) and deletion (email-confirmed; cascades through
  every table) are in Profile → Your data.
- Privacy audit of image handling: `server/PRIVACY_AUDIT.md`.

## Open items that only the owner can close

1. Rotate the keys that lived in `server/.env.test` (never committed).
2. Supabase dashboard: fix the "Confirm signup" email template; enable
   leaked-password protection.
3. Legal drafts (`legal/*.md`) remain drafts until reviewed by counsel.

**Accessibility (2026-09-11):** axe-core (WCAG 2.0/2.1 A+AA + best practice) reports 0 violations on all 11 authenticated routes; contrast tokens: `--accent #1A55CC`, `--text-secondary #5E5E5E`, `--text-tertiary #666666`, `--viz-green-text`, `--viz-amber-text`; links in running text are underlined; heading levels are sequential everywhere.
