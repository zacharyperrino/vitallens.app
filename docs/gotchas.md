---
tags: [bugs, gotchas, log]
status: living
---

# Gotchas & bug log

> Entries marked **RESOLVED 2026-09-10** were fixed in the post-audit hardening; kept for history.

> **Template**
> ### Symptom
> - **Cause:**
> - **Fix:**

### Confirmation emails arrive with no link (OPEN — owner dashboard step)
- **Cause:** the Supabase "Confirm signup" email template body is empty — only the "powered by Supabase" footer renders; `{{ .ConfirmationURL }}` content is missing.
- **Fix:** dashboard → Authentication → Email Templates → Confirm signup → restore body (exact HTML in `ROADMAP.md` §8b). Verify endpoint + redirect + first-sign-in are proven healthy. Check reset-password/magic-link templates too.

### Dev site served stale HTML/CSS; login silently swallowed; CSS loaded as HTML (black page)
- **Cause:** the PWA service worker cached dev responses.
- **Fix:** SW registers only in prod builds (`import.meta.env.PROD` in `src/main.js`). Never re-enable in dev.

### RAG silently returned nothing — RESOLVED 2026-09-10 (the `/api/ingest` stub was also the reason the corpus stayed empty; it now writes + embeds)
- **Cause:** duplicate `match_health_events` overloads (3-arg + 5-arg) made PostgREST RPC resolution ambiguous.
- **Fix:** dropped the 3-arg overload; canonical 5-arg kept, `search_path` pinned.

### ivfflat index build fails: `54000: memory required is 61 MB, maintenance_work_mem is 32 MB`
- **Fix:** run in a transaction with `SET LOCAL maintenance_work_mem='128MB'`, or lower `lists`.

### Any authenticated user could write another user's nutrition rollup (IDOR)
- **Cause:** a SECURITY DEFINER text-arg overload of `increment_daily_nutrition` bypassed RLS.
- **Fix:** dropped it; uuid SECURITY INVOKER version remains (RLS enforces ownership).

### Analytics page: "Failed to load analytics data. Make sure the server is running."
- **Cause:** only Vite (:3000) was running; the API (:3001) was down.
- **Fix:** start both processes — see `VitalLensMem/08-operations.md` ([[08-operations]] if vault-rooted).

### Food scan items misaligned with results — RESOLVED
- **Cause:** batch nutrition lookup dropped unmatched items, shifting indexes.
- **Fix:** index-preserving lookup — unmatched items get a generic ~1.5 kcal/g estimate instead of being removed.

### `node --check` fails on frontend files ("Cannot use import statement outside a module")
- **Cause:** root `package.json` is `"type": "commonjs"`; `src/` is ESM (Vite handles it).
- **Fix:** syntax-check via stdin: `node --check --input-type=module < file.js`.

### Supabase dashboard automation renders black/empty
- **Cause:** the dashboard SPA suspends rendering in an occluded/background Chrome window.
- **Fix:** bring the window to the foreground before driving it.

### White-on-white UI leftovers after the light redesign — RESOLVED
- **Cause:** components styled for the old dark theme (e.g. `.oura-connect-btn` used `rgba(255,255,255,…)` + white text).
- **Fix:** restyle with tokens (`--bg-chip`, `--border`, `--text-primary`); grep for `rgba(255, 255, 255` when a control looks washed out.

### Gitignore appended line merged with previous line
- **Cause:** file had no trailing newline; `printf >>` concatenated.
- **Fix:** check tail before appending, or rewrite the file.

### Ownership guard could be bypassed on multipart routes — RESOLVED 2026-09-10
- **Cause:** `express.json` skips `multipart/form-data`, so `req.body` was `{}` when the guard ran; multer filled `userId` afterwards.
- **Fix:** multipart routes take the user from `req.user.id` (the verified JWT), never the form body.

### Billing status readable by anyone — RESOLVED 2026-09-10
- **Cause:** `billingRoutes` mounted before `requireAuth` so the Stripe webhook stays public; `status` and `create-checkout` rode along unauthenticated.
- **Fix:** both routes apply `requireAuth` inline and use the JWT user; three regression tests.

### Spend cap silently stopped past 1,000 calls — RESOLVED 2026-09-10
- **Cause:** summing rows client-side; PostgREST returns at most 1,000.
- **Fix:** `sum_ai_spend()` aggregates in Postgres; global cap fails closed.

### Free-tier gate permanently disabled after one race — RESOLVED 2026-09-10
- **Cause:** read-modify-write with no unique key → duplicate rows → `.single()` error → count read as 0.
- **Fix:** unique index + atomic `increment_usage()` RPC.

### Sentry captured nothing — RESOLVED 2026-09-10
- **Cause:** custom error handler registered before Sentry's and never called `next(err)`; 65 route catches responded inline.
- **Fix:** Sentry handler first; `sendError()` captures from every catch.

### Fabricated health data (stool analyzer, mock steps, mock products, hardcoded trend, invented 66/C) — RESOLVED 2026-09-10
- **Fix:** modules deleted; score reports `insufficient_data`; every number on screen now comes from logged data.
