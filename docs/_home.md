---
tags: [moc, home]
status: living
---

# VitalLens — Map of Content

Personal wellness journaling PWA: vanilla-JS SPA + Express API + Supabase,
with AI scanning/analysis behind hard cost caps and a wellness-only
(non-clinical) framing.

## Core notes

- [[architecture]] — system overview + diagram
- [[data-model]] — every table, field, and relationship
- [[features]] — what the app does, per feature, with status
- [[decision-log]] — why the stack and design are the way they are
- [[roadmap]] — where it's going + what's shipped

## Working notes

- [[gotchas]] — bugs bitten by, causes, fixes
- [[glossary]] — domain terms used consistently
- [[prompt-library]] — reusable AI prompts + project context block
- [[user-research]] — interviews, feedback, patterns (needs your input)

## Deep-dive companions (pre-existing, in `VitalLensMem/`)

Algorithm-level detail with exact formulas and constants lives in
`VitalLensMem/05-algorithms.md`; route/service inventories in
`VitalLensMem/02–04`; ops runbook in `VitalLensMem/08-operations.md`.
If this vault is opened at the repo root, those resolve as:
[[05-algorithms]], [[03-backend-routes]], [[04-backend-services]], [[08-operations]].

## Status at a glance (2026-07-18)

- Pre-launch. **Launch blocker:** Supabase "Confirm signup" email template is
  empty (no confirmation link) — 2-min dashboard fix, see [[roadmap]].
- Legal drafts await attorney review; genomics + practitioner features frozen.
- Frontend repo has no git remote yet; server repo is on GitHub.
