# Paperclip Codebase Deep-Dive

> **Purpose:** This document explains HOW the Paperclip platform works — the mechanics, wiring, and conventions a new engineer needs to be productive. It complements (does not duplicate) two other docs:
>
> - [`PAPERCLIP_REFERENCE.md`](./PAPERCLIP_REFERENCE.md) — module-by-module inventory with keep/reconsider dispositions
> - [`ROADMAP.md`](./ROADMAP.md) §4 — conventions to follow in this repo (naming, auth patterns, route patterns, design system)
>
> **Read those first, then come here for the deeper mechanics.**

**Last updated:** 2026-06-03

---

## 1. Big Picture & Request Lifecycle

### Monorepo Layout

```
stockpilot ai/
├── server/         Express 5 API + all backend services
│   └── src/
│       ├── app.ts          — Express app factory (createApp)
│       ├── index.ts        — Server bootstrap (startServer, main entry)
│       ├── config.ts       — loadConfig() — all env/file config
│       ├── routes/         — One file per domain (agents, issues, …)
│       ├── services/       — Business logic (heartbeat, routines, secrets, …)
│       ├── middleware/      — auth.ts (actorMiddleware), logger, errorHandler
│       ├── adapters/        — Agent runtime adapters + registry
│       ├── realtime/        — WebSocket live-events server
│       ├── secrets/         — Secret provider implementations
│       └── auth/            — better-auth integration
├── ui/             React 19 + Vite SPA
│   └── src/
│       ├── pages/          — One file per route/page
│       ├── api/            — Typed fetch wrappers per domain
│       ├── lib/            — Shared utilities (company-routes, queryKeys, …)
│       └── components/     — Shared UI components
├── packages/
│   ├── db/                 — Drizzle schema, migrations, createDb
│   ├── shared/             — Cross-package types & utils (deployment modes, …)
│   ├── plugins/sdk         — Plugin SDK (@paperclipai/plugin-sdk)
│   ├── adapters/*          — Agent runtime adapter packages
│   ├── adapter-utils/      — Shared adapter helpers
│   ├── market-data/        — StockPilot: finance data providers
│   ├── feature-flags/      — StockPilot: STOCKPILOT_MODE tier logic
│   ├── mcp-server/         — MCP server layer (future)
│   └── skills-catalog/     — Agent skill file catalog
├── cli/                    — `stockpilot` CLI (was `paperclipai`)
├── skills/                 — Agent skill YAML/MD files (7 finance roles)
└── docker/                 — Container entrypoint + Dockerfile
```

### How a Request Flows

1. **HTTP arrives** → Express parse chain in `server/src/app.ts` (`createApp`):
   - Raw-body capture (`captureRawBody`) is registered first for `/api/billing/webhook` (Stripe signature verification requires the raw bytes).
   - `express.raw()` for the webhook path, then `express.json()` for everything else.
   - `httpLogger` middleware (structured pino logs).
   - `privateHostnameGuard` — if `deploymentExposure=private`, rejects requests from non-allowlisted hostnames.

2. **Actor resolution** — `actorMiddleware` (`server/src/middleware/auth.ts`) runs on every request. It populates `req.actor` with one of three shapes:
   - `{ type: 'board', source: 'local_implicit', … }` — `local_trusted` mode; no authentication required; the synthetic `local-board` user is used.
   - `{ type: 'board', source: 'jwt', userId, companyIds, memberships, isInstanceAdmin }` — `authenticated` mode; better-auth session resolved from cookie/bearer token.
   - `{ type: 'agent', agentId, companyId, runId }` — agent API key (hashed SHA-256 match against `agent_api_keys` table).
   - `{ type: 'none' }` — unauthenticated request.

3. **Route dispatch** — All API routes are mounted under `/api` via a single `Router` named `api` (`app.ts:436`). Special cases mounted directly on `app` (not `api`) before this: `/api/auth/*` (better-auth), `/api/auth/{*authPath}` (better-auth handler), and LLM routes.

