---
tags: [glossary, reference]
status: living
---

# Glossary

Domain terms as used consistently across VitalLens code and docs.

- **Wellness framing** — the app's hard rule: observational, non-clinical language only ("your logs suggest…"), never condition names or diagnostic claims. Enforced by the canonical `WELLNESS_SYSTEM_PROMPT`, a repo lint, and a Haiku output-review pass. See [[decision-log]].
- **BMR / TDEE** — Basal Metabolic Rate (Mifflin-St Jeor) and Total Daily Energy Expenditure (BMR × activity multiplier 1.2–1.9). Basis for calorie/macro targets.
- **Targets** — `target_calories` (TDEE→nearest 50), protein 2.2 g/kg, carbs 40%/4 kcal·g, fat 30%/9 kcal·g, fiber 28 g. Stored on `health_profile`.
- **Health score** — 8-domain weighted composite (nutrition .20, exercise .15, sleep .15, habits .15, body .10, gut .10, environment .08, mental .07) with A+–D grade.
- **Barcode-first gate** — if a scanned photo contains a barcode, resolve via product databases and skip the vision model entirely.
- **3-tier lookup** — nutrition resolution order: HARDCODED common-foods table → USDA FoodData Central → Open Food Facts.
- **Meal memory** — per-user repeat-meal recognition (`meal_memory`): quick-log with averaged macros and scan count.
- **Health event** — a row in `health_events` created from every log write; carries a 1536-dim embedding; the substrate for RAG.
- **RAG** — retrieval-augmented generation: embed the user's question, `match_health_events` cosine search (threshold 0.3, 90-day window), inject matches into the copilot prompt.
- **Context snapshot** — `buildFullContext(userId, {window})`: the user's full N-day data assembled for engine prompts; cached in Upstash Redis.
- **Usage gate** — free-tier windowed counter per feature (e.g. 5 vision scans/day). Premium bypasses counts, never the spend guard.
- **Spend guard** — hard monthly USD ceilings summed from `api_cost_log`: $5 free / $50 premium per user, $250 global. Checked before every model call.
- **Ownership guard** — Express middleware: any `userId` in query/body must equal the JWT's user id, else 403.
- **Consent gate** — SPA interstitial requiring the current version of all 4 legal documents; `user_consents` is append-only, so version bumps re-prompt.
- **Frozen feature** — built but intentionally gated off pending counsel (genomics, practitioner view).
- **Practitioner link** — `practitioner_links` row (`status='active'`) that a client creates to grant a practitioner read-only access; the consent record the API checks.
- **Quiet luxury** — the design language: warm off-whites, one blue accent (#2E6FF2), Lora serif, small radii, no emojis, muted data-viz colors. Authority: `DESIGN_BRIEF.md`.
- **Logging only** (medications) — deliberate scope limit: no interaction checking, dosage advice, or clinical interpretation, ever.

Related: [[data-model]] · [[features]] · [[architecture]]
