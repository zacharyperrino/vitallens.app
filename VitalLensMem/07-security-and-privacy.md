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
   signature: Stripe webhook (signature), Oura callback (HMAC-signed state),
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
| API | local JWT verify, ownership guard, `trust proxy`, per-user rate limits on AI routes, helmet, CORS allow-list, 5xx sanitizer, Sentry with body/header/cookie scrubbing, graceful shutdown, `/api/ready` |
| Cost | spend guard (Postgres aggregate, global cap fails closed) → premium → atomic usage counters; every model AND embedding call priced |
| Web | CSP (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`), HSTS, nosniff, referrer + permissions policies; auth library bundled (no CDN); `esc()` at every user/AI string sink; session tokens never in URLs |
| OAuth | HMAC-signed, 10-minute, provider-bound `state`; callback resolves the user only from it |
| Secrets | none in tracked files; `.env.example` / `.env.test.example` are placeholder templates |

## Honesty guarantees (product-level security)

- No fabricated data anywhere: the stool analyzer, mock step counts, mock
  product/OCR fallbacks, hardcoded trend lines, and the invented empty-account
  score were all removed. The wellness score reports `insufficient_data`
  until two domains are logged.
- Body-scan output is observational: no "suggested lab tests", syndromes,
  risk tiers, or triage chips.
- A CI lint (`scripts/check-regulatory-language.mjs`) fails the build on
  disease/diagnostic terms in user-facing copy or prompts; the correlation
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
