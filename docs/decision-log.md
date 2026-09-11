---
tags: [decisions, log]
status: living
---

# Decision log

> **Template**
> ### YYYY-MM-DD — Decision title
> - **Decision:**
> - **Alternatives rejected:**
> - **Reasoning:**

Entries below are reconstructed from the code, migrations, and commit history.

### 2026-09-10 — Portfolio framing: make every feature work honestly rather than cut features
- **Decision:** keep the full feature set (13 areas) but remove every source of fabricated data and make each feature complete and safe; ship practitioner sharing + genomics behind `ENABLE_EXPERIMENTAL_ROUTES` instead of deleting them.
- **Alternatives rejected:** the audit's "narrow to food scanning" pivot (right for a business, wrong for a portfolio piece); leaving simulated modules in with disclaimers.
- **Reasoning:** the goal is to demonstrate complete, secure, viable development. A feature that invents numbers is a liability, not a feature.

### 2026-09-10 — Verify JWTs locally instead of a network call per request
- **Decision:** `jose` + the project JWKS in `requireAuth`; remote `getUser` only as a legacy fallback.
- **Reasoning:** removes 50–200 ms and an auth-quota hit from every request; a 503 replaces a hung request when auth is unreachable.

### 2026-09-10 — Cost controls computed in the database
- **Decision:** `sum_ai_spend()` and `increment_usage()` Postgres functions; global cap fails closed.
- **Alternatives rejected:** client-side row sums (silently capped at 1,000 rows by PostgREST); read-modify-write counters (raced into permanent fail-open).

### 2026-09-10 — One `user_id` type, real cascades
- **Decision:** convert the nine `text` `user_id` columns to `uuid`, add `ON DELETE CASCADE` to `auth.users` everywhere, delete the hand-maintained table list.
- **Reasoning:** erasure must be complete by construction, not by remembering to update a list.

### 2026-09-10 — Signed OAuth state; the user id never rides in the URL
- **Decision:** HMAC-signed, provider-bound, 10-minute `state`; public callback resolves the user only from it.
- **Reasoning:** the raw-id `state` let anyone bind their wearable tokens to a victim's account.

### 2026-09-10 — Offline writes are never reported as saved
- **Decision:** the service worker returns 503 + `{queued:true}`; the page shows "saved offline, pending sync"; replays re-mint the token and are capped.
- **Reasoning:** a synthetic 200 was a data-loss lie.


Items marked **[INFERRED]** predate the recorded history — verify.

### 2026-07-09 — Delete the BullMQ queue stack
- **Decision:** remove `queue.js`, `worker.js`, the `worker` script, and the bullmq dep; run all AI analysis synchronously in-request.
- **Alternatives rejected:** wiring producers into the routes (second process + Upstash TCP dependency for zero current benefit).
- **Reasoning:** workers existed but nothing ever enqueued; one-process deploy is cheaper and simpler; rate limits + spend caps already bound the work. Upstash REST stays for the context cache only.

### 2026-07-08 — Versioned consent gate before anything else
- **Decision:** append-only `user_consents` keyed on (user, document, version); the SPA blocks until all 4 current versions are accepted.
- **Alternatives rejected:** single boolean "agreed" flag on profiles.
- **Reasoning:** version bump ⇒ automatic re-prompt; immutable history is the defensible record for a health-adjacent app.

### 2026-07-08 — Wellness-only language, enforced mechanically
- **Decision:** one canonical `WELLNESS_SYSTEM_PROMPT`; a repo lint (`check-regulatory-language.mjs`) that fails on diagnostic/disease terms; a Haiku second pass reviewing correlation output; medications = logging only; genomics + practitioner frozen.
- **Alternatives rejected:** relying on prompt discipline alone.
- **Reasoning:** keeps the app clearly outside medical-device/diagnostic territory until counsel signs off.

### 2026-07-08 — Hard dollar spend guard in front of every model call
- **Decision:** monthly caps summed from `api_cost_log` ($5 free / $50 premium / $250 global, env-overridable), checked before usage gates; premium does NOT bypass it.
- **Alternatives rejected:** provider-dashboard billing alerts only; per-request pricing without a ceiling.
- **Reasoning:** makes surprise bills structurally impossible; the cost log the guard reads is written by the same `trackCost` calls it protects — closed loop.

### 2026-07-04→08 — One global ownership guard instead of per-route checks
- **Decision:** middleware on `/api`: any `userId` in query/body must equal the JWT's user id, else 403.
- **Alternatives rejected:** auditing/patching ~36 routes individually (`requireSelf` everywhere).
- **Reasoning:** one seal covers current and future routes; per-route `requireSelf` retained where it adds clarity. Proven by 19 integration tests.

### 2026-07-04 — RLS everywhere + service-role only on the server
- **Decision:** owner policies on every table (initplan-optimized form); frontend uses anon key; server uses service-role.
- **Alternatives rejected:** trusting the API layer alone.
- **Reasoning:** two independent layers; direct-from-SPA reads stay safe even if a route slips.

### 2026-07 — Barcode-first gate on food scans
- **Decision:** if the photo contains a barcode, resolve via product DBs and skip GPT-4o entirely; model outputs labels+grams only, calories come from lookup (HARDCODED → USDA → OFF).
- **Alternatives rejected:** vision-model calorie estimation for everything.
- **Reasoning:** packaged food is exact + free via lookup; grams×per-100g beats model guessing; big cost reduction.

### **[INFERRED]** Vanilla-JS SPA over a framework
- **Decision:** hash-router vanilla JS with Vite, plus React 19 "islands" for the four richest widgets (wellness score card, pattern discovery, nutrition tracker, hygiene result) mounted via `mountReact`.
- **Reasoning (inferred):** small surface, no framework tax on simple pages; React where local state gets complex.

### **[INFERRED]** Supabase over self-hosted Postgres/auth
- **Reasoning (inferred):** auth + RLS + pgvector + storage in one managed service for a solo builder. 

### 2026-07-08 — Quiet-luxury light redesign, tokens-first
- **Decision:** warm off-white palette, single blue accent `#2E6FF2`, Lora serif everywhere, small radii, no emojis; legacy color aliases keep ~1.5k inline styles rendering.
- **Alternatives rejected:** component-by-component rewrite (too slow); dark glassmorphism status quo ("AI slop" feel).
- **Reasoning:** 3 token files flip ~80% of the look; `DESIGN_BRIEF.md` is the authority.

### 2026-07-09 — Service worker registers in prod builds only
- **Decision:** `if (import.meta.env.PROD)` around SW registration.
- **Reasoning:** dev SW caching served stale HTML/CSS and swallowed logins (see [[gotchas]]).
