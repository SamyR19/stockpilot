# Paperclip Reference — What the Forked Code Does

> **What this file is:** A map of the **original Paperclip** codebase we forked, module by module, so we know what each part does and can decide what to **keep, hide, or remove** for the StockPilot finance product. For the mechanics and architecture of how the platform actually works, see [`PAPERCLIP_DEEP_DIVE.md`](./PAPERCLIP_DEEP_DIVE.md). Paperclip is an AI-agent *company control plane* (run a company of AI employees). StockPilot reuses its agent/heartbeat/task engine and layers finance on top.
>
> **Rule:** Nothing gets removed without explicit owner sign-off (see [`PROJECT_GOALS.md`](./PROJECT_GOALS.md) principle #2). Use the `Disposition` column as a *recommendation to discuss*, not a license to delete.
>
> Legend — **KEEP** (core engine, finance app needs it) · **FINANCE** (StockPilot-added) · **RECONSIDER** (Paperclip-only; may hide for a single-user finance app) · **DEV** (lab/test surface, not user-facing).

**Last updated:** 2026-06-01

---

## Mental model

Paperclip's job: let a human run a **company** of **AI agents**. Core nouns:
- **Company** — top-level tenant (StockPilot calls this the user's workspace). Every table is scoped by `company_id`.
- **Agent** — an AI employee with a role, config, and place in an org chart.
- **Issue / Task** — a unit of work assigned to an agent (StockPilot will rename → "Research Task").
- **Heartbeat / Routine** — the recurring wake→work→sleep cycle that drives agents (StockPilot calls these "Routines").
- **Goal** — a company objective agents align to.
- **Run** — one execution of an agent doing work (the thing that costs money / is budgeted).

StockPilot keeps this entire engine and uses agents as **finance analysts** working **research tasks** on **routines**.

---

## UI pages (`ui/src/pages/`)

| Page(s) | What it does | Disposition |
|---------|--------------|-------------|
| `Dashboard.tsx`, `DashboardLive.tsx` | Company overview / live agent activity | KEEP → **rework** into financial overview (spec) |
| `Inbox.tsx` | Notifications, items needing attention, failed runs | KEEP |
| `Issues.tsx`, `IssueDetail.tsx`, `MyIssues.tsx` | Task list + detail (agent work items) | KEEP → rename to "Research Tasks"; add ticker/sector/recommendation fields |
| `Routines.tsx`, `RoutineDetail.tsx` | Recurring agent jobs (heartbeats) | KEEP → surface as "Routines"; future "Market Routine Builder" |
| `Goals.tsx`, `GoalDetail.tsx` | Company goals agents align to | KEEP (e.g. "grow portfolio research coverage") |
| `Agents.tsx`, `AgentDetail.tsx`, `NewAgent.tsx` | Create/manage AI agents | KEEP → add finance role picker (7 roles) |
| `Org.tsx`, `OrgChart.tsx` | Org hierarchy of agents | RECONSIDER (overkill for single-user; maybe hide) |
| `Projects.tsx`, `ProjectDetail.tsx`, `ProjectWorkspaceDetail.tsx` | Group work into projects | RECONSIDER |
| `Approvals.tsx`, `ApprovalDetail.tsx` | Human approval gates for agent actions | KEEP (useful: approve before acting on research) |
| `Costs.tsx` | Spend per agent/project (AI token costs) | KEEP (ties into billing/tiers) |
| `Activity.tsx` | Audit log of events | KEEP |
| `Search.tsx` | Global search | KEEP |
| `Companies.tsx`, `CompanySettings.tsx`, `CompanyInvites.tsx`, `CompanyAccess.tsx`, `CompanyEnvironments.tsx`, `CompanyExport.tsx`, `CompanyImport.tsx` | Manage companies/workspaces, members, import/export | KEEP core; RECONSIDER multi-member/invites for single-user finance; rename "Company"→"Workspace" |
| `Skills.tsx`/`CompanySkills.tsx` | Skill files agents can use | KEEP (finance role skills live here) |
| `Secrets.tsx` | Encrypted secret storage | KEEP → this is where **API keys** (AI + data) will be managed (Plan 5) |
| `Workspaces.tsx`, `ExecutionWorkspaceDetail.tsx` | Isolated execution/worktree workspaces (experimental) | RECONSIDER (advanced/dev; feature-flagged) |
| `InstanceSettings.tsx`, `InstanceAccess.tsx`, `InstanceGeneralSettings.tsx`, `InstanceExperimentalSettings.tsx` | Server-instance admin | KEEP (self-host admin) |
| `Auth.tsx`, `BoardClaim.tsx`, `CliAuth.tsx`, `InviteLanding.tsx`, `JoinRequestQueue.tsx` | Auth / onboarding / CLI pairing | KEEP (better-auth; cloud adds Supabase) |
| `ProfileSettings.tsx`, `UserProfile.tsx` | User profile | KEEP |
| `PluginManager.tsx`, `PluginPage.tsx`, `PluginSettings.tsx`, `CompanySettingsPluginPage.tsx`, `AdapterManager.tsx` | Plugin & adapter system | KEEP (extensibility; market-data/broker could be adapters) |
| `CloudUpstream.tsx` | Cloud upstream sync | RECONSIDER (relevant to Plan 6 cloud) |
| **`Portfolio.tsx`, `Watchlist.tsx`, `Alerts.tsx`, `Market.tsx`** | **Finance pages** | **FINANCE (ours)** |
| `DesignGuide.tsx`, `*UxLab.tsx`, `*.test.tsx`, `BootstrapSetupUxLab.tsx`, `IssueChatLongThreadPerf.tsx` | Design guide, UX labs, perf/test harnesses | DEV (keep for development, not user nav) |
| `NotFound.tsx` | 404 | KEEP |

---

## Server routes (`server/src/routes/`)

| Route file | Purpose | Disposition |
|-----------|---------|-------------|
| `auth.ts`, `authz.ts`, `access.ts`, `resource-memberships.ts` | Auth + authorization (`assertAuthenticated`/`assertCompanyAccess`, `req.actor`) | KEEP |
| `companies.ts`, `company-skills.ts`, `company-import-paths.ts` | Company/workspace mgmt | KEEP (rename concept to workspace) |
| `agents.ts` | Agent CRUD/config | KEEP → finance roles |
| `issues.ts`, `issue-tree-control.ts`, `issues-checkout-wakeup.ts` | Tasks | KEEP → "Research Tasks" |
| `routines.ts` | Recurring jobs | KEEP |
| `goals.ts` | Goals | KEEP |
| `approvals.ts` | Approval gates | KEEP |
| `org-chart-svg.ts` | Org chart rendering | RECONSIDER |
| `projects.ts` | Projects | RECONSIDER |
| `costs.ts` | Cost tracking (incl. subscription billing types) | KEEP (feeds tiers/billing) |
| `activity.ts` | Audit log | KEEP |
| `dashboard.ts` | Dashboard data | KEEP → rework |
| `inbox-dismissals.ts`, `sidebar-badges.ts`, `sidebar-preferences.ts` | Inbox/sidebar UX | KEEP |
| `secrets.ts` | Secret storage | KEEP → API key mgmt |
| `environments.ts`, `environment-selection.ts`, `execution-workspaces.ts`, `workspace-command-authz.ts`, `workspace-runtime-service-authz.ts` | Execution workspaces (experimental) | RECONSIDER |
| `instance-settings.ts`, `instance-database-backups.ts` | Instance admin | KEEP |
| `plugins.ts`, `plugin-ui-static.ts`, `adapters.ts` | Plugin/adapter system | KEEP |
| `cloud-upstreams.ts` | Cloud sync | RECONSIDER (Plan 6) |
| `user-profiles.ts` | Profiles | KEEP |
| `health.ts` | Health check (hardened: optional sub-queries never 500) | KEEP |
| `llms.ts` | LLM provider plumbing | KEEP |
| `assets.ts` | File/asset serving | KEEP |
| **`market.ts`, `broker.ts`, `watchlist.ts`, `alerts.ts`** | **Finance APIs** | **FINANCE (ours)** |

---

## Packages (`packages/`)

| Package | Purpose | Disposition |
|---------|---------|-------------|
| `db` | Drizzle schema, migrations, client | KEEP (holds finance tables too) |
| `shared` | Shared types/util (deployment modes, bind, etc.) | KEEP |
| `plugins` (+ `plugins/sdk`) | Plugin system + SDK | KEEP |
| `adapters`, `adapter-utils` | Agent runtime adapters (e.g. codex-local, http) | KEEP |
| `mcp-server` | MCP server layer | KEEP (future: expose StockPilot via MCP) |
| `skills-catalog` | Catalog of agent skills | KEEP (finance role skills) |
| **`market-data`** | **Yahoo / Alpha Vantage / Polygon providers + `MarketDataClient`** | **FINANCE (ours)** |
| **`feature-flags`** | **`STOCKPILOT_MODE` tier/feature gating** | **FINANCE (ours)** |

---

## Other top-level dirs

| Dir | Purpose | Disposition |
|-----|---------|-------------|
| `cli/` | `stockpilot` CLI (was `paperclip`) | KEEP |
| `skills/` | Agent skill files (incl. the 7 finance roles from Plan 1) | KEEP |
| `docker/` | Container setup | KEEP (self-host) |
| `docs/` | Docs site + our `docs/stockpilot/` + `docs/superpowers/` specs & plans | KEEP |
| `doc/` | **Original Paperclip product docs** (`GOAL.md`, `PRODUCT.md`, `TASKS.md`) | RECONSIDER — these describe *Paperclip*, not StockPilot; keep for reference, don't confuse with `docs/stockpilot/` |
| `evals/`, `tests/`, `report/`, `screenshots/`, `releases/`, `patches/`, `scripts/` | Eval/test/build infra | KEEP |

---

## Quick "is this ours or theirs?" test

- In `ui/src/pages/`: `Portfolio`, `Watchlist`, `Alerts`, `Market` are **ours**. Everything else is **Paperclip**.
- In `server/src/routes/`: `market`, `broker`, `watchlist`, `alerts` are **ours**.
- In `packages/`: `market-data`, `feature-flags` are **ours**.
- DB tables that are **ours**: `watchlist_tickers`, `alert_rules`, `alert_events`, `broker_connections`, `research_reports`, `subscriptions`.
- Everything else is inherited Paperclip — reuse it, rename labels, but don't rip out the engine.
