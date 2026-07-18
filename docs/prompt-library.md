---
tags: [prompts, ai, reference]
status: living
---

# Prompt library

Reusable prompts and context blocks for working on VitalLens with AI tools.

## Project context block (paste at the top of any session)

```
Project: VitalLens — personal wellness journaling PWA. Pre-launch.

Stack: vanilla-JS hash-router SPA (Vite 8, src/pages/*, no framework mounted),
Express API in server/ (single process, port 3001), Supabase Postgres
(RLS everywhere, pgvector), Supabase Auth (Bearer JWT → requireAuth +
global ownership guard). AI: GPT-4o vision (strict json_schema meal scan),
text-embedding-3-small RAG over health_events, Claude Sonnet engines
(correlation/prediction/weekly) + Haiku language-safety pass.
Cost control: usage gates (free-tier counters) + spend guard
($5/$50/$250 monthly caps from api_cost_log) before every model call.

Hard rules:
- Wellness framing only: no diagnostic/disease language in user-facing copy
  or prompts (lint: scripts/check-regulatory-language.mjs).
- Medications feature is LOGGING ONLY. Genomics + practitioner are FROZEN.
- Design: quiet-luxury light theme, tokens in src/styles/variables.css,
  one accent #2E6FF2, Lora serif, no emojis (DESIGN_BRIEF.md is authority).
- Code rules: YAGNI/KISS/DRY, minimal diffs, don't rewrite whole files.
- Escape user/AI strings with esc() at every innerHTML interpolation.
- Any userId in an API request must match the JWT (ownership guard).

Key docs: VitalLensMem/ (algorithms, routes, DB), docs/ (Obsidian vault),
ROADMAP.md (launch checklist).
```

## Task prompts

**Add an API route**
```
Add [route] to server/routes/. Follow the standard pattern: mounted at /api
behind requireAuth + ownership guard; usage gate + trackCost if it calls a
model; zod-validate any model JSON via ai-validators; 4xx for client errors
with useful messages; never leak internals in 5xx (sanitizer handles prod).
Add a cross-user 403 test to server/tests/security.test.js.
```

**Add a frontend page**
```
Add src/pages/[name].js following existing pages: render function returning
HTML into #page-content, tokens from variables.css only (no new colors),
Lora everywhere, esc() on all user/AI strings in innerHTML, icons from
src/icons.js (24px, currentColor), register route in src/router.js.
```

**Write AI-engine prompt copy**
```
Rewrite this engine prompt. Constraints: WELLNESS_SYSTEM_PROMPT framing —
observational only ("your logs suggest"), no condition names, no clinical
language; require data-grounded findings with explicit insufficient-data
handling; JSON-only response matching [schema]; 14-day persistent patterns
get a "worth discussing with a healthcare provider" note.
```

**Pre-commit check**
```
Run: node scripts/check-regulatory-language.mjs && npm run build (root),
npx vitest run tests/security.test.js (server/). All three must pass.
```

Related: [[architecture]] · [[glossary]] · [[decision-log]]