4. **Authorization guards** (`server/src/routes/authz.ts`):
   - `assertAuthenticated(req)` — throws 401 if `req.actor.type === 'none'`.
   - `assertCompanyAccess(req, companyId)` — verifies the actor can access a specific company. Agents can only access their own company. Board users in `authenticated` mode must be in `companyIds`. Viewer membership blocks mutations (non-GET methods). `local_implicit` source bypasses company checks entirely.
   - `assertInstanceAdmin(req)` — requires `isInstanceAdmin` flag or `local_implicit`.

5. **Route handler** executes, typically: validate input → call a service function → respond with JSON.

6. **Error handling** — `errorHandler` middleware (`server/src/middleware/index.ts`) is the last middleware. It converts `HttpError` instances (from `server/src/errors.ts`: `notFound()`, `forbidden()`, `conflict()`, `unauthorized()`, `unprocessable()`) to structured JSON error responses. Express 5 async errors auto-propagate without needing explicit `next(err)` wrappers.

7. **UI serving** — After all API routes, in `static` mode: `express.static` serves hashed assets from `ui/dist/assets/` with 1-year `immutable` cache; a wildcard `app.get(/.*/)` serves `index.html` (no-cache) for all non-asset paths (SPA fallback). In `vite-dev` mode: a Vite middleware server is embedded directly in Express.

---

## 2. Configuration & Deployment Modes

### Server configuration (`server/src/config.ts`)

`loadConfig()` is the single config source for the server. It:
1. Loads a `.env` file from `~/.paperclip/instances/default/.env` (via `resolvePaperclipEnvPath`) and falls back to the CWD `.env`.
2. Falls back to a file-based config (`readConfigFile`) from `$PAPERCLIP_CONFIG` (defaults to `~/.paperclip/instances/default/config.json`). The file format is a validated JSON object; env vars always override file values.
3. Returns a typed `Config` object.

Key config fields:

| Field | Env var | Effect |
|-------|---------|--------|
| `deploymentMode` | `PAPERCLIP_DEPLOYMENT_MODE` | `local_trusted` (dev/self-host, loopback-only, no auth) or `authenticated` (cloud/public, better-auth required) |
| `deploymentExposure` | `PAPERCLIP_DEPLOYMENT_EXPOSURE` | `private` (LAN/Tailscale) or `public` (internet-facing) |
| `stockpilotMode` / `isCloudMode` | `STOCKPILOT_MODE` | `selfhost` (default) or `cloud`; gates tier enforcement and billing UI |
| `databaseUrl` | `DATABASE_URL` | If set: external Postgres (Supabase in cloud). If absent: embedded Postgres auto-starts. |
| `heartbeatSchedulerEnabled` | `PAPERCLIP_HEARTBEAT_SCHEDULER_ENABLED` | Whether the run engine ticks |
| `secretsProvider` | `PAPERCLIP_SECRETS_PROVIDER` | `local-encrypted` (default) or `aws-secrets-manager` |
| `disableLiveEventsWs` | `PAPERCLIP_DISABLE_LIVE_EVENTS_WS` | Disables WebSocket server (used for serverless deployments) |

### CLI configuration (`cli/src/config`)

The CLI (`stockpilot` / `paperclipai`) is **file-driven**: it reads `$PAPERCLIP_CONFIG` → `config.json`. This diverges from the server's env-driven approach. Consequence: CLI commands like `bootstrap-ceo` require a valid `config.json` file even when the server is running entirely from env vars (see ROADMAP §2.5 gotchas for the exact JSON to write).

### Deployment modes and the private-hostname guard

`shouldEnablePrivateHostnameGuard` (`app.ts:127`) returns `true` when `deploymentExposure=private` AND `deploymentMode` is `local_trusted` or `authenticated`. In that state, the `privateHostnameGuard` middleware rejects requests whose `Host` header is not in the allow-set (bind host + explicit `allowedHostnames`).

---

## 3. Data Model

### `packages/db` — Drizzle ORM

**Schema files** live in `packages/db/src/schema/` — one TypeScript file per table, re-exported from `schema/index.ts`. Tables are defined using `drizzle-orm/pg-core` (`pgTable`, `uuid`, `text`, `timestamp`, `jsonb`, etc.).

