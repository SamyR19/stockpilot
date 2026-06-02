# StockPilot AI — Master Roadmap & Build Context

> **🛑 READ THIS FIRST, EVERY TIME.** This is the single source of truth for what StockPilot is, what's built, what's left, and the conventions to follow. **Read it before starting any plan, adding any feature, or changing anything**, and **update it after** you finish. If context is ever lost, this file restores it.
>
> Companion docs: [`PROJECT_GOALS.md`](./PROJECT_GOALS.md) (the why) · [`PAPERCLIP_REFERENCE.md`](./PAPERCLIP_REFERENCE.md) (what the forked code does) · design spec: `docs/superpowers/specs/2026-05-31-stockpilot-ai-design.md` · plans: `docs/superpowers/plans/`.

**Last updated:** 2026-06-01 (after Plan 5 — Stripe billing + tier enforcement)

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
| **Plan 6** | Cloud deployment (Vercel + Supabase) | ⚪ Not started |

Plans live in `docs/superpowers/plans/YYYY-MM-DD-plan-N-*.md`. Each plan is executed with the `superpowers:subagent-driven-development` skill (owner's standing preference — never ask which execution approach).

### Beyond Plan 6 (from the design spec, not yet scheduled into a plan)
- **Reports page** — library of agent-generated research reports (table `research_reports` already exists; no UI yet).
- **Market Routine Builder** — visual builder for recurring agent jobs.
- **Alert evaluation engine** — nothing currently turns `alert_rules` into `alert_events`; the Alerts UI exists but alerts don't *fire* yet. (Strong candidate for a near-term plan.)
- **Dashboard rework** — financial overview (market status, portfolio snapshot, agent activity feed).
- **Language changes** — "Heartbeats"→"Routines" (partly done), "Issues"→"Research Tasks", "Company"→"Workspace".
- **MCP server layer** — explicitly future / post-users.

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

### ⏳ Not built yet (still owed from the spec)
- Cloud deploy: Vercel + Supabase + Vercel Blob + Vercel Cron (Plan 6).
- Bring-your-own-keys onboarding **wizard** (the key-management API exists; a guided multi-step UI does not).
- Per-company **data-key value** resolution into the market client (the keys are stored; market provider selection currently reads global config keys — see `TODO(plan5)` in `server/src/app.ts`).
- Reports page, Routine Builder, alert evaluation engine, dashboard rework, remaining language changes.

### Plan 5 deferred follow-ups (tracked, non-blocking for self-host)
- Stripe **webhook event de-duplication / out-of-order protection** (current `setStatus` upsert is idempotent for the common case but has no event-id/period dedup).
- `APP_BASE_URL` validation at startup (malformed base URL surfaces as a Stripe SDK error, not a config error).
- Full webhook **integration tests** with a mocked Stripe SDK (currently only the pure status-mapping + pre-Stripe guard paths are unit-tested).
- A short-lived **tier cache** on `tierForCompany` to avoid a per-request DB read on hot paths.

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

## 7. Open questions (resolve before they block a plan)

1. **License: AGPL (spec) vs MIT (owner said in chat)?** Must confirm before publishing license terms.
2. **Alert firing:** the alert engine (`alert_rules` → `alert_events`) isn't built. Schedule it (own plan or fold into Plan 5/6?).
3. **Which Paperclip pages to hide** for the finance product (Org chart, Projects, Approvals, Execution Workspaces, etc.)?
4. **Repo name vs npm/CLI:** repo is `SamyR19/stockpilot`; product "StockPilot AI"; npm scope `@stockpilotai`; some packages still `@paperclipai/*`. Confirm whether to rename packages.

---

## 8. Conventions for working in this repo

- **Plans:** write with `superpowers:writing-plans`, execute with `superpowers:subagent-driven-development` (owner always wants subagent-driven — never ask).
- **Commits:** author is the owner (`Samy Rabah <samyrabah@icloud.com>`); include `Co-Authored-By: Claude ...`. Push to `main` (owner keeps origin in sync).
- **After finishing a plan or a notable feature/fix: update this file** (status table, feature diff, design system, open questions).
