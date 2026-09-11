# VitalLens

A personal wellness journal that turns everyday logging — meals, sleep, habits, check-ins — into patterns you can actually see. Photograph a meal and get calories from real nutrition databases; ask a copilot that answers only from *your* data; watch a wellness score that is computed from what you logged and never estimated.

Built as a full-stack portfolio project: a vanilla-JS PWA on a hardened Express API over Supabase, with AI (GPT-4o vision, Claude, pgvector RAG) wrapped in cost controls and a strict wellness-only framing.

> **Not a medical device.** VitalLens does not diagnose, screen, or treat. Every AI output is an observation about the user's own logs, and every number on screen comes from data the user entered.

---

## What it does

| Area | Feature |
|---|---|
| **Food** | Photo scan → barcode-first lookup (Open Food Facts) → GPT-4o identifies foods + gram estimates → calories from USDA / Open Food Facts, never from the model. Correction loop and "meal memory" for repeat meals. |
| **Logging** | Meals, sleep, exercise, habits (water, stress, mood, steps), supplements, medications (log only), cycle, labs (PDF parsed by GPT-4o), environment. |
| **Insight** | Wellness score across logged domains; correlation engine (Claude) with a second-pass language-safety review; trend patterns; weekly summary; an AI copilot with retrieval over the user's own `health_events` (pgvector). |
| **Account** | Email + password with optional TOTP two-factor; versioned consent gate; full JSON export; one-click account deletion (cascades through every table); Stripe subscription with usage-gated free tier. |
| **PWA** | Installable, offline shell, queued writes that sync when back online — and *never* report a failed write as saved. |

## Architecture

```mermaid
flowchart LR
  subgraph Browser["PWA (Vite, vanilla JS + React islands)"]
    UI[Hash router + pages]
    DB1[Supabase JS · RLS-scoped reads/writes]
    API1[apiFetch · Bearer JWT]
  end
  subgraph Server["Express API (single process)"]
    MW[JWT verify (local JWKS) → ownership guard → rate limits]
    Gates[usage gates + hard spend guard]
    Routes[36 routers]
    Engines[vision · copilot · correlation · prediction · weekly]
  end
  subgraph Supabase
    PG[(Postgres · RLS on every table · pgvector)]
    Auth[Supabase Auth]
  end
  UI --> DB1 --> PG
  UI --> API1 --> MW --> Gates --> Routes --> Engines
  Routes -->|service role| PG
  Auth -->|JWT| API1
  Engines --> OpenAI & Anthropic
  Routes --> Ext[USDA · Open Food Facts · Open Beauty Facts · Google Vision]
  Engines --> Redis[(Upstash · context cache)]
  Routes --> Stripe
```

Two data paths, two independent safety layers: direct Supabase access from the browser is bounded by **row-level security on every table**; API access is bounded by **local JWT verification plus a global ownership guard** that rejects any request naming another user.

## Security & correctness — what's actually enforced

- **Auth**: Supabase JWTs verified locally against the project JWKS (`jose`) — no network call per request. Multipart routes derive the user from the token, never from the form body.
- **Data isolation**: RLS owner policies on 40 tables (`(select auth.uid()) = user_id`, evaluated once per query); `user_id` is `uuid` everywhere with `ON DELETE CASCADE` to `auth.users`, so account deletion is complete.
- **Cost control**: a Postgres-aggregated **spend guard** ($5 / $50 / $250 monthly caps) runs before every model call and fails *closed* on the global cap; free-tier counters use an **atomic `increment_usage` RPC** (no read-modify-write race). Every AI call — including embeddings — is priced and logged.
- **Web**: strict CSP (`script-src 'self'`), HSTS, `frame-ancestors 'none'`; the auth library is bundled, not loaded from a CDN; every user- and AI-controlled string is HTML-escaped at the sink.
- **Honesty**: the wellness score returns `insufficient_data` until two domains are logged; no placeholder targets, no synthetic step counts, no fabricated trend lines. A CI lint fails the build if diagnostic or disease language appears in user-facing copy or prompts.
- **Observability**: Sentry captures every route error (with request bodies, headers, and cookies stripped before send); `/api/ready` probes the database, `/api/health` is liveness only; graceful `SIGTERM` drain.
- **Accessibility**: real `<button>`s everywhere, associated labels, visible focus rings, ≥4.5:1 text contrast, 44px touch targets, `aria-live` regions, pinch-zoom enabled, reduced-motion respected.

## Running locally

Two processes. Copy `.env.example` → `.env` (frontend) and `server/.env.example` → `server/.env`, fill in Supabase, OpenAI, and Anthropic keys, then:

```bash
# API  → http://localhost:3001
cd server && npm install && npm start

# App  → http://localhost:3000
npm install && npm run dev
```

Database: apply `server/supabase/schema-baseline.sql` to an empty Supabase project (extensions, tables, RLS, policies, functions). Incremental history lives in `server/supabase/migrations/`.

## Quality gates

```bash
npm run lint && npm test && npm run build          # frontend: ESLint, Vitest (jsdom), Vite
cd server && npm run lint && npm test              # server: ESLint, unit tests (no network)
cd server && npm run test:integration              # 20 auth/ownership/consent tests against a real Supabase project
node scripts/check-regulatory-language.mjs        # wellness-only copy lint
```

CI runs all of the above on every push to both repositories.

## Project layout

```
src/                 PWA — pages/, components/ (React islands), utils/, lib/db.js, router.js, sw.js
server/              Express API — routes/, services/, middleware/, db/, supabase/ (schema + migrations), tests/
docs/                Obsidian vault: architecture, data model, decision log, features, gotchas, glossary, roadmap
VitalLensMem/        Deep-dives: algorithms with exact formulas, route/service inventories, ops runbook
legal/               Terms of Service and Privacy Policy (drafts; rendered in-app)
AUDIT-2026-09.md     Full technical / product / legal audit and its remediation
```

## Stack

Vite 8 · vanilla JS + React 19 islands · Supabase (Postgres, Auth, RLS, pgvector) · Express 4 · `jose` · Zod · Stripe · Upstash Redis · OpenAI GPT-4o + `text-embedding-3-small` · Anthropic Claude Haiku 4.5 · Sentry · Vitest · ESLint · GitHub Actions

## Status

Feature-complete for a personal wellness journal and hardened against the findings of a full audit (see `AUDIT-2026-09.md`). Practitioner sharing and genomics parsing are implemented but ship **off** behind `ENABLE_EXPERIMENTAL_ROUTES` pending a compliance review. Wearable sync (Oura) is wired end-to-end and activates when developer credentials are configured.