**Migrations** live in `packages/db/src/migrations/*.sql` (numbered `0000_…` through `0096_…`). The journal is at `migrations/meta/_journal.json`. `createDb` (`packages/db/src/client.ts`) wraps `drizzle(postgres(url), { schema })` to give a fully-typed query builder. `applyPendingMigrations` and `inspectMigrations` in `client.ts` handle migration apply and introspection — called from `startServer` on boot.

**Migration auto-apply:** The server refuses to start against a stale schema unless `PAPERCLIP_MIGRATION_AUTO_APPLY=true` is set, which is required in production (Railway env). On a fresh embedded-postgres cluster, migrations are applied automatically.

### Core entity map

```
companies ─┬─< agents (role, config, org-chart position)
           │     └─< agent_api_keys  (hashed tokens for agent auth)
           │     └─< agent_runtime_state  (live process state)
           │     └─< agent_task_sessions  (active run sessions)
           ├─< issues (= "Research Tasks") ─┬─ assigned to agent
           │     └─< heartbeat_runs          └─ many: run log, events, comments,
           │     └─< issue_comments               work products, approvals
           │     └─< issue_work_products
           │     └─< approvals
           ├─< routines (recurring jobs)
           │     └─< routine_triggers (cron or event-based)
           │     └─< routine_revisions (snapshot history)
           │     └─< routine_runs
           ├─< goals (company objectives)
           ├─< projects (optional grouping of issues)
           ├─< company_secrets ─< company_secret_versions
           │     └─ company_secret_bindings (link to env/agent)
           ├─< company_memberships (user ↔ company, with role)
           ├─< plugins, plugin_config, plugin_jobs, plugin_logs
           │
           │ — StockPilot additions —
           ├─< watchlist_tickers
           ├─< alert_rules ─< alert_events
           ├─< broker_connections
           ├─< research_reports
           └─< subscriptions
```

Additional cross-cutting tables: `auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications` (better-auth managed); `instance_user_roles` (instance admin grant); `activity_log` (audit trail); `cost_events` (per-run token spend); `execution_workspaces`, `environments`, `environment_leases` (experimental worktree sandboxes).

---

## 4. Agents, the Work Graph & the Run Engine

### Nouns

- **Agent** (`agents` table) — an AI employee with a role, an adapter type (e.g. `claude-local`), a model, skill files, and a config revision history. Agents belong to a company.
- **Issue** (= Research Task, `issues` table) — a unit of work assigned to an agent. Has a title, body, status (`open`, `assigned`, `done`, etc.), and a parent issue (for tree decomposition).
- **HeartbeatRun** (`heartbeat_runs`) — one execution of an agent doing work on an issue. Carries run status, token cost, output, and a sequence of `heartbeat_run_events`.
- **Goal** (`goals`) — a company-level objective; agents and issues can be aligned to goals.
- **Routine** (`routines`) — a recurring agent job. Has a trigger (cron or event), a revision snapshot (the prompt/template to send), and a run history.

### The heartbeat tick (run engine)

The heartbeat engine lives in `server/src/services/heartbeat.ts`. It drives agents forward:

- On startup (`startServer` in `index.ts:724`), the server calls a startup recovery chain:
  1. `reapOrphanedRuns()` — marks runs stuck in `running` state (from a previous process) as failed.
  2. `promoteDueScheduledRetries()` — moves runs scheduled for retry into the `queued` state.
  3. `resumeQueuedRuns()` — picks up all `queued` runs and dispatches them to their adapters.
  4. `reconcileStrandedAssignedIssues()` — handles issues that are `assigned` but have no active run.
  5. `reconcileIssueGraphLiveness()` — creates escalations for stalled issue trees.
  6. `scanSilentActiveRuns()` — watchdog for runs producing no output.
  7. `reconcileProductivityReviews()` — creates/updates productivity review records.

- A `setInterval` loop fires every `heartbeatSchedulerIntervalMs` ms (default: configurable, typically 60 seconds). Each tick runs the same recovery chain plus `tickTimers` (which promotes timer-based issue wakeups).

