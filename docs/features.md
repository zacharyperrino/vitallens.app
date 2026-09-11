---
tags: [features, product]
status: living
---

# Features

Status legend: ✅ shipped & verified · 🟡 shipped, needs verification/data ·
🧊 frozen (built, gated off) · 🔜 planned. Inferred acceptance criteria are
marked **[INFERRED]** — verify.

## Onboarding & account
- **Sign up / sign in** (✅) — email+password, optional TOTP two-factor (enrol/disable in Profile; the skip is remembered). ⚠️ Owner step: the Supabase confirmation *email template* is empty (see [[roadmap]]).
- **Consent gate** (✅) — blocks app until 4 current document versions accepted; version bump re-prompts. E2E-verified.
- **First-run onboarding** (✅) — baseline → calculated targets (Mifflin-St Jeor, verified to the digit) → optional allergies/conditions/diet/goals/meds note → `onboarding_completed`. Skippable at every optional step.

## Logging
- **Food scanning** (✅) — photo → barcode-first gate → GPT-4o labels+grams → 3-tier calorie lookup → correction loop → meal memory quick-log. Accuracy eval harness exists but needs weighed-meal photos (🟡).
- **Manual logging** (✅) — labs (PDF parsed, fields escaped), exercise, sleep, habits (water, stress, mood, steps — no invented defaults), supplements, **medications** (logging only, own tab), **cycle** (own tab).
- **Wellness photo check-ins** (✅) — face/body/tongue and hygiene-product scanners; observational output only (no lab suggestions, syndromes, risk tiers or triage); usage-gated. The stool scanner was removed: it generated results from `Math.random()`.
- **Steps** (✅) — manual entry in habits; dashboard card and the Steps page read real `habits.steps` history. Oura sync is wired end-to-end (signed-state OAuth) and activates with developer credentials.

## Intelligence
- **Wellness score** (✅) — weighted composite over *logged* domains only; `insufficient_data` until two domains exist (weights in `VitalLensMem/05-algorithms.md`).
- **AI copilot chat** (✅) — RAG over the user's own `health_events` (pgvector); the ingest path now actually populates the corpus; internal tools carry the caller's token.
- **Correlation engine** (✅) — 30-day cross-domain patterns; Haiku language-safety second pass.
- **Prediction engine** (✅) — 7/14-day trend extrapolation + ranked interventions.
- **Weekly report** (✅) — headline/wins/gaps/focus summary, 1/week free.
- **Early patterns / custom correlation** (🟡) — shipped; needs real-usage validation.

## Monetization & limits
- **Free tier gates** (✅) — 5 vision scans/day, 10 chats/day, 3 correlation + 3 prediction/month, 2 lab uploads/month, 1 weekly report/week.
- **Spend guard** (✅) — $5/$50/$250 monthly caps aggregated in Postgres; global cap fails closed; atomic free-tier counters.
- **Stripe billing** (✅ test mode) — pricing in Profile ($9.99/mo · $79/yr) → authenticated checkout → signed webhook → premium flag. Live-mode keys are an owner step.

## Frozen (built, intentionally gated)
- **Genomics phase 1** (🧊) — implemented; mounts only with `ENABLE_EXPERIMENTAL_ROUTES=true`.
- **Practitioner read-only view** (🧊) — consent-linked; security tests cover the gate; mounts only with `ENABLE_EXPERIMENTAL_ROUTES=true`.

## Platform
- **Data export & deletion** (✅) — Profile → Your data: JSON export; email-confirmed deletion that cascades through every table.
- **PWA** (✅) — manifest + icons, network-first shell, offline banner, queued writes reported honestly (503 + pending sync, never a fake 200).
- **Push notifications** (🟡) — web-push/VAPID wired; permission requested in context from Profile (never at boot).
- **Product analytics** (🔜) — PostHog env-gated; off until `VITE_POSTHOG_KEY` is set.

Related: [[architecture]] · [[data-model]] · [[roadmap]] · [[user-research]]
