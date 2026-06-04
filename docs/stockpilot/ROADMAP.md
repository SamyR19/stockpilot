# StockPilot AI — Master Roadmap & Build Context

> **🛑 READ THIS FIRST, EVERY TIME.** This is the single source of truth for what StockPilot is, what's built, what's left, and the conventions to follow. **Read it before starting any plan, adding any feature, or changing anything**, and **update it after** you finish. If context is ever lost, this file restores it.
>
> Companion docs: [`PROJECT_GOALS.md`](./PROJECT_GOALS.md) (the why) · [`PAPERCLIP_REFERENCE.md`](./PAPERCLIP_REFERENCE.md) (what the forked code does) · design spec: `docs/superpowers/specs/2026-05-31-stockpilot-ai-design.md` · plans: `docs/superpowers/plans/`.

**Last updated:** 2026-06-03 (cloud hosting migrated Vercel → **Railway**; app builds & boots; pending first-admin bootstrap — see §2.5)

---

## 1. What we're building (30-second version)

Open-source OS for running AI agents as your personal Wall Street research team. Fork of Paperclip + finance roles + read-only broker links + market data + finance UI + cloud billing. **Read-only. Never trades.** See [`PROJECT_GOALS.md`](./PROJECT_GOALS.md).

---

## 2. The plan sequence (epics)

| Plan | Title | Status |
|------|-------|--------|
| **Plan 1** | Foundation — rebrand, `STOCKPILOT_MODE` feature flags, 6 finance DB tables, 7 agent role skill files, financial dark theme base | ✅ Done |
| **Plan 2** | Market data adapters (Yahoo / Alpha Vantage / Polygon) + `/api/market/*` routes | ✅ Done |
| **Plan 3** | Broker connections (Schwab OAuth, CSV import) + `/api/broker/*` | ✅ Done |
| **Plan 4** | Finance UI pages: Portfolio, Watchlist, Alerts, Market + sidebar nav | ✅ Done |
| **Plan 5** | **Stripe billing + subscription tier enforcement** | ✅ Done (`docs/superpowers/plans/2026-06-01-plan-5-billing-tiers.md`) |
| **Plan 6** | Cloud deployment | ⏳ **Live build on Railway; pending first-admin bootstrap** — hosting moved off Vercel (see §2.5) |