- The **routine scheduler** (`server/src/services/routines.ts:tickScheduledTriggers`) also fires in the same `setInterval` tick. It queries `routine_triggers` for cron triggers whose `nextRunAt` is in the past, creates a new issue for the routine, and advances `nextRunAt`.

- The **alert engine** (`server/src/services/alert-engine.ts:tick`) fires in the same tick as well. It fetches all active `alert_rules`, groups them by ticker, fetches market quotes via `MarketDataClient`, evaluates each rule via `evaluateRule` (pure function in `alert-evaluator.ts`), and inserts `alert_events` rows for rules that fire. A 6-hour cooldown (`last_triggered_at` column, migration `0096`) prevents repeated firing.

### Run dispatch

When a run is dispatched, `heartbeat.ts` calls `getServerAdapter(adapterType)` from `server/src/adapters/index.ts`, which returns the execute function for that runtime. The adapter gets the issue context, agent skills, and run configuration, then either starts a subprocess (claude-local, codex-local) or calls an HTTP API (http adapter).

---

## 5. Plugin System

### Overview

Plugins are out-of-process Node packages that extend the platform with new tools, triggers, UI surfaces, and managed resources. Each plugin runs in a **dedicated child process** (spawned by `PluginWorkerManager`) communicating over JSON-RPC 2.0 via stdio.

### Key files

| File | Role |
|------|------|
| `packages/plugins/sdk` (`@paperclipai/plugin-sdk`) | Types, JSON-RPC message helpers, `createHostClientHandlers` |
| `server/src/services/plugin-worker-manager.ts` | Spawns/manages plugin worker processes; crash recovery with exponential backoff |
| `server/src/services/plugin-loader.ts` | Discovers, validates, and loads plugin packages from `localPluginDir`; calls `loadAll()` on startup |
| `server/src/services/plugin-lifecycle.ts` | Start/stop lifecycle for individual plugins |
| `server/src/services/plugin-tool-dispatcher.ts` | Routes agent tool-call requests to the correct plugin worker |
| `server/src/services/plugin-job-scheduler.ts` | Schedules background plugin jobs |
| `server/src/services/plugin-job-coordinator.ts` | Coordinates job scheduling + lifecycle |
| `server/src/services/plugin-host-services.ts` | Builds the host-side service object that plugins call back into |
| `server/src/services/plugin-event-bus.ts` | In-process event bus for plugin ↔ host communication |
| `server/src/services/plugin-dev-watcher.ts` | File-watches plugin source directories during development |
| `scripts/link-plugin-dev-sdk.mjs` | Dev-link: symlinks `plugin-sdk` dist into each adapter during development |

### Plugin process model

Each installed plugin gets one `fork()`-ed worker process. The host (server) sends JSON-RPC requests over the child's stdin; reads responses from stdout. Worker stderr is captured and forwarded to the host logger. Crashes trigger automatic restart with exponential backoff. The protocol spec is in `PLUGIN_SPEC.md` (repo root).

### Local plugin directory

Default: `~/.paperclip/plugins/` (`DEFAULT_LOCAL_PLUGIN_DIR` in `plugin-loader.ts`). The `plugins` table in the DB records installed plugins; `plugin_config`, `plugin_state`, `plugin_jobs`, `plugin_logs`, `plugin_webhooks` track their runtime state.

---

## 6. Adapters & Agent Runtimes

### What adapters are

An adapter is a package in `packages/adapters/<name>/` that wraps a specific AI runtime (Claude CLI, Codex CLI, Cursor, Gemini, etc.). Each adapter exports:
- `execute(...)` — runs the agent on an issue; returns output and token counts.
- `testEnvironment(...)` — checks whether the runtime is installed and reachable.
- `sessionCodec` — serialize/deserialize session state.
- `models` / `modelProfiles` — available models and profiles.

### Registry (`server/src/adapters/registry.ts`)

`registry.ts` imports all built-in adapter modules (claude-local, codex-local, acpx-local, cursor-local, gemini-local, grok-local, opencode-local, pi-local, cursor-cloud, openclaw-gateway) and builds a static map. `waitForExternalAdapters()` is called in `startServer` after the HTTP server is constructed but before `server.listen` resolves — this ensures external adapter types (registered by plugins at runtime) are in the registry before the server starts accepting requests. `assertKnownAdapterType` uses this registry to validate adapter type strings.

