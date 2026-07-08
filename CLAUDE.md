# CLAUDE.md — VitalLens Project Documentation

## Project Overview

VitalLens is a personal wellness journal and pattern-recognition app. It is NOT a medical device. All language throughout the codebase must follow wellness journaling framing — never clinical, diagnostic, or prescriptive.

**Core value proposition:** Log lifestyle data → AI notices patterns across domains → Users gain self-awareness about their wellness habits.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS SPA + Vite (localhost:3000) |
| Backend | Express.js ESM (localhost:3001) |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| Primary AI | Claude Sonnet (claude-sonnet-4-20250514) |
| Secondary AI | Claude Haiku (claude-haiku-4-5-20251001) for simple queries |
| Vision AI | GPT-4o for food scanning and lab parsing |
| Cache | Upstash Redis (REST API + ioredis for BullMQ) |
| Job Queue | BullMQ with Upstash Redis |
| Monitoring | Sentry (@sentry/node, instrument.js) |
| Deployment | Railway (backend), local Vite (frontend) |
| React | Hybrid islands via @vitejs/plugin-react |

---

## Directory Structure

```
Archive 3/
├── server/                          # Express.js backend
│   ├── server.js                    # Entry point, all routes mounted
│   ├── instrument.js                # Sentry initialization
│   ├── routes/
│   │   ├── barcode.js               # POST /api/barcode-lookup — Open Food Facts barcode
│   │   ├── billing.js               # Stripe checkout, webhook, status
│   │   ├── biomarker.js             # POST /api/biomarker-scan — face/body scan analysis
│   │   ├── biomarker-history.js     # GET /api/biomarker-history — scan history
│   │   ├── correlate.js             # GET /api/correlate/latest — stored correlations
│   │   ├── correlation-engine.js    # POST /api/correlate/run — Claude pattern analysis
│   │   ├── environment.js           # GET /api/environment — AQI + EPA water data
│   │   ├── food-correction.js       # POST /api/food-correction — user food corrections
│   │   ├── health-copilot.js        # POST /api/health-copilot — Claude AI chat with tools
│   │   ├── health-profile.js        # GET/POST /api/health-profile
│   │   ├── health-score.js          # GET /api/health-score — computed wellness score
│   │   ├── hygiene.js               # POST /api/hygiene/scan, GET /api/hygiene/history
│   │   ├── ingest.js                # POST /api/ingest — event ingestion
│   │   ├── meal-memory.js           # GET/POST /api/meal-memory — meal recall
│   │   ├── nutrition.js             # GET /api/nutrition/search — USDA + Open Food Facts
│   │   ├── ocr.js                   # POST /api/ocr — nutrition label OCR
│   │   ├── oura.js                  # Oura Ring OAuth + data sync
│   │   ├── parse-labs.js            # POST /api/parse-labs — GPT-4o lab PDF parser
│   │   ├── prediction-engine.js     # POST /api/predictions/run — Claude trend analysis
│   │   ├── push.js                  # POST /api/push/subscribe — Web Push notifications
│   │   ├── restaurant.js            # GET /api/restaurant — restaurant nutrition lookup
│   │   ├── supplements.js           # GET/POST /api/supplements — supplement stack
│   │   ├── tcm-profile.js           # GET/POST /api/tcm-profile — TCM constitution
│   │   ├── usage.js                 # GET /api/usage/status — freemium usage tracking
│   │   ├── user-data.js             # GET /api/user-data/export, DELETE /api/user-data/delete
│   │   ├── user-goals.js            # GET/POST /api/user-goals
│   │   ├── vision.js                # POST /api/vision-scan — GPT-4o food photo analysis
│   │   └── weekly-report.js         # POST /api/weekly-report/generate, GET /api/weekly-report/narrative
│   └── services/
│       ├── additiveAnalyzer.js      # E-code additive risk analysis
│       ├── ai-fetch.js              # fetchWithRetry with exponential backoff
│       ├── ai-limiters.js           # Rate limiters: heavyAILimiter, copilotLimiter, visionLimiter, lightLimiter
│       ├── ai-validators.js         # Zod schemas: BiomarkerSchema, CorrelationSchema, PredictionSchema, WeeklyReportSchema, FoodDetectionSchema, LabParseSchema
│       ├── context-builder.js       # buildFullContext() — tiered 7-day full + 8-30 day summary
│       ├── embeddingService.js      # Vector embedding service
│       ├── eventIngestion.js        # Event ingestion pipeline
│       ├── healthScorer.js          # Wellness score computation
│       ├── openBeautyFacts.js       # Open Beauty Facts API + ingredient concern analysis
│       ├── openFoodFacts.js         # Open Food Facts API — fetchProduct(), searchProducts()
│       ├── queue.js                 # BullMQ: correlationQueue, weeklyReportQueue, workers
│       ├── sanitize.js              # sanitizeUserInput(), sanitizeContextFields(), examineLink()
│       └── usage-gates.js           # Freemium gates: checkAndIncrementUsage(), isPremium()
├── src/                             # Vanilla JS frontend
│   ├── main.js                      # App entry, router, service worker registration
│   ├── router.js                    # Client-side hash router
│   ├── store.js                     # App state store
│   ├── icons.js                     # SVG icon library (all icons have width="24" height="24")
│   ├── pages/
│   │   ├── analytics.js             # Analytics dashboard with React islands
│   │   ├── auth.js                  # Sign in/up with MFA enrollment + age verification
│   │   ├── body-scanner.js          # Face/body wellness check-in
│   │   ├── dashboard.js             # Main dashboard
│   │   ├── eastern-medicine.js      # Ayurveda + TCM page
│   │   ├── food-scanner.js          # Camera food scan + barcode scan
│   │   ├── health-chat.js           # AI copilot chat interface
│   │   ├── health-input.js          # Manual data logging (sleep, exercise, habits, labs)
│   │   ├── hygiene-scanner.js       # Hygiene product barcode scanner
│   │   ├── product-results.js       # Barcode scan results page
│   │   ├── profile.js               # User profile + settings + sign out
│   │   ├── step-details.js          # Step count details
│   │   └── stool-scanner.js         # Stool wellness check-in
│   ├── components/                  # React islands (hybrid approach)
│   │   ├── mountReact.js            # mountReact(Component, containerId, props) helper
│   │   ├── WellnessScoreCard.jsx    # Weekly score card — mounted in analytics
│   │   ├── PatternDiscoveryHero.jsx # Pattern discovery hero — mounted in analytics
│   │   ├── NutritionTracker.jsx     # Today's nutrition with progress bars — mounted in analytics
│   │   └── HygieneScanResult.jsx    # Hygiene scan result with expandable concerns
│   ├── lib/
│   │   ├── supabase.js              # Supabase client (JWT anon key, NOT sb_publishable_ format)
│   │   └── db.js                    # Supabase query helpers — use .maybeSingle() not .single() for getToday()
│   ├── utils/
│   │   ├── charts.js                # SVG charts: donut, ring, line, bar, radar, sparkline, interactiveTrendChart
│   │   ├── product-scanner.js       # BarcodeDetector API + camera utilities
│   │   ├── reminders.js             # Notification reminders
│   │   └── strava.js                # Strava OAuth utilities
│   └── services/
│       ├── foodScanApi.js           # Food scan API client
│       ├── nutritionApi.js          # Nutrition API client
│       └── visionApi.js             # Vision API client
├── sw.js                            # PWA service worker — offline queue + background sync
├── vite.config.js                   # Vite config with React plugin + HMR
└── package.json
```

