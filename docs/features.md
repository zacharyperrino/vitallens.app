---
tags: [features, product]
status: living
---

# Features

Status legend: ✅ shipped & verified · 🟡 shipped, needs verification/data ·
🧊 frozen (built, gated off) · 🔜 planned. Inferred acceptance criteria are
marked **[INFERRED]** — verify.

## Onboarding & account
- **Sign up / sign in** (✅) — email+password with required email confirmation. Edge cases: unconfirmed sign-in blocked; consent checkbox required at signup. ⚠️ Current launch blocker: the confirmation *email template* is empty (see [[roadmap]]).
- **Consent gate** (✅) — blocks app until 4 current document versions accepted; version bump re-prompts. E2E-verified.
- **First-run onboarding** (✅) — baseline → calculated targets (Mifflin-St Jeor, verified to the digit) → optional allergies/conditions/diet/goals/meds note → `onboarding_completed`. Skippable at every optional step.

## Logging
- **Food scanning** (✅) — photo → barcode-first gate → GPT-4o labels+grams → 3-tier calorie lookup → correction loop → meal memory quick-log. Accuracy eval harness exists but needs weighed-meal photos (🟡).
- **Manual logging** (✅) — labs, exercise, sleep, habits (water, stress, mood, steps), water, supplements, cycle, medications (logging **only**, by design).
- **Wellness photo check-ins** (🟡) — body/stool/hygiene/tongue scanners; wellness-framed post-hardening. **[INFERRED acceptance: outputs never name conditions — enforced by lint + prompt]**.
- **Steps** (✅) — manual entry in habits; dashboard card reads it ("Tap to log" when empty). Wearable auto-sync is 🔜 (Oura OAuth creds pending).

## Intelligence
- **Health score** (✅) — 8-domain weighted composite with grade + trend (exact weights in `VitalLensMem/05-algorithms.md`).
- **AI copilot chat** (✅) — RAG over the user's own `health_events` (pgvector).
- **Correlation engine** (✅) — 30-day cross-domain patterns; Haiku language-safety second pass.
- **Prediction engine** (✅) — 7/14-day trend extrapolation + ranked interventions.
- **Weekly report** (✅) — headline/wins/gaps/focus summary, 1/week free.
- **Early patterns / custom correlation** (🟡) — shipped; needs real-usage validation.

## Monetization & limits
- **Free tier gates** (✅) — 5 vision scans/day, 10 chats/day, 3 correlation + 3 prediction/month, 2 lab uploads/month, 1 weekly report/week.
- **Spend guard** (✅) — $5/$50/$250 monthly hard caps, everyone included.
- **Stripe billing** (🟡) — checkout/portal/webhook wired; needs a live-mode end-to-end test before launch. **[INFERRED status]**

## Frozen (built, intentionally gated)
- **Genomics phase 1** (🧊) — local parse, wellness-framed; frozen pending counsel.
- **Practitioner read-only view** (🧊) — consent-linked via `practitioner_links`; 19 security tests cover the gate; frozen pending counsel.

## Platform
- **Data export & deletion** (✅) — all user tables.
- **PWA** (🟡) — SW prod-only; network-first; needs a production-build install test.
- **Push notifications** (🟡) — web-push/VAPID wired; browser-permission UX rough (dashboard shows "Blocked" chip when denied).
- **Product analytics** (🔜) — PostHog env-gated; off until `VITE_POSTHOG_KEY` is set.

Related: [[architecture]] · [[data-model]] · [[roadmap]] · [[user-research]]