### HTTP adapter

`server/src/adapters/http/` implements a generic HTTP-based adapter for calling external agent services, enabling integrations that don't ship as local CLI tools.

---

## 7. Auth & Secrets

### better-auth (`server/src/auth/better-auth.ts`)

Used in `authenticated` deployment mode only. `createBetterAuthInstance` creates a better-auth instance backed by the Drizzle adapter pointing at the `auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications` tables. `createBetterAuthHandler` returns an Express-compatible request handler mounted at `/api/auth/{*authPath}`.

Session resolution: `resolveBetterAuthSession(auth, req)` reads the session from cookie or `Authorization: Bearer` header and returns `{ session, user } | null`. This is passed into `actorMiddleware` as `resolveSession` so every request gets a populated `req.actor`.

**Board Claim / First-Admin Bootstrap:** `server/src/board-claim.ts` manages a one-time claim URL displayed on startup when `local-board` is still the only admin. The invite challenge is stored in `cli_auth_challenges`. See ROADMAP §2.5 for the Railway gotcha around `config.json`.

### Secrets pipeline (`server/src/services/secrets.ts`)

The secrets service is the central API for storing and retrieving encrypted secrets per company. Operations: `create`, `rotate`, `remove`, `list`, `getByName`, `resolveSecretValue`.

`resolveSecretValue(companyId, secretId, versionSelector)` decrypts and returns a secret's value. It dispatches to the configured provider via `server/src/secrets/provider-registry.ts`.

**Secret providers** (`server/src/secrets/`):
- `local-encrypted-provider.ts` — AES-256-GCM encryption with a master key file (`~/.paperclip/instances/default/secrets.key`). Default for self-host.
- `aws-secrets-manager-provider.ts` — stores ciphertext in AWS Secrets Manager; for operators who need cloud key management.
- `external-stub-providers.ts` — pass-through for externally managed values.

The provider is selected by `getConfiguredSecretProvider()` using `PAPERCLIP_SECRETS_PROVIDER` env var. The master key file path is `PAPERCLIP_SECRETS_MASTER_KEY_FILE`.

**API key secrets** (`server/src/routes/api-keys.ts`): StockPilot's "bring-your-own-keys" feature wraps the secrets pipeline. AI keys are stored as secrets named `ai.<provider>` and data keys as `data.<provider>`. The `createApiKeysRouter` receives an `apiKeySecretsAdapter` built in `app.ts` that proxies `getByName` / `rotate` / `create` — so key management is just a special view of the secrets system.

---

## 8. Realtime

### WebSocket live events (`server/src/realtime/live-events-ws.ts`)

`setupLiveEventsWebSocketServer(httpServer, db, opts)` attaches a `ws` `WebSocketServer` (in `noServer` mode) to the Node.js `http.Server`. It listens for HTTP upgrade requests at the path `/api/companies/:companyId/events/ws`.

**Auth during upgrade:** The upgrade handler authenticates the connection before the WebSocket handshake completes. It accepts:
- `Authorization: Bearer <agentApiKey>` header — hash-matches against `agent_api_keys`.
- better-auth session cookie — resolved via `resolveSessionFromHeaders` passed in from `startServer`.

After a successful auth check, the server calls `subscribeCompanyLiveEvents(companyId, callback)` (`server/src/services/live-events.ts`) which delivers serialized JSON event payloads to the connected client. A ping/pong heartbeat keeps the connection alive.

### UI consumption

The UI connects via `useCompanyLiveEvents` (React hook in `ui/src/`) which creates a `WebSocket` to the company events endpoint. Live events trigger React Query cache invalidations so the UI re-fetches affected data without polling.

---

## 9. Frontend Architecture

### Stack

React 19 + Vite + React Router v6 + React Query v5 + shadcn/ui + lucide-react icons. The app is a single-page application served either from `ui/dist` (static build) or via Vite's dev middleware embedded in Express.

### Company-prefixed routes

