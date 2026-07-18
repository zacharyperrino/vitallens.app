---
tags: [bugs, gotchas, log]
status: living
---

# Gotchas & bug log

> **Template**
> ### Symptom
> - **Cause:**
> - **Fix:**

### Confirmation emails arrive with no link (LAUNCH BLOCKER, open)
- **Cause:** the Supabase "Confirm signup" email template body is empty — only the "powered by Supabase" footer renders; `{{ .ConfirmationURL }}` content is missing.
- **Fix:** dashboard → Authentication → Email Templates → Confirm signup → restore body (exact HTML in `ROADMAP.md` §8b). Verify endpoint + redirect + first-sign-in are proven healthy. Check reset-password/magic-link templates too.

### Dev site served stale HTML/CSS; login silently swallowed; CSS loaded as HTML (black page)
- **Cause:** the PWA service worker cached dev responses.
- **Fix:** SW registers only in prod builds (`import.meta.env.PROD` in `src/main.js`). Never re-enable in dev.

### RAG silently returned nothing
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

### Food scan items misaligned with results
- **Cause:** batch nutrition lookup dropped unmatched items, shifting indexes.
- **Fix:** index-preserving lookup — unmatched items get a generic ~1.5 kcal/g estimate instead of being removed.

### `node --check` fails on frontend files ("Cannot use import statement outside a module")
- **Cause:** root `package.json` is `"type": "commonjs"`; `src/` is ESM (Vite handles it).
- **Fix:** syntax-check via stdin: `node --check --input-type=module < file.js`.

### Supabase dashboard automation renders black/empty
- **Cause:** the dashboard SPA suspends rendering in an occluded/background Chrome window.
- **Fix:** bring the window to the foreground before driving it.

### White-on-white UI leftovers after the light redesign
- **Cause:** components styled for the old dark theme (e.g. `.oura-connect-btn` used `rgba(255,255,255,…)` + white text).
- **Fix:** restyle with tokens (`--bg-chip`, `--border`, `--text-primary`); grep for `rgba(255, 255, 255` when a control looks washed out.

### Gitignore appended line merged with previous line
- **Cause:** file had no trailing newline; `printf >>` concatenated.
- **Fix:** check tail before appending, or rewrite the file.

### React deps in frontend package.json but no React mounted **[INFERRED]**
- **Cause:** unclear — islands experiment or leftover.
- **TODO:** decide keep-or-remove; removal shrinks install but blocks future islands.
