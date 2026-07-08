# VitalLens Hardening Roadmap — Execution Record

**Date:** 2026-07-08
**Scope:** Legal/regulatory, cost control, security, food-scan accuracy, deploy readiness, version control.

This is a truthful record. "Done" means implemented **and** verified by a test, a build, a live DB check, or a browser check — the evidence is noted. Items only I could do are marked ✅. Items that need you (money, accounts, a lawyer, real data) are in **Part B**.

An honesty note you asked me not to sugar-coat: I can engineer to *no known gaps*. I cannot certify *zero legal risk* — only a licensed healthtech attorney can, and this app handles some of the most sensitive data categories there are. The legal docs I wrote are strong, launch-oriented **drafts** and are labeled as such. Treat attorney sign-off as a hard gate, not a nicety.

---

## Part A — Done and verified ✅

### 1. Version control (was: 61 files uncommitted, local-only)
- Frontend repo committed in logical chunks; server split into its own repo (`vitallens-server`) and **pushed to its GitHub remote** (`cb8b9f3 → …`). Embedded-repo trap fixed via `.gitignore`.
- **Evidence:** `git log` on both repos; server pushes to `origin/main` succeed.
- ⚠️ The **frontend repo still has no remote.** Create a private GitHub repo and `git remote add origin … && git push` — see Part B.

### 2. Security — "nobody can touch another user's data"
- **App-wide ownership guard** in `server/server.js`: any authenticated request naming a `userId` (query or body) that isn't the caller's is rejected `403`, for every route, current and future. This closes ~40 routes that previously had no `requireSelf`.
- **Stored-XSS sweep:** new `src/utils/esc.js`; every user/AI-controlled string interpolated into `innerHTML` across the food, hygiene, and body scanners is now HTML-escaped.
- CORS locked to an allow-list (`FRONTEND_URL`) instead of wildcard.
- Hardcoded secrets removed from source (client USDA key deleted; server USDA fallback and Upstash host moved to env).
- **Evidence:** `server/tests/security.test.js` — **17/17 passing**, including new tests proving cross-user `403` on `health-profile`, `supplements`, `user-goals`, `biomarker-history`, `meal-memory`, `hygiene/history`, and that own-access still returns `200`.

### 3. Regulatory language — wellness framing, zero disease claims
- Retired the clinical scan modes (eye pallor/anemia, skin ABCDE/melanoma, nail systemic) from the UI **and** hard-rejected them server-side (`biomarker.js` allow-list: face/body/tongue only). Deleted the eye/skin/nail AI prompts entirely.
- Neutralized disease language everywhere it appeared: body-scanner copy, heart-rate interpretations, the TCM data file (removed "possible anemia / infection" Western translations, kept traditional constructs), disclaimers.
- New **CI lint** `scripts/check-regulatory-language.mjs` fails the build if banned terms return.
- **Evidence:** `node scripts/check-regulatory-language.mjs` → "✓ No disease/diagnostic language."