Plans live in `docs/superpowers/plans/YYYY-MM-DD-plan-N-*.md`. Each plan is executed with the `superpowers:subagent-driven-development` skill (owner's standing preference — never ask which execution approach).

### Beyond Plan 6 (from the design spec)
- **Reports page** — ✅ **Done** (research-reports CRUD API + UI + nav).
- **Dashboard rework** — ✅ **Done** (financial overview: market indices, portfolio snapshot, watchlist movers).
- **Language changes** — ✅ **Done** ("Heartbeats"→"Routines", "Issues"→"Research Tasks", "Company"→"Workspace").
- **Market Routine Builder** — ⏳ **Not done** (was mid-investigation when the deploy work took over). Visual builder for recurring agent jobs (routines + cron triggers).
- **Paperclip codebase deep-dive doc** — ⏳ **Not started** (owner requested a thorough doc of the forked Paperclip code).
- **Alert evaluation engine** — ⏳ Not built; nothing turns `alert_rules` into `alert_events` yet. Strong near-term candidate.
- **MCP server layer** — future / post-users.

---

## 2.5 Deployment — current state & runbook (Railway)  🔴 READ before any deploy/infra work

**TL;DR (2026-06-03):** Cloud hosting moved **Vercel → Railway**. The **whole app (UI + Express API) runs as ONE Docker container** on Railway, talking to **Supabase** Postgres. ✅ **LIVE** — build green, server boots, first admin created and claimed. Public URL works. Remaining items below are cleanup + billing + features, not blockers to "is it up."

### Why Railway, not Vercel
StockPilot's server is a heavy, always-on Express monolith (`embedded-postgres`, `sharp`, `sqlite3`, `jsdom`, plugin system, agent adapters). Vercel **serverless** functions can't host it — bundling `api/index.ts` (which imports the whole `server/app.ts`) blew past the 250 MB lambda limit and hung. Railway runs the container **24/7**, which is the right fit and matches "one Docker image → selfhost *or* cloud (via `STOCKPILOT_MODE`)". **Vercel is retired.** `vercel.json` + `api/index.ts` remain in-repo but unused (safe to delete later). Mental model: **Supabase = database, Railway = always-on compute, the domain = front door.**

### How it's wired
- **Build:** root **`Dockerfile`** (multi-stage) builds `ui` → `plugin-sdk` → `@paperclipai/server...` (full dep graph), then runs `node server/dist/index.js`. The server serves the built UI from `../../ui/dist` (that path exists inside the image since the whole repo is copied).
- **DB:** Supabase Postgres via `DATABASE_URL`. `embedded-postgres` is only the self-host fallback (dynamic `import()`) — **never loaded when `DATABASE_URL` is set.**
- **Config split (important):** the **server is ENV-driven** (`loadConfig` reads env vars). The **CLI (`paperclipai ...`) is FILE-driven** (`readConfig` reads `$PAPERCLIP_CONFIG` → `config.json`). This mismatch is why `bootstrap-ceo` needs a config file even though the server doesn't (see gotchas).

### Railway facts
- Project **`spectacular-trust`** · team "Samy Rabah's Projects" (`team_n1nB3tBVgtNkSXrghnNzHKzD`) · project id `5225984d-70c7-4e5b-a3e7-223e7a595bc6`.
- Service is currently mis-named **`@paperclipai/db`** (Railway monorepo auto-detect artifact — **rename to `stockpilot`**). It builds the root Dockerfile (`builder: DOCKERFILE`, root dir = repo root).
- **Public URL:** `https://paperclipaidb-production.up.railway.app`
- Deployment Protection: OFF. Plan: **free trial** → will need **Hobby (~$5/mo)** for sustained 24/7.
- Railway **CLI is authenticated locally** (`railway whoami` = Samy Rabah). `railway ssh` into the running container works. `railway logs --build` only reliably streams *active* builds; failed-build logs are easiest in the dashboard. Owner prefers I avoid driving the Railway CLI for deploys unless asked — guide via dashboard.

### Required Railway env vars (service → Variables)
`DATABASE_URL` (Supabase URI, `postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres`) · `BETTER_AUTH_SECRET` · `PAPERCLIP_DEPLOYMENT_MODE=authenticated` · `PAPERCLIP_DEPLOYMENT_EXPOSURE=public` · `PAPERCLIP_AUTH_BASE_URL_MODE=explicit` · `PAPERCLIP_AUTH_PUBLIC_BASE_URL=https://<domain>` · `PAPERCLIP_ALLOWED_HOSTNAMES=<domain>` · `PAPERCLIP_MIGRATION_AUTO_APPLY=true` · `HOST=0.0.0.0` · `STOCKPILOT_MODE=cloud`. **Do NOT set `PORT`** (Railway injects it). Stripe vars optional until billing goes live.

### Hard-won gotchas — do NOT re-learn these
**Railway (current):**
- **Monorepo auto-detect spawns one junk service per package** (`db`, `market-data`, `mcp-server`, `skills-catalog`, `feature-flags`). Keep ONE, delete the rest.
- **Watch Paths** on the auto-created service were scoped to `/packages/db/**` → every build **SKIPPED** ("no changes detected in watch paths"). **Clear watch paths** or only db-package changes deploy.
- **"Wait for CI"** ON blocks deploys forever (repo has no GitHub CI). **Turn it OFF.**
- **`VOLUME` is unsupported** by Railway's builder ("docker VOLUME … is not supported, use Railway Volumes") — removed from Dockerfile (commit `545c8617`). For persistent `/paperclip`, attach a Railway Volume.
- **"Redeploy"** re-runs the OLD snapshot/commit — it does NOT pick up newer `main` commits. Push a new commit (with watch-path cleared + CI-wait off) to build latest.
- `# syntax=` directive + `COPY --parents` (BuildKit features) ultimately built fine on Railway; watch them if builds break.
- **`bootstrap-ceo` needs a config FILE** at `$PAPERCLIP_CONFIG` (=`/paperclip/instances/default/config.json`) whose `server.deploymentMode` = `authenticated`; it reads `DATABASE_URL` + base URL from env. In the env-driven container that file doesn't exist → *"No config found, run onboard first."* **Fix:** `railway ssh` into the container, write a minimal valid `config.json`, then `pnpm paperclipai auth bootstrap-ceo`. Minimal schema:
  ```json
  { "$meta": {"version":1,"updatedAt":"2026-06-03T00:00:00.000Z","source":"configure"},
    "database": {}, "logging": {"mode":"file"},
    "server": {"deploymentMode":"authenticated","exposure":"private"} }
  ```
  (exposure `private` in the *file* avoids the public-auth cross-field validation; the real running server stays `public` via env. DB URL + invite base URL come from env.)

**Vercel (historical, for reference):** lockfile missing the `api/` importer (`ERR_PNPM_OUTDATED_LOCKFILE`); `plugin-sdk` postinstall `EEXIST` (made idempotent in `scripts/link-plugin-dev-sdk.mjs`); server `tsc` couldn't resolve `@paperclipai/plugin-sdk` on a clean checkout; output-dir / Root-Directory mismatch; invalid `functions.runtime: "@vercel/node@5"`.

### Deployment task list
1. ✅ **First admin created** — claimed via `bootstrap-ceo` invite (2026-06-03).
2. **Verify end-to-end** on the public URL: login, UI loads, DB reads/writes, market data. *(Largely working — admin claim succeeded.)*
3. **Cleanup:** rename service `@paperclipai/db` → `stockpilot`; confirm watch paths cleared; remove unused `vercel.json` + `api/`.
4. **(Better fix)** bake `config.json` generation into `scripts/docker-entrypoint.sh` from env vars so `bootstrap-ceo` "just works" without manual ssh on future instances.
5. **Billing:** add Stripe env vars + webhook (→ `/api/billing/...`) when ready to charge; until then cloud users sign up + bring their own keys.
6. **Plan:** upgrade Railway to **Hobby (~$5/mo)** for sustained 24/7 (trial credits run out).

### Local-dev note
Owner's Mac disk was ~500 MB free during this work (96% full) — heavy local builds/Docker fail. `pnpm store prune` (~2 GB) helps; otherwise clear Downloads / System Settings → Storage.

---

## 3. Current status — feature diff vs Paperclip

### ✅ Built (StockPilot additions on top of Paperclip)

| Area | What exists | Where |
|------|-------------|-------|
| Feature-flag mode | `STOCKPILOT_MODE=selfhost\|cloud`, `isCloudMode` | `server/src/config.ts`, `packages/feature-flags` |
| Finance DB tables | `watchlist_tickers`, `alert_rules`, `alert_events`, `broker_connections`, `research_reports`, `subscriptions` | `packages/db/src/schema/*`, migrations `0094`, `0095` |
| Market data | `MarketDataClient` w/ Yahoo (crumb-free v8 chart endpoint), Alpha Vantage, Polygon + `withFallback` | `packages/market-data` |
| Market API | `/api/market/quote|news|history|earnings-calendar` (rate-limit aware → 429) | `server/src/routes/market.ts` |
| Broker | Schwab OAuth, CSV import, read-only holdings | `server/src/routes/broker.ts` |
| Watchlist/Alerts API | CRUD for tickers & alert rules | `server/src/routes/watchlist.ts`, `alerts.ts` |
| Finance UI pages | Portfolio, Watchlist, Alerts, Market + sidebar "Finance" section | `ui/src/pages/{Portfolio,Watchlist,Alerts,Market}.tsx` |
| Agent role skills | 7 finance personas as skill files | created in Plan 1 (verify location in `skills/`) |
| Branding | StockPilot name, `@stockpilotai` npm scope, `stockpilot` CLI | throughout |
| Tier enforcement | run-limit (free 20/mo, system wakeups bypass), agent-role gate, tier-aware market providers | `server/src/services/{subscription,run-limit}.ts`, `routes/{agents,market}.ts` |
| API keys | two-key mgmt (AI `ai.<provider>` + data `data.<provider>`) via secrets pipeline; data key → `keys` tier | `server/src/routes/api-keys.ts` |
| Stripe billing | config + lazy client + `/api/billing/*` (status, checkout, portal, signature-verified webhook); cloud-only | `server/src/routes/billing.ts`, `services/stripe-client.ts` |
| Billing UI | Billing page (tier, usage, upgrade/manage) + sidebar nav; self-host shows "all unlocked" | `ui/src/pages/Billing.tsx` |
| Vercel deployment config | `vercel.json`, `api/index.ts` serverless entry, WS disable flag | `vercel.json`, `api/index.ts` |

### ⏳ Not built yet (still owed from the spec)
- **Plan 6 pending**: Supabase project setup + Vercel env vars configured + first deploy verified (Tasks 4, 5, 7 require Supabase/Vercel credentials — see `docs/superpowers/plans/2026-06-01-plan-6-cloud-deployment.md`).
- Vercel Cron for automated heartbeat scheduling (deferred to its own plan).
- Bring-your-own-keys onboarding **wizard** (the key-management API exists; a guided multi-step UI does not).
- Per-company **data-key value** resolution into the market client (the keys are stored; market provider selection currently reads global config keys — see `TODO(plan5)` in `server/src/app.ts`).
- Reports page, Routine Builder, alert evaluation engine, dashboard rework, remaining language changes.

### Plan 5 deferred follow-ups (tracked, non-blocking for self-host)
- Stripe **webhook event de-duplication / out-of-order protection** (current `setStatus` upsert is idempotent for the common case but has no event-id/period dedup).
- `APP_BASE_URL` validation at startup (malformed base URL surfaces as a Stripe SDK error, not a config error).
- Full webhook **integration tests** with a mocked Stripe SDK (currently only the pure status-mapping + pre-Stripe guard paths are unit-tested).
- A short-lived **tier cache** on `tierForCompany` to avoid a per-request DB read on hot paths.
- **Consolidate the subscription-service instances**: `createSubscriptionService` is currently instantiated in four places (`app.ts` ×2, `agents.ts`, `heartbeat.ts`). Stateless today, but a single shared instance should be threaded through before any per-instance state (cache) is added.
- **Tier policy on data-key delete**: removing a data key does not revert a cloud company from `keys` back to `free` (intentional "once unlocked, stays" assumption). Confirm this is the desired policy and document it.

### Tiers (target behavior — enforce in Plan 5 / feature flags)
| Feature | selfhost | cloud/free | cloud/keys | cloud/subscription |
|---------|:--:|:--:|:--:|:--:|
| All 7 agent roles | ✓ | News Sentinel only | ✓ | ✓ |
| Unlimited runs | ✓ | ✗ (~20/mo) | ✓ | ✓ |
| Alpha Vantage / Polygon | ✓ | ✗ (Yahoo only) | ✓ | ✓ |
| Stripe billing UI | ✗ | ✓ | ✓ | ✓ |
| Managed AI keys | ✗ | ✗ | ✗ | ✓ |
| Broker OAuth | ✓ | ✓ | ✓ | ✓ |

---

## 4. Architecture & key context

- **Monorepo**, pnpm workspaces. `STOCKPILOT_MODE` is the one switch between self-host and cloud.
- **server/** — Express 5 API. Async errors auto-caught. Auth via `assertAuthenticated(req)` + `assertCompanyAccess(req, companyId)` (uses `req.actor`, NOT `req.user`; `source:'local_implicit'` bypasses company checks, `source:'jwt'` enforces them). Routes mounted in `server/src/app.ts`.
- **ui/** — React 19 + Vite + React Router. **Company-prefixed routes** `/:companyPrefix/route`. Any new board page MUST be added to `BOARD_ROUTE_ROOTS` in `ui/src/lib/company-routes.ts` or links resolve wrong (this bit us on Plan 4). Data via React Query v5; keys in `ui/src/lib/queryKeys.ts`. Components from shadcn/ui + lucide-react. `useCompany()`, `useBreadcrumbs()`, `EmptyState`, `PageSkeleton` are the standard building blocks.
- **packages/db** — Drizzle ORM. Schema in `packages/db/src/schema/`, re-exported from `schema/index.js`; SQL migrations in `packages/db/src/migrations/`. NOTE: `ALERT_CONDITION_TYPES` is NOT re-exported from the db index — it's defined inline in the alerts router.
- **packages/market-data** — provider abstraction. **Yahoo provider uses the crumb-free `/v8/finance/chart` endpoint with a minimal `Mozilla/5.0` UA** (a full Chrome UA gets 429'd). Consumed from source via tsx — **restarting the server is required to pick up changes to linked workspace packages** (tsx only watches `server/src`).
- **Database (self-host)** — embedded PostgreSQL, auto-starts. Data dir `~/.paperclip/instances/default/`. Logs at `.../logs/server.log`.

### Run it
```bash
pnpm dev                                 # server + ui together
# or individually:
pnpm --filter @paperclipai/server dev    # API on :3100 (tsx watch — watches server/src only)
pnpm --filter @paperclipai/ui dev        # UI on :5173 (Vite, proxies /api → :3100)
```

---

## 5. Design system

- **Dark theme = original Paperclip neutral greys.** The earlier blue-tinted "financial" theme was reverted per owner request. The `.dark` palette in `ui/src/index.css` uses neutral `oklch(... 0 0)` values for background/card/popover/muted/accent/border/input/ring/primary.
- **Finance accent tokens kept:** `--gain` (green `oklch(0.52 0.17 145)`) and `--loss` (red `oklch(0.58 0.22 25)`), plus `--color-gain`/`--color-loss` mappings. Finance pages currently use Tailwind `text-green-600`/`text-red-600` directly for gain/loss; `--gain`/`--loss` are available for future use.
- **Components:** shadcn/ui (`Button`, `Input`, `Select`, `Badge`, `Card`). Button has a `size="icon-sm"` variant. Icons: lucide-react. Numbers: `tabular-nums`, monospace for tickers/prices.
- **Page conventions:** wrap content in `<div className="space-y-6 p-6">`; set breadcrumbs via `useBreadcrumbs()` in a `useEffect`; gate on `selectedCompanyId` with `EmptyState`; loading with `PageSkeleton`; icon-only destructive buttons need `aria-label`.

---

## 6. Paperclip surface to reconsider (keep / hide / remove)

We don't delete Paperclip features, but some make less sense for a single-user finance app. **Decisions here belong to the owner** — see [`PAPERCLIP_REFERENCE.md`](./PAPERCLIP_REFERENCE.md) for the full module inventory and per-module keep/remove notes. Do not remove anything without explicit owner sign-off.

---

## 7. Decisions & open questions

**Resolved (owner, 2026-06-03):**
- ✅ **License = MIT** (not AGPL). Apply across repo (LICENSE file, package.json `license` fields, headers as needed).
- ✅ **Finish renaming** `@paperclipai/*` → `@stockpilotai/*` everywhere (packages, imports, scopes). Repo `SamyR19/stockpilot`, product "StockPilot AI".

**Still open:**
- **Which Paperclip pages to hide** for the finance product (Org chart, Projects, Approvals, Execution Workspaces, etc.)? — needs owner pass.

## 7b. Active work queue (owner-requested 2026-06-03, agent-driven, one plan at a time)

Build in this order; write each plan with `superpowers:writing-plans`, execute with `superpowers:subagent-driven-development`. Pause for any owner action (infra/keys/decisions).

1. ✅ **Alert evaluation engine** — DONE. Pure `evaluateRule` (`server/src/services/alert-evaluator.ts`) + `createAlertEngine().tick()` (`alert-engine.ts`) run on startup + each heartbeat scheduler tick; edge-trigger + 6h cooldown via `alert_rules.last_triggered_at` (migration 0096); `GET /api/alerts/:companyId/events` + "Triggered alerts" UI section. 12 tests pass. Deferred follow-ups: agent auto-dispatch on fire (`rule.agentId`), notification delivery (`alert_events.notified`).
2. ✅ **Market Routine Builder** — DONE as **finance routine templates** (owner chose option A). The general routine builder already existed; added a finance preset catalog (`ui/src/lib/routineTemplates.ts`: daily watchlist briefing, weekly portfolio review, earnings watch) + a "New from template" dialog on `Routines.tsx` that composes existing `routinesApi.create` + `createTrigger`. No backend changes. Follow-ups: in-dialog cron editing, auto-create agent if none, server-side custom templates.
3. ⏳ **Bring-your-own-keys onboarding wizard** — guided multi-step UI over the existing api-keys API.
4. ⏳ **Sample/mock subscription onboarding** — simulate the subscribe/upgrade flow WITHOUT real Stripe (no Stripe setup yet); swappable for real billing later.
5. ⏳ **Per-company data-key resolution** into the market client (the `TODO(plan5)` in `server/src/app.ts`).
6. ⏳ **MIT license** application across the repo.
7. ⏳ **Finish `@paperclipai/*` → `@stockpilotai/*` rename.**
8. ⏳ **Paperclip codebase deep-dive doc.**

---

## 8. Conventions for working in this repo

- **Plans:** write with `superpowers:writing-plans`, execute with `superpowers:subagent-driven-development` (owner always wants subagent-driven — never ask).
- **Commits:** author is the owner (`Samy Rabah <samyrabah@icloud.com>`); include `Co-Authored-By: Claude ...`. Push to `main` (owner keeps origin in sync).
- **After finishing a plan or a notable feature/fix: update this file** (status table, feature diff, design system, open questions).