All board routes are prefixed with `/:companyPrefix/` where `companyPrefix` is the company's short identifier (e.g. `ACME`). `ui/src/lib/company-routes.ts` contains:
- `BOARD_ROUTE_ROOTS` — a `Set` of all route root segments that are company-scoped (e.g. `"dashboard"`, `"agents"`, `"portfolio"`, `"watchlist"`, etc.). **Every new finance page must be added here** or company-to-company navigation breaks.
- `GLOBAL_ROUTE_ROOTS` — routes that are NOT company-scoped (`"auth"`, `"invite"`, `"instance"`, …).
- Helper functions: `isGlobalPath`, `isBoardPathWithoutPrefix`, `buildCompanyPath`, `resolveCompanyFromPath`.

### Data fetching

React Query is used throughout. All query key factories live in `ui/src/lib/queryKeys.ts` — a single object with one key per domain (companies, agents, issues, routines, goals, etc.). Using centralized keys enables precise cache invalidation after mutations.

API calls are typed fetch wrappers in `ui/src/api/` — one file per domain (`agents.ts`, `issues.ts`, `market.ts`, etc.). They call the Express `/api/…` endpoints. The base client (`ui/src/api/client.ts`) handles auth headers and error normalization.

### Standard page building blocks

| Hook/Component | What it does |
|----------------|-------------|
| `useCompany()` | Returns the selected company (from URL prefix); gates on `selectedCompanyId` |
| `useBreadcrumbs()` | Sets breadcrumbs for the page header; called in `useEffect` |
| `EmptyState` | Standard empty-state placeholder |
| `PageSkeleton` | Loading skeleton for full-page loads |
| shadcn/ui `Button`, `Input`, `Select`, `Badge`, `Card` | Base UI primitives |

### Page conventions (from ROADMAP §4 & §5)

```tsx
// Typical page structure
export function MyPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "My Page" }]);
  }, []);

  if (!selectedCompanyId) return <EmptyState ... />;
  // ...
  return <div className="space-y-6 p-6">...</div>;
}
```

Dark theme, neutral greys. Finance gain/loss use `text-green-600` / `text-red-600` (or the CSS custom properties `--gain` / `--loss`).

---

## 10. Build, Test, Run

### pnpm workspace

`pnpm-workspace.yaml` declares all packages. Running `pnpm install` from the repo root installs all packages. Workspace packages reference each other via `workspace:*` in `package.json`.

### Running locally

```bash
pnpm dev                                  # server (:3100) + ui (:5173) together
pnpm --filter @paperclipai/server dev     # server only (tsx watch — server/src only)
pnpm --filter @paperclipai/ui dev         # ui only (Vite HMR)
```

**Important:** `tsx` only watches `server/src`. If you change a linked workspace package (e.g. `packages/market-data`, `packages/db`), **restart the server** — the change is not hot-reloaded.

### TypeScript / build

The server is compiled with `tsc` + `tsx` for dev. The UI uses Vite's build pipeline (`pnpm --filter @paperclipai/ui build`). The multi-stage `Dockerfile` at the repo root builds the full stack: install deps → build plugin-sdk → build server → build UI → copy into the final image, then runs `node server/dist/index.js`.

### Tests

`vitest` is used throughout. Test files are colocated with source (`*.test.ts`). Finance-specific tests: `server/src/routes/alerts.test.ts`, `billing.test.ts`, `broker.test.ts`, `api-keys.test.ts`, `market-tier.test.ts`, `agents-role-tier.test.ts`. Run all tests: `pnpm test` (or `pnpm --filter <package> test`).

### Deployment (Railway)

The whole app runs as one Docker container on Railway, talking to Supabase Postgres via `DATABASE_URL`. See **ROADMAP §2.5** for the full runbook — required env vars, Railway-specific gotchas, bootstrap-ceo instructions, and the deployment task list. This doc does not duplicate that section.

---

## 11. StockPilot Additions vs Paperclip Core

The Paperclip engine (agents, heartbeat, routines, issues, goals, plugins, secrets, auth, costs) is unchanged. StockPilot layers finance on top via four integration points:

### Feature-flag mode (`packages/feature-flags`, `server/src/config.ts`)

