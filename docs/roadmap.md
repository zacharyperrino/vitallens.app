---
tags: [roadmap, changelog]
status: living
---

# Roadmap

The operational launch checklist lives in the repo root `ROADMAP.md`
(Parts A / A.2 = executed with evidence; Part B = owner steps). This note is
the Obsidian-side summary.

## Now (blocking launch, in order)

1. **Fix the "Confirm signup" email template** — currently empty; users cannot
   confirm accounts. 2-min Supabase dashboard edit; exact HTML in `ROADMAP.md`
   §8b. Then one real signup test. (See [[gotchas]].)
2. **Attorney review** of ToS + Privacy drafts (`legal/*.md`); fill
   jurisdiction/arbitration brackets.
3. **Supabase dashboard**: leaked-password protection toggle; confirm
   backup/PITR plan.
4. **Frontend git remote** (`vitallens-app`, private) + push.
5. **Deploy**: choose hosting; set `NODE_ENV=production`, `VITE_API_BASE`,
   `FRONTEND_URL`, spend caps; provider-side billing limits on
   OpenAI/Anthropic.

## Next

- Weighed-meal eval photos → `npm run eval:food` → tune the scan pipeline
  (highest-leverage accuracy work).
- PostHog key → activation/retention funnels ([[user-research]]).
- Oura OAuth creds → real steps/sleep sync.
- Support/privacy email addresses; email-confirmation flow re-test.

## Later / explicitly deferred

- 🧊 Unfreeze genomics + practitioner (after counsel).
- React Native / native wrap (trigger-gated; HealthKit steps needs native).
- Inline-styles → tokenized components migration (~1.5k call sites, not urgent).
- Aggregate population insights; developer API (trigger-gated).

## Changelog (shipped)

- **2026-07-15** — VitalLensMem knowledge base; Obsidian vault (`docs/`).
- **2026-07-09** — Email-confirmation leg tested end-to-end (found the
  template blocker); queue stack deleted; migrations exported; `.env.example`
  secret scrubbed; dead `environmental_log` dropped; steps card reads real
  habit data + steps input added; Oura button light-theme fix; PostHog
  env-gated.
- **2026-07-08** — Pre-pilot hardening: security seal (XSS esc, CORS
  allow-list, 19 auth tests), regulatory language purge + lint, consent
  system + legal drafts + in-app pages, spend guard + model downgrades,
  prod error sanitizer, CI, deploy configs. Fresh-user E2E (consent →
  onboarding → verified targets → dashboard). Full YAGNI audit (~1,350 dead
  lines removed). Quiet-luxury redesign completed (Lora, de-emoji, de-pill).
- **2026-07-04→07** — Feature build-out: water, RAG, early patterns, cycle,
  custom correlation, practitioner (now frozen), medications, genomics
  (now frozen), analytics events, onboarding flow, cost tracking,
  barcode gate, calculate-targets.

Related: [[_home]] · [[features]] · [[decision-log]]