---

## Environment Variables

```
# AI
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Supabase
SUPABASE_URL=https://nlxptctihrotizvaywdo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=   # JWT format, NOT sb_publishable_ format

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
UPSTASH_REDIS_URL=rediss://default:TOKEN@sensible-rooster-132693.upstash.io:6379

# Monitoring
SENTRY_DSN=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_MONTHLY=
STRIPE_PRICE_ANNUAL=

# Push Notifications (VAPID)
VAPID_PUBLIC_KEY=BCYb__byC71b7sLqEtNWEJvdoOY3tej1o4vV54ENmtu-RVlYUpXmajJq7Lot4QzWgc4o5DhX8EobQBkX3FCGLAg
VAPID_PRIVATE_KEY=
VAPID_EMAIL=mailto:contact@vitallens.app

# Oura Ring
OURA_CLIENT_ID=
OURA_CLIENT_SECRET=
OURA_REDIRECT_URI=https://vitallens-server-production.up.railway.app/api/oura/callback

# App
NODE_ENV=production
FRONTEND_URL=http://localhost:3000
PORT=3001
```

---

## Dev Aliases

```bash
# Kill port 3001 + start backend with Sentry
vl → kill port 3001 && node --import ./instrument.js server.js

# Kill port 3000 + start Vite frontend
vf → kill port 3000 && npm run dev
```

---

## Key Architecture Decisions

