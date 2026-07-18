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
- **Decision:** hash-router vanilla JS with Vite; no React migration (explicitly out of scope during redesign). React deps exist in package.json but are unmounted.
- **Reasoning (inferred):** small surface, no build-time framework tax, redesign stayed visual-layer-only. TODO: confirm whether the React deps should be removed.

### **[INFERRED]** Supabase over self-hosted Postgres/auth
- **Reasoning (inferred):** auth + RLS + pgvector + storage in one managed service for a solo builder. 

### 2026-07-08 — Quiet-luxury light redesign, tokens-first
- **Decision:** warm off-white palette, single blue accent `#2E6FF2`, Lora serif everywhere, small radii, no emojis; legacy color aliases keep ~1.5k inline styles rendering.
- **Alternatives rejected:** component-by-component rewrite (too slow); dark glassmorphism status quo ("AI slop" feel).
- **Reasoning:** 3 token files flip ~80% of the look; `DESIGN_BRIEF.md` is the authority.

### 2026-07-09 — Service worker registers in prod builds only
- **Decision:** `if (import.meta.env.PROD)` around SW registration.
- **Reasoning:** dev SW caching served stale HTML/CSS and swallowed logins (see [[gotchas]]).
