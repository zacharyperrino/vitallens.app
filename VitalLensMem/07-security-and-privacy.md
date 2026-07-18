# Security & privacy

## Auth chain (API)

1. `requireAuth` (`server/middleware/auth.js`) — verifies the Supabase Bearer
   JWT, sets `req.user`. 401 without a valid token.
2. **Global ownership guard** (`server.js`) — if the request names a `userId`
   (query or body) that ≠ `req.user.id` → 403. Covers every authenticated
   route, current and future, in one middleware.
3. `requireSelf` — per-route variant used where explicit.
4. Practitioner data additionally requires an `active` `practitioner_links`
   row (consent), else 403 even for authenticated callers.

Proven by `server/tests/security.test.js` — **19 integration tests** with real
JWTs: practitioner consent gate (403 no-link / 200 active-link / 403 identity
mismatch), export 401/403/200, cross-user 403s on medications, water, cycle,
custom-correlation, health-profile, supplements, user-goals, biomarker-history,
meal-memory, hygiene-history; self-access still succeeds.

## Defense layers

| Layer | Mechanism |
|---|---|
| DB | RLS owner policies on every table; hardened RPCs (see 06-database) |
| API | JWT auth, ownership guard, 60 req/min global limiter, `heavyAILimiter` on engines, helmet, CORS allow-list from `FRONTEND_URL`, 5xx error sanitizer in production |
| XSS | `esc()` applied at every innerHTML interpolation of user/AI strings (scanner pages had 25+ sinks); `showToast` uses `textContent` |
| Cost abuse | spend guard ($5/$50/$250 monthly caps) + free-tier count gates + per-model cost logging |
| Secrets | none in tracked files (audited); `.env.example` templates are clean and committable; a real OpenAI key briefly sat in the ignored `.env.example` — never committed; rotation optional |

## Consent & regulatory posture

- **Consent gate** blocks the app until the current versions of 4 documents
  are accepted; records are append-only and versioned (version bump ⇒
  automatic re-prompt). E2E-verified for fresh users.
- **Wellness-only framing**: canonical `WELLNESS_SYSTEM_PROMPT`; a repo lint
  (`scripts/check-regulatory-language.mjs`) fails on disease/diagnostic terms
  in user-facing copy and prompts; the correlation engine runs a Haiku
  language-safety second pass on its own output.
- **Medications = logging only** (no interactions/dosage/clinical logic).
  **Genomics + practitioner views are frozen** pending counsel.
- Legal drafts in `legal/*.md` are counsel-gated; in-app pages render them.
- Privacy audit of image-handling routes: `server/PRIVACY_AUDIT.md`
  (images processed in-memory, not persisted server-side).

## Known open items (as of 2026-07-15)

1. **LAUNCH BLOCKER:** Supabase "Confirm signup" email template is empty — the
   email arrives with no `{{ .ConfirmationURL }}` link, so real users cannot
   confirm accounts. Everything downstream of the email (verify endpoint,
   session redirect, first sign-in → consent gate) is proven healthy. Fix is a
   2-minute dashboard template edit — exact HTML in `ROADMAP.md` §8b.
2. Leaked-password protection: Supabase dashboard toggle still off (user step).
3. Attorney review of the legal drafts before launch.