### Wellness Language — ALWAYS enforce
- Never: "diagnoses", "detects", "screens for", "condition", "LOW/HIGH/CRITICAL", "dangerous", "toxic"
- Always: "your logs suggest", "we noticed", "something to explore", "commonly associated with"
- For patterns persisting 14+ days: suggest discussing with a healthcare provider
- All AI routes have `WELLNESS_SYSTEM_PROMPT` enforcing this

### Context Builder (context-builder.js)
- **Tier 1 (last 7 days):** Full detail — all meals, sleep, exercise, scans
- **Tier 2 (days 8-30):** Aggregated summaries only — avg calories, avg sleep, exercise count
- Redis cache: 5-minute TTL, invalidated on any data write
- Call `invalidateContextCache(userId)` after any write to Supabase

### Model Routing
- **Haiku:** Simple queries (logging, lookups, "what did I eat today")
- **Sonnet:** Pattern analysis, correlations, trend analysis, weekly reports
- `selectModel(message)` in health-copilot.js checks for heavy intent keywords

### Freemium Gates (usage-gates.js)
Free tier limits (resets per window):
| Feature | Limit | Window |
|---------|-------|--------|
| food_vision_scan | 5 | day |
| lab_upload | 2 | month |
| ai_chat | 10 | day |
| correlation_run | 3 | month |
| prediction_run | 3 | month |
| weekly_report | 1 | week |
| narrative | 1 | month |

Premium users (subscription_status = 'active' or 'trialing') bypass all gates.
Usage tracked in `usage_tracking` Supabase table.

### AI Output Validation
All Claude and GPT-4o outputs validated with Zod before DB writes:
- `BiomarkerSchema` — biomarker scan output
- `CorrelationSchema` — pattern analysis output
- `PredictionSchema` — trend analysis output
- `WeeklyReportSchema` — weekly report output
- `FoodDetectionSchema` — food vision scan output
- `LabParseSchema` — lab PDF parse output

### Rate Limiting
- `heavyAILimiter` — 5/hour (correlation, prediction, weekly report)
- `copilotLimiter` — 30/hour (health copilot)
- `visionLimiter` — 20/hour (food vision scan)
- `lightLimiter` — 60/hour (hygiene scan, barcode)

### Retry Logic
All Claude API calls use `fetchWithRetry` with exponential backoff:
- 3 retries: 1s → 2s → 4s delays
- Pass `{ routeName: 'RouteName' }` as second arg for logging

### React Hybrid
React islands mount inside vanilla JS pages via `mountReact(Component, containerId, props)`.
- Call `unmountReact(containerId)` before re-rendering a page
- JSX files in `src/components/` — Vite handles transpilation
- Do NOT attempt a full React migration — hybrid is intentional

---

## Supabase Tables

### Core data
- `profiles` — user profile, subscription_status, stripe fields, push_subscription
- `meals` — individual food log entries
- `daily_nutrition` — aggregated daily totals
- `sleep_log` — sleep entries (use .maybeSingle() not .single() for today queries)
- `exercise_log` — workout sessions
- `habits` — daily habits (water, stress, mood)
- `supplement_logs` — active supplement stack
- `lab_results` — parsed lab panels
- `biomarker_scans` — face/body/stool check-in results

### AI outputs
- `health_correlations` — pattern analysis results
- `health_predictions` — trend analysis results
- `health_insights` — surfaced insights
- `weekly_reports` — weekly summaries + narrative + narrative_generated_at
- `weekly_scores` — weekly score history

### Supporting
- `hygiene_scans` — hygiene product scan history
- `meal_memory` — meal recall history
- `food_corrections` — user food corrections
- `portion_corrections` — user portion corrections
- `environment_logs` — AQI + environmental data
- `tcm_profile` — TCM constitution data
- `health_profile` — detailed health profile
- `user_goals` — goals, dietary restrictions, health concerns
- `wearable_connections` — Oura OAuth tokens
- `usage_tracking` — freemium usage counters
- `scan_history` — barcode scan history
- `hr_readings` — heart rate + readiness from Oura
- `health_events` — general health events
- `push_subscription` — stored as jsonb in profiles

### RLS Policies
All tables have RLS enabled with `user_isolation` policy:
```sql
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
```
**NEVER add "Allow all" policies** — they override user_isolation and break data isolation.
If you see a 406 error on Supabase queries, check for conflicting "Allow all" policies:
```sql
SELECT tablename, policyname FROM pg_policies WHERE policyname = 'Allow all';
```

### Date Queries
Always use timezone-aware date strings for date comparisons:
```javascript
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
```
Use `.maybeSingle()` instead of `.single()` for "get today's record" queries — `.single()` returns 406 when no row exists.

