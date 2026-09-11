# VitalLensMem — Project Knowledge Base

Documentation of the VitalLens codebase: every module, route, service, and
algorithm, written from the code as it exists (last verified 2026-09-10).

| File | Covers |
|---|---|
| [01-architecture.md](01-architecture.md) | System overview, stack, processes, data flow |
| [02-frontend.md](02-frontend.md) | Every page and utility in `src/` |
| [03-backend-routes.md](03-backend-routes.md) | Every Express route in `server/routes/` |
| [04-backend-services.md](04-backend-services.md) | Every service in `server/services/` |
| [05-algorithms.md](05-algorithms.md) | **All algorithms, with formulas and exact constants** |
| [06-database.md](06-database.md) | Supabase schema, RLS model, migrations, RPC functions |
| [07-security-and-privacy.md](07-security-and-privacy.md) | Auth chain, ownership guard, XSS, consent, spend caps |
| [08-operations.md](08-operations.md) | Running locally, env vars, tests, evals, deploy state |

**One-line summary of the product:** a personal wellness journaling PWA
(vanilla-JS SPA + Express API + Supabase) that logs meals/sleep/habits/scans,
computes nutrition targets and a composite health score, and uses AI
(GPT-4o vision, Claude, pgvector RAG) to surface observational, non-clinical
patterns — with hard cost caps and a consent-gated, wellness-only framing.