### 4. Legal surface (drafts + working consent system)
- **Privacy Policy** and **Terms of Service** drafted (`legal/*.md`) — health-data + AI-subprocessor aware (GDPR/CCPA/WA-MHMDA/BIPA), with subprocessor list, data rights, retention, biometric notice. **Marked DRAFT — needs counsel.**
- **`user_consents`** table (Supabase) — append-only, RLS-isolated, unique per (user, doc, version).
- **`/api/consents`** (record) + **`/api/consents/status`** (what's owed); versions bump-to-re-consent.
- **Router-enforced consent gate**: an authenticated user who hasn't accepted the current versions is blocked from the entire app until they do. Signup also has a required consent checkbox. In-app legal pages at `#/legal/terms` and `#/legal/privacy`.
- **Froze** the genomics and practitioner-portal routes (unmounted pending counsel) — biggest liability surfaces with no shipped frontend.
- **Evidence (live browser + DB):** consent gate rendered for a returning user; unchecked-box path blocked; on accept, **all three consent rows persisted** (verified via SQL) and the app advanced past the gate; legal pages render from the markdown.

### 5. Cost control — "bills can't surprise me"
- Reality check: chat was **not** all-Haiku — `selectModel` escalated to Sonnet on words like "why/explain/summary/suggest", and all four analysis engines + both queue processors + biomarker hardcoded Sonnet. Fixed:
  - **All analysis + chat + biomarker calls downgraded Sonnet → Haiku 4.5** (~4× cheaper; fine for pattern narration).
  - **Hard monthly dollar ceiling** (`server/services/spend-guard.js`) enforced *before every model call* and applied to **everyone, including premium** — previously premium bypassed all limits. Env-configurable: `MAX_USER_MONTHLY_USD` (5), `MAX_USER_MONTHLY_USD_PREMIUM` (50), `MAX_GLOBAL_MONTHLY_USD` (250).
  - **`/api/usage/spend`** — self-serve month-to-date burn.
- **Evidence:** security suite still 17/17 with the guard in the gate path; `node --check` on all changed services.

### 6. Food-scan accuracy (toward Cal AI grade)
- Capture resolution bumped 1200 → **1536px @ 0.85** for finer portion/ingredient detail.
- Confirmed the vision call already uses `detail: 'high'`, `temperature: 0`, and a strict `json_schema` response format, feeding the 3-tier nutrition lookup (hardcoded → USDA → Open Food Facts) with the corrections flywheel.
- The remaining accuracy lever is **data, not code** — see Part B (weighed-meal eval set).

### 7. Deploy readiness
- **PWA stale-build trap fixed:** `sw.js` is now network-first for the HTML shell (deploys reach users immediately), cache-first only for immutable `/assets/*`, with `skipWaiting`/`clients.claim`.
- **CI** for both repos (`.github/workflows/ci.yml`): install → regulatory lint / syntax → tests (server, secret-gated) → build.
- **Deploy configs:** `vercel.json` (SPA rewrites + asset caching) for the frontend; `Procfile` (web + worker) and `railway.json` (health check on `/api/health`) for the server.
- **Cleanup:** root `package.json` fixed (`name: vitallens`, `private: true`, `license: UNLICENSED`, dead `main` removed); `morgan` gated to prod format; dead `src/dataset/` scaffold removed; **`npm audit` → 0 vulnerabilities** in both repos.
- **Evidence:** `npm run build` succeeds; `npm audit` clean both repos.

---

## Part B — Your next steps (I can't do these)

### Legal (do before ANY real user)
1. **Attorney review** of `legal/privacy-policy.md` and `legal/terms-of-service.md`. Fill the bracketed placeholders (governing-law jurisdiction, arbitration/class-waiver). This is the gate — the drafts are a starting point, not sign-off.
2. Stand up **support@vitallens.app** and **privacy@vitallens.app** (referenced in the docs).
3. Decide the launch geofence (recommended: **US-only at launch** to sidestep GDPR Art. 9 complexity until you have DPAs with each subprocessor).

### Accounts / config / money
4. **Frontend git remote:** create a private repo and push (frontend is still local-only).
5. Set production env before deploy: `NODE_ENV=production`, `VITE_API_BASE=<server URL>`, `FRONTEND_URL=<frontend URL>`, and the spend caps if you want different numbers.
6. **Supabase dashboard:** enable leaked-password protection (30-second toggle); confirm you're on a plan with daily backups/PITR.
7. Finish **Oura OAuth** (real client id/secret) if you want real steps/sleep before a native wrap.
8. Turn on **PostHog** (uncomment + key) — you currently have zero product analytics, which is the biggest blind spot for your unit-economics story.

### Data (this is what makes the scanner "Cal AI grade")
9. **Populate `server/evals/meals/`** with 10–20 photos of **weighed** meals + ground-truth grams/calories, then run `npm run eval:food`. Until this exists, scanner accuracy is an assertion, not a measurement. This is the single highest-leverage thing you can do for the core product.

### Follow-ups I recommend (not blocking)
10. Re-consent gate currently records on accept; if you bump a document version, existing users will be re-prompted automatically — verify that flow once you have real users.
11. The `body`/`face` wellness prompts still use functional-medicine "organ signal" framing (e.g., "liver/kidney signals"). The automated lint passes, but have counsel glance at it — it's softer than disease claims but not nothing.
12. Consider migrating the ~1,500 inline styles to the existing React-island components over time (tech debt, not urgent).
13. Wire the BullMQ producers or delete the queue stack — it's still half-built (workers exist, nothing enqueues).

---

## Verification summary
| Area | Check | Result |
|---|---|---|
| Security | `vitest run tests/security.test.js` | 17/17 pass |
| Regulatory | `node scripts/check-regulatory-language.mjs` | ✓ clean |
| Consent flow | live browser + SQL on `user_consents` | 3 rows recorded, gate enforced |
| Build | `npm run build` | ✓ builds |
| Dependencies | `npm audit` (both repos) | 0 vulnerabilities |
| Cost | model audit + spend-guard in gate path | Haiku everywhere; hard cap active |