---

## Nutrition Data Sources (Tiered)

1. **Hardcoded fallbacks** — instant, common foods in `nutrition.js`
2. **USDA FoodData Central** — whole foods, raw ingredients
3. **Open Food Facts** — packaged/branded foods (free, 3M+ products)
4. **Open Beauty Facts** — hygiene/cosmetic products (`openBeautyFacts.js`)

---

## Security

- **Helmet.js** — security headers on all Express responses
- **Prompt injection** — all user inputs sanitized via `sanitize.js` before Claude context
- **Zod validation** — all AI outputs validated before DB writes
- **RLS** — all 29 Supabase tables have row-level security
- **Rate limiting** — all AI routes rate limited
- **API keys** — in .env, never committed (gitignore covers both root and server/)
- **Age verification** — under-18 blocked at signup
- **MFA** — Supabase TOTP MFA enrolled at first login
- **Data export/deletion** — CCPA-compliant routes at /api/user-data/

---

## Deployment

- **Backend:** Railway — `vitallens-server-production.up.railway.app`
  - Start command: `node --import ./instrument.js server.js`
  - Build command: `echo "skip"`
  - GitHub: `github.com/zacharyperrino/vitallens-server`
- **Frontend:** Local Vite dev server (not yet deployed)
- **Stripe webhook:** Registered at Railway URL `/api/billing/webhook`

---

## Known Issues / Gotchas

1. **Supabase anon key** — must use JWT format (`eyJ...`), NOT `sb_publishable_` format. The sb_publishable_ key causes 406 errors.
2. **Icons** — all SVGs in `icons.js` must have `width="24" height="24"` or they expand to fill viewport.
3. **Date timezone** — always use `Date.now() - new Date().getTimezoneOffset() * 60000` for local date strings.
4. **BullMQ Redis** — uses ioredis connection (`UPSTASH_REDIS_URL`), not the REST API.
5. **Vite proxy** — `vite.config.js` targets `localhost:3001` for local dev. Change to Railway URL only for production builds.
6. **React islands** — must call `mountReact()` AFTER `content.innerHTML` is set, not before.
7. **CSS loss** — if styles disappear, run `vf` to restart Vite and hard refresh (Cmd+Shift+R).

---

## User

- User ID: `a68dbb2e-74ae-47e5-b2da-87f85c20231c`
- Supabase project: `nlxptctihrotizvaywdo.supabase.co`
- Railway project: `elegant-presence`
- GitHub: `github.com/zacharyperrino/vitallens-server`

---

## Completed Roadmap

### Phase 0 — Emergency ✅
- RLS policies on all 29 tables
- Clinical language removed from all routes
- Wellness system prompt on all 5 Claude routes
- "Talk to a professional" on 14+ day patterns
- Zod validation on all AI outputs
- Sentry error monitoring
- Plausibility guards on biomarker scores

### Phase 1 — Pre-launch ✅
- Rate limiting on all AI endpoints
- Retry logic with exponential backoff
- Vite bundler
- Redis caching on context builder
- Prompt injection mitigation
- Deploy to Railway
- Data export + account deletion (CCPA)
- MFA via Supabase TOTP
- Age verification (18+)
- BullMQ job queue
- Stripe billing routes
- Pattern discovery UI
- PWA service worker + offline queue
- API keys secured + .gitignore
- user_id audit — clean

### Phase 2 — Scale ✅
- Tiered Claude context (7-day full + 8-30 day summaries)
- Haiku vs Sonnet routing by query complexity
- Language safety check (secondary Haiku pass on correlation output)
- Unified AI output validation (FoodDetectionSchema, LabParseSchema)
- Push notification infrastructure (VAPID)
- Age verification + minor data protection
- Open Food Facts barcode scanning
- Examine.com supplement evidence linking
- OWASP security audit + Helmet.js
- Onboarding import flow (6-slide)
- Interactive trend charts with hover tooltips
- Oura Ring OAuth + data sync
- React hybrid approach (4 islands)
- 406 fixes — .maybeSingle() on getToday() queries

### Phase 3 — Growth ✅
- Hygiene product scanner (Open Beauty Facts)
- Longitudinal personalization narrative (12-week wellness story)
- Freemium feature gates on all AI features
- Hygiene → skin check-in correlation in pattern engine

### Business (Pending)
- 90-day pilot
- B2B pilot with nutritionists
- Clinical advisory board
- Content strategy
- FTC marketing review
- Wearable hardware partnership
- Genomics integration