`STOCKPILOT_MODE=selfhost|cloud` is read at process start. `isCloudMode` is threaded into `createApp` opts and into the subscription / run-limit services. Self-host unlocks everything; cloud enforces tiers (free / keys / subscription — see ROADMAP §3 tier table).

### Finance DB tables (migrations `0094`, `0095`, `0096`)

Six new tables scoped by `company_id`: `watchlist_tickers`, `alert_rules`, `alert_events`, `broker_connections`, `research_reports`, `subscriptions`. Defined in `packages/db/src/schema/` alongside the Paperclip tables. (`ALERT_CONDITION_TYPES` is defined inline in the alerts router, NOT re-exported from the db package — see ROADMAP §4.)

### Market data (`packages/market-data`)

`MarketDataClient` with three providers: Yahoo Finance (crumb-free `/v8/finance/chart` endpoint, `Mozilla/5.0` UA — a full Chrome UA returns 429), Alpha Vantage, Polygon. `withFallback` chains providers. Per-company API keys are resolved at request time via `createMarketKeyResolver` (`server/src/services/market-key-resolver.ts`): reads `data.alpha_vantage` / `data.polygon` secrets from the secrets pipeline, falls back to global config keys.

### Finance routes and UI pages

New routes (`market.ts`, `broker.ts`, `watchlist.ts`, `alerts.ts`, `research.ts`, `api-keys.ts`, `billing.ts`) are mounted in `app.ts` under `/market`, `/broker`, `/watchlist`, `/alerts`, `/research`, `/api-keys`, `/billing`. Corresponding UI pages (`Portfolio.tsx`, `Watchlist.tsx`, `Alerts.tsx`, `Market.tsx`, `Billing.tsx`) follow the standard page conventions above. All their route roots are registered in `BOARD_ROUTE_ROOTS`.

See `PAPERCLIP_REFERENCE.md` §"Quick 'is this ours or theirs?' test" for a fast checklist.

---

## 12. "Where Do I Change X?" Quick Map

| Task | Files / directories to touch |
|------|------------------------------|
| **Add an API route** | Create `server/src/routes/<domain>.ts` with a `Router`; import and `api.use(...)` it in `server/src/app.ts`; add typed fetch wrapper in `ui/src/api/<domain>.ts` |
| **Add a DB table** | Create `packages/db/src/schema/<table>.ts`; export from `packages/db/src/schema/index.ts`; generate migration with `pnpm db:generate`; migration SQL appears in `packages/db/src/migrations/` |
| **Add a UI page** | Create `ui/src/pages/<Page>.tsx`; add route in `ui/src/App.tsx` (or wherever routes are declared); add route root to `BOARD_ROUTE_ROOTS` in `ui/src/lib/company-routes.ts` |
| **Add query keys** | Add to `ui/src/lib/queryKeys.ts` |
| **Add a scheduled / recurring job** | Add a `routine_trigger` row (cron type) via the routines API; or if it's a server-internal background job, add to the `setInterval` tick in `server/src/index.ts` alongside the existing heartbeat/routine/alert ticks |
| **Add a plugin** | Drop package in `localPluginDir` (default `~/.paperclip/plugins/`); plugin manager picks it up on restart via `loader.loadAll()`. Implement plugin manifest + worker using `@paperclipai/plugin-sdk` |
| **Add a secret-backed API key** | Store via `secretService.create(companyId, { name: 'data.myprovider', … })` and retrieve via `resolveSecretValue`; or go through the `createApiKeysRouter` which wraps this pattern for the AI/data key convention |
| **Change deployment behavior** | Edit env var list in ROADMAP §2.5; read them in `server/src/config.ts` `loadConfig()`; access via `config.<field>` in services |
| **Add a new tier gate** | Add check in `server/src/services/subscription.ts` (`tierForCompany`) and/or `run-limit.ts`; call from the relevant route using `createSubscriptionService(db, { isCloudMode })` |

---

*For the module-level keep/reconsider disposition of every file listed above, see [`PAPERCLIP_REFERENCE.md`](./PAPERCLIP_REFERENCE.md). For current build/deploy status and conventions, see [`ROADMAP.md`](./ROADMAP.md).*
